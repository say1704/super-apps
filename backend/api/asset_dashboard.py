from utils.timezone import utcnow
"""Asset Dashboard Analytics API
Statistics and metrics for asset management dashboard
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import timedelta
from typing import Optional

from database import get_db
from models import AssetCommon, AssetAuditLog, User
from api.dependencies import get_current_user
from api.schemas import AssetStatsResponse

router = APIRouter(prefix="/assets/dashboard", tags=["Asset Dashboard"])


def _apply_dashboard_rbac(query, current_user: User):
    """Apply role-based filtering to dashboard queries"""
    if current_user.role != "superadmin":
        return query.filter(AssetCommon.owner_role == current_user.role)
    return query


def _apply_audit_rbac(query, db: Session, current_user: User):
    """Apply RBAC filtering to audit log queries"""
    if current_user.role != "superadmin":
        role_user_ids = db.query(User.id).filter(User.role == current_user.role).subquery()
        return query.filter(AssetAuditLog.user_id.in_(role_user_ids))
    return query


@router.get("/stats", response_model=dict)
async def get_dashboard_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get overall asset statistics for dashboard"""
    base_query = db.query(AssetCommon).filter(AssetCommon.deleted_at.is_(None))
    base_query = _apply_dashboard_rbac(base_query, current_user)

    total_by_subcategory = base_query.filter(
        AssetCommon.category == 'users'
    ).with_entities(
        AssetCommon.sub_category,
        func.count(AssetCommon.id).label('count')
    ).group_by(AssetCommon.sub_category).all()

    users_by_subcategory = {
        sub_cat: count for sub_cat, count in total_by_subcategory
    }

    disabled_users = base_query.filter(
        AssetCommon.category == 'users',
        AssetCommon.status == 'retired'
    ).count()

    total_users = base_query.filter(
        AssetCommon.category == 'users'
    ).count()

    users_by_owner = base_query.filter(
        AssetCommon.category == 'users'
    ).with_entities(
        AssetCommon.owner_name,
        func.count(AssetCommon.id).label('count')
    ).group_by(AssetCommon.owner_name).all()

    users_by_classification = base_query.filter(
        AssetCommon.category == 'users'
    ).with_entities(
        AssetCommon.classification,
        func.count(AssetCommon.id).label('count')
    ).group_by(AssetCommon.classification).all()

    return {
        "total_users": total_users,
        "users_by_subcategory": users_by_subcategory,
        "disabled_users": disabled_users,
        "users_by_owner": [{"owner": owner, "count": count} for owner, count in users_by_owner],
        "users_by_classification": [{"classification": cls, "count": count} for cls, count in users_by_classification]
    }


@router.get("/password-expiry", response_model=dict)
async def get_password_expiry_alerts(
    days_ahead: int = Query(30, ge=1, le=90),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get users with passwords expiring within specified days"""
    cutoff_date = utcnow() + timedelta(days=days_ahead)
    expiring_users = []

    return {
        "expiring_within_days": days_ahead,
        "cutoff_date": cutoff_date.isoformat(),
        "users": expiring_users,
        "count": len(expiring_users)
    }


@router.get("/access-review", response_model=dict)
async def get_access_review_overdue(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get users with overdue access reviews"""
    overdue_users = []

    return {
        "overdue_count": len(overdue_users),
        "users": overdue_users
    }


@router.get("/recent-activity", response_model=dict)
async def get_recent_activity(
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get recent asset audit activity"""
    recent_logs_query = db.query(AssetAuditLog).filter(
        AssetAuditLog.action_type.in_(['view_password', 'view_password_failed'])
    )
    recent_logs_query = _apply_audit_rbac(recent_logs_query, db, current_user)
    recent_logs = recent_logs_query.order_by(
        AssetAuditLog.timestamp.desc()
    ).limit(limit).all()

    return {
        "recent_activity": [log.to_dict() for log in recent_logs],
        "count": len(recent_logs)
    }


@router.get("/summary", response_model=dict)
async def get_dashboard_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get summary data for dashboard widgets"""
    base_query = db.query(AssetCommon).filter(AssetCommon.deleted_at.is_(None))
    base_query = _apply_dashboard_rbac(base_query, current_user)

    total_by_category = base_query.with_entities(
        AssetCommon.category,
        func.count(AssetCommon.id).label('count')
    ).group_by(AssetCommon.category).all()

    seven_days_ago = utcnow() - timedelta(days=7)
    
    base_audit_query = db.query(AssetAuditLog).filter(
        AssetAuditLog.timestamp >= seven_days_ago
    )
    base_audit_query = _apply_audit_rbac(base_audit_query, db, current_user)
    
    recent_password_views = base_audit_query.filter(
        AssetAuditLog.action_type == 'view_password'
    ).count()

    failed_attempts = base_audit_query.filter(
        AssetAuditLog.action_type == 'view_password_failed'
    ).count()

    active_users = base_query.filter(
        AssetCommon.category == 'users',
        AssetCommon.status == 'active'
    ).count()

    return {
        "total_by_category": {cat: count for cat, count in total_by_category},
        "recent_password_views": recent_password_views,
        "failed_attempts": failed_attempts,
        "active_users": active_users,
        "period": "last_7_days"
    }
