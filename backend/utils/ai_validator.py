"""
AI Data Validator — Scans for data inconsistencies and suggests corrections.
"""
import logging
from datetime import datetime, timezone, date
from typing import Any, Dict, List, Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import func, inspect as sa_inspect

logger = logging.getLogger(__name__)


def validate_data(db: Session, user_id: int, role: str, accessible_modules: list[str]) -> List[Dict[str, Any]]:
    """Run all validation checks. Returns list of issues."""
    from sqlalchemy import text

    issues: list[dict] = []
    is_super = role == "superadmin"

    # ── ORPHANED RECORDS ──────────────────────────────────
    orphan_checks = [
        ("notifications", "user_id", "users", "id",
         "Notifikasi dengan user_id {child_id} — user sudah tidak ada"),
        ("activity_logs", "user_id", "users", "id",
         "Activity log dengan user_id {child_id} — user sudah tidak ada"),
        ("asset_audit_logs", "asset_id", "asset_common", "id",
         "Audit log asset_id {child_id} — aset sudah tidak ada"),
        ("document_versions", "document_id", "document_library", "id",
         "Versi dokumen dengan document_id {child_id} — dokumen induk tidak ada"),
    ]
    for child_table, child_fk, parent_table, parent_pk, msg_template in orphan_checks:
        if not is_super and child_table not in accessible_modules:
            continue
        if child_table not in _ALLOWED_TABLES or child_fk not in _ALLOWED_COLUMNS:
            continue
        sql = text(f"""
            SELECT COUNT(*) FROM {child_table} c
            LEFT JOIN {parent_table} p ON c.{child_fk} = p.{parent_pk}
            WHERE p.{parent_pk} IS NULL
        """)
        count = db.execute(sql).scalar() or 0
        if count > 0:
            issues.append({
                "type": "orphan",
                "severity": "high",
                "table": child_table,
                "count": count,
                "message": msg_template.format(child_id="?"),
                "fix_suggestions": [
                    {"action": "delete_orphans", "table": child_table, "fk": child_fk,
                     "description": f"Hapus {count} record orphan dari {child_table}"},
                    {"action": "set_null", "table": child_table, "fk": child_fk,
                     "description": f"Set {child_fk} ke NULL untuk {count} record"},
                ],
            })

    # ── SOFT-DELETED REFERENCES ────────────────────────────
    ref_checks = [
        ("asset_hardware", "asset_id", "asset_common", "id",
         "Hardware asset_id {id} mengacu ke aset yang sudah dihapus"),
        ("asset_software", "asset_id", "asset_common", "id",
         "Software asset_id {id} mengacu ke aset yang sudah dihapus"),
        ("asset_users", "asset_id", "asset_common", "id",
         "User aset asset_id {id} mengacu ke aset yang sudah dihapus"),
        ("asset_virtual_infrastructure", "asset_id", "asset_common", "id",
         "Virtual infra asset_id {id} mengacu ke aset yang sudah dihapus"),
        ("asset_information", "asset_id", "asset_common", "id",
         "Informasi aset asset_id {id} mengacu ke aset yang sudah dihapus"),
    ]
    for child_table, child_fk, parent_table, parent_pk, msg_template in ref_checks:
        if not is_super and child_table not in accessible_modules:
            continue
        if child_table not in _ALLOWED_TABLES or child_fk not in _ALLOWED_COLUMNS:
            continue
        sql = text(f"""
            SELECT COUNT(*) FROM {child_table} c
            JOIN {parent_table} p ON c.{child_fk} = p.{parent_pk}
            WHERE p.deleted_at IS NOT NULL
        """)
        count = db.execute(sql).scalar() or 0
        if count > 0:
            issues.append({
                "type": "soft_deleted_ref",
                "severity": "medium",
                "table": child_table,
                "count": count,
                "message": msg_template.format(id="?"),
                "fix_suggestions": [
                    {"action": "flag_for_review", "table": child_table,
                     "description": f"{count} record perlu ditinjau — parent sudah dihapus"},
                ],
            })

    # ── DATE INCONSISTENCIES ──────────────────────────────
    date_checks = [
        ("sprints", "end_date", "start_date", "Sprint {id}: end_date < start_date"),
        ("sprints", "end_date", None, "Sprint {id}: end_date sudah lewat tapi status bukan 'completed'"),
        ("user_otp", "expires_at", "created_at", "OTP {id}: expires_at < created_at"),
        ("user_sessions", "expires_at", "created_at", "Session {id}: expires_at < created_at"),
    ]
    import importlib
    models_module = importlib.import_module("models")
    for table_name, col_a, col_b, msg_template in date_checks:
        if not is_super and table_name not in accessible_modules:
            continue
        model_cls = getattr(models_module, _MODEL_MAP.get(table_name, table_name), None)
        if model_cls is None:
            continue
        try:
            if col_b and hasattr(model_cls, col_a) and hasattr(model_cls, col_b):
                count = db.query(func.count()).filter(
                    getattr(model_cls, col_a) < getattr(model_cls, col_b),
                    getattr(model_cls, col_a).isnot(None),
                    getattr(model_cls, col_b).isnot(None),
                ).scalar() or 0
                if count > 0:
                    issues.append({
                        "type": "date_inconsistency",
                        "severity": "medium",
                        "table": table_name,
                        "count": count,
                        "message": msg_template.format(id="?"),
                        "fix_suggestions": [
                            {"action": "review_records", "table": table_name,
                             "description": f"{count} record di {table_name} perlu dicek"},
                        ],
                    })
        except Exception:
            pass

    # ── PROJECT TASKS OVERDUE ─────────────────────────────
    if is_super or "project_tasks" in accessible_modules:
        try:
            pt = getattr(models_module, "ProjectTask", None)
            if pt and hasattr(pt, "due_date") and hasattr(pt, "status") and hasattr(pt, "deleted_at"):
                overdue = db.query(func.count()).filter(
                    pt.deleted_at.is_(None),
                    pt.due_date < date.today(),
                    pt.status.notin_(["done", "completed", "cancelled"]),
                ).scalar() or 0
                if overdue > 0:
                    issues.append({
                        "type": "overdue_tasks",
                        "severity": "medium",
                        "table": "project_tasks",
                        "count": overdue,
                        "message": f"{overdue} task melewati deadline dan belum selesai",
                        "fix_suggestions": [
                            {"action": "bulk_update", "table": "project_tasks",
                             "data": {"status": "overdue"},
                             "description": f"Tandai {overdue} task sebagai overdue"},
                        ],
                    })
        except Exception:
            pass

    # ── WORK LOG HOURS ────────────────────────────────────
    if is_super or "work_log" in accessible_modules:
        try:
            wl = getattr(models_module, "WorkLog", None)
            if wl and hasattr(wl, "duration"):
                negative = db.query(func.count()).filter(
                    wl.duration < 0, wl.duration.isnot(None),
                ).scalar() or 0
                if negative > 0:
                    issues.append({
                        "type": "negative_duration",
                        "severity": "high",
                        "table": "work_logs",
                        "count": negative,
                        "message": f"{negative} work log dengan durasi negatif",
                        "fix_suggestions": [
                            {"action": "abs_duration", "table": "work_logs",
                             "description": f"Konversi {negative} durasi negatif ke positif"},
                        ],
                    })
        except Exception:
            pass

    # ── ASSETS WITHOUT EXTENSION ──────────────────────────
    if is_super or "asset_common" in accessible_modules:
        try:
            ac = getattr(models_module, "AssetCommon", None)
            if ac and hasattr(ac, "deleted_at"):
                missing_ext = db.query(func.count()).filter(
                    ac.deleted_at.is_(None),
                    ~db.query().filter(
                        getattr(models_module, "AssetHardware").asset_id == ac.id
                    ).exists(),
                    ~db.query().filter(
                        getattr(models_module, "AssetSoftware").asset_id == ac.id
                    ).exists(),
                ).scalar() or 0
                if missing_ext > 0:
                    issues.append({
                        "type": "missing_extension",
                        "severity": "low",
                        "table": "asset_common",
                        "count": missing_ext,
                        "message": f"{missing_ext} aset tanpa data hardware/software tambahan",
                        "fix_suggestions": [
                            {"action": "review_assets", "table": "asset_common",
                             "description": "Tinjau aset tanpa data tambahan"},
                        ],
                    })
        except Exception:
            pass

    return issues


async def generate_corrections(db: Session, issues: List[Dict[str, Any]], role: str) -> List[Dict[str, Any]]:
    """Generate suggested corrections using LLM for complex cases, or rule-based for simple."""
    from utils.ai_engine import query_llm

    corrections = []
    for issue in issues:
        for suggestion in issue.get("fix_suggestions", []):
            corrections.append({
                "issue_type": issue["type"],
                "table": issue["table"],
                "count": issue["count"],
                "action": suggestion["action"],
                "description": suggestion["description"],
                "apply_params": suggestion,
            })

    # For text-based issues, try LLM enhancement
    if len(issues) > 0:
        try:
            text_summary = "\n".join(
                f"- [{i['severity']}] {i['message']} ({i['count']} records)"
                for i in issues[:10]
            )
            prompt = (
                "Kamu asisten IT Management. Berikut isu data yang terdeteksi:\n"
                f"{text_summary}\n\n"
                "Beri saran perbaikan dalam Bahasa Indonesia, singkat dan spesifik."
            )
            llm_advice = await query_llm(
                [{"role": "system", "content": "Kamu asisten ahli data quality."},
                 {"role": "user", "content": prompt}],
                max_tokens=400, temperature=0.3,
            )
            corrections.append({
                "issue_type": "llm_advice",
                "table": "*",
                "count": len(issues),
                "action": "llm_recommendation",
                "description": llm_advice,
                "apply_params": None,
            })
        except Exception as e:
            logger.debug("LLM correction advice failed: %s", e)

    return corrections


def apply_correction(db: Session, action: str, table: str, params: dict) -> Dict[str, Any]:
    """Execute a correction action. Returns result dict."""
    from sqlalchemy import text

    try:
        if action == "delete_orphans":
            fk = params.get("fk")
            parent_table = params.get("parent_table")
            parent_pk = params.get("parent_pk", "id")
            if not fk or not parent_table:
                return {"error": "Parameter tidak lengkap"}
            if table not in _ALLOWED_TABLES or fk not in _ALLOWED_COLUMNS:
                return {"error": "Table atau kolom tidak diizinkan"}
            if parent_table not in _ALLOWED_TABLES:
                return {"error": "Parent table tidak diizinkan"}
            if parent_pk not in _ALLOWED_COLUMNS:
                return {"error": "Parent primary key tidak diizinkan"}
            sql = text(f"""
                DELETE FROM {table} WHERE {fk} IS NOT NULL
                AND {fk} NOT IN (SELECT {parent_pk} FROM {parent_table})
            """)
            count = db.execute(sql).rowcount
            db.commit()
            return {"success": True, "affected": count, "message": f"{count} orphan dihapus dari {table}"}

        elif action == "bulk_update":
            data = params.get("data", {})
            filters = params.get("filters", {})
            if not data:
                return {"error": "Data update tidak ada"}
            import importlib, inspect
            models_module = importlib.import_module("models")
            model_cls = _resolve_model(table, models_module)
            if model_cls is None:
                return {"error": f"Model {table} tidak ditemukan"}
            query = db.query(model_cls)
            for col, val in filters.items():
                if hasattr(model_cls, col):
                    query = query.filter(getattr(model_cls, col) == val)
            records = query.all()
            for obj in records:
                for col, val in data.items():
                    if hasattr(obj, col):
                        setattr(obj, col, val)
            db.commit()
            return {"success": True, "affected": len(records), "message": f"{len(records)} record diupdate di {table}"}

        elif action == "abs_duration":
            import importlib
            models_module = importlib.import_module("models")
            model_cls = _resolve_model(table, models_module)
            if model_cls is None or not hasattr(model_cls, "duration"):
                return {"error": "Model tidak memiliki duration"}
            from sqlalchemy import abs as sql_abs
            count = db.query(model_cls).filter(
                model_cls.duration < 0, model_cls.duration.isnot(None),
            ).update({"duration": sql_abs(model_cls.duration)}, synchronize_session=False)
            db.commit()
            return {"success": True, "affected": count, "message": f"{count} durasi negatif dikonversi"}

        return {"error": f"Tindakan '{action}' belum didukung"}

    except Exception as e:
        db.rollback()
        logger.error("Apply correction failed: %s", e, exc_info=True)
        return {"error": f"Gagal: {str(e)}"}


_ALLOWED_TABLES = {
    "notifications", "activity_logs", "asset_audit_logs", "document_versions",
    "asset_hardware", "asset_software", "asset_users",
    "asset_virtual_infrastructure", "asset_information",
    "users", "asset_common", "document_library",
    "asset_configurations", "config_change_history",
}
_ALLOWED_COLUMNS = {
    "user_id", "asset_id", "document_id", "id",
    "deleted_at",
}

_MODEL_MAP: dict = {
    "sprints": "Sprint", "project_tasks": "ProjectTask", "work_logs": "WorkLog",
    "asset_common": "AssetCommon", "asset_hardware": "AssetHardware",
    "asset_software": "AssetSoftware", "asset_users": "AssetUsers",
    "asset_virtual_infrastructure": "AssetVirtualInfrastructure",
    "asset_information": "AssetInformation",
    "notifications": "Notification", "activity_logs": "ActivityLog",
    "document_versions": "DocumentVersion", "document_library": "DocumentLibrary",
    "asset_audit_logs": "AssetAuditLog", "user_otp": "UserOTP",
    "user_sessions": "UserSession",
}


def _resolve_model(table_name: str, module) -> Any:
    class_name = _MODEL_MAP.get(table_name)
    if class_name:
        return getattr(module, class_name, None)
    return None
