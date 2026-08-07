"""Automated database backup scheduler using APScheduler"""
from utils.timezone import utcnow
from utils.config import get_db_path, get_backup_dir
import os
import shutil
import logging
import sqlite3
from datetime import datetime, timedelta
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy import text

logger = logging.getLogger(__name__)

scheduler = BackgroundScheduler()

DB_PATH = get_db_path()
BACKUP_DIR = get_backup_dir()


def run_scheduled_backup(db_session_factory):
    """Execute a scheduled database backup."""
    os.makedirs(BACKUP_DIR, exist_ok=True)
    timestamp = utcnow().strftime("%Y%m%d_%H%M%S")
    backup_path = os.path.join(BACKUP_DIR, f"superapps_backup_{timestamp}.db")

    try:
        # Use SQLite native backup for consistency
        src_conn = sqlite3.connect(DB_PATH)
        dst_conn = sqlite3.connect(backup_path)
        src_conn.backup(dst_conn)
        dst_conn.close()
        src_conn.close()

        # Update last_run timestamp
        from models import BackupSchedule
        db = db_session_factory()
        schedule = db.query(BackupSchedule).first()
        if schedule:
            schedule.last_run = utcnow()
            db.commit()

        # Cleanup old backups
        cleanup_old_backups(db, schedule)

        logger.info("[BACKUP] Scheduled backup created: %s", backup_path)
    except Exception as e:
        logger.error("[BACKUP] Scheduled backup failed: %s", e)


def cleanup_old_backups(db, schedule):
    """Delete backups older than retention_days or exceeding max_backups."""
    if not os.path.exists(BACKUP_DIR):
        return

    files = sorted(
        [f for f in os.listdir(BACKUP_DIR) if f.endswith(".db")],
        key=lambda f: os.path.getmtime(os.path.join(BACKUP_DIR, f))
    )

    # Delete by retention_days
    if schedule and schedule.retention_days:
        cutoff = utcnow() - timedelta(days=schedule.retention_days)
        for f in files[:]:
            fp = os.path.join(BACKUP_DIR, f)
            mtime = datetime.fromtimestamp(os.path.getmtime(fp))
            if mtime < cutoff:
                os.remove(fp)
                files.remove(f)
                logger.info("[BACKUP] Deleted old backup: %s", f)

    # Delete by max_backups (keep newest N)
    if schedule and schedule.max_backups and len(files) > schedule.max_backups:
        to_delete = files[:len(files) - schedule.max_backups]
        for f in to_delete:
            fp = os.path.join(BACKUP_DIR, f)
            os.remove(fp)
            logger.info("[BACKUP] Deleted excess backup: %s", f)


def load_backup_jobs(db_session_factory):
    """Read backup schedule from DB and register APScheduler job."""
    from models import BackupSchedule

    # Remove existing jobs
    scheduler.remove_all_jobs()

    db = db_session_factory()
    schedule = db.query(BackupSchedule).first()

    if not schedule or not schedule.enabled:
        db.close()
        logger.info("[BACKUP] No active backup schedule found")
        return

    # Read all needed values before closing session
    sched_freq = schedule.frequency
    sched_time = schedule.time
    sched_day_of_week = schedule.day_of_week
    sched_day_of_month = schedule.day_of_month
    db.close()

    # Parse time
    hour, minute = map(int, sched_time.split(":"))

    # Build cron trigger based on frequency
    if sched_freq == "hourly":
        trigger = CronTrigger(hour="*", minute=minute, second=0)
    elif sched_freq == "daily":
        trigger = CronTrigger(hour=hour, minute=minute, second=0)
    elif sched_freq == "weekly":
        day_map = {0: "mon", 1: "tue", 2: "wed", 3: "thu", 4: "fri", 5: "sat", 6: "sun"}
        day_of_week = day_map.get(sched_day_of_week or 0, "mon")
        trigger = CronTrigger(day_of_week=day_of_week, hour=hour, minute=minute, second=0)
    elif sched_freq == "monthly":
        trigger = CronTrigger(day=sched_day_of_month or 1, hour=hour, minute=minute, second=0)
    else:
        trigger = CronTrigger(hour=hour, minute=minute, second=0)

    scheduler.add_job(
        run_scheduled_backup,
        trigger=trigger,
        args=[db_session_factory],
        id="scheduled_backup",
        name="Automated Database Backup",
        replace_existing=True,
        misfire_grace_time=3600,
    )

    # Calculate next_run for display
    next_run = scheduler.get_job("scheduled_backup").next_run_time
    if next_run:
        db = db_session_factory()
        schedule = db.query(BackupSchedule).first()
        if schedule:
            schedule.next_run = next_run
            db.commit()
        db.close()

    logger.info("[BACKUP] Schedule loaded: %s at %s (next: %s)", sched_freq, sched_time, next_run)


def start_scheduler(db_session_factory):
    """Start the background scheduler."""
    if not scheduler.running:
        scheduler.start()
        load_backup_jobs(db_session_factory)
        logger.info("[BACKUP] Scheduler started")


def stop_scheduler():
    """Shutdown the scheduler gracefully."""
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("[BACKUP] Scheduler stopped")
