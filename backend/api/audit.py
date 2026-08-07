"""Audit API - File activity monitoring from audit-email report files"""
from utils.timezone import utcnow, to_iso
from utils.input_sanitizer import escape_like
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, case
from datetime import datetime, date, timedelta
from typing import List, Optional
from pydantic import BaseModel
import re
import time
import os
import logging
import shlex

logger = logging.getLogger("audit")

from database import get_db
from models import AuditFileActivity, User
from api.dependencies import get_current_user, log_activity
from utils.ssh_handler import SSHConnection
from utils.progress_tracker import create_progress_tracker, get_progress, progress_store
from api.ssh_report import _exec_remote, _sanitize_path, _build_command

router = APIRouter(prefix="/audit", tags=["Audit File"])

ENABLE_SUDO_MODE = os.getenv("ENABLE_SUDO_MODE", "false").lower() == "true"


def _apply_rbac(query, current_user: User):
    if current_user.role != "superadmin":
        return query.filter(AuditFileActivity.owner_role == current_user.role)
    return query


def _audit_to_dict(record: AuditFileActivity) -> dict:
    return {
        "id": record.id,
        "hostname": record.hostname,
        "ip_address": record.ip_address,
        "scan_date": record.scan_date.isoformat() if record.scan_date else None,
        "server_summary": record.server_summary,
        "watched_directory": record.watched_directory,
        "no_changes": record.no_changes,
        "summary_total": record.summary_total,
        "summary_files": record.summary_files,
        "username": record.username,
        "uid": record.uid,
        "process_name": record.process_name,
        "activity_type": record.activity_type,
        "level": record.level,
        "file_paths": record.file_paths,
        "total_files": record.total_files,
        "time_start": record.time_start,
        "time_end": record.time_end,
        "result": record.result,
        "created_at": to_iso(record.created_at),
        "created_by": record.created_by,
    }


# ==================== REQUEST MODELS ====================

class FetchAuditRequest(BaseModel):
    hostname: str
    username: str
    password: Optional[str] = None
    private_key: Optional[str] = None
    port: int = 22
    audit_report_dir: str = "/var/log/audit"
    auth_mode: Optional[str] = "root"


class BatchScanRequest(BaseModel):
    servers: List[str]
    username: str
    private_key: Optional[str] = None
    password: Optional[str] = None
    port: int = 22
    audit_report_dir: str = "/var/log/audit"
    auth_mode: Optional[str] = "sudo"
    max_workers: int = 50


# ==================== BACKGROUND SCAN ====================

import threading

def scan_and_import_audit(operation_id: str, request_data: dict, user_data: dict):
    from database import SessionLocal
    from api.audit_parser import parse_audit_report

    db = SessionLocal()
    tracker = create_progress_tracker(operation_id)
    ssh = None

    try:
        tracker.update(0, 100, "Connecting to server...")
        ssh = SSHConnection(
            host=request_data['hostname'],
            username=request_data['username'],
            password=request_data.get('password'),
            private_key=request_data.get('private_key'),
            port=request_data.get('port', 22)
        )
        success, message = ssh.connect(retry_delays=request_data.get('retry_delays'))
        if not success:
            tracker.error(f"SSH connection failed: {message}")
            db.close()
            raise Exception(f"SSH connection failed: {message}")

        tracker.update(10, 100, "Scanning directory for audit report files...")

        auth_mode = request_data.get('auth_mode', 'root')
        ssh_username = request_data.get('username', 'root')
        ssh_password = request_data.get('password', '')
        audit_report_dir = request_data.get('audit_report_dir', '/var/log/audit').strip()
        if not audit_report_dir:
            audit_report_dir = "/var/log/audit"

        # Find audit-email-*.txt files
        scan_cmd = f"ls -1 {_sanitize_path(audit_report_dir)}/"
        files_output, err_ls, ctx = _exec_remote(ssh, scan_cmd, ssh_username, ssh_password, timeout=30, auth_mode=auth_mode)
        logger.debug(f"[AUDIT] scan output: {len(files_output) if files_output else 0} chars")
        if err_ls:
            logger.warning(f"[AUDIT] scan stderr: {err_ls[:500]}")
        if files_output:
            logger.debug(f"[AUDIT] raw files (first 500): {files_output[:500]}")
            files_clean = files_output.replace('\r\n', '\n').replace('\r', '')
            filtered = [
                f.strip() for f in files_clean.split('\n')
                if f.strip() and 'audit-email-' in f and f.endswith('.txt')
            ]
            file_list_full = [f if f.startswith('/') else f"{audit_report_dir.rstrip('/')}/{f}" for f in filtered]
            files_output = "\n".join(file_list_full)
            logger.info(f"[AUDIT] Found {len(file_list_full)} audit report files")

        files_output = (files_output or '').strip()

        if not files_output:
            if err_ls:
                tracker.error(f"Failed to scan {audit_report_dir}: {err_ls[:200]}")
            else:
                tracker.error(f"No audit report files found in {audit_report_dir}")
            ssh.disconnect()
            db.close()
            return

        file_list = [f.strip() for f in files_output.split('\n') if f.strip()]
        total_files = len(file_list)
        logger.info(f"[AUDIT] Total files to process: {total_files}")

        imported_count = 0
        skipped_count = 0
        errors = []

        # Dedup check: load existing scan_dates for this server (by hostname OR ip_address)
        existing_records = db.query(AuditFileActivity.scan_date).filter(
            (AuditFileActivity.hostname == request_data['hostname']) |
            (AuditFileActivity.ip_address == request_data['hostname'])
        ).all()
        existing_dates = set(str(r.scan_date) for r in existing_records)

        tracker.update(15, 100, f"Found {total_files} files to import")

        from utils.batch_reader import build_batch_cmd, parse_batch_output
        file_contents: dict[str, str] = {}
        if auth_mode == "sudo" and ENABLE_SUDO_MODE:
            logger.info("[AUDIT-BATCH] Skipping batch read for sudo mode")
        else:
            try:
                batch_cmd = build_batch_cmd(file_list)
                if batch_cmd:
                    batch_out, batch_err, batch_ctx = _exec_remote(ssh, batch_cmd, ssh_username, ssh_password, timeout=300, auth_mode=auth_mode)
                    file_contents = parse_batch_output(batch_out)
                    if len(file_contents) != total_files:
                        logger.warning(f"[AUDIT-BATCH] Expected {total_files}, got {len(file_contents)}. Falling back.")
                        file_contents = {}
                    else:
                        logger.info(f"[AUDIT-BATCH] Read {len(file_contents)}/{total_files} files in 1 SSH command")
            except Exception as e:
                logger.warning(f"[AUDIT-BATCH] Batch read failed: {e}")

        for idx, file_path in enumerate(file_list):
            try:
                filename = file_path.split('/')[-1]

                if idx % 10 == 0 or idx == len(file_list) - 1:
                    progress_pct = 15 + int((idx / total_files) * 75)
                    tracker.update(progress_pct, 100, f"Processing {idx + 1}/{total_files}: {filename}")

                if imported_count > 0 and imported_count % 100 == 0:
                    db.commit()

                # Extract date from filename: audit-email-YYYY-MM-DD.txt
                date_match = re.search(r'audit-email-(\d{4}-\d{2}-\d{2})', filename)
                if not date_match:
                    errors.append(f"Invalid filename format: {filename}")
                    continue

                target_date = datetime.strptime(date_match.group(1), '%Y-%m-%d').date()

                # Dedup check
                if str(target_date) in existing_dates:
                    skipped_count += 1
                    continue

                content = file_contents.get(_sanitize_path(file_path), "")
                if not content:
                    read_cmd = f"cat {_sanitize_path(file_path)}"
                    content, err_cat, ctx_file = _exec_remote(ssh, read_cmd, ssh_username, ssh_password, timeout=60, auth_mode=auth_mode)
                    if not content:
                        errors.append(f"Failed to read {filename}")
                        continue

                parsed = parse_audit_report(content, request_data['hostname'], request_data['hostname'], target_date)

                actual_hostname = parsed.get('server_summary') or request_data['hostname']
                if actual_hostname in ('Server', '', None):
                    actual_hostname = request_data['hostname']

                if parsed['no_changes']:
                    record = AuditFileActivity(
                        hostname=actual_hostname,
                        ip_address=request_data['hostname'],
                        scan_date=target_date,
                        server_summary=parsed.get('server_summary'),
                        watched_directory=parsed.get('watched_directory'),
                        no_changes=True,
                        summary_total=0,
                        summary_files=0,
                        created_by=user_data.get('username', 'system'),
                        owner_role=user_data.get('role')
                    )
                    db.add(record)
                    imported_count += 1
                    continue

                for activity in parsed['activities']:
                    record = AuditFileActivity(
                        hostname=actual_hostname,
                        ip_address=request_data['hostname'],
                        scan_date=target_date,
                        server_summary=parsed.get('server_summary'),
                        watched_directory=parsed.get('watched_directory'),
                        no_changes=False,
                        summary_total=parsed.get('summary_total', 0),
                        summary_files=parsed.get('summary_files', 0),
                        username=activity.get('username'),
                        uid=activity.get('uid'),
                        process_name=activity.get('process_name'),
                        activity_type=activity.get('activity_type'),
                        level=activity.get('level'),
                        file_paths=activity.get('file_paths'),
                        total_files=activity.get('total_files', 0),
                        time_start=activity.get('time_start'),
                        time_end=activity.get('time_end'),
                        result=activity.get('result'),
                        raw_block=activity.get('raw_block'),
                        created_by=user_data.get('username', 'system'),
                        owner_role=user_data.get('role')
                    )
                    db.add(record)
                    imported_count += 1

            except Exception as e:
                logger.error(f"[AUDIT] Error processing {filename}: {e}")
                errors.append(f"Error processing {filename}: {str(e)}")

        db.commit()
        tracker.update(95, 100, "Saving results...")
        tracker.complete()

        progress_store[operation_id] = {
            **progress_store.get(operation_id, {}),
            "status": "completed",
            "completed_at": time.time(),
            "result": {
                "success": True,
                "summary": {
                    "server": request_data['hostname'],
                    "total_files": total_files,
                    "imported": imported_count,
                    "skipped_existing": skipped_count,
                    "errors": errors
                }
            }
        }

    except Exception as e:
        tracker.error(f"Failed to scan audit data: {str(e)}")
        raise
    finally:
        if ssh:
            ssh.disconnect()
        db.close()


# ==================== ENDPOINTS ====================

@router.post("/fetch", response_model=dict)
async def fetch_audit(
    request: FetchAuditRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    import uuid
    operation_id = str(uuid.uuid4())

    request_data = {
        'hostname': request.hostname,
        'username': request.username,
        'password': request.password,
        'private_key': request.private_key,
        'port': request.port,
        'audit_report_dir': request.audit_report_dir,
        'auth_mode': request.auth_mode
    }

    user_data = {'username': current_user.username, 'role': current_user.role}

    thread = threading.Thread(
        target=scan_and_import_audit,
        args=(operation_id, request_data, user_data),
        daemon=True
    )
    thread.start()

    log_activity(db, current_user.id, "CREATE", "audit", f"Initiated audit file scan for {request.hostname}")

    return {
        "operation_id": operation_id,
        "status": "started",
        "message": "Scan started. Poll /progress/{operation_id} for updates."
    }


@router.get("/progress/{operation_id}", response_model=dict)
async def get_scan_progress(
    operation_id: str,
    current_user: User = Depends(get_current_user)
):
    return get_progress(operation_id)


@router.post("/scan-all", response_model=dict)
async def batch_scan_all_servers(
    request: BatchScanRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    import uuid
    from concurrent.futures import ThreadPoolExecutor, as_completed

    operation_id = f"batch-{uuid.uuid4()}"
    user_data = {'username': current_user.username, 'role': current_user.role}
    server_list = [s.strip() for s in request.servers if s.strip()]

    if not server_list:
        raise HTTPException(status_code=400, detail="No servers provided")

    log_activity(db, current_user.id, "CREATE", "audit", f"Bulk audit scan initiated for {len(server_list)} servers")

    progress_store[operation_id] = {
        "operation_id": operation_id,
        "status": "running",
        "total": len(server_list),
        "completed": 0,
        "failed": 0,
        "current": server_list[0] if server_list else "",
        "errors": [],
        "results": {},
        "started_at": utcnow().isoformat(),
        "started_by": current_user.username,
    }

    def _scan_single_server(hostname: str) -> dict:
        from database import SessionLocal
        try:
            request_data = {
                'hostname': hostname,
                'username': request.username,
                'private_key': request.private_key,
                'password': request.password,
                'port': request.port,
                'audit_report_dir': request.audit_report_dir,
                'auth_mode': request.auth_mode,
                'retry_delays': [2, 5, 10],
            }
            single_op_id = f"{operation_id}-{hostname}"
            scan_and_import_audit(single_op_id, request_data, user_data)
            return {"hostname": hostname, "success": True}
        except Exception as exc:
            return {"hostname": hostname, "success": False, "error": str(exc)}

    def _run_batch():
        with ThreadPoolExecutor(max_workers=request.max_workers) as pool:
            futures = {pool.submit(_scan_single_server, h): h for h in server_list}
            for future in as_completed(futures):
                result = future.result()
                hostname = result["hostname"]
                success = result["success"]

                tracker = progress_store.get(operation_id)
                if tracker:
                    if success:
                        tracker["completed"] = tracker.get("completed", 0) + 1
                    else:
                        tracker["failed"] = tracker.get("failed", 0) + 1
                        tracker["errors"].append(f"{hostname}: {result.get('error', 'unknown')}")
                    tracker["results"][hostname] = "success" if success else "failed"
                    tracker["current"] = hostname
                    if tracker["completed"] + tracker["failed"] >= tracker["total"]:
                        tracker["status"] = "completed"
                        tracker["completed_at"] = utcnow().isoformat()

    batch_thread = threading.Thread(target=_run_batch, daemon=True)
    batch_thread.start()

    return {
        "operation_id": operation_id,
        "status": "started",
        "total_servers": len(server_list),
        "max_workers": request.max_workers,
        "message": f"Parallel scan started for {len(server_list)} servers. Poll /progress/{operation_id} for updates.",
    }


@router.get("/events", response_model=dict)
async def list_audit_events(
    hostname: str = Query(None, max_length=100),
    username: str = Query(None, max_length=100),
    process_name: str = Query(None, max_length=100),
    level: str = Query(None, max_length=20),
    result: str = Query(None, max_length=20),
    from_date: str = Query(None),
    to_date: str = Query(None),
    search_file: str = Query(None, max_length=200),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = _apply_rbac(db.query(AuditFileActivity), current_user)

    if hostname:
        query = query.filter(AuditFileActivity.hostname.ilike(f"%{escape_like(hostname)}%", escape="\\"))
    if username:
        query = query.filter(AuditFileActivity.username.ilike(f"%{escape_like(username)}%", escape="\\"))
    if process_name:
        query = query.filter(AuditFileActivity.process_name.ilike(f"%{escape_like(process_name)}%", escape="\\"))
    if level:
        query = query.filter(AuditFileActivity.level == level.upper())
    if result:
        query = query.filter(AuditFileActivity.result.ilike(f"%{escape_like(result)}%", escape="\\"))
    if from_date:
        try:
            fd = datetime.strptime(from_date, '%Y-%m-%d').date()
            query = query.filter(AuditFileActivity.scan_date >= fd)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid from_date format. Use YYYY-MM-DD")
    if to_date:
        try:
            td = datetime.strptime(to_date, '%Y-%m-%d').date()
            query = query.filter(AuditFileActivity.scan_date <= td)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid to_date format. Use YYYY-MM-DD")
    if search_file:
        query = query.filter(AuditFileActivity.file_paths.cast(db.String).ilike(f"%{escape_like(search_file)}%", escape="\\"))

    total = query.count()
    records = query.order_by(AuditFileActivity.scan_date.desc(), AuditFileActivity.id.desc()) \
        .offset((page - 1) * page_size).limit(page_size).all()

    return {
        "data": [_audit_to_dict(r) for r in records],
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total": total,
            "total_pages": (total + page_size - 1) // page_size
        }
    }


@router.get("/events/{event_id}", response_model=dict)
async def get_audit_event(
    event_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    record = _apply_rbac(db.query(AuditFileActivity), current_user).filter(
        AuditFileActivity.id == event_id
    ).first()

    if not record:
        raise HTTPException(status_code=404, detail="Audit event not found")

    result = _audit_to_dict(record)
    result['raw_block'] = record.raw_block
    return result


@router.get("/servers", response_model=dict)
async def list_audit_servers(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=10000),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = _apply_rbac(db.query(
        AuditFileActivity.hostname,
        func.max(AuditFileActivity.ip_address).label('ip_address'),
        func.count(AuditFileActivity.id).label('total_events'),
        func.max(AuditFileActivity.scan_date).label('last_scan'),
        func.count(case((AuditFileActivity.no_changes == False, 1))).label('total_activities'),
    ).group_by(AuditFileActivity.hostname), current_user)

    total = db.query(func.count(func.distinct(AuditFileActivity.hostname))).select_from(
        _apply_rbac(db.query(AuditFileActivity.hostname), current_user).subquery()
    ).scalar() or 0

    servers = query.order_by(AuditFileActivity.hostname).offset((page - 1) * page_size).limit(page_size).all()

    return {
        "data": [
            {
                "hostname": s.hostname,
                "ip_address": s.ip_address or '',
                "total_events": s.total_events,
                "last_scan": s.last_scan.isoformat() if s.last_scan else None,
                "total_activities": s.total_activities,
            }
            for s in servers
        ],
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total": total,
            "total_pages": (total + page_size - 1) // page_size
        }
    }


@router.get("/servers/{hostname}", response_model=dict)
async def get_server_audit(
    hostname: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    records = _apply_rbac(db.query(AuditFileActivity), current_user).filter(
        AuditFileActivity.hostname == hostname
    ).order_by(AuditFileActivity.scan_date.desc()).all()

    if not records:
        raise HTTPException(status_code=404, detail=f"No audit data found for {hostname}")

    summary = {
        "hostname": hostname,
        "ip_address": records[0].ip_address if records and records[0].ip_address else hostname,
        "total_events": len(records),
        "total_activities": sum(1 for r in records if not r.no_changes),
        "no_change_days": sum(1 for r in records if r.no_changes),
        "unique_users": len(set(r.username for r in records if r.username)),
        "last_scan": max(r.scan_date for r in records).isoformat() if records else None,
        "earliest_scan": min(r.scan_date for r in records).isoformat() if records else None,
    }

    return {
        "summary": summary,
        "events": [_audit_to_dict(r) for r in records],
    }


@router.get("/dashboard/stats", response_model=dict)
async def get_audit_dashboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    base = _apply_rbac(db.query(AuditFileActivity), current_user)

    total = base.count()
    total_servers = db.query(func.count(func.distinct(AuditFileActivity.hostname))).select_from(
        _apply_rbac(db.query(AuditFileActivity.hostname), current_user).subquery()
    ).scalar() or 0

    recent = base.filter(
        AuditFileActivity.scan_date >= date.today() - timedelta(days=7)
    ).count()

    with_activity = base.filter(AuditFileActivity.no_changes == False).count()

    return {
        "total_events": total,
        "total_servers": total_servers,
        "recent_7_days": recent,
        "with_activity": with_activity,
    }


@router.delete("/servers/{hostname}", response_model=dict)
async def delete_server_audit(
    hostname: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role != "superadmin":
        raise HTTPException(status_code=403, detail="Superadmin access required")

    deleted = db.query(AuditFileActivity).filter(
        AuditFileActivity.hostname == hostname
    ).delete(synchronize_session='fetch')

    db.commit()

    log_activity(db, current_user.id, "DELETE", "audit", f"Deleted {deleted} audit records for server {hostname}")

    return {
        "status": "success",
        "message": f"Deleted {deleted} records for server {hostname}",
        "deleted_count": deleted
    }


@router.get("/export-data", response_model=dict)
async def export_audit_data(
    hostname: Optional[str] = Query(None, max_length=255),
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = _apply_rbac(db.query(AuditFileActivity), current_user)

    if hostname:
        query = query.filter(AuditFileActivity.hostname == hostname)
    if from_date:
        try:
            fd = datetime.strptime(from_date, '%Y-%m-%d').date()
            query = query.filter(AuditFileActivity.scan_date >= fd)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid from_date format. Use YYYY-MM-DD")
    if to_date:
        try:
            td = datetime.strptime(to_date, '%Y-%m-%d').date()
            query = query.filter(AuditFileActivity.scan_date <= td)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid to_date format. Use YYYY-MM-DD")
    if from_date and to_date:
        try:
            fd = datetime.strptime(from_date, '%Y-%m-%d').date()
            td = datetime.strptime(to_date, '%Y-%m-%d').date()
            if (td - fd).days > 365:
                raise HTTPException(status_code=400, detail="Date range too large. Maximum 365 days allowed")
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format")

    total = query.count()
    records = query.order_by(AuditFileActivity.scan_date.desc(), AuditFileActivity.id.desc()).limit(5000).all()

    log_activity(db, current_user.id, "EXPORT", "audit", f"Exported {len(records)} audit records")

    return {
        "data": [_audit_to_dict(r) for r in records],
        "total": total,
    }


@router.get("/export", response_model=dict)
async def export_audit_pdf(
    from_date: str = Query(...),
    to_date: str = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        start_date = datetime.strptime(from_date, "%Y-%m-%d").date()
        end_date = datetime.strptime(to_date, "%Y-%m-%d").date()
        if start_date > end_date:
            raise HTTPException(status_code=400, detail="from_date must be before or equal to to_date")
        if (end_date - start_date).days > 365:
            raise HTTPException(status_code=400, detail="Date range too large. Maximum 365 days allowed")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")

    base = _apply_rbac(db.query(AuditFileActivity), current_user).filter(
        AuditFileActivity.scan_date >= start_date,
        AuditFileActivity.scan_date <= end_date,
    )
    records = base.order_by(AuditFileActivity.scan_date, AuditFileActivity.hostname).all()

    if not records:
        raise HTTPException(status_code=404, detail="No audit data found for the selected date range")

    server_summary = {}
    for r in records:
        key = (r.hostname, str(r.scan_date))
        if key not in server_summary:
            server_summary[key] = {
                "hostname": r.hostname,
                "date": str(r.scan_date),
                "total_events": 0,
                "activities": 0,
                "no_change_days": 0,
                "files_affected": 0,
            }
        ss = server_summary[key]
        ss["total_events"] += 1
        if r.no_changes:
            ss["no_change_days"] += 1
        else:
            ss["activities"] += 1
            ss["files_affected"] += r.total_files or 0

    log_activity(db, current_user.id, "EXPORT", "audit",
                 f"Exported audit report (PDF) from {from_date} to {to_date} ({len(records)} records)")
    db.commit()

    return {
        "records": list(server_summary.values()),
        "total": len(records),
        "total_servers": len(set(r.hostname for r in records)),
        "total_events": len(records),
        "from_date": from_date,
        "to_date": to_date,
    }
