from utils.timezone import to_iso, utcnow
"""Log Maintenance CRUD + Reports"""
from fastapi import APIRouter, Depends, Query, Form, Request, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import extract, distinct
from typing import Optional
from datetime import datetime, date
import logging

from database import get_db
from models import User, LogMaintenance
from api.dependencies import get_current_user, log_activity
from api.dependencies import get_offset, calculate_pagination
from api.schemas import LogMaintenanceResponse, LogMaintenanceListPaginatedResponse, MessageResponse
from utils.optimistic_lock import check_version_conflict, increment_version, get_client_version

router = APIRouter(tags=["Log Maintenance"])

logger = logging.getLogger(__name__)

ALLOWED_MAINTENANCE_SORT = {"created_at", "execution_date", "server", "size"}
MAX_PAGE_SIZE = 100
MAX_SERVER_LEN = 255
MAX_PATH_LEN = 500
MAX_SCRIPT_LEN = 255
MAX_SIZE_LEN = 50
MAX_NOTES_LEN = 1000


def _escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


@router.get("/log-maintenance/{item_id}", response_model=LogMaintenanceResponse)
async def get_log_maintenance_item(
    item_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    item = db.query(LogMaintenance).filter(
        LogMaintenance.id == item_id,
        LogMaintenance.deleted_at.is_(None)
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Log maintenance record not found")
    if current_user.role != "superadmin" and item.owner_role != current_user.role:
        raise HTTPException(status_code=403, detail="Access denied")
    return item


@router.get("/log-maintenance", response_model=LogMaintenanceListPaginatedResponse)
async def get_log_maintenance(
    page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=MAX_PAGE_SIZE), server: Optional[str] = None,
    sort_by: str = "created_at", sort_order: str = "desc",
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    query = db.query(LogMaintenance).filter(LogMaintenance.deleted_at.is_(None))
    if current_user.role != "superadmin":
        query = query.filter(LogMaintenance.owner_role == current_user.role)
    if server:
        query = query.filter(LogMaintenance.server.ilike(f"%{_escape_like(server)}%", escape="\\"))
    total = query.count()
    offset = get_offset(page, page_size)
    sort_column = getattr(LogMaintenance, sort_by if sort_by in ALLOWED_MAINTENANCE_SORT else "created_at", LogMaintenance.created_at)
    query = query.order_by(sort_column.asc() if sort_order.lower() == "asc" else sort_column.desc())
    records = query.offset(offset).limit(page_size).all()
    pagination = calculate_pagination(page, page_size, total)
    return {"data": records, "pagination": pagination.dict()}


@router.post("/log-maintenance", response_model=LogMaintenanceResponse)
async def create_log_maintenance(
    server: str = Form(...), path: str = Form(None), script_execution: str = Form(None),
    execution_date: str = Form(None), size: str = Form(None), notes: str = Form(None),
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    server = server.strip()[:MAX_SERVER_LEN]
    if not server:
        raise HTTPException(status_code=400, detail="Server is required")
    if path:
        path = path.strip()[:MAX_PATH_LEN]
    if script_execution:
        script_execution = script_execution.strip()[:MAX_SCRIPT_LEN]
    if size:
        size = size.strip()[:MAX_SIZE_LEN]
    if notes:
        notes = notes.strip()[:MAX_NOTES_LEN]
    exec_date = None
    if execution_date:
        try:
            exec_date = datetime.strptime(execution_date, '%Y-%m-%d').date()
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid execution_date format. Use YYYY-MM-DD")
    item = LogMaintenance(
        server=server, path=path, script_execution=script_execution,
        execution_date=exec_date, size=size, notes=notes, created_by=current_user.id,
        owner_role=current_user.role
    )
    db.add(item)
    log_activity(db, current_user.id, "CREATE", "Log Maintenance", f"Created log for server {server}")
    db.commit()
    db.refresh(item)
    return item


@router.put("/log-maintenance/{item_id}", response_model=LogMaintenanceResponse)
async def update_log_maintenance(
    item_id: int, request: Request, server: str = Form(...), path: str = Form(None),
    script_execution: str = Form(None), execution_date: str = Form(None),
    size: str = Form(None), notes: str = Form(None),
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    item = db.query(LogMaintenance).filter(LogMaintenance.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Log maintenance record not found")
    if current_user.role != "superadmin" and item.owner_role != current_user.role:
        raise HTTPException(status_code=403, detail="Access denied")

    client_version = get_client_version(request)
    check_version_conflict(item, client_version)

    server = server.strip()[:MAX_SERVER_LEN]
    if not server:
        raise HTTPException(status_code=400, detail="Server is required")
    if path:
        path = path.strip()[:MAX_PATH_LEN]
    if script_execution:
        script_execution = script_execution.strip()[:MAX_SCRIPT_LEN]
    if size:
        size = size.strip()[:MAX_SIZE_LEN]
    if notes:
        notes = notes.strip()[:MAX_NOTES_LEN]

    exec_date = None
    if execution_date:
        try:
            exec_date = datetime.strptime(execution_date, '%Y-%m-%d').date()
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid execution_date format. Use YYYY-MM-DD")
    item.server = server
    item.path = path
    item.script_execution = script_execution
    item.execution_date = exec_date
    item.size = size
    item.notes = notes
    increment_version(item)
    log_activity(db, current_user.id, "UPDATE", "Log Maintenance", f"Updated log {item_id}")
    db.commit()
    db.refresh(item)
    return item


@router.delete("/log-maintenance/{item_id}", response_model=MessageResponse)
async def delete_log_maintenance(item_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    item = db.query(LogMaintenance).filter(
        LogMaintenance.id == item_id,
        LogMaintenance.deleted_at.is_(None)
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Log maintenance record not found")
    if current_user.role != "superadmin" and item.owner_role != current_user.role:
        raise HTTPException(status_code=403, detail="Access denied")
    item.deleted_at = utcnow()
    log_activity(db, current_user.id, "DELETE", "Log Maintenance", f"Deleted log {item_id}")
    db.commit()
    return {"message": "Log maintenance record deleted"}


@router.get("/log-maintenance/reports/summary", response_model=dict)
async def get_log_maintenance_summary(
    server: Optional[str] = None, year: Optional[int] = None, month: Optional[int] = None,
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    query = db.query(LogMaintenance).filter(LogMaintenance.deleted_at.is_(None))
    if current_user.role != "superadmin":
        query = query.filter(LogMaintenance.owner_role == current_user.role)
    if server:
        query = query.filter(LogMaintenance.server.ilike(f"%{_escape_like(server)}%", escape="\\"))
    if year:
        query = query.filter(extract('year', LogMaintenance.execution_date) == year)
    if month:
        query = query.filter(extract('month', LogMaintenance.execution_date) == month)
    logs = query.all()
    server_stats = {}
    for log in logs:
        if log.server not in server_stats:
            server_stats[log.server] = {"server": log.server, "total_logs": 0, "total_size_gb": 0, "sizes": [], "last_execution": None, "logs": []}
        server_stats[log.server]["total_logs"] += 1
        server_stats[log.server]["logs"].append({
            "id": log.id, "execution_date": to_iso(log.execution_date),
            "size": log.size, "path": log.path, "notes": log.notes
        })
        if log.size:
            size_str = log.size.upper()
            try:
                if 'GB' in size_str:
                    server_stats[log.server]["total_size_gb"] += float(size_str.replace('GB', '').strip())
                elif size_str.endswith('G'):
                    server_stats[log.server]["total_size_gb"] += float(size_str[:-1].strip())
                elif 'MB' in size_str:
                    server_stats[log.server]["total_size_gb"] += float(size_str.replace('MB', '').strip()) / 1024
                elif size_str.endswith('M'):
                    server_stats[log.server]["total_size_gb"] += float(size_str[:-1].strip()) / 1024
                elif 'KB' in size_str:
                    server_stats[log.server]["total_size_gb"] += float(size_str.replace('KB', '').strip()) / (1024 * 1024)
                elif size_str.endswith('K'):
                    server_stats[log.server]["total_size_gb"] += float(size_str[:-1].strip()) / (1024 * 1024)
                elif size_str.endswith('B'):
                    server_stats[log.server]["total_size_gb"] += float(size_str[:-1].strip()) / (1024 ** 3)
            except (ValueError, TypeError):
                pass
        if log.execution_date:
            if server_stats[log.server]["last_execution"] is None or log.execution_date.isoformat() > server_stats[log.server]["last_execution"]:
                server_stats[log.server]["last_execution"] = log.execution_date.isoformat()
    result = list(server_stats.values())
    for item in result:
        item["total_size_gb"] = round(item["total_size_gb"], 2)
        item["logs"] = sorted(item["logs"], key=lambda x: x["execution_date"] or "", reverse=True)
    result = sorted(result, key=lambda x: x["total_logs"], reverse=True)
    return {
        "summary": result, "total_servers": len(result), "total_logs": len(logs),
        "total_size_gb": round(sum(s["total_size_gb"] for s in result), 2),
        "filters": {"server": server, "year": year, "month": month}
    }


@router.get("/log-maintenance/reports/by-date", response_model=dict)
async def get_log_maintenance_by_date(
    year: Optional[int] = None, month: Optional[int] = None,
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    query = db.query(LogMaintenance).filter(LogMaintenance.deleted_at.is_(None)).order_by(LogMaintenance.execution_date.desc())
    if current_user.role != "superadmin":
        query = query.filter(LogMaintenance.owner_role == current_user.role)
    if year:
        query = query.filter(extract('year', LogMaintenance.execution_date) == year)
    if month:
        query = query.filter(extract('month', LogMaintenance.execution_date) == month)
    logs = query.all()
    date_groups = {}
    for log in logs:
        date_key = log.execution_date.isoformat() if log.execution_date else "Unknown"
        if date_key not in date_groups:
            date_groups[date_key] = []
        date_groups[date_key].append({
            "id": log.id, "server": log.server, "path": log.path, "size": log.size,
            "script_execution": log.script_execution, "notes": log.notes
        })
    return {"by_date": date_groups, "total_logs": len(logs), "filters": {"year": year, "month": month}}


@router.get("/log-maintenance/reports/available-filters", response_model=dict)
async def get_available_filters(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    base_query = db.query(LogMaintenance).filter(LogMaintenance.deleted_at.is_(None))
    if current_user.role != "superadmin":
        base_query = base_query.filter(LogMaintenance.owner_role == current_user.role)
    servers = base_query.with_entities(distinct(LogMaintenance.server)).order_by(LogMaintenance.server).all()
    years = base_query.with_entities(distinct(extract('year', LogMaintenance.execution_date))).order_by(extract('year', LogMaintenance.execution_date).desc()).all()
    months = base_query.with_entities(distinct(extract('month', LogMaintenance.execution_date))).order_by(extract('month', LogMaintenance.execution_date)).all()
    return {
        "servers": [s[0] for s in servers if s[0]],
        "years": [int(y[0]) for y in years if y[0]],
        "months": [int(m[0]) for m in months if m[0]]
    }


def _parse_size_to_gb(size_str: str) -> float:
    """Parse size string like '2.5 GB', '21G', '850 MB', '850M', '45 KB', '45K' to GB."""
    if not size_str:
        return 0.0
    s = size_str.upper().strip()
    try:
        if 'GB' in s:
            return float(s.replace('GB', '').strip())
        if s.endswith('G'):
            return float(s[:-1].strip())
        if 'MB' in s:
            return float(s.replace('MB', '').strip()) / 1024
        if s.endswith('M'):
            return float(s[:-1].strip()) / 1024
        if 'KB' in s:
            return float(s.replace('KB', '').strip()) / (1024 * 1024)
        if s.endswith('K'):
            return float(s[:-1].strip()) / (1024 * 1024)
        if s.endswith('B'):
            return float(s[:-1].strip()) / (1024 ** 3)
    except (ValueError, TypeError):
        pass
    return 0.0


def _format_size_gb(gb: float) -> str:
    """Format GB value to human-readable string (MB/GB/TB)."""
    if gb >= 1000:
        return f"{gb / 1024:.2f} TB"
    if gb >= 1:
        return f"{gb:.2f} GB"
    if gb > 0:
        return f"{gb * 1024:.2f} MB"
    return "0.00 GB"


@router.get("/log-maintenance/reports/advanced", response_model=dict)
async def get_log_maintenance_advanced(
    server: Optional[str] = None, year: Optional[int] = None, month: Optional[int] = None,
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    query = db.query(LogMaintenance).filter(LogMaintenance.deleted_at.is_(None))
    if current_user.role != "superadmin":
        query = query.filter(LogMaintenance.owner_role == current_user.role)
    if server:
        query = query.filter(LogMaintenance.server.ilike(f"%{_escape_like(server)}%", escape="\\"))
    if year:
        query = query.filter(extract('year', LogMaintenance.execution_date) == year)
    if month:
        query = query.filter(extract('month', LogMaintenance.execution_date) == month)
    logs = query.all()

    today = utcnow().date()

    # Build per-server stats
    server_stats = {}
    for log in logs:
        if log.server not in server_stats:
            server_stats[log.server] = {
                "server": log.server, "total_logs": 0, "total_size_gb": 0,
                "last_execution": None, "sizes": [], "scripts": [], "paths": []
            }
        server_stats[log.server]["total_logs"] += 1
        size_gb = _parse_size_to_gb(log.size)
        server_stats[log.server]["total_size_gb"] += size_gb
        server_stats[log.server]["sizes"].append(size_gb)
        if log.execution_date:
            exec_iso = log.execution_date.isoformat()
            if server_stats[log.server]["last_execution"] is None or exec_iso > server_stats[log.server]["last_execution"]:
                server_stats[log.server]["last_execution"] = exec_iso
        if log.script_execution:
            server_stats[log.server]["scripts"].append(log.script_execution)
        if log.path:
            server_stats[log.server]["paths"].append(log.path)

    # Round sizes
    for s in server_stats.values():
        s["total_size_gb"] = round(s["total_size_gb"], 2)

    total_size_gb = round(sum(s["total_size_gb"] for s in server_stats.values()), 2)
    total_servers = len(server_stats)
    total_logs = len(logs)

    # Size analytics
    all_sizes = [s["total_size_gb"] for s in server_stats.values()]
    sorted_sizes = sorted(all_sizes)
    median_gb = round(sorted_sizes[len(sorted_sizes) // 2], 2) if sorted_sizes else 0
    avg_gb = round(total_size_gb / total_servers, 2) if total_servers > 0 else 0

    largest = max(server_stats.values(), key=lambda x: x["total_size_gb"]) if server_stats else None
    smallest = min(server_stats.values(), key=lambda x: x["total_size_gb"]) if server_stats else None

    top_5 = sorted(server_stats.values(), key=lambda x: x["total_size_gb"], reverse=True)[:5]
    top_5_with_pct = [
        {"server": s["server"], "size_gb": s["total_size_gb"], "percentage": round(s["total_size_gb"] / total_size_gb * 100, 1) if total_size_gb > 0 else 0}
        for s in top_5
    ]

    large_servers = [s["server"] for s in server_stats.values() if s["total_size_gb"] > 10]
    medium_servers = [s["server"] for s in server_stats.values() if 1 <= s["total_size_gb"] <= 10]
    small_servers = [s["server"] for s in server_stats.values() if s["total_size_gb"] < 1]

    # Path categories
    path_sizes = {}
    for log in logs:
        if log.path:
            parts = log.path.strip("/").split("/")
            category = "/" + parts[0] if parts else "/other"
            if category not in path_sizes:
                path_sizes[category] = {"category": category, "size_gb": 0, "count": 0}
            path_sizes[category]["size_gb"] += _parse_size_to_gb(log.size)
            path_sizes[category]["count"] += 1
    path_categories = sorted(
        [{"category": v["category"], "size_gb": round(v["size_gb"], 2), "count": v["count"], "percentage": round(v["size_gb"] / total_size_gb * 100, 1) if total_size_gb > 0 else 0} for v in path_sizes.values()],
        key=lambda x: x["size_gb"], reverse=True
    )

    # Time analytics
    date_stats = {}
    monthly_stats = {}
    for log in logs:
        if log.execution_date:
            date_key = log.execution_date.isoformat()
            if date_key not in date_stats:
                date_stats[date_key] = {"date": date_key, "count": 0, "size_gb": 0}
            date_stats[date_key]["count"] += 1
            date_stats[date_key]["size_gb"] += _parse_size_to_gb(log.size)

            month_key = date_key[:7]
            if month_key not in monthly_stats:
                monthly_stats[month_key] = {"month": month_key, "count": 0, "size_gb": 0}
            monthly_stats[month_key]["count"] += 1
            monthly_stats[month_key]["size_gb"] += _parse_size_to_gb(log.size)

    for d in date_stats.values():
        d["size_gb"] = round(d["size_gb"], 2)
    for m in monthly_stats.values():
        m["size_gb"] = round(m["size_gb"], 2)

    most_active = max(date_stats.values(), key=lambda x: x["count"]) if date_stats else None
    monthly_trend = sorted(monthly_stats.values(), key=lambda x: x["month"])
    unique_months = len(monthly_stats)
    avg_per_month = round(total_logs / unique_months, 1) if unique_months > 0 else 0

    last_deletion_date = max(date_stats.keys()) if date_stats else None
    days_since = (today - datetime.strptime(last_deletion_date, "%Y-%m-%d").date()).days if last_deletion_date else None

    # Server analytics
    most_active_server = max(server_stats.values(), key=lambda x: x["total_logs"]) if server_stats else None
    least_active_server = min(server_stats.values(), key=lambda x: x["total_logs"]) if server_stats else None

    server_health = []
    inactive_servers = []
    for s in server_stats.values():
        if s["last_execution"]:
            days_ago = (today - datetime.strptime(s["last_execution"], "%Y-%m-%d").date()).days
            if days_ago <= 30:
                status = "healthy"
            elif days_ago <= 60:
                status = "warning"
            else:
                status = "critical"
        else:
            days_ago = None
            status = "critical"

        entry = {"server": s["server"], "status": status, "last_deletion": s["last_execution"], "days_ago": days_ago}
        server_health.append(entry)
        if status == "critical":
            inactive_servers.append(entry)

    server_health = sorted(server_health, key=lambda x: x["days_ago"] if x["days_ago"] is not None else 9999)

    # Path analytics
    path_counts = {}
    for log in logs:
        if log.path:
            if log.path not in path_counts:
                path_counts[log.path] = {"path": log.path, "count": 0, "size_gb": 0}
            path_counts[log.path]["count"] += 1
            path_counts[log.path]["size_gb"] += _parse_size_to_gb(log.size)
    for p in path_counts.values():
        p["size_gb"] = round(p["size_gb"], 2)
    most_common_paths = sorted(path_counts.values(), key=lambda x: x["count"], reverse=True)[:5]

    # Script analytics
    script_stats = {}
    automated_count = 0
    manual_count = 0
    for log in logs:
        if log.script_execution:
            automated_count += 1
            if log.script_execution not in script_stats:
                script_stats[log.script_execution] = {"script": log.script_execution, "count": 0, "servers": set()}
            script_stats[log.script_execution]["count"] += 1
            script_stats[log.script_execution]["servers"].add(log.server)
        else:
            manual_count += 1
    most_used_scripts = sorted(
        [{"script": v["script"], "count": v["count"], "servers": sorted(list(v["servers"]))} for v in script_stats.values()],
        key=lambda x: x["count"], reverse=True
    )[:5]
    automation_rate = round(automated_count / total_logs * 100, 1) if total_logs > 0 else 0

    # Combined insights
    efficiency = round(total_size_gb / total_logs, 2) if total_logs > 0 else 0
    compliant_count = sum(1 for s in server_health if s["status"] == "healthy")
    compliance_rate = round(compliant_count / total_servers * 100, 1) if total_servers > 0 else 0

    if len(monthly_trend) >= 2:
        prev_size = monthly_trend[-2]["size_gb"]
        curr_size = monthly_trend[-1]["size_gb"]
        if curr_size > prev_size * 1.2:
            trend_alert = "increasing"
        elif curr_size < prev_size * 0.8:
            trend_alert = "decreasing"
        else:
            trend_alert = "stable"
    else:
        trend_alert = "stable"

    return {
        "size_analytics": {
            "total_size_gb": total_size_gb,
            "total_size_formatted": _format_size_gb(total_size_gb),
            "avg_size_per_server_gb": avg_gb,
            "median_size_gb": median_gb,
            "largest_server": {"server": largest["server"], "size_gb": largest["total_size_gb"]} if largest else None,
            "smallest_server": {"server": smallest["server"], "size_gb": smallest["total_size_gb"]} if smallest else None,
            "top_5_servers": top_5_with_pct,
            "size_distribution": {
                "large": {"count": len(large_servers), "label": "> 10 GB", "servers": large_servers},
                "medium": {"count": len(medium_servers), "label": "1-10 GB", "servers": medium_servers},
                "small": {"count": len(small_servers), "label": "< 1 GB", "servers": small_servers},
            },
            "path_categories": path_categories,
        },
        "time_analytics": {
            "most_active_date": most_active,
            "avg_deletions_per_month": avg_per_month,
            "monthly_trend": monthly_trend,
            "days_since_last_deletion": days_since,
        },
        "server_analytics": {
            "total_servers": total_servers,
            "total_logs": total_logs,
            "most_active_server": {"server": most_active_server["server"], "count": most_active_server["total_logs"]} if most_active_server else None,
            "least_active_server": {"server": least_active_server["server"], "count": least_active_server["total_logs"]} if least_active_server else None,
            "inactive_servers": inactive_servers,
            "server_health": server_health,
        },
        "path_analytics": {
            "unique_paths": len(path_counts),
            "most_common_paths": most_common_paths,
        },
        "script_analytics": {
            "automation_rate": automation_rate,
            "automated_count": automated_count,
            "manual_count": manual_count,
            "most_used_scripts": most_used_scripts,
        },
        "combined_insights": {
            "efficiency_score": efficiency,
            "compliance_rate": compliance_rate,
            "compliant_servers": compliant_count,
            "non_compliant_servers": total_servers - compliant_count,
            "trend_alert": trend_alert,
        },
        "filters": {"server": server, "year": year, "month": month},
    }
