"""Settings (SMTP, App Settings, Admin UI, Backup)"""
import os
import re
import asyncio
import tarfile
import tempfile
import threading
import logging
import subprocess
import shutil
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import text

from datetime import timedelta
from sqlalchemy import func

from utils.timezone import utcnow, to_iso
from utils.config import get_db_path, get_backup_dir, get_uploads_dir
from utils.password_encrypt import encrypt_password, decrypt_password, is_password_encrypted
from utils.admin_ui_manager import (
    validate_password_strength,
    start_sqlite_web, stop_sqlite_web, is_sqlite_web_running,
    MIN_PASSWORD_LENGTH,
)
from database import get_db, restart_engine, SessionLocal, init_db, migrate_schema
from models import User, SMTPSettings, AppSettings, BackupSchedule, BackupHistory, ErrorLog
from api.dependencies import get_current_user, log_activity
from utils.optimistic_lock import check_version_conflict, increment_version, get_client_version

MAX_BACKUP_FILE_SIZE = 100 * 1024 * 1024
MAX_TAR_TOTAL_SIZE = 500 * 1024 * 1024
MAX_TAR_MEMBER_SIZE = 250 * 1024 * 1024
from api.schemas import (
    BackupScheduleCreate, BackupScheduleResponse, MessageResponse,
    SmtpTestResponse, AdminUiResponse, SettingsBackupResponse,
    SettingsRestoreResponse, SettingsListPaginatedResponse,
    BackupScheduleListResponse,
)

router = APIRouter(tags=["Settings"])

logger = logging.getLogger(__name__)

_RESTORE_LOCK = threading.Lock()


def _is_backup_file(filename: str) -> bool:
    return filename.endswith(".db") or filename.endswith(".tar.gz")


def _restore_uploads_from_tar(extract_dir: str):
    """Restore uploads/ from extracted tar to the uploads directory (merge)."""
    extracted_uploads = os.path.join(extract_dir, "uploads")
    if not os.path.exists(extracted_uploads):
        return
    target_uploads = get_uploads_dir()
    for item in os.listdir(extracted_uploads):
        src = os.path.join(extracted_uploads, item)
        dst = os.path.join(target_uploads, item)
        if os.path.exists(dst):
            if os.path.isdir(dst):
                shutil.rmtree(dst)
            else:
                os.remove(dst)
        if os.path.isdir(src):
            shutil.copytree(src, dst)
        else:
            shutil.copy2(src, dst)


SMTP_KEYS = ["smtp_host", "smtp_port", "smtp_username", "smtp_password", "smtp_from_email", "smtp_from_name", "smtp_use_tls", "smtp_enabled"]
SETTINGS_CATEGORIES = ["general", "security", "notification", "api"]
MAX_BULK_IDS = 100
MAX_SETTING_VALUE_LENGTH = 1000
MAX_SETTING_KEY_LENGTH = 100


def _get_allowed_smtp_hosts(db: Session) -> list:
    """Get list of allowed SMTP hosts from AppSettings (category=security, key=allowed_smtp_hosts)"""
    row = db.query(AppSettings).filter(
        AppSettings.category == "security",
        AppSettings.key == "allowed_smtp_hosts"
    ).first()
    if not row or not row.value:
        return []
    return [h.strip().lower() for h in row.value.split(",") if h.strip()]


def _validate_smtp_host(host: str, db: Session):
    """Validate SMTP host against allowlist. Raises HTTPException if not allowed."""
    if not host:
        raise HTTPException(status_code=400, detail="SMTP host is required")
    
    allowed = _get_allowed_smtp_hosts(db)
    if not allowed:
        raise HTTPException(
            status_code=400,
            detail="SMTP host allowlist is empty. Configure allowed hosts in Security settings first."
        )
    
    host_lower = host.strip().lower()
    if host_lower not in allowed:
        raise HTTPException(
            status_code=400,
            detail=f"SMTP host '{host}' is not in the allowed list. Contact superadmin to add it."
        )
    return True


@router.get("/settings/smtp", response_model=dict)
async def get_smtp_settings(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "superadmin":
        raise HTTPException(status_code=403, detail="Superadmin access required")
    records = db.query(SMTPSettings).filter(SMTPSettings.key.in_(SMTP_KEYS)).all()
    result = {k: "" for k in SMTP_KEYS}
    for r in records:
        val = r.value or ""
        if r.key == "smtp_password":
            val = "********" if val else ""
        result[r.key] = val
    return result


@router.put("/settings/smtp", response_model=MessageResponse)
async def update_smtp_settings(data: dict, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "superadmin":
        raise HTTPException(status_code=403, detail="Superadmin access required")

    smtp_host = data.get("smtp_host", "")
    if smtp_host:
        _validate_smtp_host(smtp_host, db)

    port_val = data.get("smtp_port", "587")
    try:
        port_int = int(port_val)
        if port_int < 1 or port_int > 65535:
            raise HTTPException(status_code=400, detail="Invalid port number")
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Port must be a valid number")

    from_email = data.get("smtp_from_email", "")
    if from_email and not re.match(r"^[^@]+@[^@]+\.[^@]+$", from_email):
        raise HTTPException(status_code=400, detail="Invalid from_email format")

    for key in SMTP_KEYS:
        val = data.get(key, "")
        if isinstance(val, str) and len(val) > MAX_SETTING_VALUE_LENGTH:
            raise HTTPException(status_code=400, detail=f"Value for {key} exceeds maximum length")
        if key == "smtp_password" and val and val != "********":
            val = "enc:" + encrypt_password(val)
        existing = db.query(SMTPSettings).filter(SMTPSettings.key == key).first()
        if existing:
            existing.value = val
        else:
            db.add(SMTPSettings(key=key, value=val))
    db.commit()
    log_activity(db, current_user.id, "UPDATE", "settings", "Updated SMTP settings")
    return {"message": "SMTP settings updated"}


@router.post("/settings/smtp/test", response_model=SmtpTestResponse)
async def test_smtp(data: dict, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    import smtplib
    import socket
    from email.mime.text import MIMEText
    from utils.email_service import _decrypt_smtp_password
    host = data.get("smtp_host", "")
    port = int(data.get("smtp_port", 587))
    username = data.get("smtp_username", "")
    password = data.get("smtp_password", "")
    from_email = data.get("smtp_from_email", "")
    to_email = data.get("to_email", "")
    use_tls = data.get("smtp_use_tls", "true") == "true"
    # If password is masked, read the stored encrypted password from DB
    if password == "********":
        stored = db.query(SMTPSettings).filter(SMTPSettings.key == "smtp_password").first()
        if stored and stored.value:
            password = _decrypt_smtp_password(stored.value)
    if not all([host, port, username, password, from_email, to_email]):
        raise HTTPException(status_code=400, detail="All fields are required")
    _validate_smtp_host(host, db)
    try:
        socket.create_connection((host, port), timeout=5)
    except socket.gaierror:
        raise HTTPException(status_code=400, detail=f"Cannot resolve SMTP host: {host}. Check hostname")
    except socket.timeout:
        raise HTTPException(status_code=400, detail=f"Connection timeout: {host}:{port}")
    except ConnectionRefusedError:
        raise HTTPException(status_code=400, detail=f"Connection refused: {host}:{port}")
    except OSError as e:
        raise HTTPException(status_code=400, detail=f"Cannot reach SMTP host: {str(e)}")
    try:
        msg = MIMEText("Test email from Super Apps IT Management System")
        msg["Subject"] = "Test Email - Super Apps"
        msg["From"] = from_email
        msg["To"] = to_email
        if use_tls:
            server = smtplib.SMTP(host, port, timeout=10)
            server.starttls()
        else:
            server = smtplib.SMTP(host, port, timeout=10)
        server.login(username, password)
        server.sendmail(from_email, [to_email], msg.as_string())
        server.quit()
        return {"message": "Test email sent successfully", "success": True}
    except smtplib.SMTPAuthenticationError:
        raise HTTPException(status_code=400, detail="Authentication failed. Check username/password")
    except smtplib.SMTPConnectError:
        raise HTTPException(status_code=400, detail=f"Cannot connect to SMTP server {host}:{port}. Check host and port")
    except smtplib.SMTPException as e:
        code = getattr(e, "smtp_code", None)
        text = str(e).lower()
        if code == 553 or "relay" in text or "sender" in text:
            raise HTTPException(
                status_code=400,
                detail=(
                    "SMTP server rejected the sender (553). Ensure 'From Email' matches "
                    "your SMTP account or an address the server allows to relay."
                ),
            )
        raise HTTPException(status_code=400, detail=f"SMTP error: {str(e)}")
    except OSError as e:
        raise HTTPException(status_code=400, detail=f"Cannot reach SMTP server: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to send email: {str(e)}")


@router.get("/settings/admin-ui", response_model=AdminUiResponse)
async def get_admin_ui_settings(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "superadmin":
        raise HTTPException(status_code=403, detail="Superadmin access required")
    password_record = db.query(AppSettings).filter(AppSettings.key == "admin_ui_password").first()
    is_configured = bool(password_record and password_record.value)
    is_running, url = is_sqlite_web_running()
    return {"enabled": is_configured, "url": url}


@router.post("/settings/admin-ui", response_model=MessageResponse)
async def update_admin_ui_settings(data: dict, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "superadmin":
        raise HTTPException(status_code=403, detail="Superadmin access required")
    new_password = data.get("password", "")
    if not new_password:
        raise HTTPException(status_code=400, detail="Password cannot be empty")
    valid, msg = validate_password_strength(new_password)
    if not valid:
        raise HTTPException(status_code=400, detail=msg)
    encrypted = encrypt_password(new_password)
    password_record = db.query(AppSettings).filter(AppSettings.key == "admin_ui_password").first()
    if password_record:
        password_record.value = encrypted
    else:
        db.add(AppSettings(category="general", key="admin_ui_password", value=encrypted))
    db.commit()
    success, url = start_sqlite_web(new_password)
    if success:
        log_activity(db, current_user.id, "UPDATE", "settings", "Updated Admin UI password and restarted sqlite-web")
        return {"message": "Admin UI password updated and restarted successfully"}
    raise HTTPException(status_code=500, detail="Failed to restart Admin UI")


@router.post("/settings/admin-ui/restart", response_model=MessageResponse)
async def restart_admin_ui(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "superadmin":
        raise HTTPException(status_code=403, detail="Superadmin access required")
    password_record = db.query(AppSettings).filter(AppSettings.key == "admin_ui_password").first()
    if not password_record or not password_record.value:
        raise HTTPException(status_code=400, detail="Admin UI password not configured")
    stop_sqlite_web()
    await asyncio.sleep(1)
    stored = password_record.value
    password = decrypt_password(stored) if is_password_encrypted(stored) else stored
    success, url = start_sqlite_web(password)
    if success:
        log_activity(db, current_user.id, "UPDATE", "settings", "Restarted Admin UI (sqlite-web)")
        return {"message": "Admin UI restarted successfully"}
    raise HTTPException(status_code=500, detail="Failed to restart Admin UI")


# NOTE: The generic "/settings/{category}" GET/PUT handlers are registered at the
# END of this file (see bottom). They MUST come after all literal "/settings/<name>"
# routes (e.g. /settings/all, /settings/metrics, /settings/error-logs); otherwise the
# path parameter greedily matches those literals first and returns HTTP 400.


@router.get("/settings/all", response_model=dict)
async def get_all_settings(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "superadmin":
        raise HTTPException(status_code=403, detail="Superadmin access required")
    records = db.query(AppSettings).filter(AppSettings.category.in_(SETTINGS_CATEGORIES)).all()
    result = {}
    for cat in SETTINGS_CATEGORIES:
        result[cat] = {}
    for r in records:
        result.setdefault(r.category, {})[r.key] = r.value or ""
    return result


@router.post("/settings/backup", response_model=SettingsBackupResponse)
async def backup_database(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "superadmin":
        raise HTTPException(status_code=403, detail="Superadmin access required")
    db_path = get_db_path()
    uploads_dir = get_uploads_dir()
    backup_dir = get_backup_dir()
    os.makedirs(backup_dir, exist_ok=True)
    timestamp = utcnow().strftime("%Y%m%d_%H%M%S")
    backup_path = os.path.join(backup_dir, f"superapps_backup_{timestamp}.tar.gz")
    with tarfile.open(backup_path, "w:gz") as tar:
        tar.add(db_path, arcname="superapps.db")
        if os.path.exists(uploads_dir):
            tar.add(uploads_dir, arcname="uploads")
    log_activity(db, current_user.id, "CREATE", "settings", f"Database backup created: {timestamp}")
    db.commit()
    return {"message": "Backup created successfully", "filename": f"superapps_backup_{timestamp}.tar.gz", "path": backup_path}


def _safe_extract_tar(tar_path: str, tmp_dir: str):
    """Extract a .tar.gz backup safely: reject oversized members and path traversal.

    `filter="data"` (Python 3.12+) blocks absolute paths, path traversal,
    symlinks, hardlinks and special files. Member size limits prevent tar bombs.
    """
    with tarfile.open(tar_path, "r:gz") as tar:
        total_size = 0
        for member in tar.getmembers():
            if member.issym() or member.islnk():
                raise HTTPException(status_code=400, detail="Invalid backup: links are not allowed")
            if member.isfile() and member.size > MAX_TAR_MEMBER_SIZE:
                raise HTTPException(status_code=400, detail="Invalid backup: file too large in archive")
            total_size += member.size if member.isfile() else 0
            if total_size > MAX_TAR_TOTAL_SIZE:
                raise HTTPException(status_code=400, detail="Invalid backup: archive too large")
        tar.extractall(tmp_dir, filter="data")


@router.get("/settings/backup/list", response_model=dict)
async def list_backups(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    backup_dir = get_backup_dir()
    if not os.path.exists(backup_dir):
        return {"backups": []}
    files = sorted(os.listdir(backup_dir), reverse=True)
    backups = []
    for f in files:
        if _is_backup_file(f):
            fp = os.path.join(backup_dir, f)
            stat = os.stat(fp)
            backups.append({"filename": f, "size_bytes": stat.st_size, "size_mb": round(stat.st_size / (1024*1024), 2),
                "created_at": datetime.fromtimestamp(stat.st_mtime).isoformat()})
    return {"backups": backups}


@router.post("/settings/backup/restore", response_model=SettingsRestoreResponse)
async def restore_database(data: dict, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "superadmin":
        raise HTTPException(status_code=403, detail="Superadmin access required")
    filename = data.get("filename", "")
    if not filename or not _is_backup_file(filename):
        raise HTTPException(status_code=400, detail="Invalid filename: must be .db or .tar.gz")
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename: path traversal not allowed")
    filename = os.path.basename(filename)
    backup_dir = get_backup_dir()
    backup_path = os.path.join(backup_dir, filename)
    real_backup_dir = os.path.realpath(backup_dir)
    real_backup_path = os.path.realpath(backup_path)
    if not real_backup_path.startswith(real_backup_dir):
        raise HTTPException(status_code=400, detail="Invalid filename: path traversal not allowed")
    if not os.path.exists(backup_path):
        raise HTTPException(status_code=404, detail="Backup file not found")
    if os.path.getsize(backup_path) > MAX_BACKUP_FILE_SIZE:
        raise HTTPException(status_code=413, detail="Backup file too large")
    db_path = get_db_path()
    # Safety: backup current DB + uploads before overwriting
    ts = utcnow().strftime('%Y%m%d_%H%M%S')
    pre_restore_backup = os.path.join(backup_dir, f"pre_restore_{ts}.db")
    shutil.copy2(db_path, pre_restore_backup)
    pre_restore_uploads = os.path.join(backup_dir, f"pre_restore_uploads_{ts}")
    uploads_dir = get_uploads_dir()
    if os.path.exists(uploads_dir):
        shutil.copytree(uploads_dir, pre_restore_uploads, ignore_dangling_symlinks=True)
    # Restore DB + uploads from tar.gz or DB-only from .db
    if filename.endswith(".tar.gz"):
        tmp_dir = tempfile.mkdtemp()
        try:
            _safe_extract_tar(backup_path, tmp_dir)
            extracted_db = os.path.join(tmp_dir, "superapps.db")
            if not os.path.exists(extracted_db):
                raise HTTPException(status_code=400, detail="Invalid backup: missing superapps.db")
            tmp_path = db_path + ".restore_tmp"
            shutil.copy2(extracted_db, tmp_path)
            os.rename(tmp_path, db_path)
            _restore_uploads_from_tar(tmp_dir)
        finally:
            shutil.rmtree(tmp_dir, ignore_errors=True)
    else:
        # .db backup: backward compat
        tmp_path = db_path + ".restore_tmp"
        shutil.copy2(backup_path, tmp_path)
        os.rename(tmp_path, db_path)
    # Critical section: prevent concurrent DB access during engine reset
    with _RESTORE_LOCK:
        db.close()
        restart_engine()
        for ext in ("-wal", "-shm"):
            stale = get_db_path() + ext
            if os.path.exists(stale):
                os.remove(stale)
        db = SessionLocal()
        try:
            init_db()
            migrate_schema()
            log_activity(db, current_user.id, "UPDATE", "settings", f"Database restored from backup: {filename}")
            db.commit()
        except Exception as e:
            db.rollback()
            logger.warning("Post-restore ops failed (restore itself succeeded): %s", e)
    return {"message": "Database restored successfully", "filename": filename, "restart_required": False}


@router.post("/settings/backup/upload-restore", response_model=SettingsRestoreResponse)
async def upload_and_restore(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "superadmin":
        raise HTTPException(status_code=403, detail="Superadmin access required")
    if not file.filename or not _is_backup_file(file.filename):
        raise HTTPException(status_code=400, detail="Only .db or .tar.gz files are accepted")
    if file.size is not None and file.size > MAX_BACKUP_FILE_SIZE:
        raise HTTPException(status_code=413, detail="Backup file too large")
    content = await file.read()
    if len(content) > MAX_BACKUP_FILE_SIZE:
        raise HTTPException(status_code=413, detail="Backup file too large")
    backup_dir = get_backup_dir()
    os.makedirs(backup_dir, exist_ok=True)
    timestamp = utcnow().strftime("%Y%m%d_%H%M%S")
    is_tar = file.filename.endswith(".tar.gz")
    if is_tar:
        uploaded_path = os.path.join(backup_dir, f"uploaded_{timestamp}.tar.gz")
        with open(uploaded_path, "wb") as f:
            f.write(content)
    else:
        if len(content) < 16 or content[:16] != b"SQLite format 3\0":
            raise HTTPException(status_code=400, detail="Invalid SQLite database file")
        uploaded_path = os.path.join(backup_dir, f"uploaded_{timestamp}.db")
        with open(uploaded_path, "wb") as f:
            f.write(content)
    db_path = get_db_path()
    ts = utcnow().strftime('%Y%m%d_%H%M%S')
    pre_restore_backup = os.path.join(backup_dir, f"pre_restore_{ts}.db")
    shutil.copy2(db_path, pre_restore_backup)
    pre_restore_uploads = os.path.join(backup_dir, f"pre_restore_uploads_{ts}")
    uploads_dir = get_uploads_dir()
    if os.path.exists(uploads_dir):
        shutil.copytree(uploads_dir, pre_restore_uploads, ignore_dangling_symlinks=True)
    # Restore DB + uploads from tar.gz or DB-only from .db
    if is_tar:
        tmp_dir = tempfile.mkdtemp()
        try:
            _safe_extract_tar(uploaded_path, tmp_dir)
            extracted_db = os.path.join(tmp_dir, "superapps.db")
            if not os.path.exists(extracted_db):
                raise HTTPException(status_code=400, detail="Invalid backup: missing superapps.db")
            tmp_path = db_path + ".restore_tmp"
            shutil.copy2(extracted_db, tmp_path)
            os.rename(tmp_path, db_path)
            _restore_uploads_from_tar(tmp_dir)
        finally:
            shutil.rmtree(tmp_dir, ignore_errors=True)
    else:
        tmp_path = db_path + ".restore_tmp"
        shutil.copy2(uploaded_path, tmp_path)
        os.rename(tmp_path, db_path)
    # Critical section: prevent concurrent DB access during engine reset
    with _RESTORE_LOCK:
        db.close()
        restart_engine()
        for ext in ("-wal", "-shm"):
            stale = get_db_path() + ext
            if os.path.exists(stale):
                os.remove(stale)
        db = SessionLocal()
        try:
            init_db()
            migrate_schema()
            log_activity(db, current_user.id, "UPDATE", "settings", f"Database restored from uploaded file: {uploaded_path}")
            from utils.notification_dispatcher import create_in_app_notification
            admins = db.query(User).filter(User.role == "superadmin").all()
            for admin in admins:
                create_in_app_notification(
                    db, admin.id, "restore_complete",
                    "Database Restore Completed",
                    f"Database has been restored from uploaded file: {os.path.basename(uploaded_path)}"
                )
            db.commit()
        except Exception as e:
            db.rollback()
            logger.warning("Post-restore ops failed (restore itself succeeded): %s", e)
    return {"message": "Database restored successfully from uploaded file", "filename": os.path.basename(uploaded_path), "restart_required": False}


@router.get("/settings/backup/download/{filename}")
async def download_backup(
    filename: str,
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "superadmin":
        raise HTTPException(status_code=403, detail="Superadmin access required")
    if not _is_backup_file(filename):
        raise HTTPException(status_code=400, detail="Invalid filename: must be .db or .tar.gz")
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename: path traversal not allowed")
    filename = os.path.basename(filename)
    backup_dir = get_backup_dir()
    backup_path = os.path.join(backup_dir, filename)
    real_backup_dir = os.path.realpath(backup_dir)
    real_backup_path = os.path.realpath(backup_path)
    if not real_backup_path.startswith(real_backup_dir):
        raise HTTPException(status_code=400, detail="Invalid filename: path traversal not allowed")
    if not os.path.exists(backup_path):
        raise HTTPException(status_code=404, detail="Backup file not found")
    return FileResponse(backup_path, filename=filename, media_type="application/octet-stream")


@router.delete("/settings/backup/{filename}", response_model=MessageResponse)
async def delete_backup(filename: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "superadmin":
        raise HTTPException(status_code=403, detail="Superadmin access required")
    if not _is_backup_file(filename):
        raise HTTPException(status_code=400, detail="Invalid filename: must be .db or .tar.gz")
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename: path traversal not allowed")
    filename = os.path.basename(filename)
    backup_dir = get_backup_dir()
    backup_path = os.path.join(backup_dir, filename)
    real_backup_dir = os.path.realpath(backup_dir)
    real_backup_path = os.path.realpath(backup_path)
    if not real_backup_path.startswith(real_backup_dir):
        raise HTTPException(status_code=400, detail="Invalid filename: path traversal not allowed")
    if not os.path.exists(backup_path):
        raise HTTPException(status_code=404, detail="Backup file not found")
    os.remove(backup_path)
    log_activity(db, current_user.id, "DELETE", "settings", f"Deleted backup: {filename}")
    db.commit()
    return {"message": "Backup deleted successfully"}


@router.get("/settings/backup/schedule", response_model=dict)
async def get_backup_schedule(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    schedule = db.query(BackupSchedule).first()
    if not schedule:
        return {"schedule": None}
    return {"schedule": {"id": schedule.id, "frequency": schedule.frequency, "time": schedule.time,
        "day_of_week": schedule.day_of_week, "day_of_month": schedule.day_of_month, "enabled": schedule.enabled,
        "retention_days": schedule.retention_days, "max_backups": schedule.max_backups,
        "last_run": to_iso(schedule.last_run),
        "next_run": to_iso(schedule.next_run)}}


@router.post("/settings/backup/schedule", response_model=MessageResponse)
async def save_backup_schedule(data: BackupScheduleCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "superadmin":
        raise HTTPException(status_code=403, detail="Superadmin access required")
    if data.frequency not in ("hourly", "daily", "weekly", "monthly"):
        raise HTTPException(status_code=400, detail="Frequency must be: hourly, daily, weekly, monthly")
    if data.retention_days < 1 or data.retention_days > 3650:
        raise HTTPException(status_code=400, detail="retention_days must be between 1 and 3650")
    if data.max_backups < 1 or data.max_backups > 1000:
        raise HTTPException(status_code=400, detail="max_backups must be between 1 and 1000")
    if not re.match(r"^\d{2}:\d{2}$", data.time):
        raise HTTPException(status_code=400, detail="Time must be in HH:MM format")
    hour, minute = map(int, data.time.split(":"))
    if hour > 23 or minute > 59:
        raise HTTPException(status_code=400, detail="Invalid time")
    schedule = db.query(BackupSchedule).first()
    if schedule:
        schedule.frequency = data.frequency
        schedule.time = data.time
        schedule.day_of_week = data.day_of_week
        schedule.day_of_month = data.day_of_month
        schedule.enabled = data.enabled
        schedule.retention_days = data.retention_days
        schedule.max_backups = data.max_backups
    else:
        schedule = BackupSchedule(frequency=data.frequency, time=data.time, day_of_week=data.day_of_week,
            day_of_month=data.day_of_month, enabled=data.enabled, retention_days=data.retention_days,
            max_backups=data.max_backups)
        db.add(schedule)
    db.commit()
    db.refresh(schedule)
    if schedule.enabled:
        from utils.backup_scheduler import load_backup_jobs
        from database import SessionLocal
        load_backup_jobs(SessionLocal)
    else:
        from utils.backup_scheduler import scheduler
        scheduler.remove_job("scheduled_backup")
    return {"message": f"Backup schedule {'enabled' if data.enabled else 'disabled'}: {data.frequency} at {data.time}",
        "schedule": {"id": schedule.id, "frequency": schedule.frequency, "time": schedule.time,
            "enabled": schedule.enabled, "retention_days": schedule.retention_days, "max_backups": schedule.max_backups}}


@router.post("/settings/backup/schedule/run-now", response_model=MessageResponse)
async def run_backup_now(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "superadmin":
        raise HTTPException(status_code=403, detail="Superadmin access required")
    from utils.backup_scheduler import run_scheduled_backup
    from database import SessionLocal
    run_scheduled_backup(SessionLocal)
    return {"message": "Manual backup triggered successfully"}


# ==================== ERROR LOGS ====================


@router.get("/settings/error-logs")
async def list_error_logs(
    level: Optional[str] = Query(None, pattern="^(ERROR|WARNING|INFO)?$"),
    days: int = Query(7, ge=1, le=365),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "superadmin":
        raise HTTPException(status_code=403, detail="Superadmin access required")
    cutoff = datetime.utcnow() - timedelta(days=days)
    query = db.query(ErrorLog).filter(ErrorLog.created_at >= cutoff)
    if level:
        query = query.filter(ErrorLog.level == level)
    total = query.count()
    items = query.order_by(ErrorLog.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": [
            {
                "id": e.id,
                "level": e.level,
                "message": e.message,
                "source": e.source,
                "request_method": e.request_method,
                "request_path": e.request_path,
                "request_id": e.request_id,
                "user_id": e.user_id,
                "created_at": e.created_at.isoformat() if e.created_at else None,
            }
            for e in items
        ],
    }


@router.post("/settings/error-logs/client", response_model=MessageResponse)
async def report_client_error(
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    error_log = ErrorLog(
        level=data.get("level", "ERROR"),
        message=data.get("message", "Unknown client error")[:2000],
        traceback=data.get("traceback", "")[:10000],
        source="frontend",
        request_path=data.get("url", ""),
        request_id=data.get("request_id"),
        user_id=current_user.id,
    )
    db.add(error_log)
    db.commit()
    return {"message": "Client error recorded"}


@router.delete("/settings/error-logs/purge", response_model=MessageResponse)
async def purge_error_logs(
    days: int = Query(30, ge=1, le=365),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "superadmin":
        raise HTTPException(status_code=403, detail="Superadmin access required")
    cutoff = datetime.utcnow() - timedelta(days=days)
    deleted = db.query(ErrorLog).filter(ErrorLog.created_at < cutoff).delete()
    db.commit()
    return {"message": f"Deleted {deleted} error log(s) older than {days} days"}


# ==================== SYSTEM METRICS ====================


@router.get("/settings/metrics")
async def get_system_metrics(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "superadmin":
        raise HTTPException(status_code=403, detail="Superadmin access required")

    from main import START_TIME

    # START_TIME is timezone-aware (main.py: datetime.now(timezone.utc)); use the
    # tz-aware utcnow() here so the subtraction doesn't raise TypeError (naive vs aware).
    uptime_seconds = int((utcnow() - START_TIME).total_seconds())
    active_sessions = db.query(func.count()).select_from(User).scalar() or 0
    try:
        from models import UserSession
        active_sessions = db.query(func.count(UserSession.id)).filter(UserSession.is_active == True).scalar() or 0
    except Exception:
        logger.warning("[METRICS] UserSession table not available")
    db_path = get_db_path()
    db_size_mb = round(os.path.getsize(db_path) / (1024 * 1024), 2) if os.path.exists(db_path) else 0
    backup_dir = get_backup_dir()
    backup_count = 0
    if os.path.exists(backup_dir):
        backup_count = len([f for f in os.listdir(backup_dir) if _is_backup_file(f)])
    total_users = db.query(func.count(User.id)).scalar() or 0
    cutoff_24h = datetime.utcnow() - timedelta(hours=24)
    error_count_24h = 0
    try:
        error_count_24h = db.query(func.count(ErrorLog.id)).filter(ErrorLog.created_at >= cutoff_24h).scalar() or 0
    except Exception:
        logger.warning("[METRICS] ErrorLog table not available yet")
    import psutil
    disk = psutil.disk_usage("/")
    memory = psutil.virtual_memory()
    return {
        "uptime_seconds": uptime_seconds,
        "active_sessions": active_sessions,
        "database_size_mb": db_size_mb,
        "backup_count": backup_count,
        "total_users": total_users,
        "error_count_24h": error_count_24h,
        "disk_usage_percent": disk.percent,
        "memory_usage_percent": memory.percent,
    }


# ==================== GENERIC SETTINGS CATEGORY (must stay LAST) ====================
# These path-parameter routes are registered after every literal "/settings/<name>"
# route above so FastAPI/Starlette (which matches in declaration order) resolves the
# literals first. Do NOT move these up — doing so shadows /settings/metrics,
# /settings/error-logs, /settings/all, etc. and makes them return HTTP 400.


@router.get("/settings/{category}", response_model=dict)
async def get_settings_category(category: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if category not in SETTINGS_CATEGORIES:
        raise HTTPException(status_code=400, detail=f"Invalid category. Must be one of: {', '.join(SETTINGS_CATEGORIES)}")
    if category in ("security", "api") and current_user.role != "superadmin":
        raise HTTPException(status_code=403, detail="Superadmin access required")
    records = db.query(AppSettings).filter(AppSettings.category == category).all()
    return {r.key: r.value or "" for r in records}


@router.put("/settings/{category}", response_model=MessageResponse)
async def update_settings_category(category: str, data: dict, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if category not in SETTINGS_CATEGORIES:
        raise HTTPException(status_code=400, detail="Invalid category")
    if category in ("security", "api") and current_user.role != "superadmin":
        raise HTTPException(status_code=403, detail="Superadmin access required")
    for key, val in data.items():
        if len(str(key)) > MAX_SETTING_KEY_LENGTH:
            raise HTTPException(status_code=400, detail=f"Key '{key}' exceeds maximum length")
        if len(str(val)) > MAX_SETTING_VALUE_LENGTH:
            raise HTTPException(status_code=400, detail=f"Value for '{key}' exceeds maximum length")
        existing = db.query(AppSettings).filter(AppSettings.key == key).first()
        if existing:
            existing.value = str(val)
        else:
            db.add(AppSettings(category=category, key=key, value=str(val)))
    if category == "security":
        from api.dependencies import _security_settings_cache
        _security_settings_cache["data"] = None
        _security_settings_cache["expiry"] = 0
    log_activity(db, current_user.id, "UPDATE", "settings", f"Updated {category} settings")
    db.commit()
    return {"message": f"{category} settings updated"}
