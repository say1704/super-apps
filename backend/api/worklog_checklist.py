from utils.timezone import to_iso
"""Worklog Checklist CRUD"""
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.orm import Session

from database import get_db
from models import User, WorkLog, WorklogChecklist
from api.dependencies import get_current_user, can_modify_record, log_activity
from utils.optimistic_lock import check_version_conflict, increment_version, get_client_version
from api.schemas import ChecklistItemResponse, ChecklistListResponse, MessageResponse

router = APIRouter(tags=["Worklog Checklist"])


class ChecklistItemCreate(BaseModel):
    name: str
    notes: Optional[str] = None
    sort_order: Optional[int] = None


class ChecklistItemUpdate(BaseModel):
    name: Optional[str] = None
    notes: Optional[str] = None
    is_completed: Optional[bool] = None
    sort_order: Optional[int] = None


def _checklist_to_dict(item: WorklogChecklist) -> dict:
    return {
        "id": item.id,
        "worklog_id": item.worklog_id,
        "name": item.name,
        "notes": item.notes,
        "is_completed": item.is_completed,
        "sort_order": item.sort_order,
        "created_at": to_iso(item.created_at),
    }


@router.get("/worklog/{worklog_id}/checklist", response_model=ChecklistListResponse)
async def get_checklist(
    worklog_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    worklog = db.query(WorkLog).filter(WorkLog.id == worklog_id).first()
    if not worklog:
        raise HTTPException(status_code=404, detail="Worklog not found")
    if not can_modify_record(current_user, worklog):
        raise HTTPException(status_code=403, detail="Access denied")
    items = db.query(WorklogChecklist).filter(
        WorklogChecklist.worklog_id == worklog_id
    ).order_by(WorklogChecklist.sort_order).all()
    return {"items": [_checklist_to_dict(i) for i in items]}


@router.post("/worklog/{worklog_id}/checklist", response_model=ChecklistItemResponse)
async def create_checklist_item(
    worklog_id: int,
    data: ChecklistItemCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    worklog = db.query(WorkLog).filter(WorkLog.id == worklog_id).first()
    if not worklog:
        raise HTTPException(status_code=404, detail="Worklog not found")
    if not can_modify_record(current_user, worklog):
        raise HTTPException(status_code=403, detail="Access denied")
    max_order = db.query(WorklogChecklist).filter(
        WorklogChecklist.worklog_id == worklog_id
    ).order_by(WorklogChecklist.sort_order.desc()).first()
    sort_order = data.sort_order if data.sort_order is not None else (max_order.sort_order + 1 if max_order else 0)
    item = WorklogChecklist(
        worklog_id=worklog_id,
        name=data.name,
        notes=data.notes,
        sort_order=sort_order
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    log_activity(db, current_user.id, "CREATE", "worklog", f"Added checklist item to worklog {worklog_id}")
    return _checklist_to_dict(item)


@router.put("/worklog/{worklog_id}/checklist/{item_id}", response_model=ChecklistItemResponse)
async def update_checklist_item(
    worklog_id: int,
    item_id: int,
    request: Request,
    data: ChecklistItemUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    item = db.query(WorklogChecklist).filter(
        WorklogChecklist.id == item_id,
        WorklogChecklist.worklog_id == worklog_id
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    if not can_modify_record(current_user, item.worklog):
        raise HTTPException(status_code=403, detail="Access denied")

    client_version = get_client_version(request)
    check_version_conflict(item, client_version)

    if data.name is not None:
        item.name = data.name
    if data.notes is not None:
        item.notes = data.notes
    if data.is_completed is not None:
        item.is_completed = data.is_completed
    if data.sort_order is not None:
        item.sort_order = data.sort_order
    increment_version(item)
    db.commit()
    db.refresh(item)
    log_activity(db, current_user.id, "UPDATE", "worklog", f"Updated checklist item {item_id}")
    return _checklist_to_dict(item)


@router.patch("/worklog/{worklog_id}/checklist/{item_id}/toggle", response_model=ChecklistItemResponse)
async def toggle_checklist_item(
    worklog_id: int,
    item_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    item = db.query(WorklogChecklist).filter(
        WorklogChecklist.id == item_id,
        WorklogChecklist.worklog_id == worklog_id
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    if not can_modify_record(current_user, item.worklog):
        raise HTTPException(status_code=403, detail="Access denied")

    client_version = get_client_version(request)
    check_version_conflict(item, client_version)

    item.is_completed = not item.is_completed
    increment_version(item)
    db.commit()
    db.refresh(item)
    log_activity(db, current_user.id, "UPDATE", "worklog", f"Toggled checklist item {item_id}")
    return _checklist_to_dict(item)


@router.delete("/worklog/{worklog_id}/checklist/{item_id}", response_model=MessageResponse)
async def delete_checklist_item(
    worklog_id: int,
    item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    item = db.query(WorklogChecklist).filter(
        WorklogChecklist.id == item_id,
        WorklogChecklist.worklog_id == worklog_id
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    if not can_modify_record(current_user, item.worklog):
        raise HTTPException(status_code=403, detail="Access denied")
    db.delete(item)
    db.commit()
    log_activity(db, current_user.id, "DELETE", "worklog", f"Deleted checklist item {item_id}")
    return {"status": "deleted"}
