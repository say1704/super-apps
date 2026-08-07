from utils.timezone import to_iso
from utils.input_sanitizer import escape_like
"""Activity Logs Endpoints"""
import csv
import io
import json
import logging
from fastapi import APIRouter, Depends, Query, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import datetime

from database import get_db
from models import User, ActivityLog, AssetAuditLog
from api.dependencies import get_current_user
from api.dependencies import get_offset, calculate_pagination
from api.schemas import ActivityLogListPaginatedResponse, MessageResponse

router = APIRouter(tags=["Activity Logs"])

logger = logging.getLogger(__name__)

ALLOWED_ACTIVITY_SORT = {"created_at", "timestamp", "module", "action", "user"}
MAX_PAGE_SIZE = 100
MAX_EXPORT_RECORDS = 10000


def _escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _get_combined_logs_count_and_data(db, is_superadmin, current_user_id, module, action, sort_by, sort_order, limit, offset, from_date=None, to_date=None):
    """DB-level pagination with parameterized UNION ALL queries.
    
    Security: All user inputs are parameterized. Only sort column/direction
    are interpolated from validated whitelists (not user input).
    RBAC enforced on both sides of UNION.
    """
    sort_column_map = {
        "created_at": "timestamp",
        "timestamp": "timestamp",
        "module": "module",
        "action": "action",
        "user": "user_name",
    }
    sort_col = sort_column_map.get(sort_by, "timestamp")
    sort_dir = "DESC" if sort_order == "desc" else "ASC"

    base_params = {
        "is_superadmin": 1 if is_superadmin else 0,
        "current_user_id": current_user_id,
        "module": escape_like(module) if module else None,
        "action": action,
        "from_date": from_date,
        "to_date": to_date,
    }

    date_filter_activity = ""
    date_filter_audit = ""
    if from_date:
        date_filter_activity += " AND al.created_at >= :from_date"
        date_filter_audit += " AND aal.timestamp >= :from_date"
    if to_date:
        date_filter_activity += " AND al.created_at <= :to_date"
        date_filter_audit += " AND aal.timestamp <= :to_date"

    count_sql = f"""
        SELECT COUNT(*) FROM (
            SELECT al.id FROM activity_logs al
            WHERE (:is_superadmin = 1 OR al.user_id = :current_user_id)
              AND (:module IS NULL OR LOWER(al.module) LIKE '%' || LOWER(:module) || '%' ESCAPE '\\')
              AND (:action IS NULL OR al.action = :action)
              {date_filter_activity}

            UNION ALL

            SELECT aal.id FROM asset_audit_logs aal
            WHERE (:is_superadmin = 1 OR aal.user_id = :current_user_id)
              AND (:module IS NULL OR LOWER('Asset Register') LIKE '%' || LOWER(:module) || '%' ESCAPE '\\')
              AND (:action IS NULL OR aal.action_type = :action)
              {date_filter_audit}
        )
    """

    total = db.execute(text(count_sql), base_params).scalar()

    data_sql = f"""
        SELECT * FROM (
            SELECT
                al.id,
                'activity' as log_type,
                al.created_at as timestamp,
                al.module,
                al.action,
                al.user_id,
                u.full_name as user_name,
                u.role as user_role,
                al.description,
                al.details,
                NULL as asset_code,
                NULL as asset_name,
                al.ip_address
            FROM activity_logs al
            LEFT JOIN users u ON al.user_id = u.id
            WHERE (:is_superadmin = 1 OR al.user_id = :current_user_id)
              AND (:module IS NULL OR LOWER(al.module) LIKE '%' || LOWER(:module) || '%' ESCAPE '\\')
              AND (:action IS NULL OR al.action = :action)
              {date_filter_activity}

            UNION ALL

            SELECT
                aal.id,
                'asset_audit' as log_type,
                aal.timestamp,
                'Asset Register' as module,
                aal.action_type as action,
                aal.user_id,
                aal.username as user_name,
                NULL as user_role,
                aal.action_type || ': ' || aal.asset_name || ' (' || aal.asset_code || ')' as description,
                aal.details as details,
                aal.asset_code,
                aal.asset_name,
                aal.ip_address
            FROM asset_audit_logs aal
            WHERE (:is_superadmin = 1 OR aal.user_id = :current_user_id)
              AND (:module IS NULL OR LOWER('Asset Register') LIKE '%' || LOWER(:module) || '%' ESCAPE '\\')
              AND (:action IS NULL OR aal.action_type = :action)
              {date_filter_audit}
        ) combined
        ORDER BY {sort_col} {sort_dir}
        LIMIT :limit OFFSET :offset
    """

    rows = db.execute(text(data_sql), {
        **base_params,
        "limit": limit,
        "offset": offset,
    }).fetchall()

    return total, rows


@router.get("/activity-logs", response_model=ActivityLogListPaginatedResponse)
async def get_activity_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=MAX_PAGE_SIZE),
    module: str = Query(None, max_length=100),
    action: str = Query(None, max_length=50),
    sort_by: str = "created_at",
    sort_order: str = "desc",
    from_date: str = Query(None),
    to_date: str = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    is_superadmin = current_user.role == "superadmin"
    effective_sort = sort_by if sort_by in ALLOWED_ACTIVITY_SORT else "created_at"
    offset = get_offset(page, page_size)

    from_dt = None
    to_dt = None
    if from_date:
        try:
            from_dt = datetime.fromisoformat(from_date)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid from_date format. Use ISO format (YYYY-MM-DD)")
    if to_date:
        try:
            to_dt = datetime.fromisoformat(to_date)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid to_date format. Use ISO format (YYYY-MM-DD)")

    total, rows = _get_combined_logs_count_and_data(
        db=db,
        is_superadmin=is_superadmin,
        current_user_id=current_user.id,
        module=module,
        action=action,
        sort_by=effective_sort,
        sort_order=sort_order,
        limit=page_size,
        offset=offset,
        from_date=from_dt,
        to_date=to_dt,
    )

    paginated_logs = []
    for row in rows:
        details = row.details or {}
        if isinstance(details, str):
            try:
                details = json.loads(details)
            except (json.JSONDecodeError, TypeError):
                details = {}

        ts = row.timestamp
        if ts is None:
            ts_iso = None
        elif isinstance(ts, str):
            ts_iso = ts
        else:
            ts_iso = to_iso(ts)

        paginated_logs.append({
            "id": row.id,
            "log_type": row.log_type,
            "timestamp": ts_iso,
            "module": row.module,
            "action": row.action,
            "user_id": row.user_id,
            "user": row.user_name or f"User-{row.user_id}",
            "user_role": row.user_role,
            "description": row.description,
            "details": details,
            "asset_code": row.asset_code,
            "asset_name": row.asset_name,
            "ip_address": row.ip_address,
        })

    pagination = calculate_pagination(page, page_size, total)

    return {"data": paginated_logs, "pagination": pagination.dict()}


@router.get("/activity-logs/me", response_model=dict)
async def get_my_activity_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=MAX_PAGE_SIZE),
    module: str = Query(None, max_length=100),
    action: str = Query(None, max_length=50),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = db.query(ActivityLog).filter(ActivityLog.user_id == current_user.id)
    if module:
        query = query.filter(ActivityLog.module.ilike(f"%{_escape_like(module)}%", escape="\\"))
    if action:
        query = query.filter(ActivityLog.action == action)
    total = query.count()
    offset = get_offset(page, page_size)
    records = query.order_by(ActivityLog.created_at.desc()).offset(offset).limit(page_size).all()
    pagination = calculate_pagination(page, page_size, total)
    return {
        "data": [
            {
                "id": log.id,
                "timestamp": (to_iso(log.created_at)),
                "module": log.module, "action": log.action, "description": log.description,
                "details": getattr(log, 'details', {}) or {},
            }
            for log in records
        ],
        "pagination": pagination.dict()
    }


@router.get("/activity-logs/export")
async def export_activity_logs(
    request: Request,
    format: str = Query("csv", pattern="^(csv|json)$"),
    module: str = Query(None, max_length=100),
    action: str = Query(None, max_length=50),
    from_date: str = Query(None),
    to_date: str = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role != "superadmin":
        activity_query = db.query(ActivityLog).filter(ActivityLog.user_id == current_user.id)
        audit_query = db.query(AssetAuditLog).filter(AssetAuditLog.user_id == current_user.id)
    else:
        activity_query = db.query(ActivityLog)
        audit_query = db.query(AssetAuditLog)
    if module:
        escaped_module = _escape_like(module)
        activity_query = activity_query.filter(ActivityLog.module.ilike(f"%{escaped_module}%", escape="\\"))
        audit_query = audit_query.filter(AssetAuditLog.details.ilike(f"%{escaped_module}%", escape="\\"))
    if action:
        activity_query = activity_query.filter(ActivityLog.action == action)
        audit_query = audit_query.filter(AssetAuditLog.action_type == action)
    if from_date:
        try:
            from_dt = datetime.fromisoformat(from_date)
            activity_query = activity_query.filter(ActivityLog.created_at >= from_dt)
            audit_query = audit_query.filter(AssetAuditLog.timestamp >= from_dt)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid from_date format. Use ISO format (YYYY-MM-DD)")
    if to_date:
        try:
            to_dt = datetime.fromisoformat(to_date)
            activity_query = activity_query.filter(ActivityLog.created_at <= to_dt)
            audit_query = audit_query.filter(AssetAuditLog.timestamp <= to_dt)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid to_date format. Use ISO format (YYYY-MM-DD)")

    half_limit = MAX_EXPORT_RECORDS // 2
    activity_logs = activity_query.order_by(ActivityLog.created_at.desc()).limit(half_limit).all()
    audit_logs = audit_query.order_by(AssetAuditLog.timestamp.desc()).limit(half_limit).all()

    if format == "json":
        result = []
        for log in activity_logs:
            result.append({
                "type": "activity",
                "timestamp": to_iso(log.created_at) or "",
                "module": log.module,
                "action": log.action,
                "user": log.user_id,
                "description": log.description,
                "ip_address": log.ip_address or "",
            })
        for log in audit_logs:
            result.append({
                "type": "asset_audit",
                "timestamp": to_iso(log.timestamp) or "",
                "module": "Asset Register",
                "action": log.action_type,
                "user": log.username or "anonymous",
                "description": f"{log.action_type}: {log.asset_name} ({log.asset_code})",
                "ip_address": log.ip_address or "",
            })
        return {"data": result, "total": len(result)}

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Type", "Timestamp", "Module", "Action", "User", "Description", "IP Address"])
    for log in activity_logs:
        writer.writerow([
            "activity",
            to_iso(log.created_at) or "",
            log.module,
            log.action,
            str(log.user_id),
            log.description or "",
            log.ip_address or "",
        ])
    for log in audit_logs:
        writer.writerow([
            "asset_audit",
            to_iso(log.timestamp) or "",
            "Asset Register",
            log.action_type,
            log.username or "anonymous",
            f"{log.action_type}: {log.asset_name} ({log.asset_code})",
            log.ip_address or "",
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=activity_logs.csv"},
    )
