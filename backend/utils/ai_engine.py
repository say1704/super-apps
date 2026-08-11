"""
AI Engine — LLM-based natural language query and action engine for Super Apps.
Inference delegated to dedicated model server via HTTP.
"""
import asyncio
import json
import logging
import re
from pathlib import Path
from typing import Any, AsyncGenerator, Dict, List, Optional, Tuple
from sqlalchemy.orm import Session
from utils.timezone import utcnow

logger = logging.getLogger(__name__)

_pending_lock = asyncio.Lock()
_last_action_lock = asyncio.Lock()

MAX_OUTPUT_TOKENS = 512

PENDING_ACTIONS: Dict[str, dict] = {}

# Last action snapshot for undo (TTL 30 detik)
_LAST_ACTION: Dict[int, dict] = {}

# Inference metadata (kept for backward compat with ai_bridge)
_last_inference: Dict[str, Any] = {}


def get_last_inference_meta() -> Dict[str, Any]:
    return _last_inference


def _reset_inference_meta():
    global _last_inference
    _last_inference = {}


async def query_heavy_llm(
    messages: List[dict], max_tokens: int = MAX_OUTPUT_TOKENS,
    temperature: float = 0.1,
) -> str:
    from utils.ai_model_client import query_heavy_llm as _http_query_heavy
    return await _http_query_heavy(messages, max_tokens, temperature)


async def query_heavy_llm_stream(
    messages: List[dict], max_tokens: int = MAX_OUTPUT_TOKENS,
    temperature: float = 0.1,
) -> AsyncGenerator[str, None]:
    from utils.ai_model_client import query_heavy_llm_stream as _http_query_heavy_stream
    async for token in _http_query_heavy_stream(messages, max_tokens, temperature):
        yield token


# ── Tiered query routing ───────────────────────────────────────────

_HIGH_VALUE_WORDS = {
    "analisa", "analisis", "analyst", "banding", "comparison",
    "trend", "tren", "rata-rata", "average", "summary", "ringkasan",
    "rekap", "rekapitulasi", "laporan", "report", "grafik", "chart",
    "detail", "lengkap", "semua", "all", "forecast", "prediksi",
}


def _is_complex_query(user_message: str, fetch_count: int) -> str:
    """Return 'heavy' if query needs 7B, 'light' if 1.5B is enough."""
    msg = user_message.lower()
    word_count = len(msg.split())
    # Long queries → heavy
    if word_count > 20:
        return "heavy"
    # High-value analysis keywords → heavy
    if any(kw in msg for kw in _HIGH_VALUE_WORDS):
        return "heavy"
    # Many data rows → heavy (better summarization)
    if fetch_count > 20:
        return "heavy"
    return "light"


async def query_llm(messages: List[dict], max_tokens: int = MAX_OUTPUT_TOKENS, temperature: float = 0.1) -> str:
    from utils.ai_model_client import query_llm as _http_query
    return await _http_query(messages, max_tokens, temperature)


async def query_llm_stream(
    messages: List[dict],
    max_tokens: int = MAX_OUTPUT_TOKENS,
    temperature: float = 0.1,
) -> AsyncGenerator[str, None]:
    from utils.ai_model_client import query_llm_stream as _http_query_stream
    async for token in _http_query_stream(messages, max_tokens, temperature):
        yield token


# ── System prompt ──────────────────────────────────────────────────────

def build_system_prompt(role: str, accessible_modules: List[str], schema_text: str) -> str:
    return f"""Kamu asisten AI IT Management. Pengguna: role={role}.

GAYA: Bahasa Indonesia hangat, natural, seperti ngobrol.
AMAN: Jangan ungkap password/token/kredensial.
CREATE/UPDATE/DELETE: Minta konfirmasi user dulu.

PENTING untuk DELETE/UPDATE:
- SELALU gunakan UNIQUE IDENTIFIER sebagai filter (id atau asset_code)
- JANGAN gunakan nama/kolom non-unique sebagai filter
- Jika user sebut nama, tanya ID/asset_code yang spesifik
- Format filters: {{"id": 123}} atau {{"asset_code": "AST-2026-001"}}

TABEL:
{schema_text}

Query → JSON: {{"table":"...","columns":[...],"filters":{{}},"aggregate":"count|list","limit":10}}
Action → JSON: {{"action":"create|update|delete","table":"...","data":{{"col":"val"}},"filters":{{}}}}"""


# ── Intent parsing ─────────────────────────────────────────────────────

def parse_intent(user_message: str, has_pending: bool = False) -> str:
    """Classify user intent: query | confirm | reject | action | greeting | unknown."""
    msg = user_message.strip().lower()

    if has_pending:
        if msg in ("ya", "y", "yes", "oke", "ok", "lanjut", "setuju", "confirm", "simpan"):
            return "confirm"
        if msg in ("tidak", "ga", "gak", "no", "cancel", "batal", "nanti", "jangan"):
            return "reject"

    greetings = {"halo", "hai", "hi", "hello", "pagi", "siang", "sore", "malam", "test", "tes", "hey", "terimakasih", "makasih", "thanks", "thank"}
    if msg.strip() in greetings or any(g in msg for g in ("terimakasih", "makasih", "thanks", "thank")):
        return "greeting"

    keywords_create = {"tambah", "buat", "create", "input", "insert", "daftarkan", "simpan", "masukan", "masukkan"}
    keywords_update = {"ubah", "edit", "update", "perbarui", "ganti", "modif"}
    keywords_delete = {"hapus", "delete", "remove", "buang", "nonaktifkan"}
    keywords_query = {
        "berapa", "siapa", "apa", "mana", "kapan", "list", "cari", "tampilkan",
        "show", "count", "total", "daftar", "data", "semua", "yang",
    }

    words = set(msg.split())

    has_create = any(kw in msg for kw in keywords_create)
    has_update = any(kw in msg for kw in keywords_update)
    has_delete = any(kw in msg for kw in keywords_delete)
    has_query = bool(words & keywords_query)
    has_qmark = "?" in msg

    if has_create or has_update or has_delete:
        return "action"
    if has_query or has_qmark:
        return "query"

    return "query"


async def build_response_message(history: List[dict]) -> str:
    """Build the last assistant response to check for pending action context."""
    for msg in reversed(history):
        if msg.get("role") == "assistant":
            return msg.get("content", "")
    return ""


# ── Handle action (create/update/delete) ──────────────────────────────

async def handle_action(
    user_message: str,
    db: Session,
    user_id: int,
    role: str,
    accessible_modules: List[str],
) -> Dict[str, Any]:
    """User wants to create/update/delete data → LLM → structured action → preview."""
    from utils.ai_schema import get_compact_schema_text

    schema_text = get_compact_schema_text()

    system_msg = build_system_prompt(role, accessible_modules, schema_text)

    user_prompt = f"""Request: {user_message}
Return JSON: {{"action":"create|update|delete","table":"...","data":{{"col":"val"}},"filters":{{}}}}"""

    messages = [
        {"role": "system", "content": system_msg},
        {"role": "user", "content": user_prompt},
    ]

    try:
        raw = await query_llm(messages, max_tokens=MAX_OUTPUT_TOKENS, temperature=0.1)
    except RuntimeError:
        return {"error": "Maaf, AI sedang tidak tersedia. Coba lagi ya."}
    except Exception as e:
        logger.error("Handle action LLM failed: %s", e, exc_info=True)
        return {"error": "Maaf, ada gangguan. Coba lagi ya."}

    parsed = validate_llm_output(raw)
    if "error" in parsed:
        return parsed

    action_type = parsed.get("action")
    table_name = parsed.get("table", "")
    action_data = parsed.get("data", {})
    filters = parsed.get("filters", {})

    if action_type not in ("create", "update", "delete"):
        return {"error": "Maaf, saya kurang paham maksudnya. Mau nambah, ubah, atau hapus data ya?"}

    if table_name not in _AVAILABLE_TABLES:
        return {"error": f"Maaf, tabel '{table_name}' tidak tersedia di sistem."}

    # ── Safety guardrails ──────────────────────────────────────────
    # Block user role escalation
    if table_name == "users" and role != "superadmin":
        return {"error": "Maaf, kamu tidak punya izin untuk mengubah data pengguna."}
    if action_type in ("update", "delete") and table_name in ("users", "roles", "app_settings"):
        if role != "superadmin":
            return {"error": "Maaf, hanya superadmin yang bisa mengubah pengaturan sistem."}
    # Block creating new users entirely
    if action_type == "create" and table_name in ("users", "roles", "app_settings"):
        return {"error": "Maaf, pembuatan akun hanya bisa dilakukan di halaman Settings ya."}
    # Block role escalation in data payload
    if "role" in action_data and action_data["role"] in ("superadmin", "admin"):
        if role != "superadmin":
            return {"error": "Maaf, kamu tidak punya izin untuk naikkan level akses pengguna."}

    return await preview_action(
        module=table_name,
        action=action_type,
        data=action_data,
        filters=filters,
        db=db,
        user_id=user_id,
        role=role,
        accessible_modules=accessible_modules,
    )


async def confirm_action(
    db: Session,
    user_id: int,
    role: str,
) -> Dict[str, Any]:
    """Execute the pending action after user confirmation."""
    import importlib
    from datetime import datetime, timezone

    pending = await get_pending_action(user_id)
    if pending is None:
        return {"error": "Tidak ada tindakan yang perlu dikonfirmasi."}

    action_type = pending.get("action")
    table_name = pending.get("module", "")
    action_data = pending.get("data", {})
    filters = pending.get("filters", {})

    await clear_pending_action(user_id)

    models_module = importlib.import_module("models")
    model_class = _get_model_class(table_name, models_module)
    if model_class is None:
        return {"error": f"Maaf, data '{table_name}' tidak ada di sistem."}

    try:
        if action_type == "create":
            from sqlalchemy import Date as SA_Date

            obj = model_class()
            for col, val in action_data.items():
                if not hasattr(obj, col):
                    continue
                col_type = getattr(model_class, col, None).type if hasattr(getattr(model_class, col, None), 'type') else None
                if isinstance(col_type, SA_Date) and isinstance(val, str):
                    for fmt in ("%d-%m-%Y", "%Y-%m-%d", "%d/%m/%Y", "%Y/%m/%d"):
                        try:
                            val = datetime.strptime(val, fmt).date()
                            break
                        except ValueError:
                            continue
                setattr(obj, col, val)

            if hasattr(obj, "created_at"):
                obj.created_at = datetime.now(timezone.utc)
            if hasattr(obj, "owner_role") and not getattr(obj, "owner_role", None):
                obj.owner_role = role
            if hasattr(obj, "created_by"):
                obj.created_by = user_id
            if hasattr(obj, "is_active") and not getattr(obj, "is_active", None):
                obj.is_active = True
            if hasattr(obj, "status") and not getattr(obj, "status", None):
                obj.status = "active"

            db.add(obj)
            db.commit()
            db.refresh(obj)
            await store_last_action(user_id, "create", table_name, obj_id=getattr(obj, "id", None))
            return {
                "action": "create",
                "table": table_name,
                "id": getattr(obj, "id", None),
                "message": f"✅ Data berhasil ditambahkan ke {table_name}.",
            }

        elif action_type == "update":
            query = db.query(model_class)
            for col, val in filters.items():
                if hasattr(model_class, col):
                    query = query.filter(getattr(model_class, col) == val)

            if hasattr(model_class, "deleted_at"):
                query = query.filter(model_class.deleted_at.is_(None))

            records = query.all()
            if not records:
                return {"error": "Data tidak ditemukan."}

            # Snapshot before update for undo
            ids = [r.id for r in records]
            data_before = {}
            if records:
                r = records[0]
                data_before = {col: getattr(r, col) for col in action_data if hasattr(r, col)}

            for obj in records:
                for col, val in action_data.items():
                    if hasattr(obj, col):
                        setattr(obj, col, val)
                if hasattr(obj, "updated_at"):
                    obj.updated_at = datetime.now(timezone.utc)

            db.commit()
            await store_last_action(user_id, "update", table_name, ids=ids, data_before=data_before, data_after=action_data)
            return {
                "action": "update",
                "table": table_name,
                "count": len(records),
                "message": f"✅ {len(records)} data berhasil diubah di {table_name}.",
            }

        elif action_type == "delete":
            query = db.query(model_class)
            for col, val in filters.items():
                if hasattr(model_class, col):
                    query = query.filter(getattr(model_class, col) == val)

            records = query.all()
            if not records:
                return {"error": "Data tidak ditemukan."}

            # Safety: jika multiple matches, minta user specify unique ID
            if len(records) > 1:
                items = []
                for r in records[:5]:  # Max 5 items
                    if hasattr(r, 'asset_code'):
                        items.append(f"- ID {r.id} ({r.asset_code}): {getattr(r, 'name', 'N/A')}")
                    else:
                        items.append(f"- ID {r.id}: {getattr(r, 'name', getattr(r, 'title', 'N/A'))}")
                
                return {
                    "error": f"Ditemukan {len(records)} data yang cocok. Spesifikasikan ID:\n" + 
                             "\n".join(items) + 
                             "\n\nContoh: 'hapus asset ID 123'"
                }

            if hasattr(model_class, "deleted_at"):
                ids = [r.id for r in records]
                for obj in records:
                    obj.deleted_at = datetime.now(timezone.utc)
                db.commit()
                await store_last_action(user_id, "soft_delete", table_name, ids=ids)
                return {
                    "action": "soft_delete",
                    "table": table_name,
                    "count": len(records),
                    "message": f"✅ {len(records)} data dinonaktifkan di {table_name}.",
                }
            else:
                for obj in records:
                    db.delete(obj)
                db.commit()
                return {
                    "action": "delete",
                    "table": table_name,
                    "count": len(records),
                    "message": f"✅ {len(records)} data dihapus dari {table_name}.",
                }

    except Exception as e:
        db.rollback()
        logger.error("Confirm action failed: %s", e, exc_info=True)
        return {"error": "Gagal mengeksekusi data. Coba lagi."}

    return {"error": "Maaf, saya kurang paham tindakan yang dimaksud."}


# ── Output validation ──────────────────────────────────────────────────

def validate_llm_output(raw: str) -> dict:
    """Parse and validate LLM JSON output. Returns validated dict or error dict."""
    raw = raw.strip()

    # Try to extract JSON from markdown code blocks
    json_match = re.search(r'```(?:json)?\s*\n?(.*?)\n?```', raw, re.DOTALL)
    if json_match:
        raw = json_match.group(1).strip()

    # Try to find JSON object in plain text
    brace_start = raw.find("{")
    brace_end = raw.rfind("}")
    if brace_start != -1 and brace_end != -1 and brace_end > brace_start:
        raw = raw[brace_start:brace_end + 1]

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return {"error": "Maaf, saya kurang paham maksud pertanyaannya. Bisa diulang dengan kata lain?"}

    # Check for error response
    if "error" in parsed:
        return {"error": parsed["error"]}

    # Check for action response
    if "action" in parsed:
        return parsed

    # Validate query fields
    table = parsed.get("table", "")
    if table not in _AVAILABLE_TABLES:
        return {"error": f"Maaf, data untuk '{table}' tidak tersedia."}

    # Normalize filters: LLM sometimes returns list instead of dict
    filters = parsed.get("filters", {})
    if isinstance(filters, list):
        normalized = {}
        for item in filters:
            if isinstance(item, dict):
                normalized.update(item)
            elif isinstance(item, str) and "=" in item:
                parts = item.split("=", 1)
                key = parts[0].strip().strip("'\"")
                val = parts[1].strip().strip("'\"")
                normalized[key] = val
        parsed["filters"] = normalized

    return parsed


# ── Preview / Execute helpers ─────────────────────────────────────────

async def set_pending_action(user_id: int, action_data: dict):
    async with _pending_lock:
        key = f"user_{user_id}"
        PENDING_ACTIONS[key] = action_data


async def get_pending_action(user_id: int) -> Optional[dict]:
    async with _pending_lock:
        return PENDING_ACTIONS.get(f"user_{user_id}")


async def clear_pending_action(user_id: int):
    async with _pending_lock:
        key = f"user_{user_id}"
        PENDING_ACTIONS.pop(key, None)


# ── Model class resolver ─────────────────────────────────
_AVAILABLE_TABLES: set = {
    "users", "roles", "asset_common", "asset_hardware", "asset_software",
    "incident_report", "vulnerability_report", "isu_matrix", "penilaian_risiko",
    "interested_parties", "peluang", "quality_objectives", "irmc_check",
    "monthly_server_check", "capacity_metrics", "project_tasks", "work_log",
    "activity_log", "ssh_login_logs", "backup_history", "notifications",
    "log_maintenance", "log_compression", "documents", "app_settings",
    "irmc_folders", "form_uploads", "form_types", "form_folders",
    "disk_partitions", "task_notes", "sprints",
    "worklog_checklist", "worklog_progress", "quality_evidence",
    "asset_configurations", "config_categories", "config_change_history",
    "configuration_items", "asset_metadata_categories",
    "asset_metadata_sub_categories", "asset_metadata_classifications",
    "asset_metadata_statuses", "document_categories", "document_versions",
    "risk_assessment_forms", "risk_assessment_logs", "risk_assessment_items",
    "opportunity_items", "issue_items", "isms_notes",
    "asset_users", "asset_virtual_infrastructure", "asset_information",
    "document_library",
}


def _get_model_class(table_name: str, module) -> Any:
    """Map table name to SQLAlchemy model class."""
    mapping = {
        "users": "User", "roles": "Role",
        "asset_common": "AssetCommon", "asset_hardware": "AssetHardware",
        "asset_software": "AssetSoftware", "asset_users": "AssetUsers",
        "asset_virtual_infrastructure": "AssetVirtualInfrastructure",
        "asset_information": "AssetInformation",
        "incident_report": "IncidentReport", "vulnerability_report": "VulnerabilityReport",
        "isu_matrix": "IsuMatrix", "penilaian_risiko": "PenilaianRisiko",
        "peluang": "Peluang", "quality_objectives": "QualityObjective",
        "irmc_check": "IRMCCheck", "monthly_server_check": "MonthlyServerCheck",
        "capacity_metrics": "CapacityMetrics", "project_tasks": "ProjectTask",
        "work_log": "WorkLog", "activity_log": "ActivityLog",
        "ssh_login_logs": "SSHLoginLog", "backup_history": "BackupHistory",
        "notifications": "Notification", "log_maintenance": "LogMaintenance",
        "log_compression": "LogCompression", "documents": "Document",
        "app_settings": "AppSettings", "form_uploads": "FormUpload",
        "configuration_items": "ConfigurationItem", "sprints": "Sprint",
        "risk_assessment_forms": "RiskAssessmentForm", "document_library": "DocumentLibrary",
        "interested_parties": "InterestedParty",
    }
    class_name = mapping.get(table_name)
    if class_name is None:
        return None
    return getattr(module, class_name, None)


# ── Undo helpers ──────────────────────────────────────────
async def store_last_action(user_id: int, action_type: str, table: str, obj_id: int | None = None,
                            ids: list[int] | None = None, data_before: dict | None = None,
                            data_after: dict | None = None):
    """Simpan snapshot aksi terakhir untuk undo (TTL 30 detik)."""
    async with _last_action_lock:
        _LAST_ACTION[user_id] = {
            "type": action_type,
            "table": table,
            "id": obj_id,
            "ids": ids,
            "data_before": data_before,
            "data_after": data_after,
            "timestamp": utcnow(),
        }


async def get_last_action(user_id: int) -> dict | None:
    async with _last_action_lock:
        entry = _LAST_ACTION.get(user_id)
        if not entry:
            return None
        if (utcnow() - entry["timestamp"]).total_seconds() > 30:
            _LAST_ACTION.pop(user_id, None)
            return None
        return entry


async def clear_last_action(user_id: int):
    async with _last_action_lock:
        _LAST_ACTION.pop(user_id, None)


async def undo_action(db: Session, user_id: int, role: str) -> dict:
    """Reverse the last create/update/delete action. Only within 30 seconds."""
    from datetime import datetime, timezone
    import importlib

    entry = await get_last_action(user_id)
    if not entry:
        return {"error": "Waktu undo sudah habis (30 detik) atau tidak ada aksi sebelumnya."}

    table_name = entry["table"]
    models_module = importlib.import_module("models")
    model_class = _get_model_class(table_name, models_module)
    if model_class is None:
        return {"error": f"Tabel '{table_name}' tidak ditemukan."}

    await clear_last_action(user_id)

    try:
        if entry["type"] == "create":
            obj_id = entry.get("id")
            if obj_id is None:
                return {"error": "Gagal: ID tidak ditemukan."}
            obj = db.query(model_class).filter(model_class.id == obj_id).first()
            if not obj:
                return {"error": "Data sudah tidak ada."}
            if hasattr(model_class, "deleted_at"):
                obj.deleted_at = datetime.now(timezone.utc)
                db.commit()
                return {"action": "undo_create", "table": table_name, "message": f"✅ Data berhasil dibatalkan (soft-delete)."}
            else:
                db.delete(obj)
                db.commit()
                return {"action": "undo_create", "table": table_name, "message": f"✅ Data berhasil dihapus."}

        elif entry["type"] == "update":
            ids = entry.get("ids", [])
            data_before = entry.get("data_before", {})
            if not ids or not data_before:
                return {"error": "Data snapshot tidak tersedia untuk undo."}
            records = db.query(model_class).filter(model_class.id.in_(ids)).all()
            for obj in records:
                for col, val in data_before.items():
                    if hasattr(obj, col):
                        setattr(obj, col, val)
                if hasattr(obj, "updated_at"):
                    obj.updated_at = datetime.now(timezone.utc)
            db.commit()
            return {"action": "undo_update", "table": table_name, "count": len(records), "message": f"✅ {len(records)} data dikembalikan ke nilai sebelumnya."}

        elif entry["type"] == "soft_delete":
            ids = entry.get("ids", [])
            records = db.query(model_class).filter(model_class.id.in_(ids)).all()
            for obj in records:
                if hasattr(obj, "deleted_at"):
                    obj.deleted_at = None
            db.commit()
            return {"action": "undo_delete", "table": table_name, "count": len(records), "message": f"✅ {len(records)} data dipulihkan."}

        return {"error": "Tipe aksi tidak didukung untuk undo."}

    except Exception as e:
        db.rollback()
        logger.error("Undo action failed: %s", e, exc_info=True)
        return {"error": "Gagal undo. Silakan coba manual."}


# ── Proactive suggestions ────────────────────────────────
async def get_suggestions(db: Session, user_id: int, role: str, accessible_modules: list[str]) -> list[dict]:
    """Generate context-aware proactive suggestions.
    
    Uses LLM for intelligent suggestions when model is loaded,
    falls back to DB-rule-based suggestions otherwise.
    """
    from sqlalchemy import func, or_
    from models import ProjectTask, IncidentReport, VulnerabilityReport, AssetCommon, MonthlyServerCheck

    stats = {}

    if role == "superadmin" or "tasks" in accessible_modules:
        overdue_query = db.query(func.count(ProjectTask.id)).filter(
            ProjectTask.status.notin_(["done", "completed", "cancelled"]),
            ProjectTask.due_date < utcnow().date(),
        )
        if role != "superadmin":
            overdue_query = overdue_query.filter(
                or_(ProjectTask.created_by == user_id, ProjectTask.assignee == str(user_id))
            )
        stats["overdue_tasks"] = overdue_query.scalar() or 0
        stats["total_tasks"] = db.query(func.count(ProjectTask.id)).filter(
            ProjectTask.deleted_at.is_(None) if hasattr(ProjectTask, "deleted_at") else True
        ).scalar() or 0

    if role == "superadmin" or "incident" in accessible_modules:
        open_query = db.query(func.count(IncidentReport.id)).filter(IncidentReport.status == "Open")
        if role != "superadmin":
            open_query = open_query.filter(IncidentReport.owner_role == role)
        stats["open_incidents"] = open_query.scalar() or 0

    if role == "superadmin" or "vulnerability" in accessible_modules:
        high_query = db.query(func.count(VulnerabilityReport.id)).filter(VulnerabilityReport.high_count > 0)
        if role != "superadmin":
            high_query = high_query.filter(VulnerabilityReport.owner_role == role)
        stats["high_vuln_reports"] = high_query.scalar() or 0

    if role == "superadmin" or "assets" in accessible_modules:
        stats["total_assets"] = db.query(func.count(AssetCommon.id)).filter(
            AssetCommon.deleted_at.is_(None) if hasattr(AssetCommon, "deleted_at") else True
        ).scalar() or 0

    if role == "superadmin" or "server-check" in accessible_modules:
        this_month = utcnow().date().replace(day=1)
        stats["unchecked_servers"] = db.query(func.count(MonthlyServerCheck.id)).filter(
            MonthlyServerCheck.check_date < this_month,
        ).scalar() or 0

    # Fallback: DB-rule suggestions
    suggestions = []
    if stats.get("overdue_tasks", 0) > 0:
        suggestions.append({
            "icon": "📌",
            "text": f"Ada {stats['overdue_tasks']} task yang melewati deadline.",
            "action": "Tampilkan task overdue",
        })
    if stats.get("open_incidents", 0) > 0:
        suggestions.append({
            "icon": "🚨",
            "text": f"Ada {stats['open_incidents']} insiden yang masih terbuka.",
            "action": "Tampilkan insiden terbuka",
        })
    if stats.get("high_vuln_reports", 0) > 0:
        suggestions.append({
            "icon": "⚠️",
            "text": f"Ada {stats['high_vuln_reports']} laporan dengan kerentanan tinggi.",
            "action": "Tampilkan kerentanan tinggi",
        })

    # LLM-enhanced suggestions (non-blocking)
    if any(stats.values()):
        try:
            stats_text = "\n".join(f"- {k}: {v}" for k, v in stats.items() if v)
            system_prompt = (
                "Kamu asisten IT Management. Berdasarkan data berikut, "
                "berikan 1-2 saran proaktif dalam Bahasa Indonesia. "
                f"Role user: {role}.\n\nData:\n{stats_text}\n\n"
                "Return JSON array: [{\"icon\": \"emoji\", \"text\": \"saran\", \"action\": \"perintah query\"}]"
            )
            raw = await query_llm(
                [{"role": "system", "content": system_prompt}],
                max_tokens=300, temperature=0.7,
            )
            parsed = _parse_suggestions_llm(raw)
            if parsed:
                suggestions = parsed
        except Exception as e:
            logger.debug("LLM suggestion failed, using DB rules: %s", e)

    return suggestions


def _parse_suggestions_llm(raw: str) -> list[dict] | None:
    """Parse LLM output into structured suggestions list."""
    import re
    json_match = re.search(r'\[.*?\]', raw, re.DOTALL)
    if not json_match:
        return None
    try:
        parsed = json.loads(json_match.group())
        if isinstance(parsed, list) and all(isinstance(s, dict) and "text" in s for s in parsed):
            return parsed
    except (json.JSONDecodeError, TypeError):
        pass
    return None


async def preview_action(
    module: str,
    action: str,
    data: dict,
    filters: dict,
    db: Session,
    user_id: int,
    role: str,
    accessible_modules: List[str],
) -> dict:
    """Generate a diff preview for the proposed action. Does NOT execute."""
    from utils.ai_bridge import _MODUL_TO_RBAC
    rbac_modul = _MODUL_TO_RBAC.get(module, module)
    if rbac_modul not in accessible_modules and role != "superadmin":
        return {"error": "Anda tidak memiliki akses ke modul ini."}

    preview = {
        "module": module,
        "action": action,
        "data": data,
        "filters": filters,
        "status": "preview",
    }

    if action == "create":
        preview["description"] = f"Akan menambahkan data baru ke modul {module}"
    elif action == "update":
        preview["description"] = f"Akan mengubah data di modul {module}: {data}"
        preview["filter_description"] = f"Filter: {filters}"
    elif action == "delete":
        preview["description"] = f"Akan menghapus data dari modul {module}"
        preview["filter_description"] = f"Filter: {filters}"

    await set_pending_action(user_id, preview)
    return preview
