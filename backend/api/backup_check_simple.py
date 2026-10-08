"""Backup Check API - Simple Sync Version with Hybrid Auto-Detect"""
from fastapi import APIRouter, HTTPException, Depends, Request, Query
from pydantic import BaseModel, field_validator
from typing import List, Dict, Any, Optional
from datetime import date, datetime, timedelta, timezone
from utils.timezone import utcnow
import uuid
import json
import logging
import time
import traceback
import ipaddress
from utils.ssh_handler import SSHConnection
from utils.backup_parser import parse_log_content, parse_file_list, calculate_status, MAX_FILES_TO_PROCESS, format_size, get_summary
from utils.progress_tracker import create_progress_tracker, get_progress, cleanup_progress
from database import get_db, SessionLocal
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from models import BackupHistory, User
from api.dependencies import get_current_user, log_activity, get_offset, calculate_pagination
from api.schemas import MessageResponse

router = APIRouter(prefix="/backup-check", tags=["Backup Check"])

logger = logging.getLogger(__name__)


# Request models - define at top
MAX_NAS_IP_LEN = 255
MAX_USERNAME_LEN = 128
MAX_PASSWORD_LEN = 256
MAX_PATH_LEN = 512


class CredentialRequest(BaseModel):
    nas_ip: str
    username: str
    password: str
    path: str
    port: int = 22
    mode: str = "auto"  # auto, daily, weekly, monthly

    @field_validator("nas_ip")
    @classmethod
    def validate_nas_ip(cls, v: str) -> str:
        v = v.strip()
        if len(v) > MAX_NAS_IP_LEN:
            raise ValueError(f"NAS IP must be {MAX_NAS_IP_LEN} characters or less")
        try:
            ipaddress.ip_address(v)
        except ValueError:
            raise ValueError("Invalid IP address format")
        return v

    @field_validator("username")
    @classmethod
    def validate_username(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Username is required")
        if len(v) > MAX_USERNAME_LEN:
            raise ValueError(f"Username must be {MAX_USERNAME_LEN} characters or less")
        return v

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if not v:
            raise ValueError("Password is required")
        if len(v) > MAX_PASSWORD_LEN:
            raise ValueError(f"Password must be {MAX_PASSWORD_LEN} characters or less")
        return v

    @field_validator("path")
    @classmethod
    def validate_path(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Backup path is required")
        if len(v) > MAX_PATH_LEN:
            raise ValueError(f"Path must be {MAX_PATH_LEN} characters or less")
        if ".." in v:
            raise ValueError("Path traversal not allowed")
        return v

    @field_validator("port")
    @classmethod
    def validate_port(cls, v: int) -> int:
        if v < 1 or v > 65535:
            raise ValueError("Port must be between 1 and 65535")
        return v

    @field_validator("mode")
    @classmethod
    def validate_mode(cls, v: str) -> str:
        v = v.strip().lower()
        if v not in ("auto", "daily", "weekly", "monthly"):
            raise ValueError("Mode must be auto, daily, weekly, or monthly")
        return v


class TestConnectionRequest(BaseModel):
    nas_ip: str
    username: str
    password: str
    port: int = 22

    @field_validator("nas_ip")
    @classmethod
    def validate_nas_ip(cls, v: str) -> str:
        v = v.strip()
        if len(v) > MAX_NAS_IP_LEN:
            raise ValueError(f"NAS IP must be {MAX_NAS_IP_LEN} characters or less")
        try:
            ipaddress.ip_address(v)
        except ValueError:
            raise ValueError("Invalid IP address format")
        return v

    @field_validator("username")
    @classmethod
    def validate_username(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Username is required")
        if len(v) > MAX_USERNAME_LEN:
            raise ValueError(f"Username must be {MAX_USERNAME_LEN} characters or less")
        return v

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if not v:
            raise ValueError("Password is required")
        if len(v) > MAX_PASSWORD_LEN:
            raise ValueError(f"Password must be {MAX_PASSWORD_LEN} characters or less")
        return v

    @field_validator("port")
    @classmethod
    def validate_port(cls, v: int) -> int:
        if v < 1 or v > 65535:
            raise ValueError("Port must be between 1 and 65535")
        return v


def _apply_backup_rbac(query, current_user: User):
    """Apply RBAC filter: superadmin sees all, others see own role group."""
    if current_user.role != "superadmin":
        return query.filter(BackupHistory.owner_role == current_user.role)
    return query


def _status_label(days_since: int) -> str:
    """Generate status label without emojis."""
    if days_since == 0:
        return "Backed up today"
    elif days_since == 1:
        return "Yesterday"
    elif days_since <= 7:
        return f"{days_since} days ago"
    else:
        return f"{days_since} days ago"


def auto_detect_check_mode(db: Session, current_user: User) -> tuple[str, int]:
    """
    Auto-detect check mode based on last run and current day
    RBAC: only considers records from user's role group.

    Returns: (mode, days_to_check)
    """
    query = _apply_backup_rbac(db.query(BackupHistory), current_user)
    last_record = query.order_by(BackupHistory.created_at.desc()).first()

    if not last_record:
        return "monthly", 365

    last_check = last_record.created_at
    if last_check.tzinfo is None:
        last_check = last_check.replace(tzinfo=timezone.utc)
    days_since_check = (utcnow() - last_check).days

    is_monday = utcnow().weekday() == 0

    if days_since_check >= 30:
        return "monthly", 365
    elif is_monday and days_since_check >= 7:
        return "weekly", 30
    elif days_since_check >= 1:
        return "daily", 7
    else:
        return "daily", 3


@router.get("/export")
async def export_backup_data(
    from_date: str = Query(..., description="Start date (YYYY-MM-DD)"),
    to_date: str = Query(..., description="End date (YYYY-MM-DD)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Export ALL backups in date range (no grouping by server)
    Returns complete history for PDF generation
    """
    logger.info(f"[BACKUP-CHECK-EXPORT] Request: from_date={from_date}, to_date={to_date}")

    # Parse dates
    try:
        start_date = datetime.strptime(from_date, "%Y-%m-%d").date()
        end_date = datetime.strptime(to_date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")

    # Validate range
    if start_date > end_date:
        raise HTTPException(status_code=400, detail="from_date must be before or equal to to_date")

    if (end_date - start_date).days > 365:
        raise HTTPException(status_code=400, detail="Date range too large. Maximum 365 days allowed")

    # Query ALL backups in range (NO GROUP BY)
    base_query = _apply_backup_rbac(db.query(BackupHistory), current_user)

    all_backups = base_query.filter(
        BackupHistory.backup_date >= start_date,
        BackupHistory.backup_date <= end_date
    ).order_by(
        BackupHistory.backup_date.desc(),
        BackupHistory.server_name
    ).all()

    logger.info(f"[BACKUP-CHECK-EXPORT] Found {len(all_backups)} backups")

    # Convert to dict format
    backups_data = []
    for backup in all_backups:
        days_since = (date.today() - backup.backup_date).days
        backups_data.append({
            "server": backup.server_name,
            "date": backup.backup_date.isoformat(),
            "files": backup.jumlah_files,
            "files_formatted": backup.jumlah_files.toLocaleString() if hasattr(backup.jumlah_files, 'toLocaleString') else f"{backup.jumlah_files:,}",
            "size_bytes": backup.total_size_bytes,
            "size_formatted": format_size(backup.total_size_bytes),
            "status": _status_label(days_since),
            "filename": backup.filename if hasattr(backup, 'filename') else None
        })

    return {
        "backups": backups_data,
        "total": len(backups_data),
        "from_date": from_date,
        "to_date": to_date
    }


@router.get("/servers", response_model=dict)
async def get_servers_from_db(
    from_date: str = Query(None, description="Filter from date (YYYY-MM-DD)"),
    to_date: str = Query(None, description="Filter to date (YYYY-MM-DD)"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(100, ge=1, le=10000, description="Items per page (max 10000)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Load all servers from database (persistent storage)
    Shows latest backup status per server (ONE record per server)
    Supports date range filtering with from_date and to_date (YYYY-MM-DD)
    RBAC: superadmin sees all, others see own role group.
    """
    logger.info(f"[BACKUP-CHECK] Received request: from_date={from_date}, to_date={to_date}, page={page}, page_size={page_size}")

    base_query = _apply_backup_rbac(db.query(BackupHistory), current_user)

    # Parse date range if provided
    start_date = None
    end_date = None
    if from_date and to_date:
        try:
            start_date = datetime.strptime(from_date, "%Y-%m-%d").date()
            end_date = datetime.strptime(to_date, "%Y-%m-%d").date()
            if start_date > end_date:
                raise HTTPException(status_code=400, detail="from_date must be before or equal to to_date")

            # Validasi max 365 hari untuk mencegah DoS
            if (end_date - start_date).days > 365:
                raise HTTPException(
                    status_code=400,
                    detail="Date range too large. Maximum 365 days allowed"
                )
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")

    # Apply date filter if range provided
    if start_date and end_date:
        base_query = base_query.filter(
            BackupHistory.backup_date >= start_date,
            BackupHistory.backup_date <= end_date
        )

    subquery = base_query.with_entities(
        BackupHistory.server_name,
        func.max(BackupHistory.backup_date).label('max_date')
    ).group_by(
        BackupHistory.server_name
    ).subquery()

    latest_records_query = db.query(BackupHistory).join(
        subquery,
        BackupHistory.server_name == subquery.c.server_name
    ).filter(
        BackupHistory.backup_date == subquery.c.max_date
    )

    # Hitung total sebelum pagination
    total_count = latest_records_query.count()

    # Apply pagination
    latest_records = latest_records_query.order_by(BackupHistory.server_name)\
                                        .offset((page - 1) * page_size)\
                                        .limit(page_size)\
                                        .all()

    servers = []
    today = date.today()

    for record in latest_records:
        days_since = (today - record.backup_date).days

        servers.append({
            "server": record.server_name,
            "latest_backup": record.backup_date.isoformat() if record.backup_date else None,
            "days_since": days_since,
            "status": _status_label(days_since),
            "latest_files": record.jumlah_files,
            "latest_size": format_size(record.total_size_bytes),
            "latest_size_bytes": record.total_size_bytes
        })

    status_order = {"Critical": 0, "Warning": 1, "OK": 2}
    servers.sort(key=lambda x: (status_order.get(x["status"], 3), x["server"]))

    # Format date range for response
    if start_date and end_date:
        date_range = start_date.isoformat() if start_date == end_date else f"{start_date.isoformat()} to {end_date.isoformat()}"
    else:
        date_range = "All time"

    # Get data range info (earliest and latest dates available)
    data_range_query = _apply_backup_rbac(db.query(BackupHistory), current_user)
    earliest_date = data_range_query.order_by(BackupHistory.backup_date.asc()).first()
    latest_date = data_range_query.order_by(BackupHistory.backup_date.desc()).first()

    data_range_info = {
        "earliest_date": earliest_date.backup_date.isoformat() if earliest_date else None,
        "latest_date": latest_date.backup_date.isoformat() if latest_date else None
    }

    return {
        "servers": servers,
        "total": total_count,
        "page": page,
        "page_size": page_size,
        "total_pages": (total_count + page_size - 1) // page_size,
        "from_date": start_date.isoformat() if start_date else None,
        "to_date": end_date.isoformat() if end_date else None,
        "date_range": date_range,
        "data_range": data_range_info,
        "last_updated": datetime.now(timezone.utc).isoformat()
    }


@router.get("/server/{server_name}/history", response_model=dict)
async def get_server_history(
    server_name: str,
    days: int = 30,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=1000),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get backup history for a specific server
    RBAC: superadmin sees all, others see own role group.
    """
    cutoff_date = date.today() - timedelta(days=days)

    base_query = db.query(BackupHistory).filter(
        BackupHistory.server_name == server_name,
        BackupHistory.backup_date >= cutoff_date
    )
    base_query = _apply_backup_rbac(base_query, current_user)

    total_records = base_query.count()

    # Statistics computed over the full period (independent of the current page)
    stats_row = base_query.with_entities(
        func.count(BackupHistory.id),
        func.avg(BackupHistory.jumlah_files),
        func.max(BackupHistory.jumlah_files),
        func.min(BackupHistory.jumlah_files),
        func.avg(BackupHistory.total_size_bytes),
        func.max(BackupHistory.total_size_bytes),
        func.min(BackupHistory.total_size_bytes),
    ).first()

    count = stats_row[0] if stats_row else 0
    avg_files = stats_row[1] if stats_row else None
    max_files = stats_row[2] if stats_row else None
    min_files = stats_row[3] if stats_row else None
    avg_size = stats_row[4] if stats_row else None
    max_size = stats_row[5] if stats_row else None
    min_size = stats_row[6] if stats_row else None

    records = base_query.order_by(desc(BackupHistory.backup_date)) \
                        .offset(get_offset(page, page_size)) \
                        .limit(page_size) \
                        .all()

    history = []
    for record in records:
        days_since = (date.today() - record.backup_date).days
        history.append({
            "backup_date": record.backup_date.isoformat() if record.backup_date else None,
            "jumlah_files": record.jumlah_files,
            "total_size_bytes": record.total_size_bytes,
            "total_size_formatted": format_size(record.total_size_bytes),
            "status": _status_label(days_since),
            "filename": record.filename
        })

    return {
        "server_name": server_name,
        "period_days": days,
        "statistics": {
            "total_records": count,
            "avg_files": round(avg_files, 2) if avg_files else 0,
            "avg_size_gb": round(avg_size / (1024**3), 2) if avg_size else 0,
            "max_files": max_files or 0,
            "max_size_gb": round(max_size / (1024**3), 2) if max_size else 0,
            "min_files": min_files or 0,
            "min_size_gb": round(min_size / (1024**3), 2) if min_size else 0
        },
        "history": history,
        "pagination": calculate_pagination(page, page_size, total_records).dict()
    }


@router.get("/server/{server_name}/history/{backup_date}/files", response_model=dict)
async def get_server_backup_files(
    server_name: str,
    backup_date: str,
    q: str = Query(None, description="Optional case-insensitive path filter"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=1000),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    List individual files backed up for a server on a specific date.
    Data is captured at scan time (BackupHistory.file_list). Legacy records
    have no file list -> available=False.
    RBAC: superadmin sees all, others see own role group.
    """
    try:
        target_date = datetime.strptime(backup_date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")

    base_query = db.query(BackupHistory).filter(
        BackupHistory.server_name == server_name,
        BackupHistory.backup_date == target_date
    )
    base_query = _apply_backup_rbac(base_query, current_user)
    record = base_query.order_by(desc(BackupHistory.created_at)).first()

    if not record:
        raise HTTPException(status_code=404, detail="Backup record not found")

    if not record.file_list:
        return {
            "server_name": server_name,
            "backup_date": backup_date,
            "available": False,
            "truncated": False,
            "files": [],
            "pagination": calculate_pagination(page, page_size, 0).dict()
        }

    try:
        parsed = json.loads(record.file_list)
        files = parsed.get("files", []) if isinstance(parsed, dict) else []
        truncated = bool(parsed.get("truncated", False)) if isinstance(parsed, dict) else False
    except (ValueError, TypeError):
        files = []
        truncated = False

    if q:
        ql = q.strip().lower()
        files = [f for f in files if ql in str(f.get("path", "")).lower()]

    total_records = len(files)
    offset = get_offset(page, page_size)
    page_items = files[offset:offset + page_size]

    return {
        "server_name": server_name,
        "backup_date": backup_date,
        "available": True,
        "truncated": truncated,
        "files": page_items,
        "pagination": calculate_pagination(page, page_size, total_records).dict()
    }


@router.get("/progress/{operation_id}", response_model=dict)
async def get_backup_progress(operation_id: str, current_user: User = Depends(get_current_user)):
    """Get current progress"""
    progress = get_progress(operation_id)
    if progress.get("status") == "not_found":
        raise HTTPException(status_code=404, detail="Operation not found")
    return progress


@router.get("/results/{operation_id}", response_model=dict)
async def get_backup_results(operation_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Get results after completion"""
    progress = get_progress(operation_id)
    if progress.get("status") != "completed":
        raise HTTPException(status_code=400, detail="Operation not completed")

    query = _apply_backup_rbac(db.query(BackupHistory), current_user)
    latest_records = query.order_by(BackupHistory.created_at.desc()).all()

    latest_per_server = {}
    for record in latest_records:
        if record.server_name not in latest_per_server:
            latest_per_server[record.server_name] = record

    records = []
    for server_name, record in latest_per_server.items():
        records.append({
            "server": record.server_name,
            "date": record.backup_date.isoformat() if record.backup_date else None,
            "files": record.jumlah_files,
            "files_formatted": f"{record.jumlah_files:,}",
            "size_bytes": record.total_size_bytes,
            "size_formatted": format_size(record.total_size_bytes),
            "status": record.status,
            "filename": record.filename
        })

    summary = get_summary(records)

    return {
        "summary": summary,
        "records": records,
        "message": f"Successfully checked {len(records)} servers"
    }


@router.post("/run-manual", response_model=dict)
async def run_manual_backup_check(
    credentials: CredentialRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Run backup check - returns immediately, processes in background"""
    operation_id = str(uuid.uuid4())
    tracker = create_progress_tracker(operation_id)

    import threading
    thread = threading.Thread(
        target=process_backup_sync,
        args=(operation_id, credentials, current_user.id, current_user.role, tracker)
    )
    thread.start()

    log_activity(db, current_user.id, "CREATE", "backup_check", f"Manual backup check initiated for {credentials.nas_ip}")

    return {"operation_id": operation_id, "status": "started"}


def process_backup_sync(
    operation_id: str,
    credentials: CredentialRequest,
    user_id: int,
    user_role: str,
    tracker
):
    """Synchronous processing in separate thread with hybrid auto-detect.
    Thread-safe: creates its own DB session.
    """
    thread_db = SessionLocal()
    ssh = SSHConnection(
        host=credentials.nas_ip,
        username=credentials.username,
        password=credentials.password,
        port=credentials.port
    )

    try:
        success, message = ssh.connect()
        if not success:
            tracker.error(message)
            ssh.disconnect()
            return

        mode = credentials.mode
        days_to_check = 365

        if mode == "auto":
            mode, days_to_check = auto_detect_check_mode(thread_db, User(id=user_id, role=user_role))
            logger.info("[AUTO] Detected mode: %s (checking last %d days)", mode, days_to_check)
        elif mode == "daily":
            days_to_check = 7
        elif mode == "weekly":
            days_to_check = 30
        elif mode == "monthly":
            days_to_check = 365

        success, files_with_size, message = ssh.list_log_files(credentials.path)
        if not success:
            tracker.error(message)
            ssh.disconnect()
            return

        if not files_with_size:
            tracker.complete()
            ssh.disconnect()
            return

        from utils.backup_parser import map_filename_to_ip
        import re
        from datetime import datetime as dt

        cutoff_date = date.today() - timedelta(days=days_to_check)
        filtered_files = []
        skipped_old = 0

        for filepath, size in files_with_size:
            filename = filepath.split("/")[-1]

            base = filename.replace(".log", "")
            tokens = base.split("_")
            raw_date = tokens[-1] if tokens else ""

            file_date = None
            if re.match(r"\d{2}-\d{2}-\d{4}$", raw_date):
                file_date = dt.strptime(raw_date, "%d-%m-%Y").date()
            elif re.match(r"\d{8}$", raw_date):
                file_date = dt.strptime(raw_date, "%Y%m%d").date()

            if file_date and file_date < cutoff_date:
                skipped_old += 1
                continue

            filtered_files.append(filepath)

        logger.info("[FILTER] Skipped %d old files (> %d days)", skipped_old, days_to_check)
        logger.info("[FILTER] Processing %d recent files", len(filtered_files))

        files = filtered_files

        total_to_process = min(len(files), MAX_FILES_TO_PROCESS)

        logger.info("=" * 60)
        logger.info("[STATS] Mode: %s", mode)
        logger.info("[STATS] Days to check: %d", days_to_check)
        logger.info("[STATS] Total .log files in folder: %d", len(files_with_size))
        logger.info("[STATS] Files after date filter: %d", len(files))
        logger.info("[STATS] Files that will be processed: %d", total_to_process)
        logger.info("=" * 60)

        tracker.update(0, total_to_process, "Starting...")

        saved_count = 0
        all_records = []
        failed_count = 0

        logger.info("[INFO] Processing %d files... (Op: %s)", total_to_process, operation_id)

        existing_dates = thread_db.query(
            BackupHistory.server_name,
            BackupHistory.backup_date,
            BackupHistory.file_list
        ).all()
        existing_set = {(r.server_name, str(r.backup_date)) for r in existing_dates}
        # Records that already have a captured file list -> safe to early-skip (no re-read).
        # Records in existing_set but NOT here are re-read to backfill file_list (Option A).
        filled_set = {(r.server_name, str(r.backup_date)) for r in existing_dates if r.file_list}
        logger.info("[INFO] Found %d existing records in DB (%d already with file list)", len(existing_set), len(filled_set))

        for i, filepath in enumerate(files[:MAX_FILES_TO_PROCESS]):
            filename = filepath.split("/")[-1]
            tracker.update(i + 1, total_to_process, filename)

            try:
                base = filename.replace(".log", "")
                tokens = base.split("_")
                raw_date = tokens[-1] if tokens else ""

                backup_date = None
                if re.match(r"\d{2}-\d{2}-\d{4}$", raw_date):
                    backup_date = datetime.strptime(raw_date, "%d-%m-%Y").date()
                elif re.match(r"\d{8}$", raw_date):
                    backup_date = datetime.strptime(raw_date, "%Y%m%d").date()

                if backup_date:
                    server_ip = map_filename_to_ip(filename)
                    # Skip only if already in DB AND already has a file list.
                    # If it exists but lacks a file list, fall through to backfill it.
                    if server_ip and (server_ip, str(backup_date)) in filled_set:
                        logger.info("[SKIP] %s (already in DB with file list)", filename)
                        continue

                success, content, message = ssh.read_file(filepath)
                if not success:
                    logger.warning("[WARN] Skip %s: %s", filename, message)
                    failed_count += 1
                    continue

                parsed = parse_log_content(filename, content)
                if not parsed:
                    logger.warning("[WARN] Parse failed %s", filename)
                    failed_count += 1
                    continue

                backup_date = parsed["tanggal"]
                status = calculate_status(parsed["jumlah_files"], parsed["total_size_bytes"])

                existing = thread_db.query(BackupHistory).filter(
                    BackupHistory.server_name == parsed["server_name"],
                    BackupHistory.backup_date == backup_date
                ).first()

                # Capture file list only when needed: a new record, or an existing
                # record that is still missing its file list (Option A backfill).
                # Additive; a capture failure must NOT block the record.
                file_list_json = None
                if (not existing) or (existing and not existing.file_list):
                    try:
                        ok_full, full_content, _ = ssh.read_file_full(filepath)
                        if ok_full and full_content:
                            parsed_files = parse_file_list(full_content)
                            if parsed_files["files"]:
                                file_list_json = json.dumps(parsed_files, ensure_ascii=False)
                    except Exception as e:
                        logger.warning("[FILELIST] Failed to capture file list for %s: %s", filename, e)

                if not existing:
                    total_bytes = parsed["total_size_bytes"]
                    backup_record = BackupHistory(
                        server_name=parsed["server_name"],
                        backup_date=backup_date,
                        jumlah_files=parsed["jumlah_files"],
                        total_size_bytes=total_bytes,
                        total_size_kb=parsed.get("total_size_kb") or round(total_bytes / 1024, 2),
                        total_size_mb=parsed.get("total_size_mb") or round(total_bytes / (1024**2), 2),
                        total_size_gb=parsed.get("total_size_gb") or round(total_bytes / (1024**3), 4),
                        status=status,
                        filename=filename,
                        file_list=file_list_json,
                        created_by=user_id,
                        owner_role=user_role
                    )
                    thread_db.add(backup_record)
                    saved_count += 1
                    logger.info("[SAVE] %s", filename)
                elif not existing.file_list:
                    # Existing record missing file list -> fill it only (other fields untouched)
                    if file_list_json:
                        existing.file_list = file_list_json
                        logger.info("[FILELIST] Backfilled file list for %s", filename)
                    else:
                        logger.info("[SKIP] %s (no file list to backfill)", filename)
                else:
                    logger.info("[SKIP] %s (duplicate)", filename)

            except Exception as e:
                logger.error("[ERROR] File %s: %s", filename, e)
                logger.debug("[DEBUG] Exception type: %s", type(e).__name__)
                logger.debug("[DEBUG] Traceback: %s", traceback.format_exc())
                failed_count += 1
                continue

        try:
            thread_db.commit()
        except Exception as e:
            thread_db.rollback()
            logger.error("[ERROR] Failed to commit backup records: %s", e)
            tracker.error(f"Database commit failed: {e}")
            ssh.disconnect()
            thread_db.close()
            return

        logger.info("=" * 60)
        logger.info("[FINAL STATS]")
        logger.info("  Total files in folder: %d", len(files))
        logger.info("  Files checked: %d", total_to_process)
        logger.info("  New records saved: %d", saved_count)
        logger.info("  Skipped (already in DB): %d", total_to_process - saved_count)
        logger.info("  Failed: %d", failed_count)
        logger.info("=" * 60)
        tracker.complete()

    except Exception as e:
        thread_db.rollback()
        tracker.error(str(e))
        logger.error("[ERROR] %s", e)
    finally:
        thread_db.close()
        ssh.disconnect()


@router.post("/test-connection", response_model=dict)
async def test_connection(credentials: TestConnectionRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Test SSH connection"""
    ssh = SSHConnection(
        host=credentials.nas_ip,
        username=credentials.username,
        password=credentials.password,
        port=credentials.port
    )

    success, message = ssh.connect()
    ssh.disconnect()

    if success:
        log_activity(db, current_user.id, "VIEW", "backup_check", f"Tested SSH connection to {credentials.nas_ip}")
        return {"success": True, "message": message}
    else:
        raise HTTPException(status_code=400, detail=message)


@router.get("/status-guide", response_model=dict)
async def get_status_guide():
    """Get status explanation"""
    return {
        "status_levels": {
            "OK": {"description": "Backup normal", "criteria": "Files >= 1000 AND Size >= 100MB"},
            "Warning": {"description": "Backup ada masalah", "criteria": "Files < 1000 OR Size < 100MB"},
            "Critical": {"description": "Backup gagal", "criteria": "Files = 0 AND Size = 0"}
        }
    }
