"""Asset Audit Logs API - ISO 27001:2022 Compliance
Track all asset access and modifications for audit trail
"""
from utils.timezone import utcnow
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc, func
from typing import Optional, List
from datetime import datetime, date, timedelta
import json

from database import get_db
from models import AssetAuditLog, AssetCommon, User
from api.dependencies import get_current_user
from utils.password_encrypt import decrypt_password
from api.schemas import MessageResponse

router = APIRouter(prefix="/audit-logs", tags=["Audit Logs"])


def _apply_audit_rbac(query, db: Session, current_user: User):
    """Apply RBAC filter: superadmin sees all, others see records from their role group only."""
    if current_user.role != "superadmin":
        role_user_ids = db.query(User.id).filter(User.role == current_user.role).subquery()
        return query.filter(AssetAuditLog.user_id.in_(role_user_ids))
    return query


@router.get("", response_model=dict)
async def get_audit_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    action_type: Optional[str] = Query(None),
    asset_id: Optional[int] = Query(None),
    username: Optional[str] = Query(None),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get audit logs with filters and pagination"""

    query = db.query(AssetAuditLog)
    query = _apply_audit_rbac(query, db, current_user)
    
    # Apply filters
    if action_type:
        query = query.filter(AssetAuditLog.action_type == action_type)
    if asset_id:
        query = query.filter(AssetAuditLog.asset_id == asset_id)
    if username:
        escaped_username = username.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        query = query.filter(AssetAuditLog.username.ilike(f"%{escaped_username}%", escape="\\"))
    if start_date:
        query = query.filter(AssetAuditLog.timestamp >= start_date)
    if end_date:
        query = query.filter(AssetAuditLog.timestamp <= end_date)
    
    # Get total count
    total = query.count()
    
    # Apply sorting (newest first)
    query = query.order_by(desc(AssetAuditLog.timestamp))
    
    # Apply pagination
    offset = (page - 1) * page_size
    logs = query.offset(offset).limit(page_size).all()
    
    return {
        "data": [log.to_dict() for log in logs],
        "pagination": {
            "current_page": page,
            "page_size": page_size,
            "total_records": total,
            "total_pages": (total + page_size - 1) // page_size
        }
    }


@router.get("/stats", response_model=dict)
async def get_audit_stats(
    days: int = Query(30, ge=1, le=365),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get audit log statistics for dashboard"""

    cutoff_date = utcnow() - timedelta(days=days)

    base_query = db.query(AssetAuditLog).filter(
        AssetAuditLog.timestamp >= cutoff_date
    )
    base_query = _apply_audit_rbac(base_query, db, current_user)

    # Total logs
    total_logs = base_query.count()

    # Logs by action type
    logs_by_action = db.query(
        AssetAuditLog.action_type,
        func.count(AssetAuditLog.id).label('count')
    ).filter(
        AssetAuditLog.timestamp >= cutoff_date
    )
    logs_by_action = _apply_audit_rbac(logs_by_action, db, current_user)
    logs_by_action = logs_by_action.group_by(AssetAuditLog.action_type).all()

    # Top users by activity
    top_users_query = db.query(
        AssetAuditLog.username,
        func.count(AssetAuditLog.id).label('count')
    ).filter(
        AssetAuditLog.timestamp >= cutoff_date
    )
    top_users_query = _apply_audit_rbac(top_users_query, db, current_user)
    top_users = top_users_query.group_by(AssetAuditLog.username).order_by(desc('count')).limit(10).all()

    # Failed password attempts
    failed_query = db.query(AssetAuditLog).filter(
        AssetAuditLog.action_type == 'view_password_failed',
        AssetAuditLog.timestamp >= cutoff_date
    )
    failed_query = _apply_audit_rbac(failed_query, db, current_user)
    failed_attempts = failed_query.count()

    # Successful password views
    success_query = db.query(AssetAuditLog).filter(
        AssetAuditLog.action_type == 'view_password',
        AssetAuditLog.timestamp >= cutoff_date
    )
    success_query = _apply_audit_rbac(success_query, db, current_user)
    successful_views = success_query.count()
    
    return {
        "total_logs": total_logs,
        "logs_by_action": {action: count for action, count in logs_by_action},
        "top_users": [{"username": user, "count": count} for user, count in top_users],
        "failed_attempts": failed_attempts,
        "successful_views": successful_views,
        "period_days": days
    }


@router.get("/export/csv", response_model=dict)
async def export_audit_logs_csv(
    start_date: date = Query(...),
    end_date: date = Query(...),
    action_type: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Export audit logs to CSV for compliance audit"""

    query = db.query(AssetAuditLog).filter(
        AssetAuditLog.timestamp >= start_date,
        AssetAuditLog.timestamp <= end_date
    )
    query = _apply_audit_rbac(query, db, current_user)
    
    if action_type:
        query = query.filter(AssetAuditLog.action_type == action_type)
    
    logs = query.order_by(desc(AssetAuditLog.timestamp)).all()
    
    # Generate CSV
    csv_lines = [
        "Timestamp,Asset Code,Asset Name,Sub-Category,Action,User,IP Address,Details"
    ]
    
    for log in logs:
        details_str = json.dumps(log.details).replace('"', '""') if log.details else ""
        csv_lines.append(
            f'"{log.timestamp}","{log.asset_code}","{log.asset_name}",'
            f'"{log.sub_category}","{log.action_type}","{log.username}",'
            f'"{log.ip_address}","{details_str}"'
        )
    
    csv_content = "\n".join(csv_lines)
    
    timestamp = utcnow().strftime("%Y%m%d-%H%M")
    filename = f"asset-audit-logs-{timestamp}.csv"
    
    from fastapi.responses import Response
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


ALLOWED_ACTION_TYPES = {"view_password", "view_password_failed", "edit", "delete", "create", "export", "bulk_delete", "bulk_update", "status_change", "classification_change", "password_view", "password_view_failed", "config_change", "config_create", "config_delete"}


@router.post("/log", response_model=dict)
async def create_audit_log(
    asset_id: int,
    action_type: str,
    details: dict = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create an audit log entry"""
    if action_type not in ALLOWED_ACTION_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid action type. Must be one of: {sorted(ALLOWED_ACTION_TYPES)}")

    asset = db.query(AssetCommon).filter(AssetCommon.id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    audit_log = AssetAuditLog(
        asset_id=asset_id,
        asset_code=asset.asset_code,
        asset_name=asset.name,
        sub_category=asset.sub_category,
        action_type=action_type,
        details=details or {},
        user_id=current_user.id,
        username=current_user.username
    )
    
    db.add(audit_log)
    db.commit()
    db.refresh(audit_log)
    
    return audit_log.to_dict()
