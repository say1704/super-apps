"""
AI Chat API — Natural language query and action interface for Super Apps.
"""
import json
import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from database import get_db
from models import User
from api.dependencies import (
    get_current_user,
    resolve_user_modules,
    broadcast_event,
)
from utils.activity_logger import log_activity as log_activity_util
from utils.ai_engine import (
    parse_intent,
    handle_action,
    confirm_action,
    get_pending_action,
    clear_pending_action,
    undo_action,
    get_suggestions,
)
from utils.ai_bridge import rag_query, rag_query_stream, _get_last_query_data
from utils.ai_audit import (
    log_audit,
    needs_approval as _needs_approval,
    stage_pending_for_approval,
    approve_action as _approve_action,
    get_pending_approvals,
    get_audit_logs,
)
from utils.ai_conversation import add_message as _add_conv_message, list_conversations, get_conversation, delete_conversation
from utils.ai_wizard import (
    get_active_wizard,
    start_wizard,
    process_wizard_answer,
    cancel_wizard,
    build_create_data,
    WIZARD_FIELDS,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["AI"])


# ── Helpers ──────────────────────────────────────────────

def _resolve_audit_user(current_user: User) -> tuple[int, str, str | None]:
    return current_user.id, current_user.role, None


async def _get_pending_action_context(user_id: int) -> dict | None:
    """Get the current pending action and extract key fields for audit/approval."""
    from utils.ai_engine import get_pending_action
    return await get_pending_action(user_id)


def _chat_response(data: dict, db: Session, user_id: int, conversation_id: int | None) -> dict:
    """Wrap a chat response with conversation_id and persist assistant message."""
    if conversation_id:
        assistant_msg = data.get("response", "")
        if assistant_msg:
            _add_conv_message(db, conversation_id, user_id, "assistant", assistant_msg)
            db.commit()
        data["conversation_id"] = conversation_id
    return data


def _confirm_or_approve(
    db: Session,
    user_id: int,
    role: str,
    pending: dict,
    ip_address: str | None,
) -> dict:
    """
    Check if pending action needs approval. 
    Returns {"needs_approval": True, "audit_id": ..., "response": "..."} if approval needed.
    Returns {"needs_approval": False} if can proceed directly.
    """
    action_type = pending.get("action")
    table_name = pending.get("module", "")
    action_data = pending.get("data", {})
    filters = pending.get("filters", {})

    if _needs_approval(action_type, table_name, role):
        audit_entry = stage_pending_for_approval(
            db, user_id, action_type, table_name, action_data, filters,
            pending, ip_address=ip_address,
        )
        return {
            "needs_approval": True,
            "response": (
                f"Tindakan ini memerlukan persetujuan admin. "
                f"Permintaan telah dikirim (ID #{audit_entry.id}). "
                "Silakan tunggu persetujuan."
            ),
        }
    return {"needs_approval": False}

# Keyword → module mapping untuk mendeteksi module dari pesan user
_CREATE_MODULE_KEYWORDS = {
    "asset_common": {"asset", "aset", "barang", "inventaris"},
    "incident_report": {"incident", "insiden", "laporan", "gangguan"},
    "project_tasks": {"task", "tugas", "proyek", "pekerjaan"},
    "work_log": {"worklog", "log kerja", "timesheet", "log pekerjaan"},
    "log_maintenance": {"log maintenance", "deletion", "hapus log", "maintenance log"},
    "log_compression": {"kompresi log", "compression", "log compression"},
    "documents": {"dokumen", "document"},
    "document_library": {"library", "sop", "instruksi"},
    "sprints": {"sprint"},
    "isu_matrix": {"isu", "risk matrix", "matrix isu"},
    "penilaian_risiko": {"penilaian", "scoring", "penilaian risiko"},
    "peluang": {"peluang", "opportunity"},
    "quality_objectives": {"sasaran mutu", "quality", "sasaran"},
    "risk_assessment_forms": {"risk assessment", "assessment risiko"},
    "configuration_items": {"configuration item", "ci", "konfigurasi item"},
    "irmc_check": {"irmc", "cek irmc"},
    "monthly_server_check": {"monthly check", "cek bulanan", "monthly server check"},
}

_MODULE_DISPLAY = {
    "asset_common": "Asset Register",
    "incident_report": "Incident Report",
    "project_tasks": "Project Tasks",
    "work_log": "Work Log",
    "log_maintenance": "Log Maintenance",
    "log_compression": "Log Compression",
    "documents": "Documents",
    "document_library": "Document Library",
    "sprints": "Sprints",
    "isu_matrix": "Isu Matrix",
    "penilaian_risiko": "Penilaian Risiko",
    "peluang": "Peluang",
    "quality_objectives": "Quality Objectives",
    "risk_assessment_forms": "Risk Assessment Forms",
    "configuration_items": "Configuration Items",
    "irmc_check": "IRMC Check",
    "monthly_server_check": "Monthly Server Check",
}


def _detect_create_module(msg: str) -> str | None:
    """Detect module from user create message via keyword matching."""
    msg_lower = msg.lower()
    words = set(msg_lower.split())
    best_match = None
    best_count = 0
    for modul, keywords in _CREATE_MODULE_KEYWORDS.items():
        count = sum(1 for kw in keywords if kw in msg_lower or kw in words)
        if count > best_count:
            best_count = count
            best_match = modul
    return best_match if best_count > 0 else None


async def _execute_wizard_create(
    db: Session, user_id: int, role: str, ip_address: str | None,
    accessible_modules: list[str] | None = None,
) -> str:
    """Execute create from completed wizard state. Return success/error message."""
    from sqlalchemy import inspect, Date
    from datetime import datetime, timezone, date
    import importlib

    data = await build_create_data(user_id)
    if not data:
        return "Data tidak lengkap. Silakan coba lagi dari awal."

    module = data["module"]
    common = data.get("common", {})
    extensions = data.get("extensions", {})
    models_module = importlib.import_module("models")

    # ── RBAC check ──
    if accessible_modules is not None and role != "superadmin":
        from utils.ai_bridge import _MODUL_TO_RBAC
        rbac_modul = _MODUL_TO_RBAC.get(module, module)
        if rbac_modul not in accessible_modules:
            return "Anda tidak memiliki akses ke modul ini."

    if module == "asset_common":
        model_class = getattr(models_module, "AssetCommon", None)
        if model_class is None:
            return "System error: model tidak ditemukan."

        obj = model_class()
        asset_mapper = inspect(model_class)
        asset_columns = {c.name: c.type for c in asset_mapper.c}
        for col, val in common.items():
            if hasattr(obj, col):
                col_type = asset_columns.get(col)
                if isinstance(col_type, Date) and isinstance(val, str):
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
            obj.created_by = str(user_id)
        if hasattr(obj, "status") and not getattr(obj, "status", None):
            obj.status = "active"

        # Auto-generate asset_code
        if hasattr(obj, "asset_code") and not getattr(obj, "asset_code", None):
            prefix = "AST"
            year = datetime.now(timezone.utc).strftime("%Y")
            import random
            obj.asset_code = f"{prefix}-{year}-{random.randint(1, 9999):04d}"

        db.add(obj)
        db.flush()

        # Create extension records
        for ext_modul, ext_data in extensions.items():
            ext_key = {
                "asset_hardware": "AssetHardware",
                "asset_software": "AssetSoftware",
                "asset_users": "AssetUsers",
                "asset_virtual_infrastructure": "AssetVirtualInfrastructure",
                "asset_information": "AssetInformation",
            }.get(ext_modul)
            if ext_key:
                ext_cls = getattr(models_module, ext_key, None)
                if ext_cls:
                    ext_obj = ext_cls()
                    ext_obj.asset_id = obj.id
                    for col, val in ext_data.items():
                        if hasattr(ext_obj, col):
                            setattr(ext_obj, col, val)
                    db.add(ext_obj)

        try:
            db.commit()
        except Exception as e:
            db.rollback()
            await cancel_wizard(user_id)
            return "Terjadi kesalahan saat menyimpan data. Coba lagi."
        await cancel_wizard(user_id)
        display = _MODULE_DISPLAY.get(module, module.replace("_", " ").title())
        return f"✅ Data berhasil ditambahkan ke {display}."

    # Non-asset modules
    mapper = {
        "incident_report": "IncidentReport",
        "project_tasks": "ProjectTask",
        "work_log": "WorkLog",
        "log_maintenance": "LogMaintenance",
        "log_compression": "LogCompression",
        "documents": "Document",
        "document_library": "DocumentLibrary",
        "sprints": "Sprint",
        "isu_matrix": "IsuMatrix",
        "penilaian_risiko": "PenilaianRisiko",
        "peluang": "Peluang",
        "quality_objectives": "QualityObjective",
        "risk_assessment_forms": "RiskAssessmentForm",
        "configuration_items": "ConfigurationItem",
        "irmc_check": "IRMCCheck",
        "monthly_server_check": "MonthlyServerCheck",
    }
    class_name = mapper.get(module)
    if not class_name:
        return f"Module '{module}' belum didukung."

    model_class = getattr(models_module, class_name, None)
    if model_class is None:
        return "System error: model tidak ditemukan."

    obj = model_class()
    mapper = inspect(model_class)
    columns = {c.name: c.type for c in mapper.c}
    for col, val in common.items():
        if hasattr(obj, col):
            col_type = columns.get(col)
            if isinstance(col_type, Date) and isinstance(val, str):
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
    if hasattr(obj, "status") and not getattr(obj, "status", None):
        obj.status = "active"

    db.add(obj)
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        await cancel_wizard(user_id)
        return "Terjadi kesalahan saat menyimpan data. Coba lagi."
    await cancel_wizard(user_id)
    display = _MODULE_DISPLAY.get(module, module.replace("_", " ").title())
    return f"✅ Data berhasil ditambahkan ke {display}."


@router.get("/ai/status")
async def ai_status(
    current_user: User = Depends(get_current_user),
):
    pending = await get_pending_action(current_user.id)
    return {
        "model_loaded": True,
        "has_pending_action": pending is not None,
        "pending_action": pending,
    }


@router.get("/ai/rag/status")
async def ai_rag_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Status indeks RAG (jumlah chunk per sumber)."""
    from utils.rag_retrieve import rag_status
    return rag_status(db)


@router.post("/ai/reindex")
async def ai_reindex(
    full: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Bangun ulang indeks RAG dari semua sumber (superadmin). full=true paksa embed ulang."""
    if getattr(current_user, "role", None) != "superadmin":
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Hanya superadmin")
    from utils.rag_index import reindex
    return reindex(db, full=full)


@router.post("/ai/agent")
async def ai_agent(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mode Agent (LangGraph autonomous tool-calling). Untuk pertanyaan kompleks/multi-data.
    Selalu aman: fallback ke jawaban RAG bila agent gagal/timeout."""
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")
    user_message = (body.get("message") or "").strip()
    history = body.get("history", [])
    conversation_id = body.get("conversation_id")
    if not user_message:
        raise HTTPException(status_code=400, detail="Message is required")

    accessible_modules = resolve_user_modules(current_user, db)
    user_ctx = {"user_id": current_user.id, "role": current_user.role,
                "accessible_modules": accessible_modules}
    from utils.agent_graph import run_agent
    result = await run_agent(user_message, user_ctx, history,
                             thread_id=str(conversation_id or current_user.id))
    return result


@router.post("/ai/chat")
async def ai_chat(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    user_message = body.get("message", "").strip()
    history = body.get("history", [])
    conversation_id = body.get("conversation_id")
    ip_address = request.client.host if request.client else None

    # Persist user message to conversation
    if user_message:
        user_msg = _add_conv_message(
            db, conversation_id,
            current_user.id, "user", user_message, extra_data={"ip": ip_address},
        )
        db.commit()
        conversation_id = user_msg.conversation_id

    if not user_message:
        raise HTTPException(status_code=400, detail="Message is required")

    accessible_modules = resolve_user_modules(current_user, db)

    # ── Wizard handler ──────────────────────────────────────────
    wizard = await get_active_wizard(current_user.id)
    if wizard:
        if wizard.get("phase") == "complete" and user_message.lower() in (
            "ya", "y", "yes", "oke", "ok", "lanjut", "setuju", "simpan"):
            msg = await _execute_wizard_create(db, current_user.id, current_user.role, ip_address, accessible_modules)
            log_activity_util(
                db, current_user.id, "CREATE", "ai",
                f"AI wizard create: {wizard.get('module', 'unknown')}",
                ip_address=ip_address,
            )
            db.commit()
            await broadcast_event("ai_action", {"user_id": current_user.id, "action": "create"})
            return {"response": msg, "pending_action": None}

        if user_message.lower() in ("tidak", "ga", "gak", "no", "cancel", "batal", "nanti"):
            await cancel_wizard(current_user.id)
            return {"response": "Oke, dibatalkan.", "pending_action": None}

        result = await process_wizard_answer(current_user.id, user_message)

        if result["status"] == "complete":
            # Semua field terkumpul, simpan phase agar "ya" bisa trigger execute
            w = await get_active_wizard(current_user.id)
            if w:
                w["phase"] = "complete"
            return {
                "response": result["summary"],
                "pending_action": None,
            }

        if result["status"] == "error":
            return {"response": result["message"], "pending_action": None}

        return {
            "response": _format_wizard_question(result),
            "pending_action": None,
        }

    # ── Standard flow ───────────────────────────────────────────
    has_pending = await get_pending_action(current_user.id) is not None
    intent = parse_intent(user_message, has_pending)

    if intent == "greeting":
        return _chat_response({
            "response": "Halo! Ada yang bisa saya bantu? Saya bisa menjawab pertanyaan tentang data aplikasi, atau membantu menambah/mengubah/menghapus data.",
            "pending_action": None,
        }, db, current_user.id, conversation_id)

    if intent == "confirm":
        pending = await get_pending_action(current_user.id)
        if pending:
            approval = _confirm_or_approve(db, current_user.id, current_user.role, pending, ip_address)
            if approval["needs_approval"]:
                await clear_pending_action(current_user.id)
                db.commit()
                return _chat_response({"response": approval["response"], "pending_action": None}, db, current_user.id, conversation_id)

        result = await confirm_action(db, current_user.id, current_user.role)

        # Audit log
        if "error" not in result:
            log_audit(
                db, current_user.id, result.get("action", "unknown"),
                result.get("table", "unknown"),
                record_ids=[result["id"]] if result.get("id") else None,
                details={"message": result.get("message")},
                ip_address=ip_address,
            )

        log_activity_util(
            db, current_user.id, "UPDATE", "ai",
            f"Confirmed AI action: {result.get('action', 'unknown')}",
            ip_address=ip_address,
        )
        db.commit()
        await broadcast_event("ai_action", {"user_id": current_user.id, "action": result.get("action")})
        return _chat_response({"response": result.get("message", result.get("error", "")), "pending_action": None}, db, current_user.id, conversation_id)

    if intent == "reject":
        await clear_pending_action(current_user.id)
        return _chat_response({"response": "Tindakan dibatalkan.", "pending_action": None}, db, current_user.id, conversation_id)

    if intent == "action":
        # Hanya start wizard untuk CREATE action
        keywords_create = {"tambah", "buat", "create", "input", "insert", "daftarkan", "simpan", "masukan", "masukkan"}
        msg_lower = user_message.lower()
        is_create = any(kw in msg_lower for kw in keywords_create)
        
        if is_create:
            module = _detect_create_module(user_message)
            if module and module in WIZARD_FIELDS:
                wizard_result = await start_wizard(current_user.id, module)
                if wizard_result.get("status") == "error":
                    return {"response": wizard_result["message"], "pending_action": None}
                return {
                    "response": _format_wizard_question(wizard_result),
                    "pending_action": None,
                }
        
        # DELETE/UPDATE atau CREATE tanpa wizard → handle_action
        result = await handle_action(
            user_message, db, current_user.id, current_user.role, accessible_modules
        )
        if "error" in result:
            return {"response": result["error"], "pending_action": None}
        pending = await get_pending_action(current_user.id)
        description = result.get("description", "")
        filter_desc = result.get("filter_description", "")
        preview_text = f"{description}\n{filter_desc}" if filter_desc else description
        log_activity_util(
            db, current_user.id, "CREATE", "ai",
            f"AI action preview: {result.get('action', 'unknown')} on {result.get('module', 'unknown')}",
            ip_address=ip_address,
        )
        db.commit()
        return _chat_response({
            "response": f"{preview_text}\n\nKetik 'ya' untuk konfirmasi atau 'tidak' untuk membatalkan.",
            "pending_action": pending,
        }, db, current_user.id, conversation_id)

    # Inject conversation summary into history for context
    if conversation_id:
        from utils.ai_conversation import get_summary_context, get_recent_messages, maybe_summarize
        summary = get_summary_context(db, conversation_id)
        if summary:
            history = [
                {"role": "system", "content": f"Ringkasan percakapan sebelumnya: {summary}"},
            ] + get_recent_messages(db, conversation_id)
        # Trigger auto-summarize after response
        await maybe_summarize(db, conversation_id)

    response_text = await rag_query(
        user_message, history, db,
        current_user.id, current_user.role, accessible_modules,
    )
    query_data = await _get_last_query_data()
    log_activity_util(
        db, current_user.id, "VIEW", "ai",
        f"AI query: {user_message[:100]}",
        ip_address=ip_address,
    )
    db.commit()
    response_obj = {"response": response_text, "pending_action": None}
    if query_data:
        response_obj["query_data"] = query_data
    return _chat_response(response_obj, db, current_user.id, conversation_id)


def _format_wizard_question(result: dict) -> str:
    """Format wizard question for the user."""
    if result["status"] != "collecting":
        return result.get("summary", result.get("question", ""))

    field_type = result.get("type", "text")
    label = result.get("label", "")
    required = result.get("required", False)
    options = result.get("options")

    if options:
        opts = ", ".join(options)
        return f"{label}? Pilihan: {opts}"

    suffix = " (wajib)" if required else " (opsional, ketik 'skip' untuk lewati)"
    return f"{label}?{suffix}"


@router.post("/ai/confirm")
async def ai_confirm(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ip_address = request.client.host if request.client else None

    pending = await get_pending_action(current_user.id)
    if pending:
        approval = _confirm_or_approve(db, current_user.id, current_user.role, pending, ip_address)
        if approval["needs_approval"]:
            await clear_pending_action(current_user.id)
            db.commit()
            return {"response": approval["response"]}

    result = await confirm_action(db, current_user.id, current_user.role)
    if "error" not in result:
        log_audit(
            db, current_user.id, result.get("action", "unknown"),
            result.get("table", "unknown"),
            record_ids=[result["id"]] if result.get("id") else None,
            details={"message": result.get("message")},
            ip_address=ip_address,
        )
    log_activity_util(
        db, current_user.id, "UPDATE", "ai",
        f"Confirmed AI action: {result.get('action', 'unknown')} on {result.get('table', 'unknown')}",
        ip_address=ip_address,
    )
    db.commit()
    await broadcast_event("ai_action", {"user_id": current_user.id, "action": result.get("action")})
    return {"response": result.get("message", "")}


@router.post("/ai/cancel")
async def ai_cancel(
    current_user: User = Depends(get_current_user),
):
    await clear_pending_action(current_user.id)
    return {"response": "Tindakan dibatalkan."}


@router.post("/ai/chat/stream")
async def ai_chat_stream(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    user_message = body.get("message", "").strip()
    history = body.get("history", [])
    conversation_id = body.get("conversation_id")
    ip_address = request.client.host if request.client else None

    if not user_message:
        raise HTTPException(status_code=400, detail="Message is required")

    # Persist user message (auto-create conversation if None)
    user_msg = _add_conv_message(
        db, conversation_id,
        current_user.id, "user", user_message, extra_data={"ip": ip_address},
    )
    db.commit()
    conversation_id = user_msg.conversation_id

    accessible_modules = resolve_user_modules(current_user, db)

    # ── Wizard handler (non-stream) ────────────────────────────
    wizard = await get_active_wizard(current_user.id)
    if wizard:
        if wizard.get("phase") == "complete" and user_message.lower() in (
            "ya", "y", "yes", "oke", "ok", "lanjut", "setuju", "simpan"):
            msg = await _execute_wizard_create(db, current_user.id, current_user.role, ip_address, accessible_modules)
            log_activity_util(
                db, current_user.id, "CREATE", "ai",
                f"AI wizard create: {wizard.get('module', 'unknown')}",
                ip_address=ip_address,
            )
            db.commit()
            await broadcast_event("ai_action", {"user_id": current_user.id, "action": "create"})
            return StreamingResponse(
                _sse_events({"response": msg}),
                media_type="text/event-stream",
            )

        if user_message.lower() in ("tidak", "ga", "gak", "no", "cancel", "batal", "nanti"):
            await cancel_wizard(current_user.id)
            return StreamingResponse(
                _sse_events({"response": "Oke, dibatalkan."}),
                media_type="text/event-stream",
            )

        result = await process_wizard_answer(current_user.id, user_message)

        if result["status"] == "complete":
            w = await get_active_wizard(current_user.id)
            if w:
                w["phase"] = "complete"
            return StreamingResponse(
                _sse_events({"response": result["summary"]}),
                media_type="text/event-stream",
            )

        if result["status"] == "error":
            return StreamingResponse(
                _sse_events({"response": result["message"]}),
                media_type="text/event-stream",
            )

        return StreamingResponse(
            _sse_events({"response": _format_wizard_question(result)}),
            media_type="text/event-stream",
        )

    # ── Standard flow ───────────────────────────────────────────
    has_pending = await get_pending_action(current_user.id) is not None
    intent = parse_intent(user_message, has_pending)

    async def _stream_done():
        """Yield conversation_id if available, then [DONE] signal."""
        if conversation_id:
            yield _sse_data({"conversation_id": conversation_id})
        yield _sse_done()

    async def event_generator():
        nonlocal conversation_id

        if intent == "greeting":
            yield _sse_data({"response": "Halo! Ada yang bisa saya bantu? Saya bisa menjawab pertanyaan tentang data aplikasi, atau membantu menambah/mengubah/menghapus data."})
            async for _ in _stream_done(): yield _
            return

        if intent == "confirm":
            pending = await get_pending_action(current_user.id)
            if pending:
                approval = _confirm_or_approve(db, current_user.id, current_user.role, pending, ip_address)
                if approval["needs_approval"]:
                    await clear_pending_action(current_user.id)
                    db.commit()
                    yield _sse_data({"response": approval["response"]})
                    async for _ in _stream_done(): yield _
                    return

            result = await confirm_action(db, current_user.id, current_user.role)
            msg = result.get("message", result.get("error", ""))

            if "error" not in result:
                log_audit(
                    db, current_user.id, result.get("action", "unknown"),
                    result.get("table", "unknown"),
                    record_ids=[result["id"]] if result.get("id") else None,
                    details={"message": result.get("message")},
                    ip_address=ip_address,
                )

            log_activity_util(
                db, current_user.id, "UPDATE", "ai",
                f"Confirmed AI action: {result.get('action', 'unknown')}",
                ip_address=ip_address,
            )
            db.commit()
            await broadcast_event("ai_action", {"user_id": current_user.id, "action": result.get("action")})
            yield _sse_data({"response": msg})
            async for _ in _stream_done(): yield _
            return

        if intent == "reject":
            await clear_pending_action(current_user.id)
            yield _sse_data({"response": "Tindakan dibatalkan."})
            async for _ in _stream_done(): yield _
            return

        if intent == "action":
            # Hanya start wizard untuk CREATE action
            keywords_create = {"tambah", "buat", "create", "input", "insert", "daftarkan", "simpan", "masukan", "masukkan"}
            msg_lower = user_message.lower()
            is_create = any(kw in msg_lower for kw in keywords_create)
            
            if is_create:
                module = _detect_create_module(user_message)
                if module and module in WIZARD_FIELDS:
                    wizard_result = await start_wizard(current_user.id, module)
                    if wizard_result.get("status") == "error":
                        yield _sse_data({"response": wizard_result["message"]})
                    else:
                        yield _sse_data({"response": _format_wizard_question(wizard_result)})
                    async for _ in _stream_done(): yield _
                    return

            # DELETE/UPDATE atau CREATE tanpa wizard → handle_action
            result = await handle_action(
                user_message, db, current_user.id, current_user.role, accessible_modules,
            )
            if "error" in result:
                yield _sse_data({"response": result["error"]})
            else:
                pending = await get_pending_action(current_user.id)
                description = result.get("description", "")
                filter_desc = result.get("filter_description", "")
                preview_text = f"{description}\n{filter_desc}" if filter_desc else description
                log_activity_util(
                    db, current_user.id, "CREATE", "ai",
                    f"AI action preview: {result.get('action', 'unknown')} on {result.get('module', 'unknown')}",
                    ip_address=ip_address,
                )
                db.commit()
                yield _sse_data({
                    "response": f"{preview_text}\n\nKetik 'ya' untuk konfirmasi atau 'tidak' untuk membatalkan.",
                    "pending_action": pending,
                })
            async for _ in _stream_done(): yield _
            return

        # Query intent — stream tokens, emit query_data before first token
        _rag_stream = rag_query_stream(
            user_message, history, db,
            current_user.id, current_user.role, accessible_modules,
        ).__aiter__()
        _first = True
        try:
            async for token in _rag_stream:
                if _first:
                    _first = False
                    qd = await _get_last_query_data()
                    if qd:
                        yield _sse_data({"query_data": qd})
                yield _sse_data({"token": token})
        except Exception as e:
            logger.error("Stream error: %s", e, exc_info=True)
            yield _sse_data({"response": f"Terjadi kesalahan: {e}"})

        async for _ in _stream_done(): yield _

        log_activity_util(
            db, current_user.id, "VIEW", "ai",
            f"AI query: {user_message[:100]}",
            ip_address=ip_address,
        )
        db.commit()

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/ai/action/direct")
async def ai_action_direct(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Single-shot CRUD: langsung handle_action, skip wizard. Wajib confirm sebelum eksekusi."""
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    user_message = body.get("message", "").strip()
    ip_address = request.client.host if request.client else None

    if not user_message:
        raise HTTPException(status_code=400, detail="Message is required")

    accessible_modules = resolve_user_modules(current_user, db)

    result = await handle_action(
        user_message, db, current_user.id, current_user.role, accessible_modules
    )

    if "error" in result:
        return {"response": result["error"], "pending_action": None}

    pending = await get_pending_action(current_user.id)
    description = result.get("description", "")
    filter_desc = result.get("filter_description", "")
    preview_text = f"{description}\n{filter_desc}" if filter_desc else description

    log_activity_util(
        db, current_user.id, "CREATE", "ai",
        f"AI direct action preview: {result.get('action', 'unknown')} on {result.get('module', 'unknown')}",
        ip_address=ip_address,
    )
    db.commit()

    return {
        "response": f"{preview_text}\n\nKetik 'ya' untuk konfirmasi atau 'tidak' untuk membatalkan.",
        "pending_action": pending,
    }


@router.post("/ai/action/undo")
async def ai_action_undo(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Undo aksi terakhir (create/update/soft-delete) dalam 30 detik."""
    ip_address = request.client.host if request.client else None
    result = await undo_action(db, current_user.id, current_user.role)
    if "error" not in result:
        log_audit(
            db, current_user.id, "undo",
            result.get("table", "unknown"),
            details={"message": result.get("message")},
            ip_address=ip_address,
        )
    log_activity_util(
        db, current_user.id, "UPDATE", "ai",
        f"AI undo: {result.get('action', 'unknown')} on {result.get('table', 'unknown')}",
        ip_address=ip_address,
    )
    db.commit()
    await broadcast_event("ai_action", {"user_id": current_user.id, "action": result.get("action")})
    return {"response": result.get("message", "")}


@router.post("/ai/suggest")
async def ai_suggest(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Proactive suggestions based on user's own data."""
    accessible_modules = resolve_user_modules(current_user, db)
    suggestions = await get_suggestions(db, current_user.id, current_user.role, accessible_modules)
    return {"suggestions": suggestions}


@router.post("/ai/retrain")
async def ai_retrain(
    current_user: User = Depends(get_current_user),
):
    """Trigger recompute centroid dari accumulated examples.
    
    Berguna untuk container: tanpa restart, langsung merge data belajar terbaru.
    """
    try:
        from utils.ai_embedder import load_embedder, _load_accumulated_examples, _example_embeddings
        load_embedder(force=True)
        count = _load_accumulated_examples()
        return {
            "status": "ok",
            "loaded_examples": count,
            "total_modules": len(_example_embeddings),
            "message": f"Centroid diperbarui dengan {count} contoh dari data belajar.",
        }
    except Exception as e:
        logger.error("AI retrain failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Retrain gagal. Coba lagi.")


# ── Audit & Approval endpoints ───────────────────────────

@router.get("/ai/audit-logs")
async def ai_audit_logs(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    limit: int = 50,
    offset: int = 0,
    action_type: str | None = None,
    table_name: str | None = None,
):
    """Get AI audit trail. Superadmin sees all; others see their own."""
    if current_user.role == "superadmin":
        user_id = request.query_params.get("user_id")
        uid = int(user_id) if user_id and user_id.isdigit() else None
    else:
        uid = current_user.id

    logs = get_audit_logs(db, user_id=uid, limit=limit, offset=offset, action_type=action_type, table_name=table_name)
    return {"audit_logs": logs}


@router.get("/ai/pending-approvals")
async def ai_pending_approvals(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all actions awaiting approval. Only superadmin can view."""
    if current_user.role != "superadmin":
        raise HTTPException(status_code=403, detail="Hanya superadmin yang bisa melihat permintaan persetujuan.")
    approvals = get_pending_approvals(db)
    return {"pending_approvals": approvals}


@router.post("/ai/approve/{audit_id}")
async def ai_approve_action(
    audit_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Approve or reject a pending AI action. Only superadmin."""
    if current_user.role != "superadmin":
        raise HTTPException(status_code=403, detail="Hanya superadmin yang bisa menyetujui tindakan.")
    try:
        body = await request.json()
        rejection_reason = body.get("rejection_reason")
    except Exception:
        rejection_reason = None

    result = _approve_action(db, audit_id, current_user.id, rejection_reason=rejection_reason)
    db.commit()
    return result


# ── Conversation memory endpoints ────────────────────────

@router.get("/ai/conversations")
async def ai_list_conversations(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List user's AI conversations."""
    convs = list_conversations(db, current_user.id)
    return {"conversations": convs}


@router.get("/ai/conversations/{conversation_id}")
async def ai_get_conversation(
    conversation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a specific conversation with messages."""
    conv = get_conversation(db, conversation_id, current_user.id)
    if not conv:
        raise HTTPException(status_code=404, detail="Percakapan tidak ditemukan.")
    return conv


@router.delete("/ai/conversations/{conversation_id}")
async def ai_delete_conversation(
    conversation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a conversation."""
    ok = delete_conversation(db, conversation_id, current_user.id)
    if not ok:
        raise HTTPException(status_code=404, detail="Percakapan tidak ditemukan.")
    db.commit()
    return {"status": "ok"}


# ── Multi-step / Batch Action ────────────────────────────

@router.post("/ai/action/batch")
async def ai_batch_action(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Execute multiple actions in sequence from a single instruction."""
    try:
        body = await request.json()
        instructions = body.get("instructions", "").strip()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    if not instructions:
        raise HTTPException(status_code=400, detail="Instructions are required")

    from utils.ai_engine import handle_action
    accessible_modules = resolve_user_modules(current_user, db)
    ip_address = request.client.host if request.client else None

    steps = []
    for instruction in instructions.split("\n"):
        instruction = instruction.strip()
        if not instruction:
            continue

        result = await handle_action(
            instruction, db, current_user.id, current_user.role, accessible_modules,
        )
        if "error" in result:
            steps.append({"instruction": instruction, "status": "error", "message": result["error"]})
            continue

        pending = await get_pending_action(current_user.id)
        if pending:
            approval = _confirm_or_approve(db, current_user.id, current_user.role, pending, ip_address)
            if approval["needs_approval"]:
                await clear_pending_action(current_user.id)
                steps.append({"instruction": instruction, "status": "pending_approval", "message": approval["response"]})
                continue

        exec_result = await confirm_action(db, current_user.id, current_user.role)
        if "error" not in exec_result:
            log_audit(
                db, current_user.id, exec_result.get("action", "unknown"),
                exec_result.get("table", "unknown"),
                details={"message": exec_result.get("message"), "instruction": instruction},
                ip_address=ip_address,
            )
        steps.append({
            "instruction": instruction,
            "status": "error" if "error" in exec_result else "done",
            "message": exec_result.get("message", exec_result.get("error", "")),
        })

    db.commit()
    return {"steps": steps}


# ── Report Generator ──────────────────────────────────────

@router.post("/ai/report")
async def ai_report(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Generate a structured report from natural language."""
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    query = body.get("query", "").strip()
    if not query:
        raise HTTPException(status_code=400, detail="Query is required")

    from utils.ai_report import generate_report
    accessible_modules = resolve_user_modules(current_user, db)
    report = await generate_report(query, db, current_user.id, current_user.role, accessible_modules)
    return report


# ── Workflow Builder ──────────────────────────────────────

@router.post("/ai/workflow/parse")
async def ai_workflow_parse(
    request: Request,
    current_user: User = Depends(get_current_user),
):
    """Parse natural language into a workflow definition."""
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")
    message = body.get("message", "").strip()
    if not message:
        raise HTTPException(status_code=400, detail="Message is required")
    from utils.ai_workflow import parse_workflow_intent
    result = await parse_workflow_intent(message)
    return result


@router.post("/ai/workflow")
async def ai_workflow_create(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a workflow from parsed data."""
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")
    from utils.ai_workflow import create_workflow
    result = create_workflow(db, body, current_user.id)
    db.commit()
    return result


@router.get("/ai/workflows")
async def ai_workflows_list(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all workflows."""
    from utils.ai_workflow import list_workflows
    return {"workflows": list_workflows(db, current_user.id, current_user.role)}


@router.post("/ai/workflows/{workflow_id}/toggle")
async def ai_workflow_toggle(
    workflow_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Enable/disable a workflow."""
    from utils.ai_workflow import toggle_workflow
    result = toggle_workflow(db, workflow_id, current_user.id, current_user.role)
    db.commit()
    return result


@router.delete("/ai/workflows/{workflow_id}")
async def ai_workflow_delete(
    workflow_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a workflow."""
    from utils.ai_workflow import delete_workflow
    ok = delete_workflow(db, workflow_id, current_user.id, current_user.role)
    if not ok:
        raise HTTPException(status_code=404, detail="Workflow tidak ditemukan")
    db.commit()
    return {"status": "ok"}


# ── Analytics (Anomaly & Predictive) ──────────────────────

@router.post("/ai/anomaly")
async def ai_anomaly(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Detect anomalies in a module's data."""
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")
    module = body.get("module", "all")
    from utils.ai_analytics import detect_anomalies
    accessible_modules = resolve_user_modules(current_user, db)
    result = await detect_anomalies(db, module, current_user.id, current_user.role, accessible_modules)
    return result


@router.post("/ai/predict")
async def ai_predict(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Predict trends for a given module/metric."""
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")
    module = body.get("module", "incident_report")
    metric = body.get("metric", "count")
    horizon = body.get("horizon_days", 30)
    from utils.ai_analytics import predict_trend
    result = await predict_trend(db, module, metric, horizon)
    return result


# ── Data Validator ────────────────────────────────────────

@router.post("/ai/validate")
async def ai_validate(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Run data validation and return issues + suggested corrections."""
    from utils.ai_validator import validate_data, generate_corrections, apply_correction

    accessible_modules = resolve_user_modules(current_user, db)
    issues = validate_data(db, current_user.id, current_user.role, accessible_modules)
    corrections = await generate_corrections(db, issues, current_user.role)
    return {"issues": issues, "corrections": corrections, "total_issues": len(issues)}


@router.post("/ai/validate/apply")
async def ai_validate_apply(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Apply a specific correction."""
    from utils.ai_validator import apply_correction

    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    action = body.get("action")
    table = body.get("table")
    params = body.get("params", {})
    if not action or not table:
        raise HTTPException(status_code=400, detail="action and table are required")

    result = apply_correction(db, action, table, params)
    return result


def _sse_data(data: dict) -> str:
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"


def _sse_done() -> str:
    return "data: [DONE]\n\n"


def _sse_events(data: dict) -> str:
    return _sse_data(data) + _sse_done()

