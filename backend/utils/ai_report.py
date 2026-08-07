"""
AI Report Generator — Generate structured reports from natural language queries.
"""
import json
import logging
from datetime import datetime, timezone, date, timedelta
from typing import Any, Dict, List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func, text

logger = logging.getLogger(__name__)

_REPORT_TEMPLATES = {
    "asset": {
        "title": "Laporan Aset",
        "sections": ["ringkasan", "kategori", "kondisi", "garansi"],
    },
    "incident": {
        "title": "Laporan Insiden",
        "sections": ["ringkasan", "status", "severity", "tren"],
    },
    "task": {
        "title": "Laporan Task",
        "sections": ["ringkasan", "status", "overdue", "assignee"],
    },
    "vulnerability": {
        "title": "Laporan Kerentanan",
        "sections": ["ringkasan", "severity", "server"],
    },
    "backup": {
        "title": "Laporan Backup",
        "sections": ["ringkasan", "status", "server"],
    },
}


async def generate_report(
    query: str,
    db: Session,
    user_id: int,
    role: str,
    accessible_modules: list[str],
) -> Dict[str, Any]:
    """Generate a structured report from a natural language query."""
    from utils.ai_intent_router import route

    # 1. Route the intent to determine what data to fetch
    history = [{"role": "user", "content": query}]
    intent = await route(query, history)
    modul = intent.get("modul", "").lower()
    action = intent.get("action", "UNKNOWN")
    filters = intent.get("filters", {})

    if modul == "GUARDRAIL_BLOCKED":
        return {"error": intent.get("reason", "Pesan tidak dapat diproses.")}

    # 2. Map module to report template
    template_key = _detect_report_type(modul, query)
    template = _REPORT_TEMPLATES.get(template_key)

    # 3. Fetch data for each section
    sections = {}
    if template:
        for section_name in template["sections"]:
            section_data = await _fetch_section_data(
                db, template_key, section_name, filters, role, accessible_modules,
            )
            sections[section_name] = section_data

    # 4. Generate narrative with LLM
    narrative = await _generate_narrative(query, template, sections, modul)

    # 5. Build final report
    report = {
        "title": template["title"] if template else f"Laporan {modul.replace('_', ' ').title()}",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "period": _detect_period(filters),
        "module": modul,
        "sections": sections,
        "narrative": narrative,
        "total_records": sum(
            s.get("count", 0) for s in sections.values() if isinstance(s, dict)
        ),
    }
    return report


def _detect_report_type(modul: str, query: str) -> Optional[str]:
    """Map module or query keywords to report template."""
    q = query.lower()
    if modul in ("asset_common", "asset") or any(kw in q for kw in ("aset", "asset", "barang")):
        return "asset"
    if modul in ("incident_report",) or any(kw in q for kw in ("insiden", "incident", "gangguan")):
        return "incident"
    if modul in ("project_tasks",) or any(kw in q for kw in ("task", "tugas", "proyek")):
        return "task"
    if modul in ("vulnerability_report",) or any(kw in q for kw in ("kerentanan", "vulnerability", "security")):
        return "vulnerability"
    if modul in ("backup_history",) or any(kw in q for kw in ("backup", "cadangan")):
        return "backup"
    return None


def _detect_period(filters: dict) -> str:
    """Extract or default to a report period."""
    if "start_date" in filters and "end_date" in filters:
        return f"{filters['start_date']} - {filters['end_date']}"
    return "Bulan ini"


async def _fetch_section_data(
    db: Session,
    report_type: str,
    section: str,
    filters: dict,
    role: str,
    accessible_modules: list[str],
) -> Dict[str, Any]:
    """Fetch data for a specific report section."""
    import importlib
    models_module = importlib.import_module("models")

    if report_type == "asset":
        ac = getattr(models_module, "AssetCommon", None)
        if ac is None:
            return {"count": 0, "error": "Model tidak ditemukan"}
        base = db.query(ac).filter(ac.deleted_at.is_(None)) if hasattr(ac, "deleted_at") else db.query(ac)
        if role != "superadmin":
            if hasattr(ac, "owner_role"):
                base = base.filter(ac.owner_role == role)

        if section == "ringkasan":
            total = base.count()
            statuses = db.query(ac.status, func.count(ac.id)).filter(
                ac.deleted_at.is_(None) if hasattr(ac, "deleted_at") else True
            ).group_by(ac.status).all() if hasattr(ac, "status") else []
            return {"count": total, "by_status": dict(statuses)}

        elif section == "kategori":
            cats = db.query(ac.category, func.count(ac.id)).filter(
                ac.deleted_at.is_(None) if hasattr(ac, "deleted_at") else True
            ).group_by(ac.category).all() if hasattr(ac, "category") else []
            return {"by_category": dict(cats)}

        elif section == "kondisi":
            cls = db.query(ac.classification, func.count(ac.id)).filter(
                ac.deleted_at.is_(None) if hasattr(ac, "deleted_at") else True
            ).group_by(ac.classification).all() if hasattr(ac, "classification") else []
            return {"by_classification": dict(cls)}

        elif section == "garansi":
            expiring = base.filter(
                ac.warranty_until < date.today() + timedelta(days=90),
                ac.warranty_until > date.today(),
            ).count() if hasattr(ac, "warranty_until") else 0
            expired = base.filter(ac.warranty_until < date.today()).count() if hasattr(ac, "warranty_until") else 0
            return {"expiring_soon": expiring, "expired": expired}

    elif report_type == "incident":
        ir = getattr(models_module, "IncidentReport", None)
        if ir is None:
            return {"count": 0}
        base = db.query(ir)
        if role != "superadmin" and hasattr(ir, "owner_role"):
            base = base.filter(ir.owner_role == role)

        if section == "ringkasan":
            return {"count": base.count()}
        elif section == "status":
            by_status = db.query(ir.status, func.count(ir.id)).group_by(ir.status).all() if hasattr(ir, "status") else []
            return {"by_status": dict(by_status)}
        elif section == "severity":
            by_sev = db.query(ir.severity, func.count(ir.id)).group_by(ir.severity).all() if hasattr(ir, "severity") else []
            return {"by_severity": dict(by_sev)}

    elif report_type == "task":
        pt = getattr(models_module, "ProjectTask", None)
        if pt is None:
            return {"count": 0}
        base = db.query(pt).filter(pt.deleted_at.is_(None)) if hasattr(pt, "deleted_at") else db.query(pt)
        if role != "superadmin" and hasattr(pt, "created_by"):
            base = base.filter(pt.created_by == user_id)

        if section == "ringkasan":
            return {"count": base.count()}
        elif section == "status":
            by_status = db.query(pt.status, func.count(pt.id)).filter(
                pt.deleted_at.is_(None) if hasattr(pt, "deleted_at") else True
            ).group_by(pt.status).all() if hasattr(pt, "status") else []
            return {"by_status": dict(by_status)}
        elif section == "overdue":
            overdue = base.filter(
                pt.due_date < date.today(),
                pt.status.notin_(["done", "completed", "cancelled"]),
            ).count() if hasattr(pt, "due_date") else 0
            return {"overdue": overdue}

    return {"count": 0}


async def _generate_narrative(
    query: str, template: Optional[dict], sections: dict, modul: str,
) -> str:
    """Use LLM to generate a report narrative from section data."""
    from utils.ai_engine import query_llm

    data_summary = "\n".join(
        f"- {k}: {v}" for k, v in sections.items() if isinstance(v, dict)
    )
    prompt = (
        f"Buat ringkasan laporan {template['title'] if template else modul} dalam Bahasa Indonesia. "
        f"Gaya formal, 2-3 paragraf.\n\nData:\n{data_summary}\n\n"
        "Pertanyaan user:\n" + query
    )
    try:
        return await query_llm(
            [{"role": "system", "content": "Kamu asisten pelaporan IT Management."},
             {"role": "user", "content": prompt}],
            max_tokens=500, temperature=0.3,
        )
    except Exception as e:
        logger.debug("LLM narrative failed: %s", e)
        return "Laporan berhasil dibuat."
