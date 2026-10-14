"""Monthly Server Check CRUD"""
import logging
from fastapi import APIRouter, Depends, Query, Form, Request
from sqlalchemy.orm import Session
from typing import Optional, List
from datetime import datetime

logger = logging.getLogger(__name__)

from utils.timezone import utcnow

from database import get_db
from models import User, MonthlyServerCheck
from api.dependencies import get_current_user, log_activity
from api.dependencies import get_offset, calculate_pagination
from api.schemas import MonthlyCheckResponse, MonthlyCheckListPaginatedResponse, MessageResponse
from utils.optimistic_lock import check_version_conflict, increment_version, get_client_version

router = APIRouter(tags=["Monthly Server Check"])


@router.get("/monthly-server-check/{item_id}", response_model=MonthlyCheckResponse)
async def get_monthly_server_check_item(
    item_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    from fastapi import HTTPException
    item = db.query(MonthlyServerCheck).filter(MonthlyServerCheck.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Monthly server check not found")
    return item


@router.get("/monthly-server-check", response_model=MonthlyCheckListPaginatedResponse)
async def get_monthly_server_check(
    page: int = 1, page_size: int = 20, server_name: Optional[str] = None,
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    query = db.query(MonthlyServerCheck)
    if server_name:
        escaped_name = server_name.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        query = query.filter(MonthlyServerCheck.server_name.ilike(f"%{escaped_name}%", escape="\\"))
    total = query.count()
    offset = get_offset(page, page_size)
    records = query.order_by(MonthlyServerCheck.created_at.desc()).offset(offset).limit(page_size).all()
    pagination = calculate_pagination(page, page_size, total)
    return {"data": records, "pagination": pagination.dict()}


@router.post("/monthly-server-check", response_model=MonthlyCheckResponse)
async def create_monthly_server_check(
    ip_server: str = Form(...), month: str = Form(...), check_date: str = Form(...),
    status: str = Form("OK"), notes: str = Form(None),
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    try:
        check_dt = datetime.strptime(check_date, '%Y-%m-%d').date()
    except ValueError:
        check_dt = utcnow().date()
    item = MonthlyServerCheck(ip_server=ip_server, month=month, check_date=check_dt, status=status, notes=notes, created_by=current_user.id)
    db.add(item)
    log_activity(db, current_user.id, "CREATE", "Monthly Server Check", f"Checked server {ip_server}")
    db.commit()
    db.refresh(item)
    return item


@router.put("/monthly-server-check/{item_id}", response_model=MonthlyCheckResponse)
async def update_monthly_server_check(
    item_id: int, request: Request, ip_server: str = Form(...), month: str = Form(...), check_date: str = Form(...),
    status: str = Form("OK"), notes: str = Form(None),
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    item = db.query(MonthlyServerCheck).filter(MonthlyServerCheck.id == item_id).first()
    if not item:
        raise Exception("Not found")

    client_version = get_client_version(request)
    check_version_conflict(item, client_version)

    try:
        check_dt = datetime.strptime(check_date, '%Y-%m-%d').date()
    except ValueError:
        check_dt = item.check_date
    item.ip_server = ip_server
    item.month = month
    item.check_date = check_dt
    item.status = status
    item.notes = notes
    increment_version(item)
    log_activity(db, current_user.id, "UPDATE", "Monthly Server Check", f"Updated check for server {ip_server}")
    db.commit()
    db.refresh(item)
    return item


@router.delete("/monthly-server-check/{item_id}", response_model=MessageResponse)
async def delete_monthly_server_check(item_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    item = db.query(MonthlyServerCheck).filter(MonthlyServerCheck.id == item_id).first()
    if not item:
        raise Exception("Not found")
    db.delete(item)
    log_activity(db, current_user.id, "DELETE", "monthly_check", f"Deleted monthly server check {item_id}")
    db.commit()
    return {"message": "deleted"}
