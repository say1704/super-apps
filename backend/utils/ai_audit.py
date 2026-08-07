"""
AI Audit Trail — Logs every AI-driven action for compliance and security.
"""
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from sqlalchemy.orm import Session
from models import AiAuditLog

logger = logging.getLogger(__name__)

SENSITIVE_TABLES = {"users", "roles", "app_settings", "retention_policies", "ai_audit_logs"}


def log_audit(
    db: Session,
    user_id: int,
    action_type: str,
    table_name: str,
    record_ids: Optional[List[int]] = None,
    details: Optional[Dict[str, Any]] = None,
    status: str = "executed",
    ip_address: Optional[str] = None,
) -> AiAuditLog:
    """Create an audit log entry for an AI action."""
    if details is None:
        details = {}
    entry = AiAuditLog(
        user_id=user_id,
        action_type=action_type,
        table_name=table_name,
        record_ids=record_ids,
        details=details,
        status=status,
        ip_address=ip_address,
    )
    db.add(entry)
    db.flush()
    logger.info("Audit: user=%d action=%s table=%s status=%s", user_id, action_type, table_name, status)
    return entry


def needs_approval(action_type: str, table_name: str, role: str) -> bool:
    """Determine if an action requires admin approval."""
    if role == "superadmin":
        return False
    if action_type in ("delete", "undo", "update") and table_name in SENSITIVE_TABLES:
        return True
    if action_type == "create" and table_name == "users":
        return True
    return False


def stage_pending_for_approval(
    db: Session,
    user_id: int,
    action_type: str,
    table_name: str,
    action_data: dict,
    filters: dict,
    action_details: Optional[Dict[str, Any]],
    ip_address: Optional[str] = None,
) -> AiAuditLog:
    """Store a pending action for admin approval. Returns the audit log entry."""
    details = {
        "action_type": action_type,
        "table_name": table_name,
        "data": action_data,
        "filters": filters,
        "extra": action_details,
    }
    entry = AiAuditLog(
        user_id=user_id,
        action_type=action_type,
        table_name=table_name,
        details=details,
        status="pending_approval",
        ip_address=ip_address,
    )
    db.add(entry)
    db.flush()
    return entry


def execute_approved_action(db: Session, entry: AiAuditLog) -> Dict[str, Any]:
    """Re-execute a previously staged action after approval. Returns result dict."""
    import importlib
    from datetime import datetime, timezone
    from utils.ai_engine import _get_model_class

    details = entry.details or {}
    action_type = details.get("action_type", entry.action_type)
    table_name = details.get("table_name", entry.table_name)
    action_data = details.get("data", {})
    filters = details.get("filters", {})

    models_module = importlib.import_module("models")
    model_class = _get_model_class(table_name, models_module)
    if model_class is None:
        return {"error": f"Model '{table_name}' not found."}

    try:
        if action_type == "create":
            obj = model_class()
            for col, val in action_data.items():
                if hasattr(obj, col):
                    setattr(obj, col, val)
            if hasattr(obj, "created_at"):
                obj.created_at = datetime.now(timezone.utc)
            if hasattr(obj, "owner_role") and not getattr(obj, "owner_role", None):
                obj.owner_role = entry.user.role if entry.user else None
            if hasattr(obj, "created_by"):
                obj.created_by = entry.user_id
            if hasattr(obj, "is_active") and not getattr(obj, "is_active", None):
                obj.is_active = True
            if hasattr(obj, "status") and not getattr(obj, "status", None):
                obj.status = "active"
            db.add(obj)
            db.flush()
            entry.record_ids = [obj.id]
            return {"action": "create", "table": table_name, "id": obj.id, "message": "Data berhasil ditambahkan."}

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
            ids = [r.id for r in records]
            for obj in records:
                for col, val in action_data.items():
                    if hasattr(obj, col):
                        setattr(obj, col, val)
                if hasattr(obj, "updated_at"):
                    obj.updated_at = datetime.now(timezone.utc)
            entry.record_ids = ids
            return {"action": "update", "table": table_name, "count": len(records), "message": f"{len(records)} data diubah."}

        elif action_type == "delete":
            query = db.query(model_class)
            for col, val in filters.items():
                if hasattr(model_class, col):
                    query = query.filter(getattr(model_class, col) == val)
            records = query.all()
            if not records:
                return {"error": "Data tidak ditemukan."}
            ids = [r.id for r in records]
            if hasattr(model_class, "deleted_at"):
                for obj in records:
                    obj.deleted_at = datetime.now(timezone.utc)
            else:
                for obj in records:
                    db.delete(obj)
            entry.record_ids = ids
            return {"action": "delete", "table": table_name, "count": len(records), "message": f"{len(records)} data dihapus."}

        return {"error": "Unknown action type."}

    except Exception as e:
        db.rollback()
        logger.error("Execute approved action failed: %s", e, exc_info=True)
        return {"error": f"Gagal mengeksekusi: {str(e)}"}


def approve_action(db: Session, audit_id: int, approver_id: int, rejection_reason: Optional[str] = None) -> Dict[str, Any]:
    """Approve or reject a pending AI action. On approve, re-execute the action."""
    from models import User

    entry = db.query(AiAuditLog).filter(AiAuditLog.id == audit_id).first()
    if not entry:
        return {"error": "Audit log tidak ditemukan."}
    if entry.status != "pending_approval":
        return {"error": "Tindakan tidak dalam status menunggu persetujuan."}

    if rejection_reason:
        entry.status = "rejected"
        entry.rejection_reason = rejection_reason
        entry.approved_by = approver_id
        entry.approved_at = datetime.now(timezone.utc)
        db.commit()
        return {"status": "rejected", "message": "Tindakan ditolak.", "audit_id": audit_id, "action_type": entry.action_type, "table_name": entry.table_name}

    result = execute_approved_action(db, entry)
    if "error" in result:
        entry.status = "failed"
        entry.rejection_reason = result["error"]
        db.commit()
        return {"status": "failed", "message": result["error"], "audit_id": audit_id}

    entry.status = "executed"
    entry.approved_by = approver_id
    entry.approved_at = datetime.now(timezone.utc)
    db.commit()
    return {
        "status": "executed",
        "message": result.get("message", "Tindakan berhasil dieksekusi."),
        "audit_id": audit_id,
        "action_type": entry.action_type,
        "table_name": entry.table_name,
    }


def get_pending_approvals(db: Session) -> List[Dict[str, Any]]:
    """List all actions awaiting approval."""
    entries = db.query(AiAuditLog).filter(
        AiAuditLog.status == "pending_approval"
    ).order_by(AiAuditLog.created_at.desc()).all()
    return [_audit_to_dict(e) for e in entries]


def get_audit_logs(
    db: Session,
    user_id: Optional[int] = None,
    limit: int = 50,
    offset: int = 0,
    action_type: Optional[str] = None,
    table_name: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Get audit trail entries with optional filters."""
    query = db.query(AiAuditLog).order_by(AiAuditLog.created_at.desc())
    if user_id is not None:
        query = query.filter(AiAuditLog.user_id == user_id)
    if action_type:
        query = query.filter(AiAuditLog.action_type == action_type)
    if table_name:
        query = query.filter(AiAuditLog.table_name == table_name)
    entries = query.offset(offset).limit(limit).all()
    return [_audit_to_dict(e) for e in entries]


def _audit_to_dict(entry: AiAuditLog) -> Dict[str, Any]:
    return {
        "id": entry.id,
        "user_id": entry.user_id,
        "action_type": entry.action_type,
        "table_name": entry.table_name,
        "record_ids": entry.record_ids,
        "details": entry.details,
        "status": entry.status,
        "approved_by": entry.approved_by,
        "approved_at": entry.approved_at.isoformat() if entry.approved_at else None,
        "rejection_reason": entry.rejection_reason,
        "ip_address": entry.ip_address,
        "created_at": entry.created_at.isoformat() if entry.created_at else None,
    }
