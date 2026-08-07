import logging
from fastapi import APIRouter, Depends, Query, Form, UploadFile, File, Request, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, or_
from typing import Optional, List
from datetime import datetime, date, timezone, timedelta
from database import get_db
from models import (
    User, WorkLog, ProjectTask, Sprint, ActivityLog, Notification, TaskNote,
)
from utils.timezone import utcnow, to_iso
from utils.cache import cache
from api.dependencies import (
    get_current_user, log_activity, save_file, encrypt_password, is_password_encrypted,
    can_modify_record, get_task_filter, get_offset, calculate_pagination, broadcast_event,
)
from api.schemas import (
    TaskStatsResponse, TaskItemResponse, SprintResponse,
    TaskListPaginatedResponse, TaskDeleteResponse, TaskBulkResponse,
    SprintListPaginatedResponse, SprintDeleteResponse, MessageResponse,
    TaskByIdsResponse,
)
from utils.optimistic_lock import check_version_conflict, increment_version, get_client_version

router = APIRouter(tags=["Tasks & Worklog"])
logger = logging.getLogger(__name__)

ALLOWED_TASK_STATUS = {"todo", "doing", "done"}
ALLOWED_TASK_PRIORITY = {"low", "medium", "high", "urgent"}
ALLOWED_SPRINT_STATUS = {"planned", "active", "completed", "cancelled"}
ALLOWED_SORT_COLUMNS = {"title", "status", "priority", "due_date", "created_at", "assignee", "estimated_hours", "completed_at"}
MAX_TASK_IDS = 100


def _escape_like(value: str) -> str:
    """Escape SQL LIKE wildcards to prevent injection."""
    return value.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_')


def _invalidate_task_stats(current_user: User):
    """Invalidate cached stats after any mutation."""
    cache.invalidate(f"project_tasks_stats_{current_user.id}")


def _commit_activity(db: Session, user_id: int, action: str, module: str, description: str):
    """Add activity log entry — caller must commit."""
    activity = ActivityLog(user_id=user_id, action=action, module=module, description=description)
    db.add(activity)


@router.get("/project-tasks/by-ids", response_model=TaskByIdsResponse)
async def get_tasks_by_ids(
    ids: str = Query(..., description="Comma-separated task IDs"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    try:
        task_ids = [int(x.strip()) for x in ids.split(",") if x.strip() and x.strip().isdigit()]
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Invalid task IDs")
    if len(task_ids) > MAX_TASK_IDS:
        raise HTTPException(status_code=400, detail=f"Maximum {MAX_TASK_IDS} IDs allowed")
    if not task_ids:
        return {"data": []}
    query = db.query(ProjectTask).filter(ProjectTask.id.in_(task_ids))
    owner_filter = get_task_filter(current_user)
    if owner_filter is not None:
        query = query.filter(owner_filter)
    records = query.all()
    return {"data": records}


@router.get("/project-tasks/{task_id}/worklogs", response_model=dict)
async def get_task_worklogs(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    task = db.query(ProjectTask).filter(ProjectTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if not can_modify_record(current_user, task):
        raise HTTPException(status_code=403, detail="Access denied")
    return db.query(WorkLog).filter(WorkLog.task_id == task_id).order_by(WorkLog.date.desc()).all()


@router.post("/worklog/{worklog_id}/link-task", response_model=dict)
async def link_worklog_to_task(
    worklog_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    body = await request.json()
    task_id = body.get('task_id')
    worklog = db.query(WorkLog).filter(WorkLog.id == worklog_id).first()
    if not worklog:
        raise HTTPException(status_code=404, detail="Worklog not found")
    if not can_modify_record(current_user, worklog):
        raise HTTPException(status_code=403, detail="You can only modify your own worklogs")
    if task_id:
        task = db.query(ProjectTask).filter(ProjectTask.id == task_id).first()
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
        worklog.task_id = task_id
    else:
        worklog.task_id = None
    db.commit()
    db.refresh(worklog)

    action_desc = f"Worklog {worklog_id} linked to task {task_id}" if task_id else f"Worklog {worklog_id} unlinked from task"
    log_activity(db, current_user.id, "UPDATE", "worklog", action_desc)

    return worklog


@router.get("/project-tasks", response_model=TaskListPaginatedResponse)
async def get_project_tasks(
    page: int = 1,
    page_size: int = 20,
    status_filter: Optional[str] = None,
    priority: Optional[str] = None,
    assignee: Optional[str] = None,
    tags: Optional[str] = None,
    search: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    sort_by: str = "created_at",
    sort_order: str = "desc",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if sort_by not in ALLOWED_SORT_COLUMNS:
        sort_by = "created_at"

    query = db.query(ProjectTask)
    owner_filter = get_task_filter(current_user)
    if owner_filter is not None:
        query = query.filter(owner_filter)
    if status_filter:
        query = query.filter(ProjectTask.status == status_filter)
    if priority:
        query = query.filter(ProjectTask.priority == priority)
    if assignee:
        query = query.filter(ProjectTask.assignee.ilike(f"%{_escape_like(assignee)}%", escape='\\'))
    if tags:
        for tag in tags.split(","):
            tag = tag.strip()
            if tag:
                query = query.filter(ProjectTask.tags.ilike(f"%{_escape_like(tag)}%", escape='\\'))
    if search:
        query = query.filter(
            (ProjectTask.title.ilike(f"%{_escape_like(search)}%", escape='\\')) |
            (ProjectTask.description.ilike(f"%{_escape_like(search)}%", escape='\\'))
        )
    if from_date:
        try:
            query = query.filter(ProjectTask.created_at >= datetime.fromisoformat(from_date))
        except (ValueError, TypeError):
            raise HTTPException(status_code=400, detail="Invalid from_date format")
    if to_date:
        try:
            query = query.filter(ProjectTask.created_at <= datetime.fromisoformat(to_date))
        except (ValueError, TypeError):
            raise HTTPException(status_code=400, detail="Invalid to_date format")
    total = query.count()
    offset = get_offset(page, page_size)
    sort_column = getattr(ProjectTask, sort_by, ProjectTask.created_at)
    if sort_order.lower() == "asc":
        query = query.order_by(sort_column.asc())
    else:
        query = query.order_by(sort_column.desc())
    records = query.offset(offset).limit(page_size).all()
    pagination = calculate_pagination(page, page_size, total)
    return {
        "data": records,
        "pagination": pagination.dict()
    }


@router.get("/project-tasks/stats", response_model=TaskStatsResponse)
async def get_project_tasks_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    cached = cache.get(f"project_tasks_stats_{current_user.id}")
    if cached:
        return cached

    base_query = db.query(ProjectTask)
    owner_filter = get_task_filter(current_user)
    if owner_filter is not None:
        base_query = base_query.filter(owner_filter)

    status_stats = base_query.with_entities(
        ProjectTask.status,
        func.count(ProjectTask.id).label('count')
    ).group_by(ProjectTask.status).all()
    status_map = {row[0]: row[1] for row in status_stats}
    total = sum(status_map.values())
    todo = status_map.get("todo", 0)
    doing = status_map.get("doing", 0)
    done = status_map.get("done", 0)

    high_priority = base_query.filter(ProjectTask.priority == "high").count()

    overdue = base_query.filter(
        (ProjectTask.due_date != None) &
        (ProjectTask.due_date < date.today()) &
        (ProjectTask.status != "done")
    ).count()

    assignee_stats = base_query.filter(ProjectTask.assignee != "").group_by(ProjectTask.assignee).with_entities(
        ProjectTask.assignee,
        func.count(ProjectTask.id).label('count')
    ).all()
    priority_stats = base_query.with_entities(
        ProjectTask.priority,
        func.count(ProjectTask.id).label('count')
    ).group_by(ProjectTask.priority).all()
    recent_completed = base_query.filter(
        ProjectTask.status == "done"
    ).order_by(ProjectTask.completed_at.desc()).limit(5).all()
    result = {
        "total": total,
        "todo": todo,
        "doing": doing,
        "done": done,
        "high_priority": high_priority,
        "overdue": overdue,
        "completion_rate": round((done / total * 100) if total > 0 else 0, 1),
        "by_assignee": [{"assignee": a.assignee, "count": a.count} for a in assignee_stats],
        "by_priority": [{"priority": p.priority, "count": p.count} for p in priority_stats],
        "recent_completed": recent_completed
    }
    cache.set(f"project_tasks_stats_{current_user.id}", result, ttl=60)
    return result


@router.post("/project-tasks", response_model=TaskItemResponse)
async def create_project_task(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    form = await request.form()
    title = form.get('title')
    description = form.get('description', '')
    status = form.get('status', 'todo')
    assignee = form.get('assignee', '')
    priority = form.get('priority', 'medium')
    due_date = form.get('due_date', None)
    tags = form.get('tags', '')

    if not title:
        raise HTTPException(status_code=400, detail="Title is required")
    if status not in ALLOWED_TASK_STATUS:
        raise HTTPException(status_code=400, detail=f"Status must be one of: {', '.join(sorted(ALLOWED_TASK_STATUS))}")
    if priority not in ALLOWED_TASK_PRIORITY:
        raise HTTPException(status_code=400, detail=f"Priority must be one of: {', '.join(sorted(ALLOWED_TASK_PRIORITY))}")

    completed_at = None
    if status == "done":
        completed_at = utcnow()
    parsed_due_date = None
    if due_date:
        try:
            parsed_due_date = datetime.strptime(due_date, "%Y-%m-%d").date()
        except (ValueError, TypeError):
            pass

    item = ProjectTask(
        title=title,
        description=description,
        status=status,
        assignee=assignee,
        priority=priority,
        due_date=parsed_due_date,
        tags=tags,
        created_by=current_user.id,
        completed_at=completed_at,
        estimated_hours=form.get('estimated_hours', None),
        actual_hours=form.get('actual_hours', None)
    )
    db.add(item)

    activity = ActivityLog(
        user_id=current_user.id,
        action="create",
        module="project-tasks",
        description=f"Created task: {title}"
    )
    db.add(activity)
    db.commit()
    db.refresh(item)

    if assignee:
        try:
            from utils.notification_dispatcher import notify_task_assigned
            notify_task_assigned(
                db=db,
                task_title=title,
                assignee=assignee,
                priority=priority,
                due_date=due_date,
                assigned_by=current_user.full_name or current_user.username,
                description=description,
            )
        except Exception as e:
            logger.warning(f"[NOTIFICATION] Failed to send task assignment notification: {e}")
    try:
        await broadcast_event("task_created", {
            "task_id": item.id,
            "title": item.title,
            "status": item.status,
            "assignee": item.assignee,
            "created_by": current_user.full_name or current_user.username,
        }, exclude_user=current_user.id)
    except Exception as e:
        logger.warning(f"[SSE] Failed to broadcast task_created: {e}")

    _invalidate_task_stats(current_user)
    return item


@router.put("/project-tasks/{item_id}", response_model=TaskItemResponse)
async def update_project_task(
    item_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    from datetime import datetime as dt
    form = await request.form()
    item = db.query(ProjectTask).filter(ProjectTask.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Not found")
    if not can_modify_record(current_user, item):
        raise HTTPException(status_code=403, detail="You can only edit tasks you created")

    client_version = get_client_version(request)
    check_version_conflict(item, client_version)

    old_status = item.status
    if form.get('title') is not None:
        item.title = form.get('title')
    if form.get('description') is not None:
        item.description = form.get('description')
    if form.get('status') is not None:
        new_status = form.get('status')
        if new_status not in ALLOWED_TASK_STATUS:
            raise HTTPException(status_code=400, detail=f"Status must be one of: {', '.join(sorted(ALLOWED_TASK_STATUS))}")
        item.status = new_status
        if item.status == "done" and old_status != "done":
            item.completed_at = dt.utcnow()
        elif item.status != "done":
            item.completed_at = None
    if form.get('assignee') is not None:
        item.assignee = form.get('assignee')
    if form.get('priority') is not None:
        new_priority = form.get('priority')
        if new_priority not in ALLOWED_TASK_PRIORITY:
            raise HTTPException(status_code=400, detail=f"Priority must be one of: {', '.join(sorted(ALLOWED_TASK_PRIORITY))}")
        item.priority = new_priority
    if form.get('due_date') is not None:
        due_date_str = form.get('due_date')
        if due_date_str:
            try:
                item.due_date = dt.strptime(due_date_str, "%Y-%m-%d").date()
            except ValueError:
                pass
        else:
            item.due_date = None
    if form.get('tags') is not None:
        item.tags = form.get('tags')
    if form.get('estimated_hours') is not None:
        item.estimated_hours = form.get('estimated_hours')
    if form.get('actual_hours') is not None:
        item.actual_hours = form.get('actual_hours')
    increment_version(item)

    new_assignee = form.get('assignee')
    activity = ActivityLog(
        user_id=current_user.id,
        action="update",
        module="project-tasks",
        description=f"Updated task: {item.title}"
    )
    db.add(activity)
    db.commit()
    db.refresh(item)

    if new_assignee and new_assignee != item.assignee:
        try:
            from utils.notification_dispatcher import notify_task_assigned
            notify_task_assigned(
                db=db,
                task_title=item.title,
                assignee=new_assignee,
                priority=item.priority,
                due_date=str(item.due_date) if item.due_date else None,
                assigned_by=current_user.full_name or current_user.username,
                description="",
            )
        except Exception as e:
            logger.warning(f"[NOTIFICATION] Failed to send task assignment notification: {e}")
    try:
        await broadcast_event("task_updated", {
            "task_id": item.id,
            "title": item.title,
            "status": item.status,
            "assignee": item.assignee,
            "updated_by": current_user.full_name or current_user.username,
        }, exclude_user=current_user.id)
    except Exception as e:
        logger.warning(f"[SSE] Failed to broadcast task_updated: {e}")

    _invalidate_task_stats(current_user)
    return item


@router.delete("/project-tasks/{item_id}", response_model=TaskDeleteResponse)
async def delete_project_task(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    item = db.query(ProjectTask).filter(ProjectTask.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Not found")
    if not can_modify_record(current_user, item):
        raise HTTPException(status_code=403, detail="You can only delete tasks you created")
    task_title = item.title
    db.delete(item)
    activity = ActivityLog(
        user_id=current_user.id,
        action="delete",
        module="project-tasks",
        description=f"Deleted task: {task_title}"
    )
    db.add(activity)
    db.commit()

    _invalidate_task_stats(current_user)
    return {"status": "deleted"}


@router.post("/project-tasks/bulk-delete", response_model=TaskBulkResponse)
async def bulk_delete_tasks(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    body = await request.json()
    task_ids = body.get('ids', [])
    if not task_ids:
        raise HTTPException(status_code=400, detail="No task IDs provided")
    if current_user.role != "superadmin":
        deleted_count = db.query(ProjectTask).filter(
            ProjectTask.id.in_(task_ids), ProjectTask.created_by == current_user.id
        ).delete(synchronize_session=False)
    else:
        deleted_count = db.query(ProjectTask).filter(
            ProjectTask.id.in_(task_ids)
        ).delete(synchronize_session=False)
    activity = ActivityLog(
        user_id=current_user.id,
        action="bulk-delete",
        module="project-tasks",
        description=f"Bulk deleted {deleted_count} tasks"
    )
    db.add(activity)
    db.commit()

    _invalidate_task_stats(current_user)
    return {"status": "deleted", "count": deleted_count}


@router.post("/project-tasks/bulk-status", response_model=TaskBulkResponse)
async def bulk_update_status_tasks(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    body = await request.json()
    task_ids = body.get('ids', [])
    new_status = body.get('status', 'todo')
    if not task_ids:
        raise HTTPException(status_code=400, detail="No task IDs provided")
    if new_status not in ALLOWED_TASK_STATUS:
        raise HTTPException(status_code=400, detail=f"Status must be one of: {', '.join(sorted(ALLOWED_TASK_STATUS))}")
    completed_at = utcnow() if new_status == "done" else None
    if current_user.role != "superadmin":
        updated_count = db.query(ProjectTask).filter(
            ProjectTask.id.in_(task_ids), ProjectTask.created_by == current_user.id
        ).update({
            ProjectTask.status: new_status,
            ProjectTask.completed_at: completed_at
        }, synchronize_session=False)
    else:
        updated_count = db.query(ProjectTask).filter(
            ProjectTask.id.in_(task_ids)
        ).update({
            ProjectTask.status: new_status,
            ProjectTask.completed_at: completed_at
        }, synchronize_session=False)
    activity = ActivityLog(
        user_id=current_user.id,
        action="bulk-status-update",
        module="project-tasks",
        description=f"Bulk updated {updated_count} tasks to {new_status}"
    )
    db.add(activity)
    db.commit()

    _invalidate_task_stats(current_user)
    return {"status": "updated", "count": updated_count}


def _note_to_dict(note):
    return {
        "id": note.id,
        "task_id": note.task_id,
        "message": note.message,
        "photo_urls": note.photo_urls or "[]",
        "hours": note.hours,
        "created_at": to_iso(note.created_at),
        "created_by": note.created_by,
    }

@router.get("/project-tasks/{task_id}/notes", response_model=dict)
async def get_task_notes(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    task = db.query(ProjectTask).filter(ProjectTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if not can_modify_record(current_user, task):
        raise HTTPException(status_code=403, detail="Access denied")
    notes = db.query(TaskNote).filter(TaskNote.task_id == task_id).order_by(TaskNote.created_at.asc()).all()
    return {"data": [_note_to_dict(n) for n in notes]}


@router.post("/project-tasks/{task_id}/notes", response_model=dict)
async def create_task_note(
    task_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    task = db.query(ProjectTask).filter(ProjectTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if not can_modify_record(current_user, task):
        raise HTTPException(status_code=403, detail="Access denied")

    form = await request.form()
    message = form.get('message', '').strip()
    if not message:
        raise HTTPException(status_code=400, detail="Message is required")

    hours = form.get('hours', None)
    photo_urls = "[]"

    photo_files = form.getlist('photos') if hasattr(form, 'getlist') else []
    if photo_files:
        saved_paths = []
        for photo in photo_files:
            if hasattr(photo, 'filename') and photo.filename:
                try:
                    saved_path = save_file(photo, "task_photos")
                    saved_paths.append(saved_path)
                except Exception as e:
                    logger.warning(f"Failed to save photo: {e}")
        if saved_paths:
            import json
            photo_urls = json.dumps(saved_paths)

    note = TaskNote(
        task_id=task_id,
        message=message,
        hours=hours,
        photo_urls=photo_urls,
        created_by=current_user.id
    )
    db.add(note)

    activity = ActivityLog(
        user_id=current_user.id,
        action="create",
        module="task-notes",
        description=f"Added note to task: {task.title}"
    )
    db.add(activity)
    db.commit()
    db.refresh(note)

    try:
        await broadcast_event("task_note_created", {
            "task_id": task_id,
            "note_id": note.id,
            "message": message,
            "created_by": current_user.full_name or current_user.username,
        }, exclude_user=current_user.id)
    except Exception as e:
        logger.warning(f"[SSE] Failed to broadcast task_note_created: {e}")

    return _note_to_dict(note)


@router.delete("/project-tasks/{task_id}/notes/{note_id}", response_model=dict)
async def delete_task_note(
    task_id: int,
    note_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    note = db.query(TaskNote).filter(TaskNote.id == note_id, TaskNote.task_id == task_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    if note.created_by != current_user.id and current_user.role != "superadmin":
        raise HTTPException(status_code=403, detail="You can only delete your own notes")

    task = db.query(ProjectTask).filter(ProjectTask.id == task_id).first()
    task_title = task.title if task else "unknown"

    db.delete(note)
    activity = ActivityLog(
        user_id=current_user.id,
        action="delete",
        module="task-notes",
        description=f"Deleted note from task: {task_title}"
    )
    db.add(activity)
    db.commit()

    return {"status": "deleted"}


@router.put("/project-tasks/{task_id}/photos", response_model=dict)
async def update_task_photos(
    task_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    task = db.query(ProjectTask).filter(ProjectTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if not can_modify_record(current_user, task):
        raise HTTPException(status_code=403, detail="Access denied")

    form = await request.form()
    import json

    if form.get('photo_urls') is not None:
        task.photo_urls = form.get('photo_urls')
    else:
        photo_files = form.getlist('photos') if hasattr(form, 'getlist') else []
        if photo_files:
            existing = []
            try:
                existing = json.loads(task.photo_urls) if task.photo_urls else []
                if not isinstance(existing, list):
                    existing = []
            except (json.JSONDecodeError, TypeError):
                existing = []
            for photo in photo_files:
                if hasattr(photo, 'filename') and photo.filename:
                    try:
                        saved_path = save_file(photo, "task_photos")
                        existing.append(saved_path)
                    except Exception as e:
                        logger.warning(f"Failed to save photo: {e}")
            task.photo_urls = json.dumps(existing)

    activity = ActivityLog(
        user_id=current_user.id,
        action="update",
        module="project-tasks",
        description=f"Updated photos for task: {task.title}"
    )
    db.add(activity)
    db.commit()
    db.refresh(task)

    return {
        "id": task.id,
        "title": task.title,
        "description": task.description,
        "status": task.status,
        "assignee": task.assignee,
        "priority": task.priority,
        "due_date": str(task.due_date) if task.due_date else None,
        "tags": task.tags,
        "estimated_hours": task.estimated_hours,
        "actual_hours": task.actual_hours,
        "photo_urls": task.photo_urls or "[]",
        "created_at": to_iso(task.created_at),
        "updated_at": to_iso(task.updated_at),
        "created_by": task.created_by,
        "completed_at": to_iso(task.completed_at),
        "version": task.version,
    }


@router.get("/project-tasks/{task_id}/linked-worklogs", response_model=dict)
async def get_task_linked_worklogs(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    task = db.query(ProjectTask).filter(ProjectTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if not can_modify_record(current_user, task):
        raise HTTPException(status_code=403, detail="Access denied")

    worklogs = db.query(WorkLog).filter(
        WorkLog.task_id == task_id
    ).order_by(WorkLog.date.desc()).all()

    total_hours = 0
    for wl in worklogs:
        if wl.actual_time:
            try:
                h = float(wl.actual_time.replace('h', '').replace('m', '').strip())
                if 'm' in wl.actual_time:
                    h = h / 60
                total_hours += h
            except (ValueError, TypeError):
                pass

    return {
        "task_id": task_id,
        "worklog_count": len(worklogs),
        "total_hours": round(total_hours, 2),
        "worklogs": [
            {
                "id": wl.id,
                "date": str(wl.date) if wl.date else None,
                "description": wl.description,
                "actual_time": wl.actual_time,
                "status": wl.status,
                "category": wl.category,
                "photo_urls": wl.photo_urls or "[]",
            }
            for wl in worklogs
        ],
    }


# Sprint Management

def _sprint_dict(sprint):
    task_ids_str = sprint.task_ids or ""
    task_ids = [int(t.strip()) for t in task_ids_str.split(",") if t.strip() and t.strip().isdigit()]
    return {
        "id": sprint.id,
        "name": sprint.name,
        "goal": sprint.goal or "",
        "start_date": str(sprint.start_date) if sprint.start_date else None,
        "end_date": str(sprint.end_date) if sprint.end_date else None,
        "status": sprint.status,
        "task_ids": task_ids,
        "created_by": sprint.created_by,
        "created_at": to_iso(sprint.created_at),
    }


@router.get("/sprints", response_model=SprintListPaginatedResponse)
async def get_sprints(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = db.query(Sprint)
    if current_user.role != "superadmin":
        query = query.filter(Sprint.created_by == current_user.id)
    query = query.order_by(Sprint.created_at.desc())
    total_records = query.count()
    offset = get_offset(page, page_size)
    records = query.offset(offset).limit(page_size).all()
    return {
        "data": [_sprint_dict(r) for r in records],
        "pagination": calculate_pagination(page, page_size, total_records).dict()
    }


@router.post("/sprints", response_model=SprintResponse)
async def create_sprint(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    form = await request.form()
    task_ids_str = form.get('task_ids', '')
    task_ids = [int(t) for t in task_ids_str.split(',') if t.strip() and t.strip().isdigit()] if task_ids_str else []
    parsed_start = None
    if form.get('start_date'):
        try:
            parsed_start = datetime.strptime(form.get('start_date'), '%Y-%m-%d').date()
        except (ValueError, TypeError):
            pass
    parsed_end = None
    if form.get('end_date'):
        try:
            parsed_end = datetime.strptime(form.get('end_date'), '%Y-%m-%d').date()
        except (ValueError, TypeError):
            pass
    sprint_status = form.get('status', 'planned')
    if sprint_status not in ALLOWED_SPRINT_STATUS:
        raise HTTPException(status_code=400, detail=f"Status must be one of: {', '.join(sorted(ALLOWED_SPRINT_STATUS))}")
    sprint = Sprint(
        name=form.get('name'),
        goal=form.get('goal', ''),
        start_date=parsed_start,
        end_date=parsed_end,
        status=sprint_status,
        task_ids=','.join(str(t) for t in task_ids),
        created_by=current_user.id
    )
    db.add(sprint)
    activity = ActivityLog(
        user_id=current_user.id,
        action="create",
        module="sprints",
        description=f"Created sprint: {sprint.name}"
    )
    db.add(activity)
    db.commit()
    db.refresh(sprint)
    return _sprint_dict(sprint)


@router.put("/sprints/{sprint_id}", response_model=SprintResponse)
async def update_sprint(
    sprint_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    form = await request.form()
    sprint = db.query(Sprint).filter(Sprint.id == sprint_id).first()
    if not sprint:
        raise HTTPException(status_code=404, detail="Sprint not found")
    if not can_modify_record(current_user, sprint):
        raise HTTPException(status_code=403, detail="You can only edit sprints you created")

    client_version = get_client_version(request)
    check_version_conflict(sprint, client_version)

    if form.get('name') is not None:
        sprint.name = form.get('name')
    if form.get('goal') is not None:
        sprint.goal = form.get('goal')
    if form.get('status') is not None:
        new_status = form.get('status')
        if new_status not in ALLOWED_SPRINT_STATUS:
            raise HTTPException(status_code=400, detail=f"Status must be one of: {', '.join(sorted(ALLOWED_SPRINT_STATUS))}")
        sprint.status = new_status
    if form.get('start_date') is not None:
        try:
            sprint.start_date = datetime.strptime(form.get('start_date'), '%Y-%m-%d').date()
        except (ValueError, TypeError):
            pass
    if form.get('end_date') is not None:
        try:
            sprint.end_date = datetime.strptime(form.get('end_date'), '%Y-%m-%d').date()
        except (ValueError, TypeError):
            pass
    if 'task_ids' in form:
        task_ids_str = form.get('task_ids', '')
        sprint.task_ids = task_ids_str
    increment_version(sprint)
    activity = ActivityLog(
        user_id=current_user.id,
        action="update",
        module="sprints",
        description=f"Updated sprint: {sprint.name}"
    )
    db.add(activity)
    db.commit()
    db.refresh(sprint)
    return _sprint_dict(sprint)


@router.delete("/sprints/{sprint_id}", response_model=SprintDeleteResponse)
async def delete_sprint(
    sprint_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    sprint = db.query(Sprint).filter(Sprint.id == sprint_id).first()
    if not sprint:
        raise HTTPException(status_code=404, detail="Not found")
    if not can_modify_record(current_user, sprint):
        raise HTTPException(status_code=403, detail="You can only delete sprints you created")
    name = sprint.name
    db.delete(sprint)
    activity = ActivityLog(
        user_id=current_user.id,
        action="delete",
        module="sprints",
        description=f"Deleted sprint: {name}"
    )
    db.add(activity)
    db.commit()
    return {"status": "deleted"}
