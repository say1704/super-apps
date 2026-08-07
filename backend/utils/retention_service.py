"""Data retention cleanup service — deletes old records per module policy."""
from datetime import datetime, timezone, timedelta
import logging

from sqlalchemy.orm import Session
from sqlalchemy import text

from models import RetentionPolicy, RetentionCleanupLog
from utils.timezone import utcnow

logger = logging.getLogger(__name__)

RETENTION_MODULES = {
    "activity_logs": {"table": "activity_logs", "column": "created_at"},
    "notifications": {"table": "notifications", "column": "created_at"},
    "backup_history": {"table": "backup_history", "column": "created_at"},
    "ssh_login_logs": {"table": "ssh_login_logs", "column": "created_at"},
    "incident_report": {"table": "incident_report", "column": "created_at"},
    "vulnerability_report": {"table": "vulnerability_report", "column": "created_at"},
    "work_logs": {"table": "work_logs", "column": "created_at"},
    "audit_file_activities": {"table": "audit_file_activities", "column": "created_at"},
}


def get_retention_policies(db: Session) -> list[RetentionPolicy]:
    _seed_default_policies(db)
    return db.query(RetentionPolicy).order_by(RetentionPolicy.module).all()


def _seed_default_policies(db: Session):
    for module in RETENTION_MODULES:
        existing = db.query(RetentionPolicy).filter(RetentionPolicy.module == module).first()
        if not existing:
            db.add(RetentionPolicy(module=module, enabled=True, retention_days=90))
    db.commit()


def update_retention_policy(db: Session, module: str, enabled: bool, retention_days: int) -> RetentionPolicy:
    policy = db.query(RetentionPolicy).filter(RetentionPolicy.module == module).first()
    if not policy:
        policy = RetentionPolicy(module=module)
        db.add(policy)
    policy.enabled = enabled
    policy.retention_days = retention_days
    policy.updated_at = utcnow()
    db.commit()
    db.refresh(policy)
    return policy


def run_module_cleanup(db: Session, module: str, dry_run: bool = False) -> RetentionCleanupLog:
    log_entry = RetentionCleanupLog(module=module, status="running" if not dry_run else "preview")
    if not dry_run:
        db.add(log_entry)
        db.commit()

    policy = db.query(RetentionPolicy).filter(RetentionPolicy.module == module).first()
    if not policy or not policy.enabled:
        if not dry_run:
            log_entry.status = "skipped"
            log_entry.completed_at = utcnow()
            db.commit()
        return log_entry

    info = RETENTION_MODULES.get(module)
    if not info:
        if not dry_run:
            log_entry.status = "failed"
            log_entry.error_message = f"Unknown module: {module}"
            log_entry.completed_at = utcnow()
            db.commit()
        return log_entry

    cutoff = utcnow() - timedelta(days=policy.retention_days)
    cutoff_str = cutoff.strftime("%Y-%m-%d %H:%M:%S")

    try:
        table = info["table"]
        column = info["column"]
        if dry_run:
            count_sql = text(f"SELECT COUNT(*) FROM {table} WHERE {column} < :cutoff")
            result = db.execute(count_sql, {"cutoff": cutoff_str})
            count = result.scalar()
            logger.info("[RETENTION] [DRY-RUN] Would delete %d records from %s (retention: %d days)", count, module, policy.retention_days)
            return RetentionCleanupLog(
                module=module, status="preview", records_deleted=count or 0,
                started_at=utcnow(), completed_at=utcnow(),
            )
        sql = text(f"DELETE FROM {table} WHERE {column} < :cutoff")
        result = db.execute(sql, {"cutoff": cutoff_str})
        db.commit()
        log_entry.records_deleted = result.rowcount
        log_entry.status = "completed"
        logger.info("[RETENTION] Cleaned %d records from %s (retention: %d days)", result.rowcount, module, policy.retention_days)
    except Exception as e:
        db.rollback()
        log_entry.status = "failed"
        log_entry.error_message = str(e)
        logger.error("[RETENTION] Cleanup failed for %s: %s", module, e)
    finally:
        if not dry_run:
            log_entry.completed_at = utcnow()
            db.commit()

    return log_entry


def run_all_cleanups(db: Session, dry_run: bool = False) -> list[RetentionCleanupLog]:
    policies = get_retention_policies(db)
    results = []
    for policy in policies:
        if policy.enabled:
            log_entry = run_module_cleanup(db, policy.module, dry_run=dry_run)
            results.append(log_entry)
    return results
