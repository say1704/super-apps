"""Worklog CRUD + Stats"""
import json
import os
import logging
from fastapi import APIRouter, Depends, HTTPException, Query, Form, Request, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session, selectinload
from sqlalchemy import func, and_, Integer
from datetime import datetime, timedelta, timezone
from utils.timezone import utcnow
from typing import Optional, List

from database import get_db
from models import User, WorkLog, ActivityLog, ProjectTask, WorklogChecklist, WorklogProgress
from api.dependencies import get_current_user, log_activity, broadcast_event
from api.dependencies import get_worklog_filter, can_modify_record
from api.dependencies import get_offset, calculate_pagination
from api.schemas import WorklogStatsResponse, ChecklistItemResponse, WorklogListPaginatedResponse, MessageResponse, ChecklistListResponse
from utils.optimistic_lock import check_version_conflict, increment_version, get_client_version
from utils.image_processor import process_image, delete_image_file, UploadFile

router = APIRouter(tags=["Worklog"])
logger = logging.getLogger(__name__)


def _parse_photo_urls(photo_urls_str: str) -> List[str]:
    if not photo_urls_str or photo_urls_str == "[]":
        return []
    try:
        return json.loads(photo_urls_str)
    except (json.JSONDecodeError, TypeError):
        return []


@router.get("/worklog", response_model=WorklogListPaginatedResponse)
async def get_worklog(
    page: int = 1, page_size: int = 20, start_date: str = None, end_date: str = None,
    status: str = None, category: str = None, tags: str = None, task_id: int = None,
    sort_by: str = "created_at", sort_order: str = "desc",
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    ALLOWED_SORT_COLUMNS = {"date", "created_at", "status", "category", "description"}
    if sort_by not in ALLOWED_SORT_COLUMNS:
        sort_by = "created_at"

    query = db.query(WorkLog)
    owner_filter = get_worklog_filter(current_user)
    if owner_filter is not None:
        query = query.filter(owner_filter)
    filters = []
    if start_date:
        filters.append(WorkLog.date >= datetime.strptime(start_date, "%Y-%m-%d").date())
    if end_date:
        filters.append(WorkLog.date <= datetime.strptime(end_date, "%Y-%m-%d").date())
    if status:
        filters.append(WorkLog.status == status)
    if category and category != "All":
        filters.append(WorkLog.category == category)
    if tags:
        escaped_tags = tags.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        filters.append(WorkLog.tags.ilike(f"%{escaped_tags}%", escape="\\"))
    if task_id:
        filters.append(WorkLog.task_id == task_id)
    if filters:
        query = query.filter(and_(*filters))
    total = query.count()
    offset = get_offset(page, page_size)
    sort_column = getattr(WorkLog, sort_by, WorkLog.created_at)
    query = query.order_by(sort_column.asc() if sort_order.lower() == "asc" else sort_column.desc())
    records = query.offset(offset).limit(page_size).all()
    pagination = calculate_pagination(page, page_size, total)

    worklog_ids = [r.id for r in records]
    checklist_stats = {}
    if worklog_ids:
        checklist_rows = db.query(
            WorklogChecklist.worklog_id,
            func.count(WorklogChecklist.id).label("total"),
            func.sum(func.cast(WorklogChecklist.is_completed, Integer)).label("completed")
        ).filter(WorklogChecklist.worklog_id.in_(worklog_ids)).group_by(WorklogChecklist.worklog_id).all()
        for row in checklist_rows:
            checklist_stats[row.worklog_id] = {"checklist_total": row.total, "checklist_completed": row.completed or 0}

    result_data = []
    for r in records:
        item_dict = {k: v for k, v in r.__dict__.copy().items() if not k.startswith('_')}
        item_dict["photo_urls"] = _parse_photo_urls(r.photo_urls)
        stats = checklist_stats.get(r.id, {"checklist_total": 0, "checklist_completed": 0})
        item_dict["checklist_total"] = stats["checklist_total"]
        item_dict["checklist_completed"] = stats["checklist_completed"]
        result_data.append(item_dict)

    return {"data": result_data, "pagination": pagination.dict()}


@router.post("/worklog", response_model=dict)
async def create_worklog(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    try:
        form = await request.form()
        date_str = form.get('date')
        time_str = form.get('time', '')
        description = form.get('description')
        status = form.get('status', 'in_progress')
        category = form.get('category', 'General')
        tags = form.get('tags', '')
        estimated_time = form.get('estimated_time', '')
        actual_time = form.get('actual_time', '')
        notes = form.get('notes', '')
        task_id = form.get('task_id', None)

        if not date_str or not description:
            raise HTTPException(status_code=400, detail="Date and description are required")

        date_obj = datetime.strptime(date_str, "%Y-%m-%d").date()
        if not time_str:
            wib_tz = timezone(timedelta(hours=7))
            time_str = datetime.now(wib_tz).strftime("%H:%M")

        photos = form.getlist('photos')
        # Use duck typing: isinstance(UploadFile) fails due to fastapi/starlette class identity mismatch
        photos = [p for p in photos if hasattr(p, 'filename') and p.filename]
        
        logger.info(f"[Worklog POST] Received {len(photos)} photos. Raw form keys: {list(form.keys())}")
        for i, p in enumerate(photos):
            logger.info(f"[Worklog POST] Photo {i}: filename={p.filename}, content_type={p.content_type}")

        photo_urls = []
        photo_errors = []
        for photo in photos:
            path, error = await process_image(photo)
            if path:
                photo_urls.append(path)
            elif error:
                photo_errors.append(error)

        item = WorkLog(
            date=date_obj, time=time_str, description=description, status=status,
            tags=tags, category=category, estimated_time=estimated_time,
            actual_time=actual_time, notes=notes, user_id=current_user.id,
            task_id=int(task_id) if task_id else None,
            photo_urls=json.dumps(photo_urls)
        )
        db.add(item)

        if task_id:
            task = db.query(ProjectTask).options(selectinload(ProjectTask.worklogs)).filter(ProjectTask.id == int(task_id)).first()
            if task:
                total_hours = 0
                for wl in task.worklogs:
                    if wl.actual_time:
                        ts = wl.actual_time.lower().strip()
                        if 'h' in ts:
                            total_hours += float(ts.replace('h', '').strip())
                        elif 'm' in ts:
                            total_hours += float(ts.replace('m', '').strip()) / 60
                        else:
                            total_hours += float(ts)
                task.actual_hours = f"{total_hours:.1f}"
                if status == 'done' and task.status != 'done':
                    task.status = 'doing'

        db.commit()
        db.refresh(item)

        activity = ActivityLog(user_id=current_user.id, action="create", module="worklog",
            description=f"Logged work: {description[:50]}...")
        db.add(activity)
        db.commit()

        try:
            await broadcast_event("worklog_created", {
                "worklog_id": item.id, "description": item.description[:100],
                "category": item.category, "status": item.status,
                "user": current_user.full_name or current_user.username,
                "photo_count": len(photo_urls),
            }, exclude_user=current_user.id)
        except Exception:
            pass

        result = {k: v for k, v in item.__dict__.copy().items() if not k.startswith('_')}
        result["photo_urls"] = photo_urls
        if photo_errors:
            result["photo_errors"] = photo_errors
        return result
    except Exception as e:
        db.rollback()
        raise


@router.put("/worklog/{item_id}", response_model=dict)
async def update_worklog(
    item_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    try:
        form = await request.form()
        date_str = form.get('date')
        time_str = form.get('time', '')
        description = form.get('description')
        status = form.get('status')
        category = form.get('category')
        tags = form.get('tags', '')
        estimated_time = form.get('estimated_time', '')
        actual_time = form.get('actual_time', '')
        notes = form.get('notes', '')
        task_id = form.get('task_id', None)
        remove_photo_indexes = form.get('remove_photo_indexes', None)

        item = db.query(WorkLog).filter(WorkLog.id == item_id).first()
        if not item:
            raise HTTPException(status_code=404, detail="Worklog not found")
        if not can_modify_record(current_user, item):
            raise HTTPException(status_code=403, detail="You can only edit your own worklogs")

        client_version = get_client_version(request)
        check_version_conflict(item, client_version)

        if not date_str or not description:
            raise HTTPException(status_code=400, detail="Date and description are required")

        existing_photos = _parse_photo_urls(item.photo_urls)

        if remove_photo_indexes:
            try:
                indexes_to_remove = [int(x.strip()) for x in remove_photo_indexes.split(",")]
                for idx in sorted(indexes_to_remove, reverse=True):
                    if 0 <= idx < len(existing_photos):
                        delete_image_file(existing_photos[idx])
                        existing_photos.pop(idx)
            except (ValueError, IndexError):
                pass

        new_photo_urls = []
        for v in form.getlist('photos'):
            if hasattr(v, 'filename') and v.filename:
                path, error = await process_image(v)
                if path:
                    new_photo_urls.append(path)
                elif error:
                    logger.warning(f"[Worklog PUT] Photo processing error: {error}")

        all_photos = existing_photos + new_photo_urls
        logger.info(f"[Worklog PUT] Processed {len(new_photo_urls)} new photos, {len(existing_photos)} existing, total: {len(all_photos)}")
        item.photo_urls = json.dumps(all_photos)

        date_obj = datetime.strptime(date_str, "%Y-%m-%d").date()
        item.date = date_obj
        if time_str:
            item.time = time_str
        item.description = description
        if status:
            item.status = status
        if category:
            item.category = category
        item.tags = tags
        item.estimated_time = estimated_time
        item.actual_time = actual_time
        if notes:
            item.notes = notes
        if task_id is not None:
            item.task_id = int(task_id) if task_id else None

        increment_version(item)
        if item.task_id:
            task = db.query(ProjectTask).options(selectinload(ProjectTask.worklogs)).filter(ProjectTask.id == item.task_id).first()
            if task:
                total_hours = 0
                for wl in task.worklogs:
                    if wl.actual_time:
                        try:
                            ts = wl.actual_time.lower().strip()
                            if 'h' in ts:
                                total_hours += float(ts.replace('h', '').strip())
                            elif 'm' in ts:
                                total_hours += float(ts.replace('m', '').strip()) / 60
                            else:
                                total_hours += float(ts)
                        except (ValueError, AttributeError):
                            pass
                task.actual_hours = f"{total_hours:.1f}"

        db.commit()
        db.refresh(item)

        activity = ActivityLog(user_id=current_user.id, action="update", module="worklog",
            description=f"Updated worklog: {description[:50]}...")
        db.add(activity)
        db.commit()

        result = {k: v for k, v in item.__dict__.copy().items() if not k.startswith('_')}
        result["photo_urls"] = all_photos
        return result
    except Exception as e:
        db.rollback()
        raise


@router.patch("/worklog/{item_id}/status", response_model=dict)
async def toggle_worklog_status(
    item_id: int, request: Request, status: str = Form(...), actual_time: str = Form(None),
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    try:
        item = db.query(WorkLog).filter(WorkLog.id == item_id).first()
        if not item:
            raise HTTPException(status_code=404, detail="Worklog not found")
        if not can_modify_record(current_user, item):
            raise HTTPException(status_code=403, detail="You can only modify your own worklogs")

        client_version = get_client_version(request)
        check_version_conflict(item, client_version)

        item.status = status
        now = utcnow()
        if status == 'done':
            item.completed_at = now
            item.cancelled_at = None
        elif status == 'cancelled':
            item.cancelled_at = now
            item.completed_at = None
        else:
            item.completed_at = None
            item.cancelled_at = None
        if actual_time:
            item.actual_time = actual_time
        increment_version(item)

        # Recalculate task.actual_hours when status changes
        if item.task_id:
            task = db.query(ProjectTask).options(selectinload(ProjectTask.worklogs)).filter(ProjectTask.id == item.task_id).first()
            if task:
                total_hours = 0
                for wl in task.worklogs:
                    if wl.actual_time:
                        ts = wl.actual_time.lower().strip()
                        if 'h' in ts:
                            total_hours += float(ts.replace('h', '').strip())
                        elif 'm' in ts:
                            total_hours += float(ts.replace('m', '').strip()) / 60
                        else:
                            total_hours += float(ts)
                task.actual_hours = f"{total_hours:.1f}"
                if status == 'done' and task.status != 'done':
                    task.status = 'doing'

        db.commit()
        db.refresh(item)
        log_activity(db, current_user.id, "UPDATE", "worklog", f"Updated worklog {item_id} status to {status}")
        return {k: v for k, v in item.__dict__.copy().items() if not k.startswith('_')}
    except Exception as e:
        db.rollback()
        raise


@router.delete("/worklog/{item_id}", response_model=MessageResponse)
async def delete_worklog(item_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    try:
        item = db.query(WorkLog).filter(WorkLog.id == item_id).first()
        if not item:
            raise HTTPException(status_code=404, detail="Worklog not found")
        if not can_modify_record(current_user, item):
            raise HTTPException(status_code=403, detail="You can only delete your own worklogs")

        photo_urls = _parse_photo_urls(item.photo_urls)
        for photo_path in photo_urls:
            delete_image_file(photo_path)

        # Delete related progress entries (no cascade relationship defined)
        progress_entries = db.query(WorklogProgress).filter(WorklogProgress.worklog_id == item_id).all()
        for entry in progress_entries:
            for photo_path in _parse_photo_urls(entry.photo_urls):
                delete_image_file(photo_path)
            db.delete(entry)

        db.delete(item)
        log_activity(db, current_user.id, "DELETE", "worklog", f"Deleted worklog {item_id}")
        db.commit()
        return {"message": "Worklog deleted successfully"}
    except Exception as e:
        db.rollback()
        raise


@router.post("/worklog/bulk-delete", response_model=dict)
async def bulk_delete_worklog(
    ids: str = Form(...), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    try:
        id_list = [int(x.strip()) for x in ids.split(",")]
        items = db.query(WorkLog).filter(WorkLog.id.in_(id_list)).all()
        if current_user.role != "superadmin":
            items = [i for i in items if i.user_id == current_user.id]

        for item in items:
            # Delete related progress entries
            progress_entries = db.query(WorklogProgress).filter(WorklogProgress.worklog_id == item.id).all()
            for entry in progress_entries:
                for photo_path in _parse_photo_urls(entry.photo_urls):
                    delete_image_file(photo_path)
                db.delete(entry)

            photo_urls = _parse_photo_urls(item.photo_urls)
            for photo_path in photo_urls:
                delete_image_file(photo_path)
            db.delete(item)

        log_activity(db, current_user.id, "DELETE", "worklog", f"Bulk deleted {len(items)} worklogs")
        db.commit()
        return {"status": "deleted", "count": len(items)}
    except Exception as e:
        db.rollback()
        raise


@router.post("/worklog/bulk-status", response_model=dict)
async def bulk_update_status(
    ids: str = Form(...), status: str = Form(...),
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    try:
        id_list = [int(x.strip()) for x in ids.split(",")]
        query = db.query(WorkLog).filter(WorkLog.id.in_(id_list))
        if current_user.role != "superadmin":
            query = query.filter(WorkLog.user_id == current_user.id)
        items = query.all()
        count = 0
        now = utcnow()
        for item in items:
            item.status = status
            if status == 'done':
                item.completed_at = now
                item.cancelled_at = None
            elif status == 'cancelled':
                item.cancelled_at = now
                item.completed_at = None
            else:
                item.completed_at = None
                item.cancelled_at = None
            increment_version(item)
            count += 1
        log_activity(db, current_user.id, "UPDATE", "worklog", f"Bulk updated {count} worklogs to {status}")
        db.commit()
        return {"status": "updated", "count": count}
    except Exception as e:
        db.rollback()
        raise


@router.get("/worklog/stats", response_model=WorklogStatsResponse)
async def get_worklog_stats(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
    start_date: str = None, end_date: str = None
):
    if not start_date:
        end = utcnow().date()
        start = end - timedelta(days=7)
    else:
        start = datetime.strptime(start_date, "%Y-%m-%d").date()
        end = datetime.strptime(end_date, "%Y-%m-%d").date() if end_date else start

    query = db.query(WorkLog).filter(WorkLog.date >= start, WorkLog.date <= end)
    owner_filter = get_worklog_filter(current_user)
    if owner_filter is not None:
        query = query.filter(owner_filter)

    total = query.count()
    status_stats = query.with_entities(
        WorkLog.status, func.count(WorkLog.id).label('count')
    ).group_by(WorkLog.status).all()
    status_map = {row[0]: row[1] for row in status_stats}
    done = status_map.get("done", 0)
    in_progress = status_map.get("in_progress", 0)
    cancelled = status_map.get("cancelled", 0)

    cat_query = db.query(WorkLog.category, func.count(WorkLog.id)).filter(WorkLog.date >= start, WorkLog.date <= end)
    if current_user.role != "superadmin":
        cat_query = cat_query.filter(WorkLog.user_id == current_user.id)
    categories = cat_query.group_by(WorkLog.category).all()

    time_entries = query.with_entities(WorkLog.estimated_time, WorkLog.actual_time).filter(WorkLog.estimated_time != None).all()
    total_estimated = 0.0
    total_actual = 0.0

    def _parse_time_to_hours(ts: str) -> float:
        """Parse time strings like '2h', '30m', '2h30m', '120' into hours."""
        ts = ts.lower().strip()
        hours = 0.0
        if 'h' in ts:
            parts = ts.split('h')
            hours += float(parts[0]) if parts[0] else 0
            ts = parts[1] if len(parts) > 1 else ''
        if 'm' in ts:
            minutes = float(ts.replace('m', ''))
            hours += minutes / 60
        elif ts.strip():
            # Plain number, assume hours
            hours += float(ts)
        return hours

    for est, act in time_entries:
        try:
            if est:
                total_estimated += _parse_time_to_hours(est)
            if act:
                total_actual += _parse_time_to_hours(act)
        except (ValueError, AttributeError):
            pass

    return {
        "total": total, "done": done, "in_progress": in_progress, "cancelled": cancelled,
        "categories": [{"name": c[0], "count": c[1]} for c in categories],
        "total_estimated_hours": round(total_estimated, 2), "total_actual_hours": round(total_actual, 2),
        "total_estimated_time": str(total_estimated), "total_actual_time": str(total_actual),
        "date_range": {"start": str(start), "end": str(end)}
    }
