"""
AI Engine — LLM-based natural language query and action engine for Super Apps.
Self-contained, runs via llama-cpp-python (CPU), no external API calls.
"""
import asyncio
import json
import logging
import re
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

_executor = ThreadPoolExecutor(max_workers=1)
_model_instance = None
_model_lock = asyncio.Lock()

MODEL_PATH = Path(__file__).parent.parent / "data" / "ai" / "qwen2.5-1.5b-instruct-q4_k_m.gguf"
MAX_INPUT_TOKENS = 2048
MAX_OUTPUT_TOKENS = 512

PENDING_ACTIONS: Dict[str, dict] = {}

_AVAILABLE_TABLES = [
    "users", "roles", "asset_common", "asset_hardware", "asset_software",
    "incident_report", "vulnerability_report", "isu_matrix", "penilaian_risiko",
    "interested_parties", "peluang", "quality_objectives", "irmc_check",
    "monthly_server_check", "capacity_metrics", "project_tasks", "work_log",
    "activity_log", "ssh_login_logs", "backup_history", "notifications",
    "log_maintenance", "documents", "app_settings",
]

_AGGREGATE_MODES = {"count", "sum", "avg", "min", "max", "group_by", "list"}
_VALID_OPERATORS = {"eq", "neq", "gt", "gte", "lt", "lte", "like", "in", "between"}


# ── Model loading ──────────────────────────────────────────────────────

def load_model():
    global _model_instance
    if _model_instance is not None:
        return
    if not MODEL_PATH.exists():
        logger.warning("AI model not found at %s. AI features disabled.", MODEL_PATH)
        return
    logger.info("Loading AI model %s ... (this may take 30-60 seconds)", MODEL_PATH.name)
    from llama_cpp import Llama
    _model_instance = Llama(
        model_path=str(MODEL_PATH),
        n_ctx=4096,
        n_threads=8,
        n_gpu_layers=0,
        verbose=False,
    )
    logger.info("AI model loaded: %s", MODEL_PATH.name)


def unload_model():
    global _model_instance
    if _model_instance is not None:
        del _model_instance
        _model_instance = None
        logger.info("AI model unloaded")


def is_model_loaded() -> bool:
    return _model_instance is not None


async def query_llm(messages: List[dict], max_tokens: int = MAX_OUTPUT_TOKENS, temperature: float = 0.1) -> str:
    """Call the local LLM asynchronously via thread pool. Returns raw text."""
    model = _model_instance
    if model is None:
        raise RuntimeError("AI model not loaded")

    async with _model_lock:
        raw = await asyncio.get_event_loop().run_in_executor(
            _executor,
            _do_inference,
            model,
            messages,
            max_tokens,
            temperature,
        )
    return raw


def _do_inference(model, messages, max_tokens, temperature):
    try:
        result = model.create_chat_completion(
            messages=messages,
            max_tokens=max_tokens,
            temperature=temperature,
            stop=["<|im_end|>", "<|end|>"],
        )
        return result["choices"][0]["message"]["content"].strip()
    except Exception as e:
        logger.error("LLM inference failed: %s", e, exc_info=True)
        return json.dumps({"error": f"AI inference error: {str(e)}"})


# ── System prompt ──────────────────────────────────────────────────────

def build_system_prompt(role: str, accessible_modules: List[str], schema_text: str) -> str:
    return f"""Kamu adalah asisten AI untuk Super Apps IT Management System. Pengguna saat ini: role={role}.

GAYA RESPON:
- Gunakan bahasa Indonesia yang hangat dan alami, seperti ngobrol dengan rekan kerja
- Respon query data dengan ramah: sampaikan hasilnya dengan kalimat yang enak dibaca
- Jika hasil kosong, bilang dengan sopan bukan "Tidak ada data"
- Jangan terlalu kaku atau formal berlebihan
- Tanya jawab singkat saja, tidak perlu panjang lebar

BATASAN KEAMANAN (WAJIB):
- Hanya jawab pertanyaan tentang data aplikasi, bukan pengetahuan umum
- JANGAN pernah ungkapkan password, token, kunci, atau kredensial
- JANGAN pernah ubah role/user/settings
- Operasi CREATE/UPDATE/DELETE WAJIB minta konfirmasi user dulu (preview + tanya "Lanjutkan?")

TABEL YANG TERSEDIA:
{schema_text}

UNTUK PERTANYAAN DATA: respon dengan JSON query.
Format: {{"table":"...","columns":["..."],"filters":{{}},"aggregate":"count|list","order_by":"...","limit":10}}
Jika tidak bisa menjawab: {{"error":"pesan singkat"}}

UNTUK PERINTAH TULIS: respon dengan JSON action.
Format: {{"action":"create|update|delete","table":"...","data":{{"kolom":"nilai"}},"filters":{{}}}}"""  # noqa: E501


# ── Intent parsing ─────────────────────────────────────────────────────

def parse_intent(user_message: str, has_pending: bool = False) -> str:
    """Classify user intent: query | confirm | reject | action | greeting | unknown."""
    msg = user_message.strip().lower()

    if has_pending:
        if msg in ("ya", "y", "yes", "oke", "ok", "lanjut", "setuju", "confirm", "simpan"):
            return "confirm"
        if msg in ("tidak", "ga", "gak", "no", "cancel", "batal", "nanti", "jangan"):
            return "reject"

    greetings = {"halo", "hai", "hi", "hello", "pagi", "siang", "sore", "malam", "test", "tes", "hey"}
    if msg.strip() in greetings:
        return "greeting"

    keywords_create = {"tambah", "buat", "create", "input", "insert", "daftarkan", "simpan"}
    keywords_update = {"ubah", "edit", "update", "perbarui", "ganti", "modif"}
    keywords_delete = {"hapus", "delete", "remove", "buang", "nonaktifkan"}
    keywords_query = {
        "berapa", "siapa", "apa", "mana", "kapan", "list", "cari", "tampilkan",
        "show", "count", "total", "daftar", "data", "semua", "yang",
    }

    words = set(msg.split())

    has_create = bool(words & keywords_create)
    has_update = bool(words & keywords_update)
    has_delete = bool(words & keywords_delete)
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


# ── Query data ─────────────────────────────────────────────────────────

async def query_data(
    user_message: str,
    db: Session,
    user_id: int,
    role: str,
    accessible_modules: List[str],
) -> Dict[str, Any]:
    """Natural language → LLM → structured query → ORM → formatted result."""
    from utils.ai_schema import get_compact_schema_text

    schema_text = get_compact_schema_text()
    system_msg = build_system_prompt(role, accessible_modules, schema_text)

    user_prompt = f"""Tabel: asset_common (Common asset), asset_hardware (Hardware), asset_software (Software), users (Users), ...

Pertanyaan: {user_message}

Return JSON:
{{"table":"...","columns":["..."],"filters":{{}},"aggregate":"count|list","order_by":"...","limit":10}}
Atau error: {{"error":"pesan error"}}"""

    messages = [
        {"role": "system", "content": system_msg},
        {"role": "user", "content": user_prompt},
    ]

    try:
        raw = await query_llm(messages, max_tokens=MAX_OUTPUT_TOKENS, temperature=0.1)
    except RuntimeError:
        return {"error": "Maaf, AI sedang tidak tersedia. Coba lagi ya."}
    except Exception as e:
        logger.error("Query LLM failed: %s", e, exc_info=True)
        return {"error": f"Maaf, ada gangguan: {str(e)}"}

    parsed = validate_llm_output(raw)
    if "error" in parsed:
        return parsed

    return _execute_query(parsed, db, user_id, role)


def _execute_query(parsed: dict, db: Session, user_id: int, role: str) -> Dict[str, Any]:
    """Execute a validated structured query against the database."""
    import importlib
    models_module = importlib.import_module("models")

    table_name = parsed.get("table", "")
    model_class = _get_model_class(table_name, models_module)
    if model_class is None:
        return {"error": f"Maaf, data '{table_name}' tidak ada di sistem."}

    query = db.query(model_class)

    # Soft delete filter
    if hasattr(model_class, "deleted_at"):
        query = query.filter(model_class.deleted_at.is_(None))

    # RBAC filter
    if role != "superadmin":
        if table_name in _get_rbac_tables():
            if hasattr(model_class, "owner_role"):
                query = query.filter(model_class.owner_role == role)
        elif table_name in _get_created_by_tables():
            if hasattr(model_class, "created_by"):
                query = query.filter(model_class.created_by == user_id)

    # Apply filters
    from sqlalchemy import and_
    filters = parsed.get("filters", {})
    filter_conditions = []
    for col_name, col_value in filters.items():
        if not hasattr(model_class, col_name):
            continue
        col = getattr(model_class, col_name)
        if isinstance(col_value, dict):
            op = col_value.get("op", "eq")
            val = col_value.get("value")
            if op == "eq":
                filter_conditions.append(col == val)
            elif op == "neq":
                filter_conditions.append(col != val)
            elif op == "gt":
                filter_conditions.append(col > val)
            elif op == "gte":
                filter_conditions.append(col >= val)
            elif op == "lt":
                filter_conditions.append(col < val)
            elif op == "lte":
                filter_conditions.append(col <= val)
            elif op == "like":
                filter_conditions.append(col.ilike(f"%{val}%"))
            elif op == "in":
                filter_conditions.append(col.in_(val if isinstance(val, list) else [val]))
            elif op == "between":
                filter_conditions.append(col.between(val[0], val[1]))
        else:
            filter_conditions.append(col == col_value)

    if filter_conditions:
        query = query.filter(and_(*filter_conditions))

    # Aggregation
    aggregate = parsed.get("aggregate", "list")
    columns = parsed.get("columns", None)
    group_by = parsed.get("group_by")
    order_by = parsed.get("order_by")
    order_dir = parsed.get("order_dir", "asc")
    limit = parsed.get("limit", 20)

    if aggregate == "count":
        if group_by and hasattr(model_class, group_by):
            group_col = getattr(model_class, group_by)
            from sqlalchemy import func
            result = query.with_entities(group_col, func.count()).group_by(group_col).all()
            return {"data": {str(r[0]): r[1] for r in result}, "count": sum(r[1] for r in result)}

        total = query.count()
        return {"data": [], "count": total}

    if order_by and hasattr(model_class, order_by):
        order_col = getattr(model_class, order_by)
        if order_dir == "desc":
            query = query.order_by(order_col.desc())
        else:
            query = query.order_by(order_col.asc())

    results = query.limit(limit).all()

    if columns:
        data = []
        for obj in results:
            row = {}
            for col in columns:
                if hasattr(obj, col):
                    val = getattr(obj, col)
                    if hasattr(val, "isoformat"):
                        val = val.isoformat()
                    row[col] = val
            data.append(row)
    else:
        data = _serialize_objects(results)

    return {"data": data, "count": len(data)}


def _get_model_class(table_name: str, module) -> Any:
    """Map table name to SQLAlchemy model class."""
    mapping = {
        "users": "User",
        "roles": "Role",
        "asset_common": "AssetCommon",
        "asset_hardware": "AssetHardware",
        "asset_software": "AssetSoftware",
        "incident_report": "IncidentReport",
        "vulnerability_report": "VulnerabilityReport",
        "isu_matrix": "IsuMatrix",
        "penilaian_risiko": "PenilaianRisiko",
        "interested_parties": "InterestedParty",
        "peluang": "Peluang",
        "quality_objectives": "QualityObjective",
        "irmc_check": "IRMCCheck",
        "monthly_server_check": "MonthlyServerCheck",
        "capacity_metrics": "CapacityMetrics",
        "project_tasks": "ProjectTask",
        "work_log": "WorkLog",
        "activity_log": "ActivityLog",
        "ssh_login_logs": "SSHLoginLog",
        "backup_history": "BackupHistory",
        "notifications": "Notification",
        "log_maintenance": "LogMaintenance",
        "documents": "Document",
        "app_settings": "AppSettings",
    }
    class_name = mapping.get(table_name)
    if class_name is None:
        return None
    return getattr(module, class_name, None)


def _get_rbac_tables():
    """Get set of tables that need owner_role filtering."""
    from utils.ai_schema import RBAC_TABLES
    return RBAC_TABLES


def _get_created_by_tables():
    """Get set of tables that need created_by filtering."""
    from utils.ai_schema import CREATED_BY_TABLES
    return CREATED_BY_TABLES


def _serialize_objects(objects: list) -> List[dict]:
    """Convert ORM objects to dicts."""
    data = []
    for obj in objects:
        row = {}
        for col in obj.__table__.columns.keys():
            val = getattr(obj, col, None)
            if hasattr(val, "isoformat"):
                val = val.isoformat()
            row[col] = val
        data.append(row)
    return data


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
        return {"error": f"Maaf, ada gangguan: {str(e)}"}

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

    pending = get_pending_action(user_id)
    if pending is None:
        return {"error": "Tidak ada tindakan yang perlu dikonfirmasi."}

    action_type = pending.get("action")
    table_name = pending.get("module", "")
    action_data = pending.get("data", {})
    filters = pending.get("filters", {})

    clear_pending_action(user_id)

    models_module = importlib.import_module("models")
    model_class = _get_model_class(table_name, models_module)
    if model_class is None:
        return {"error": f"Maaf, data '{table_name}' tidak ada di sistem."}

    try:
        if action_type == "create":
            obj = model_class()
            for col, val in action_data.items():
                if hasattr(obj, col):
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

            for obj in records:
                for col, val in action_data.items():
                    if hasattr(obj, col):
                        setattr(obj, col, val)
                if hasattr(obj, "updated_at"):
                    obj.updated_at = datetime.now(timezone.utc)

            db.commit()
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

            if hasattr(model_class, "deleted_at"):
                for obj in records:
                    obj.deleted_at = datetime.now(timezone.utc)
                db.commit()
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
        return {"error": f"Gagal mengeksekusi: {str(e)}"}

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

def set_pending_action(user_id: int, action_data: dict):
    key = f"user_{user_id}"
    PENDING_ACTIONS[key] = action_data


def get_pending_action(user_id: int) -> Optional[dict]:
    return PENDING_ACTIONS.get(f"user_{user_id}")


def clear_pending_action(user_id: int):
    key = f"user_{user_id}"
    PENDING_ACTIONS.pop(key, None)


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
    if module not in accessible_modules and role != "superadmin":
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

    set_pending_action(user_id, preview)
    return preview
