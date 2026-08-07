"""
AI Chat API — Natural language query and action interface for Super Apps.
"""
import json
import logging

from fastapi import APIRouter, Depends, HTTPException, Request
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
    is_model_loaded,
    load_model,
    parse_intent,
    query_data,
    handle_action,
    confirm_action,
    get_pending_action,
    clear_pending_action,
)
from utils.ai_audit import (
    log_audit,
    needs_approval as _needs_approval,
    stage_pending_for_approval,
    approve_action as _approve_action,
    get_pending_approvals,
    get_audit_logs,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["AI"])


def _confirm_or_approve(
    db: Session,
    user_id: int,
    role: str,
    pending: dict,
    ip_address=None,
) -> dict:
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


@router.get("/ai/status")
async def ai_status(
    current_user: User = Depends(get_current_user),
):
    load_model()
    pending = get_pending_action(current_user.id)
    return {
        "model_loaded": is_model_loaded(),
        "has_pending_action": pending is not None,
        "pending_action": pending,
    }


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

    if not user_message:
        raise HTTPException(status_code=400, detail="Message is required")

    load_model()
    if not is_model_loaded():
        return {"response": "AI model tidak tersedia. Hubungi administrator.", "pending_action": None}

    accessible_modules = resolve_user_modules(current_user, db)
    has_pending = get_pending_action(current_user.id) is not None
    intent = parse_intent(user_message, has_pending)

    if intent == "greeting":
        return {
            "response": "Halo! Ada yang bisa saya bantu? Saya bisa menjawab pertanyaan tentang data aplikasi, atau membantu menambah/mengubah/menghapus data.",
            "pending_action": None,
        }

    if intent == "confirm":
        ip_address = request.client.host if request.client else None
        pending = get_pending_action(current_user.id)
        if pending:
            approval = _confirm_or_approve(db, current_user.id, current_user.role, pending, ip_address)
            if approval["needs_approval"]:
                clear_pending_action(current_user.id)
                db.commit()
                return {"response": approval["response"], "pending_action": None}

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
            f"Confirmed AI action: {result.get('action', 'unknown')}",
            ip_address=request.client.host if request.client else None,
        )
        db.commit()
        await broadcast_event("ai_action", {"user_id": current_user.id, "action": result.get("action")})
        return {"response": result.get("message", result.get("error", "")), "pending_action": None}

    if intent == "reject":
        clear_pending_action(current_user.id)
        return {"response": "Tindakan dibatalkan.", "pending_action": None}

    if intent == "action":
        result = await handle_action(
            user_message, db, current_user.id, current_user.role, accessible_modules
        )
        if "error" in result:
            return {"response": result["error"], "pending_action": None}
        pending = get_pending_action(current_user.id)
        description = result.get("description", "")
        filter_desc = result.get("filter_description", "")
        preview_text = f"{description}\n{filter_desc}" if filter_desc else description
        log_activity_util(
            db, current_user.id, "CREATE", "ai",
            f"AI action preview: {result.get('action', 'unknown')} on {result.get('module', 'unknown')}",
            ip_address=request.client.host if request.client else None,
        )
        db.commit()
        return {
            "response": f"{preview_text}\n\nKetik 'ya' untuk konfirmasi atau 'tidak' untuk membatalkan.",
            "pending_action": pending,
        }

    result = await query_data(user_message, db, current_user.id, current_user.role, accessible_modules)
    if "error" in result:
        return {"response": result["error"], "pending_action": None}

    response_text = _format_query_result(result)
    log_activity_util(
        db, current_user.id, "VIEW", "ai",
        f"AI query: {user_message[:100]}",
        ip_address=request.client.host if request.client else None,
    )
    db.commit()
    return {"response": response_text, "pending_action": None}


@router.post("/ai/confirm")
async def ai_confirm(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    load_model()
    ip_address = request.client.host if request.client else None
    pending = get_pending_action(current_user.id)
    if pending:
        approval = _confirm_or_approve(db, current_user.id, current_user.role, pending, ip_address)
        if approval["needs_approval"]:
            clear_pending_action(current_user.id)
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
        ip_address=request.client.host if request.client else None,
    )
    db.commit()
    await broadcast_event("ai_action", {"user_id": current_user.id, "action": result.get("action")})
    return {"response": result.get("message", "")}


@router.post("/ai/cancel")
async def ai_cancel(
    current_user: User = Depends(get_current_user),
):
    clear_pending_action(current_user.id)
    return {"response": "Tindakan dibatalkan."}


def _format_query_result(result: dict) -> str:
    data = result.get("data", [])
    count = result.get("count", 0)

    if not data:
        return "Sepertinya belum ada data yang cocok dengan pertanyaan kamu."

    if isinstance(data, dict):
        items = "\n".join(f"  • {k}: {v}" for k, v in data.items())
        return f"Total {count} data:\n{items}"

    if count == 1 and len(data) == 1:
        parts = []
        for k, v in data[0].items():
            if v is not None and v != "":
                parts.append(f"{k}: {v}")
        return "Ditemukan 1:\n" + "\n".join(parts)

    lines = [f"Ada {count} data:"]
    for i, item in enumerate(data[:10], 1):
        summary = _summarize_item(item)
        lines.append(f"  {i}. {summary}")

    if count > 10:
        lines.append(f"  ... dan {count - 10} lainnya.")

    return "\n".join(lines)


def _summarize_item(item: dict) -> str:
    for key in ("name", "title", "description", "asset_name", "judul", "nama", "id"):
        if key in item and item[key]:
            val = item[key]
            if isinstance(val, str) and len(val) > 60:
                val = val[:60] + "..."
            return f"{key}={val}"
    for k, v in item.items():
        if k != "id" and v is not None and v != "":
            val = str(v)
            if len(val) > 60:
                val = val[:60] + "..."
            return f"{k}={val}"
    return str(item.get("id", "?"))


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
