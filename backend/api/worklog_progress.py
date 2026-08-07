"""Worklog Progress Chat CRUD"""
import json
import logging
from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from typing import List

from database import get_db
from models import User, WorkLog, WorklogProgress, ActivityLog
from api.dependencies import get_current_user, can_modify_record, log_activity
from utils.image_processor import process_image, delete_image_file
from utils.timezone import to_iso

router = APIRouter(tags=["Worklog Progress"])
logger = logging.getLogger(__name__)


def _progress_to_dict(item: WorklogProgress) -> dict:
    try:
        photo_urls = json.loads(item.photo_urls) if item.photo_urls else []
    except (json.JSONDecodeError, TypeError):
        photo_urls = []
    return {
        "id": item.id,
        "worklog_id": item.worklog_id,
        "message": item.message,
        "photo_urls": photo_urls,
        "created_at": to_iso(item.created_at),
    }


@router.get("/worklog/{worklog_id}/progress")
async def get_progress(
    worklog_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    worklog = db.query(WorkLog).filter(WorkLog.id == worklog_id).first()
    if not worklog:
        return {"entries": []}
    entries = db.query(WorklogProgress).filter(
        WorklogProgress.worklog_id == worklog_id
    ).order_by(WorklogProgress.created_at.asc()).all()
    return {"entries": [_progress_to_dict(e) for e in entries]}


@router.post("/worklog/{worklog_id}/progress")
async def create_progress(
    worklog_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    worklog = db.query(WorkLog).filter(WorkLog.id == worklog_id).first()
    if not worklog:
        raise HTTPException(status_code=404, detail="Worklog not found")
    if not can_modify_record(current_user, worklog):
        raise HTTPException(status_code=403, detail="Access denied")

    form = await request.form()
    message = (form.get("message") or "").strip()

    # Use duck typing: check for filename attribute instead of isinstance
    # (fastapi.UploadFile identity differs from starlette.datastructures.UploadFile at runtime)
    def _is_upload_file(v):
        return hasattr(v, 'filename') and v.filename is not None

    photos = [v for v in form.getlist('photos') if _is_upload_file(v)]
    logger.info(f"[Progress POST] worklog_id={worklog_id}, message='{message}', photos_count={len(photos)}")
    for i, p in enumerate(photos):
        logger.info(f"[Progress POST] Photo {i}: filename={p.filename}, content_type={p.content_type}, size={p.size}")

    if not message and not photos:
        raise HTTPException(status_code=400, detail="Message or at least one photo is required")

    photo_urls = []
    for photo in photos:
        path, error = await process_image(photo)
        if path:
            photo_urls.append(path)

    entry = WorklogProgress(
        worklog_id=worklog_id,
        message=message,
        photo_urls=json.dumps(photo_urls)
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)

    log_activity(db, current_user.id, "CREATE", "worklog", f"Added progress update to worklog {worklog_id}")
    return _progress_to_dict(entry)


@router.put("/worklog/{worklog_id}/progress/{entry_id}")
async def update_progress(
    worklog_id: int,
    entry_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    entry = db.query(WorklogProgress).filter(
        WorklogProgress.id == entry_id,
        WorklogProgress.worklog_id == worklog_id
    ).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")

    worklog = db.query(WorkLog).filter(WorkLog.id == worklog_id).first()
    if not can_modify_record(current_user, worklog):
        raise HTTPException(status_code=403, detail="Access denied")

    form = await request.form()
    message = form.get("message", "").strip()
    if message:
        entry.message = message

    # Support removing photos by index
    remove_indexes_str = form.get("remove_photo_indexes", "")
    remove_indexes = []
    if remove_indexes_str:
        try:
            remove_indexes = json.loads(remove_indexes_str)
        except (json.JSONDecodeError, TypeError):
            pass

    existing = _progress_to_dict(entry)["photo_urls"]

    # Delete removed photos from disk and filter them out
    if remove_indexes:
        for idx in sorted(remove_indexes, reverse=True):
            if 0 <= idx < len(existing):
                delete_image_file(existing[idx])
                existing.pop(idx)

    photos = [v for v in form.getlist('photos') if _is_upload_file(v)]

    if photos:
        new_urls = []
        for photo in photos:
            path, error = await process_image(photo)
            if path:
                new_urls.append(path)
        existing = existing + new_urls

    entry.photo_urls = json.dumps(existing)

    db.commit()
    db.refresh(entry)
    log_activity(db, current_user.id, "UPDATE", "worklog", f"Updated progress entry {entry_id}")
    return _progress_to_dict(entry)


@router.delete("/worklog/{worklog_id}/progress/{entry_id}")
async def delete_progress(
    worklog_id: int,
    entry_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    entry = db.query(WorklogProgress).filter(
        WorklogProgress.id == entry_id,
        WorklogProgress.worklog_id == worklog_id
    ).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")

    worklog = db.query(WorkLog).filter(WorkLog.id == worklog_id).first()
    if not can_modify_record(current_user, worklog):
        raise HTTPException(status_code=403, detail="Access denied")

    photo_urls = _progress_to_dict(entry)["photo_urls"]
    for path in photo_urls:
        delete_image_file(path)

    db.delete(entry)
    log_activity(db, current_user.id, "DELETE", "worklog", f"Deleted progress entry {entry_id}")
    db.commit()
    return {"status": "deleted"}
