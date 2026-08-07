"""Log Compression CRUD + Reports"""
from fastapi import APIRouter, Depends, Query, Form, Request, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import extract, distinct
from typing import Optional
from datetime import datetime
import logging

from database import get_db
from models import User, LogCompression
from api.dependencies import get_current_user, log_activity
from api.dependencies import get_offset, calculate_pagination
from api.schemas import LogCompressionResponse, LogCompressionListPaginatedResponse, MessageResponse
from utils.optimistic_lock import check_version_conflict, increment_version, get_client_version
from utils.timezone import utcnow

router = APIRouter(tags=["Log Compression"])

logger = logging.getLogger(__name__)

ALLOWED_COMPRESSION_SORT = {"execution_date", "created_at", "server"}
MAX_PAGE_SIZE = 100
MAX_SERVER_LEN = 255
MAX_ARCHIVE_LEN = 500
MAX_NOTES_LEN = 1000


def _escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


@router.get("/log-compression/{item_id}", response_model=LogCompressionResponse)
async def get_log_compression_item(
    item_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    item = db.query(LogCompression).filter(
        LogCompression.id == item_id,
        LogCompression.deleted_at.is_(None)
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Log compression record not found")
    if current_user.role != "superadmin" and item.owner_role != current_user.role:
        raise HTTPException(status_code=403, detail="Access denied")
    return item


@router.get("/log-compression", response_model=LogCompressionListPaginatedResponse)
async def get_log_compression(
    page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=MAX_PAGE_SIZE), server: Optional[str] = None,
    year: Optional[int] = None, sort_by: str = "execution_date", sort_order: str = "desc",
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    query = db.query(LogCompression).filter(LogCompression.deleted_at.is_(None))
    if current_user.role != "superadmin":
        query = query.filter(LogCompression.owner_role == current_user.role)
    if server:
        query = query.filter(LogCompression.server.ilike(f"%{_escape_like(server)}%", escape="\\"))
    if year:
        query = query.filter(extract('year', LogCompression.execution_date) == year)
    total = query.count()
    offset = get_offset(page, page_size)
    sort_column = getattr(LogCompression, sort_by if sort_by in ALLOWED_COMPRESSION_SORT else "execution_date", LogCompression.execution_date)
    query = query.order_by(sort_column.asc() if sort_order.lower() == "asc" else sort_column.desc())
    records = query.offset(offset).limit(page_size).all()
    pagination = calculate_pagination(page, page_size, total)
    return {"data": records, "pagination": pagination.dict()}


@router.post("/log-compression", response_model=LogCompressionResponse)
async def create_log_compression(
    server: str = Form(...), archive_info: str = Form(...), execution_date: str = Form(...),
    notes: str = Form(None), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    server = server.strip()[:MAX_SERVER_LEN]
    if not server:
        raise HTTPException(status_code=400, detail="Server is required")
    archive_info = archive_info.strip()[:MAX_ARCHIVE_LEN]
    if not archive_info:
        raise HTTPException(status_code=400, detail="Archive info is required")
    if notes:
        notes = notes.strip()[:MAX_NOTES_LEN]
    try:
        exec_date = datetime.strptime(execution_date, '%Y-%m-%d').date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid execution_date format. Use YYYY-MM-DD")
    item = LogCompression(server=server, archive_info=archive_info, execution_date=exec_date, notes=notes, created_by=current_user.id, owner_role=current_user.role)
    db.add(item)
    log_activity(db, current_user.id, "CREATE", "Log Compression", f"Created archive {archive_info} on {server}")
    db.commit()
    db.refresh(item)
    return item


@router.put("/log-compression/{item_id}", response_model=LogCompressionResponse)
async def update_log_compression(
    item_id: int, request: Request, server: Optional[str] = None, archive_info: Optional[str] = None,
    execution_date: Optional[str] = None, notes: str = Form(None),
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    item = db.query(LogCompression).filter(LogCompression.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Log compression record not found")
    if current_user.role != "superadmin" and item.owner_role != current_user.role:
        raise HTTPException(status_code=403, detail="Access denied")

    client_version = get_client_version(request)
    check_version_conflict(item, client_version)

    if server:
        item.server = server.strip()[:MAX_SERVER_LEN]
    if archive_info:
        item.archive_info = archive_info.strip()[:MAX_ARCHIVE_LEN]
    if execution_date:
        try:
            item.execution_date = datetime.strptime(execution_date, '%Y-%m-%d').date()
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid execution_date format. Use YYYY-MM-DD")
    if notes is not None:
        item.notes = notes.strip()[:MAX_NOTES_LEN] if notes else item.notes
    increment_version(item)
    log_activity(db, current_user.id, "UPDATE", "Log Compression", f"Updated archive {item.archive_info}")
    db.commit()
    db.refresh(item)
    return item


@router.delete("/log-compression/{item_id}", response_model=MessageResponse)
async def delete_log_compression(item_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    item = db.query(LogCompression).filter(
        LogCompression.id == item_id,
        LogCompression.deleted_at.is_(None)
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Log compression record not found")
    if current_user.role != "superadmin" and item.owner_role != current_user.role:
        raise HTTPException(status_code=403, detail="Access denied")
    item.deleted_at = utcnow()
    log_activity(db, current_user.id, "DELETE", "Log Compression", f"Deleted archive {item.archive_info}")
    db.commit()
    return {"message": "Log compression record deleted"}


@router.get("/log-compression/reports/summary", response_model=dict)
async def get_compression_summary(
    server: Optional[str] = None, year: Optional[int] = None,
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    query = db.query(LogCompression).filter(LogCompression.deleted_at.is_(None))
    if current_user.role != "superadmin":
        query = query.filter(LogCompression.owner_role == current_user.role)
    if server:
        query = query.filter(LogCompression.server.ilike(f"%{_escape_like(server)}%", escape="\\"))
    if year:
        query = query.filter(extract('year', LogCompression.execution_date) == year)
    logs = query.all()
    server_stats = {}
    for log in logs:
        if log.server not in server_stats:
            server_stats[log.server] = {"server": log.server, "total_archives": 0, "last_compression": None}
        server_stats[log.server]["total_archives"] += 1
        if log.execution_date:
            if server_stats[log.server]["last_compression"] is None or log.execution_date.isoformat() > server_stats[log.server]["last_compression"]:
                server_stats[log.server]["last_compression"] = log.execution_date.isoformat()
    result = list(server_stats.values())
    result = sorted(result, key=lambda x: x["total_archives"], reverse=True)
    return {"summary": result, "total_servers": len(result), "total_archives": len(logs), "filters": {"server": server, "year": year}}


@router.get("/log-compression/reports/available-filters", response_model=dict)
async def get_compression_filters(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    base_query = db.query(LogCompression).filter(LogCompression.deleted_at.is_(None))
    if current_user.role != "superadmin":
        base_query = base_query.filter(LogCompression.owner_role == current_user.role)
    servers = base_query.with_entities(distinct(LogCompression.server)).order_by(LogCompression.server).all()
    years = base_query.with_entities(distinct(extract('year', LogCompression.execution_date))).order_by(extract('year', LogCompression.execution_date).desc()).all()
    return {"servers": [s[0] for s in servers if s[0]], "years": [int(y[0]) for y in years if y[0]]}
