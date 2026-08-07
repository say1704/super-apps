"""Incident Report CRUD"""
import os
import logging
from datetime import datetime
from fastapi import APIRouter, Depends, Query, Form, UploadFile, File, Request, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import Optional, List
from datetime import date

logger = logging.getLogger(__name__)

from database import get_db
from models import User, IncidentReport
from api.dependencies import get_current_user, log_activity, save_file, broadcast_event
from api.dependencies import get_offset, calculate_pagination
from api.schemas import IncidentResponse, IncidentListPaginatedResponse, MessageResponse
from utils.optimistic_lock import check_version_conflict, increment_version, get_client_version

router = APIRouter(tags=["Incident Report"])


@router.get("/incident-report/stats")
async def get_incident_stats(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """Get incident status summary"""
    base_query = db.query(IncidentReport)
    if current_user.role != "superadmin":
        base_query = base_query.filter(IncidentReport.owner_role == current_user.role)
    total = base_query.count()
    open_count = base_query.filter(IncidentReport.status == "Open").count()
    in_progress_count = base_query.filter(IncidentReport.status == "In Progress").count()
    resolved_count = base_query.filter(IncidentReport.status == "Resolved").count()
    closed_count = base_query.filter(IncidentReport.status == "Closed").count()
    return {
        "total": total,
        "open": open_count,
        "in_progress": in_progress_count,
        "resolved": resolved_count,
        "closed": closed_count,
    }


@router.get("/incident-report/{item_id}", response_model=IncidentResponse)
async def get_incident_report(
    item_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    item = db.query(IncidentReport).filter(IncidentReport.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Incident report not found")
    if current_user.role != "superadmin" and item.owner_role != current_user.role:
        raise HTTPException(status_code=403, detail="Access denied")
    return item


@router.get("/incident-report/{item_id}/file")
async def download_incident_file(
    item_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """Serve uploaded incident report file (PDF, DOCX, images, etc.)"""
    item = db.query(IncidentReport).filter(IncidentReport.id == item_id).first()
    if not item or not item.file_path:
        raise HTTPException(status_code=404, detail="File not found")
    if not os.path.exists(item.file_path):
        raise HTTPException(status_code=404, detail="File not found on disk")
    filename = os.path.basename(item.file_path)
    return FileResponse(item.file_path, filename=filename)


@router.get("/incident-report", response_model=IncidentListPaginatedResponse)
async def get_incident_reports(
    page: int = 1, page_size: int = 20, status: Optional[str] = None,
    incident_type: Optional[str] = None, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    query = db.query(IncidentReport)
    if current_user.role != "superadmin":
        query = query.filter(IncidentReport.owner_role == current_user.role)
    if status:
        query = query.filter(IncidentReport.status == status)
    if incident_type:
        escaped_type = incident_type.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        query = query.filter(IncidentReport.incident_type.ilike(f"%{escaped_type}%", escape="\\"))
    total = query.count()
    offset = get_offset(page, page_size)
    records = query.order_by(IncidentReport.created_at.desc()).offset(offset).limit(page_size).all()
    pagination = calculate_pagination(page, page_size, total)
    return {"data": records, "pagination": pagination.dict()}


@router.post("/incident-report", response_model=IncidentResponse)
async def create_incident_report(
    incident_date: str = Form(...), server_name: str = Form(...), incident_type: str = Form(...),
    description: str = Form(...), status: str = Form("Open"), action_taken: str = Form(None),
    notes: str = Form(None), file: UploadFile = File(None),
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    file_path = None
    if file:
        file_path = save_file(file, "incidents")
    try:
        inc_date = datetime.strptime(incident_date, '%Y-%m-%d').date()
    except ValueError:
        inc_date = date.today()
    item = IncidentReport(
        incident_date=inc_date, server_name=server_name, incident_type=incident_type,
        description=description, status=status, action_taken=action_taken,
        file_path=file_path, created_by=current_user.id, owner_role=current_user.role
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    log_activity(db, current_user.id, "CREATE", "Incident Report", f"Incident on {server_name}")

    try:
        from utils.notification_dispatcher import notify_incident_created
        notify_incident_created(db=db, server_name=server_name, incident_type=incident_type,
            incident_date=incident_date, status=status, reported_by=current_user.full_name or current_user.username,
            description=description)
    except Exception as e:
        logger.warning("Failed to send incident notification: %s", e)

    try:
        await broadcast_event("incident_created", {
            "incident_id": item.id, "server_name": server_name, "incident_type": incident_type,
            "status": status, "reported_by": current_user.full_name or current_user.username,
        }, exclude_user=current_user.id)
    except Exception as e:
        logger.warning("Failed to broadcast incident_created: %s", e)

    return item


@router.put("/incident-report/{item_id}", response_model=IncidentResponse)
async def update_incident_report(
    item_id: int, request: Request,
    incident_date: str = Form(None), server_name: str = Form(None), incident_type: str = Form(None),
    description: str = Form(None), status: str = Form(None), action_taken: str = Form(None),
    file: UploadFile = File(None),
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    item = db.query(IncidentReport).filter(IncidentReport.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Incident report not found")

    client_version = get_client_version(request)
    check_version_conflict(item, client_version)

    # Replace old file if new one uploaded
    if file:
        if item.file_path and os.path.exists(item.file_path):
            os.remove(item.file_path)
        item.file_path = save_file(file, "incidents")

    # Update fields if provided
    if incident_date:
        try:
            item.incident_date = datetime.strptime(incident_date, '%Y-%m-%d').date()
        except ValueError:
            pass
    if server_name:
        item.server_name = server_name
    if incident_type:
        item.incident_type = incident_type
    if description:
        item.description = description
    if status:
        item.status = status
    if action_taken:
        item.action_taken = action_taken

    increment_version(item)
    log_activity(db, current_user.id, "UPDATE", "Incident Report", f"Updated incident {item_id}")
    db.commit()
    db.refresh(item)
    return item


@router.delete("/incident-report/{item_id}", response_model=MessageResponse)
async def delete_incident_report(item_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    item = db.query(IncidentReport).filter(IncidentReport.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Not found")
    if item.file_path and os.path.exists(item.file_path):
        os.remove(item.file_path)
    db.delete(item)
    log_activity(db, current_user.id, "DELETE", "incident", f"Deleted incident report {item_id}")
    db.commit()
    return {"message": "Incident report deleted successfully"}
