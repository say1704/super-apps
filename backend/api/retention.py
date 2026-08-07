"""Data retention policy management — view, update, trigger cleanup."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel

from database import get_db
from api.dependencies import get_current_user, log_activity
from models import RetentionPolicy, RetentionCleanupLog, User, AppSettings
from utils.retention_service import (
    get_retention_policies,
    update_retention_policy,
    run_module_cleanup,
    run_all_cleanups,
)
from apscheduler.triggers.cron import CronTrigger

router = APIRouter(tags=["Data Retention"])
logger = __import__("logging").getLogger(__name__)


class RetentionPolicyUpdate(BaseModel):
    enabled: bool
    retention_days: int


class RetentionPolicyResponse(BaseModel):
    module: str
    enabled: bool
    retention_days: int

    class Config:
        from_attributes = True


class RetentionPolicyListResponse(BaseModel):
    policies: list[RetentionPolicyResponse]


class CleanupLogResponse(BaseModel):
    id: int
    module: str
    records_deleted: int
    started_at: str | None
    completed_at: str | None
    status: str
    error_message: str | None

    class Config:
        from_attributes = True


class CleanupLogListResponse(BaseModel):
    logs: list[CleanupLogResponse]


class MessageResponse(BaseModel):
    message: str


class ScheduleTimeResponse(BaseModel):
    schedule_time: str


class ScheduleTimeUpdate(BaseModel):
    schedule_time: str


@router.get("/retention/policies", response_model=RetentionPolicyListResponse)
def list_policies(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    policies = get_retention_policies(db)
    return RetentionPolicyListResponse(policies=policies)


@router.put("/retention/policies/{module}", response_model=MessageResponse)
def upsert_policy(module: str, data: RetentionPolicyUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if data.retention_days < 1 or data.retention_days > 3650:
        raise HTTPException(status_code=400, detail="retention_days must be between 1 and 3650")
    update_retention_policy(db, module, data.enabled, data.retention_days)
    log_activity(db, current_user.id, "UPDATE", "retention",
                 f"Updated retention policy for '{module}' (enabled={data.enabled}, days={data.retention_days})")
    db.commit()
    return MessageResponse(message=f"Retention policy for '{module}' updated")


@router.post("/retention/run/{module}", response_model=CleanupLogResponse)
def trigger_module_cleanup(
    module: str,
    dry_run: bool = Query(False, description="Preview without deleting"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from utils.retention_service import RETENTION_MODULES
    if module not in RETENTION_MODULES:
        raise HTTPException(status_code=400, detail=f"Unknown module: {module}")
    log_entry = run_module_cleanup(db, module, dry_run=dry_run)
    log_activity(db, current_user.id, "DELETE", "retention",
                 f"Retention cleanup '{module}': {log_entry.status} "
                 f"({'preview, would delete ' if dry_run else 'deleted '}{log_entry.records_deleted or 0} records)")
    db.commit()
    return CleanupLogResponse(
        id=log_entry.id if log_entry.id else 0,
        module=log_entry.module,
        records_deleted=log_entry.records_deleted,
        started_at=log_entry.started_at.isoformat() if log_entry.started_at else None,
        completed_at=log_entry.completed_at.isoformat() if log_entry.completed_at else None,
        status=log_entry.status,
        error_message=log_entry.error_message,
    )


@router.post("/retention/run-all", response_model=MessageResponse)
def trigger_all_cleanup(
    dry_run: bool = Query(False, description="Preview without deleting"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    results = run_all_cleanups(db, dry_run=dry_run)
    total = sum(r.records_deleted for r in results)
    label = "preview" if dry_run else "deleted"
    log_activity(db, current_user.id, "DELETE", "retention",
                 f"Retention cleanup run-all: {len(results)} modules processed, {total} records {label}")
    db.commit()
    return MessageResponse(message=f"Retention cleanup completed: {len(results)} modules processed, {total} records {label}")


@router.get("/retention/logs", response_model=CleanupLogListResponse)
def list_cleanup_logs(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    logs = db.query(RetentionCleanupLog).order_by(RetentionCleanupLog.started_at.desc()).limit(50).all()
    return CleanupLogListResponse(logs=[
        CleanupLogResponse(
            id=l.id,
            module=l.module,
            records_deleted=l.records_deleted,
            started_at=l.started_at.isoformat() if l.started_at else None,
            completed_at=l.completed_at.isoformat() if l.completed_at else None,
            status=l.status,
            error_message=l.error_message,
        ) for l in logs
    ])


@router.get("/retention/schedule", response_model=ScheduleTimeResponse)
def get_schedule_time(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    record = db.query(AppSettings).filter(AppSettings.key == "retention_schedule_time").first()
    value = record.value if record else "02:30"
    return ScheduleTimeResponse(schedule_time=value)


@router.put("/retention/schedule", response_model=MessageResponse)
def set_schedule_time(data: ScheduleTimeUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    try:
        hour, minute = map(int, data.schedule_time.split(":"))
        if not (0 <= hour <= 23 and 0 <= minute <= 59):
            raise ValueError
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Invalid schedule_time format. Use HH:MM (00:00 - 23:59)")

    record = db.query(AppSettings).filter(AppSettings.key == "retention_schedule_time").first()
    if record:
        record.value = data.schedule_time
    else:
        db.add(AppSettings(category="general", key="retention_schedule_time", value=data.schedule_time))
    db.commit()

    # Reschedule APScheduler job
    try:
        from utils.backup_scheduler import scheduler
        from utils.retention_service import run_all_cleanups
        from database import SessionLocal
        existing = scheduler.get_job("retention_cleanup_daily")
        if existing:
            scheduler.reschedule_job(
                "retention_cleanup_daily",
                trigger=CronTrigger(hour=hour, minute=minute),
            )
            logger.info("[RETENTION] Rescheduled daily cleanup to %s", data.schedule_time)
        else:
            scheduler.add_job(
                run_all_cleanups,
                CronTrigger(hour=hour, minute=minute),
                args=[SessionLocal],
                id="retention_cleanup_daily",
                replace_existing=True,
                name="Daily retention cleanup",
            )
            logger.info("[RETENTION] Created daily cleanup job at %s", data.schedule_time)
    except Exception as e:
        logger.warning("[RETENTION] Failed to reschedule: %s", e)

    log_activity(db, current_user.id, "UPDATE", "retention",
                 f"Updated retention schedule time to {data.schedule_time}")
    db.commit()
    return MessageResponse(message=f"Retention schedule updated to {data.schedule_time}")
