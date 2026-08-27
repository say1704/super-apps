"""SSH Report API - SSH login audit from server report files"""
from utils.timezone import utcnow, to_iso
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, case
from datetime import datetime, date, timedelta, timezone
from typing import List, Optional
from pydantic import BaseModel, field_validator
import re
import time
import os
import logging
import shlex

logger = logging.getLogger("ssh_report")

ENABLE_SUDO_MODE = os.getenv("ENABLE_SUDO_MODE", "false").lower() == "true"

# Binary path map for sudo mode — sudo may not inherit user PATH
_CMD_MAP = {
    'ls': '/usr/bin/ls',
    'cat': '/usr/bin/cat',
}

from database import get_db
from models import SSHLoginLog, User
from api.dependencies import get_current_user, log_activity
from utils.ssh_handler import SSHConnection
from utils.progress_tracker import create_progress_tracker, get_progress, progress_store


def _apply_ssh_rbac(query, current_user: User):
    """RBAC: superadmin sees all; others see records with matching owner_role."""
    if current_user.role != "superadmin":
        return query.filter(SSHLoginLog.owner_role == current_user.role)
    return query

router = APIRouter(prefix="/ssh-report", tags=["SSH Report"])


def _sanitize_path(path: str) -> str:
    """Remove shell metacharacters from paths used in remote commands."""
    return re.sub(r'[^a-zA-Z0-9/_.\-]', '', path)


def _ssh_login_to_dict(record: SSHLoginLog) -> dict:
    """Convert SSHLoginLog ORM object to dict for JSON serialization."""
    return {
        "id": record.id,
        "hostname": record.hostname,
        "ip_address": record.ip_address,
        "login_timestamp": record.login_timestamp.isoformat() if record.login_timestamp else None,
        "username": record.username,
        "source_ip": record.source_ip,
        "auth_method": record.auth_method,
        "status": record.status,
        "duration": record.duration,
        "severity": record.severity,
        "scan_date": record.scan_date.isoformat() if record.scan_date else None,
        "created_at": to_iso(record.created_at),
        "created_by": record.created_by,
    }


def _build_command(cmd: str, username: str, password: str, auth_mode: str = "root") -> tuple:
    """Build final command for ssh.ssh.exec_command().
    - auth_mode='root' → bash -c (run as SSH user)
    - auth_mode='sudo' → printf | sudo -S (elevate privileges)
    """
    use_sudo = (auth_mode == "sudo") and ENABLE_SUDO_MODE

    if use_sudo:
        resolved = cmd
        for prefix, full in _CMD_MAP.items():
            if cmd.startswith(prefix):
                resolved = full + cmd[len(prefix):]
                break
        sudo_cmd = f"printf '%s\\n' {shlex.quote(password)} | sudo -S -p '' {resolved}"
        return (sudo_cmd, True)

    return (f"bash -c '{cmd}'", False)


def _exec_remote(ssh: SSHConnection, cmd: str, username: str, password: str, timeout: int = 30, auth_mode: str = "root") -> tuple:
    """Execute command with sudo support. Returns (stdout, stderr, context)."""
    final_cmd, use_sudo = _build_command(cmd, username, password, auth_mode)
    mode = 'root' if auth_mode == 'root' else ('sudo' if use_sudo else 'direct')
    context = {'mode': mode, 'raw_cmd': final_cmd, 'sudo_failed': False}

    try:
        logger.debug(f"mode={mode}, cmd={final_cmd[:200]}")
        use_pty = use_sudo
        stdin, stdout, stderr = ssh.ssh.exec_command(final_cmd, timeout=timeout, get_pty=use_pty)

        stdin.channel.settimeout(timeout)
        out = stdout.read().decode('utf-8', errors='ignore').strip()
        err = stderr.read().decode('utf-8', errors='ignore').strip()

        if out:
            logger.debug(f"stdout_preview: {out[:200]}")
        if err:
            logger.warning(f"stderr: {err[:200]}")
    except Exception as e:
        out, err = '', str(e)
        exc_type = type(e).__name__
        logger.error(f"SSH exec failed [{exc_type}]: {e} (host={ssh.host}, mode={mode}, cmd={final_cmd[:120]})")

    return (out, err, context)


# ==================== SSH REPORT PARSER ====================

def _normalize_ts(dt) -> str:
    """Normalize datetime to string without microseconds for consistent duplicate detection."""
    if dt is None:
        return ''
    if hasattr(dt, 'replace'):
        dt = dt.replace(microsecond=0)
    return str(dt)


def _parse_month_day_time(time_str: str, target_date: date) -> Optional[datetime]:
    """Parse 'May 24 01:21:10' into datetime using year from target_date."""
    try:
        time_str = time_str.strip()
        parts = time_str.split()
        if len(parts) < 3:
            return None
        month_str = parts[0]
        day = int(parts[1])
        time_parts = parts[2].split(':')
        hour = int(time_parts[0])
        minute = int(time_parts[1])
        second = int(time_parts[2]) if len(time_parts) > 2 else 0

        month_map = {
            'Jan': 1, 'Feb': 2, 'Mar': 3, 'Apr': 4, 'May': 5, 'Jun': 6,
            'Jul': 7, 'Aug': 8, 'Sep': 9, 'Oct': 10, 'Nov': 11, 'Dec': 12
        }
        month = month_map.get(month_str)
        if not month:
            return None

        return datetime(target_date.year, month, day, hour, minute, second)
    except (ValueError, IndexError):
        return None


def parse_ssh_report(content: str, hostname: str, ip_address: str, target_date: date) -> dict:
    """
    Parse SSH login report file (ASCII table format).

    Expected sections:
    [1] RINGKASAN AKTIVITAS
    [2] LOGIN GAGAL
    [3] LOGIN BERHASIL (4 columns: Waktu Login | User | IP Address | Metode)
    [4] ACTIVE SESSION (skipped)
    [5] TOP USER LOGIN
    [6] TOP FAILED IP
    """
    result = {
        'hostname': hostname,
        'ip_address': ip_address,
        'scan_date': str(target_date),
        'summary': {'total_success': 0, 'total_failed': 0},
        'successful_logins': [],
        'failed_logins': [],
        'top_users': [],
        'top_failed_ips': [],
    }

    lines = content.strip().split('\n')
    current_section = None
    sections_found = set()

    for line in lines:
        section_match = re.match(r'^\[(\d)\]', line)
        if section_match:
            current_section = int(section_match.group(1))
            sections_found.add(current_section)
            continue

        if not current_section:
            continue

        separator_match = re.match(r'^\+[-+]+\+$', line.strip())
        if separator_match:
            continue

        header_match = re.match(r'^\|.*\|$', line.strip())
        if header_match and any(h in line for h in ['Waktu Login', 'IP Address', 'User', 'Total', 'Metode', 'Durasi', 'Severity', 'Status']):
            continue

        if current_section == 1:
            success_match = re.search(r'Total Login Berhasil\s*:\s*(\d+)', line)
            if success_match:
                result['summary']['total_success'] = int(success_match.group(1))
            failed_match = re.search(r'Total Login Gagal\s*:\s*(\d+)', line)
            if failed_match:
                result['summary']['total_failed'] = int(failed_match.group(1))

        elif current_section == 2:
            parts = [p.strip() for p in line.split('|') if p.strip()]
            if len(parts) >= 6:
                login_time = _parse_month_day_time(parts[0], target_date)
                result['failed_logins'].append({
                    'login_timestamp': login_time,
                    'source_ip': parts[1],
                    'username': parts[2],
                    'severity': parts[4],
                    'status': parts[5],
                })
            elif len(parts) >= 5:
                result['failed_logins'].append({
                    'login_timestamp': None,
                    'source_ip': parts[0],
                    'username': parts[1],
                    'total': int(parts[2]) if parts[2].isdigit() else 0,
                    'severity': parts[3],
                    'status': parts[4],
                })

        elif current_section == 3:
            parts = [p.strip() for p in line.split('|') if p.strip()]
            if len(parts) >= 4:
                login_time = _parse_month_day_time(parts[0], target_date)
                result['successful_logins'].append({
                    'login_timestamp': login_time,
                    'username': parts[1],
                    'source_ip': parts[2],
                    'auth_method': parts[3],
                    'duration': '',
                })

        elif current_section == 5:
            parts = [p.strip() for p in line.split('|') if p.strip()]
            if len(parts) >= 2 and parts[1].isdigit():
                result['top_users'].append({
                    'username': parts[0],
                    'total': int(parts[1]),
                })

        elif current_section == 6:
            parts = [p.strip() for p in line.split('|') if p.strip()]
            if len(parts) >= 2 and parts[1].isdigit():
                result['top_failed_ips'].append({
                    'source_ip': parts[0],
                    'total': int(parts[1]),
                })

    total_extracted = len(result['successful_logins']) + len(result['failed_logins'])
    logger.info(
        f"[PARSE] {hostname}/{target_date}: {len(lines)} lines, "
        f"sections={sorted(sections_found)}, "
        f"success={len(result['successful_logins'])}, "
        f"failed={len(result['failed_logins'])}, "
        f"top_users={len(result['top_users'])}, "
        f"top_ips={len(result['top_failed_ips'])}"
    )

    if total_extracted == 0 and len(lines) > 2:
        logger.warning(
            f"[PARSE] File for {hostname}/{target_date} has {len(lines)} lines "
            f"but 0 records extracted. Sections found: {sorted(sections_found)}. "
            f"First 5 non-empty lines: {[l for l in lines if l.strip()][:5]}"
        )

    return result


# ==================== REQUEST MODELS ====================

class FetchSSHReportRequest(BaseModel):
    """Request model for fetching SSH report data"""
    hostname: str
    username: str
    password: Optional[str] = None
    private_key: Optional[str] = None
    port: int = 22
    ssh_report_dir: str = "/var/log/sa"
    auth_mode: Optional[str] = "root"
    mode: Optional[str] = "auto"

    @field_validator("mode")
    @classmethod
    def validate_mode(cls, v: str) -> str:
        v = v.strip().lower()
        if v not in ("auto", "daily", "weekly", "monthly"):
            raise ValueError("Mode must be auto, daily, weekly, or monthly")
        return v


class BatchScanRequest(BaseModel):
    """Request model for parallel bulk scan"""
    servers: List[str]
    username: str
    private_key: Optional[str] = None
    password: Optional[str] = None
    port: int = 22
    ssh_report_dir: str = "/var/log/sa"
    auth_mode: Optional[str] = "sudo"
    max_workers: int = 50
    mode: Optional[str] = "auto"

    @field_validator("mode")
    @classmethod
    def validate_mode(cls, v: str) -> str:
        v = v.strip().lower()
        if v not in ("auto", "daily", "weekly", "monthly"):
            raise ValueError("Mode must be auto, daily, weekly, or monthly")
        return v


# ==================== BACKGROUND SCAN ====================

import threading

def scan_and_import_ssh_logs(operation_id: str, request_data: dict, user_data: dict):
    """Background task to scan and import SSH report data with progress tracking"""
    from database import SessionLocal

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

        tracker.update(10, 100, "Scanning directory for report files...")

        auth_mode = request_data.get('auth_mode', 'root')
        ssh_username = request_data.get('username', 'root')
        logger.info(f"[SSH_REPORT] auth_mode={auth_mode}, username={ssh_username}, ENABLE_SUDO={ENABLE_SUDO_MODE}")
        ssh_password = request_data.get('password', '')

        ssh_report_dir = request_data['ssh_report_dir']

        scan_cmd = f"ls -1 {_sanitize_path(ssh_report_dir)}/"
        files_output, err_ls, ctx = _exec_remote(ssh, scan_cmd, ssh_username, ssh_password, timeout=30, auth_mode=auth_mode)
        logger.debug(f"[SSH_REPORT] scan output: {len(files_output) if files_output else 0} chars")
        if err_ls:
            logger.warning(f"[SSH_REPORT] scan stderr: {err_ls[:500]}")
        if files_output:
            logger.debug(f"[SSH_REPORT] raw files: {files_output[:1000]}")
            filtered = [
                f for f in files_output.split('\n')
                if '_ssh_login_' in f and '.log' in f
            ]
            file_list_full = [f if f.startswith('/') else f"{ssh_report_dir.rstrip('/')}/{f}" for f in filtered]
            files_output = "\n".join(file_list_full)
            logger.info(f"Found {len(file_list_full)} SSH report files")

        files_output = (files_output or '').strip()

        if not files_output:
            if err_ls:
                tracker.error(f"Failed to scan {request_data['ssh_report_dir']}: {err_ls[:200]}")
            else:
                tracker.error(f"No SSH report files found in {request_data['ssh_report_dir']}")
            ssh.disconnect()
            db.close()
            return

        file_list = [f.strip() for f in files_output.split('\n') if f.strip()]
        total_files = len(file_list)
        logger.info(f"Total files to process: {total_files}")

        imported_count = 0
        skipped_count = 0
        errors = []

        # Scan mode date-window filter (auto = no filter, preserves existing behavior)
        mode = request_data.get('mode', 'auto')
        days_to_check = 0
        if mode == 'daily':
            days_to_check = 7
        elif mode == 'weekly':
            days_to_check = 30
        elif mode == 'monthly':
            days_to_check = 365

        cutoff_date = date.today() - timedelta(days=days_to_check) if days_to_check > 0 else None

        skipped_old = 0
        if cutoff_date is not None:
            filtered_files = []
            for file_path in file_list:
                filename = file_path.split('/')[-1]
                parts = filename.replace('.log', '').split('_ssh_login_', 1)
                if len(parts) == 2:
                    try:
                        file_date = datetime.strptime(parts[0], '%Y%m%d').date()
                        if file_date < cutoff_date:
                            skipped_old += 1
                            continue
                    except ValueError:
                        pass
                filtered_files.append(file_path)
            file_list = filtered_files
            total_files = len(file_list)
            logger.info(f"[SSH_REPORT] Scan mode: {mode}, cutoff: {cutoff_date}, files after filter: {total_files}, skipped old: {skipped_old}")
        else:
            logger.info(f"[SSH_REPORT] Scan mode: auto (no date filter)")

        hostnames_in_files = set()
        for file_path in file_list:
            filename = file_path.split('/')[-1]
            parts = filename.replace('.log', '').split('_ssh_login_', 1)
            if len(parts) == 2:
                hostnames_in_files.add(parts[1].strip())

        if hostnames_in_files:
            existing_records = db.query(SSHLoginLog.hostname, SSHLoginLog.login_timestamp, SSHLoginLog.username, SSHLoginLog.source_ip, SSHLoginLog.status, SSHLoginLog.duration).filter(
                SSHLoginLog.hostname.in_(hostnames_in_files)
            ).all()
            existing_set = {(r.hostname, _normalize_ts(r.login_timestamp), r.username, r.source_ip, r.duration or '', r.status) for r in existing_records}
            logger.debug(f"Loaded {len(existing_records)} existing records")
        else:
            existing_set = set()

        tracker.update(15, 100, f"Found {total_files} files to import ({len(existing_set)} duplicates in DB)")

        # Batch read all files via single SSH command (skip for sudo mode — batch uses ; which only elevates first command via sudo)
        from utils.batch_reader import build_batch_cmd, parse_batch_output
        file_contents: dict[str, str] = {}
        if auth_mode == "sudo" and ENABLE_SUDO_MODE:
            logger.info("[BATCH] Skipping batch read for sudo mode, using individual reads")
        else:
            try:
                batch_cmd = build_batch_cmd(file_list)
                if batch_cmd:
                    batch_out, batch_err, batch_ctx = _exec_remote(ssh, batch_cmd, ssh_username, ssh_password, timeout=300, auth_mode=auth_mode)
                    file_contents = parse_batch_output(batch_out)
                    if len(file_contents) != total_files:
                        logger.warning(f"[BATCH] Expected {total_files} files, got {len(file_contents)}. Falling back to individual reads.")
                        file_contents = {}
                    else:
                        logger.info(f"[BATCH] Read {len(file_contents)}/{total_files} files in 1 SSH command")
            except Exception as e:
                logger.warning(f"[BATCH] Batch read failed, falling back to individual reads: {e}")

        for idx, file_path in enumerate(file_list):
            try:
                filename = file_path.split('/')[-1]

                if idx % 10 == 0 or idx == len(file_list) - 1:
                    progress_pct = 15 + int((idx / total_files) * 75)
                    tracker.update(progress_pct, 100, f"Processing {idx + 1}/{total_files}: {filename}")

                if imported_count > 0 and imported_count % 100 == 0:
                    db.commit()
                    logger.info(f"[BATCH-COMMIT] SSH Report: {imported_count} records committed")

                parts = filename.replace('.log', '').split('_ssh_login_', 1)
                if len(parts) != 2:
                    errors.append(f"Invalid filename format: {filename}")
                    continue

                date_prefix = parts[0]
                server_hostname = parts[1].strip()
                target_date = datetime.strptime(date_prefix, '%Y%m%d').date()

                # Get content from batch result or fall back to individual read
                content = file_contents.get(_sanitize_path(file_path), "")
                if not content:
                    read_cmd = f"cat {_sanitize_path(file_path)}"
                    content, err_cat, ctx_file = _exec_remote(ssh, read_cmd, ssh_username, ssh_password, timeout=60, auth_mode=auth_mode)
                    if not content:
                        errors.append(f"Failed to read {filename}")
                        continue

                parsed = parse_ssh_report(content, server_hostname, request_data['hostname'], target_date)

                if not parsed['successful_logins'] and not parsed['failed_logins']:
                    logger.warning(
                        f"[IMPORT] No records extracted from {filename} for {server_hostname}. "
                        f"Content preview: {content[:500]}"
                    )

                for login in parsed['successful_logins']:
                    if login.get('login_timestamp'):
                        dup_key = (server_hostname, _normalize_ts(login['login_timestamp']), login['username'], login['source_ip'], '', 'success')
                        if dup_key in existing_set:
                            skipped_count += 1
                            continue
                        record = SSHLoginLog(
                            hostname=server_hostname,
                            ip_address=request_data['hostname'],
                            login_timestamp=login['login_timestamp'],
                            username=login['username'],
                            source_ip=login['source_ip'],
                            auth_method=login.get('auth_method', 'unknown'),
                            status='success',
                            duration='',
                            severity='LOW',
                            scan_date=target_date,
                            created_by=user_data.get('username', 'system'),
                            owner_role=user_data.get('role')
                        )
                        db.add(record)
                        existing_set.add(dup_key)
                        imported_count += 1

                for failed in parsed['failed_logins']:
                    if failed.get('login_timestamp'):
                        dup_key = (server_hostname, _normalize_ts(failed['login_timestamp']), failed['username'], failed['source_ip'], '', 'failed')
                        if dup_key in existing_set:
                            skipped_count += 1
                            continue

                        record = SSHLoginLog(
                            hostname=server_hostname,
                            ip_address=request_data['hostname'],
                            login_timestamp=failed['login_timestamp'],
                            username=failed['username'],
                            source_ip=failed['source_ip'],
                            auth_method='password',
                            status='failed',
                            duration='',
                            severity=failed.get('severity', 'LOW'),
                            scan_date=target_date,
                            created_by=user_data.get('username', 'system'),
                            owner_role=user_data.get('role')
                        )
                        db.add(record)
                        existing_set.add(dup_key)
                        imported_count += 1
                    else:
                        for i in range(failed.get('total', 0)):
                            fake_ts = datetime(target_date.year, target_date.month, target_date.day, 0, 0, i)
                            duplicate_key = (server_hostname, _normalize_ts(fake_ts), failed['username'], failed['source_ip'], '', 'failed')
                            if duplicate_key in existing_set:
                                skipped_count += 1
                                continue

                            record = SSHLoginLog(
                                hostname=server_hostname,
                                ip_address=request_data['hostname'],
                                login_timestamp=fake_ts,
                                username=failed['username'],
                                source_ip=failed['source_ip'],
                                auth_method='password',
                                status='failed',
                                duration='',
                                severity=failed.get('severity', 'LOW'),
                                scan_date=target_date,
                                created_by=user_data.get('username', 'system'),
                                owner_role=user_data.get('role')
                            )
                            db.add(record)
                            existing_set.add(duplicate_key)
                            imported_count += 1

            except Exception as e:
                logger.error(f"Error processing {filename}: {e}")
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
                    "mode": mode or 'auto',
                    "days_checked": days_to_check,
                    "cutoff_date": cutoff_date.isoformat() if cutoff_date else None,
                    "total_files": total_files,
                    "imported": imported_count,
                    "skipped_existing": skipped_count,
                    "skipped_old": skipped_old,
                    "errors": errors
                }
            }
        }

    except Exception as e:
        tracker.error(f"Failed to scan SSH report data: {str(e)}")
        raise
    finally:
        if ssh:
            ssh.disconnect()
        db.close()


# ==================== ENDPOINTS ====================

@router.post("/fetch", response_model=dict)
async def fetch_ssh_logs(
    request: FetchSSHReportRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Start SSH report scan with progress tracking."""
    import uuid

    operation_id = str(uuid.uuid4())

    request_data = {
        'hostname': request.hostname,
        'username': request.username,
        'password': request.password,
        'private_key': request.private_key,
        'port': request.port,
        'ssh_report_dir': request.ssh_report_dir,
        'auth_mode': request.auth_mode,
        'mode': request.mode
    }

    user_data = {'username': current_user.username, 'role': current_user.role}

    thread = threading.Thread(
        target=scan_and_import_ssh_logs,
        args=(operation_id, request_data, user_data),
        daemon=True
    )
    thread.start()

    log_activity(db, current_user.id, "CREATE", "ssh-report", f"Initiated SSH report scan for {request.hostname}")

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
    """Get progress of SSH report scan operation"""
    progress = get_progress(operation_id)
    return progress


@router.post("/scan-all", response_model=dict)
async def batch_scan_all_servers(
    request: BatchScanRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Parallel bulk scan of multiple servers."""
    import uuid
    from concurrent.futures import ThreadPoolExecutor, as_completed

    operation_id = f"batch-{uuid.uuid4()}"

    user_data = {'username': current_user.username, 'role': current_user.role}
    server_list = [s.strip() for s in request.servers if s.strip()]

    if not server_list:
        raise HTTPException(status_code=400, detail="No servers provided")

    log_activity(db, current_user.id, "CREATE", "ssh-report", f"Bulk SSH scan initiated for {len(server_list)} servers")

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
                'ssh_report_dir': request.ssh_report_dir,
                'auth_mode': request.auth_mode,
                'mode': request.mode or 'auto',
                'retry_delays': [2, 5, 10],
            }
            single_op_id = f"{operation_id}-{hostname}"
            scan_and_import_ssh_logs(single_op_id, request_data, user_data)
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
        "message": f"Parallel scan started for {len(server_list)} servers.",
    }


@router.get("/dashboard/stats", response_model=dict)
async def get_dashboard_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get dashboard statistics for SSH report module"""

    total_servers = _apply_ssh_rbac(db.query(SSHLoginLog.hostname), current_user).distinct().count()

    success_count = _apply_ssh_rbac(db.query(func.count(SSHLoginLog.id)), current_user).filter(
        SSHLoginLog.status == 'success'
    ).scalar() or 0

    failed_count = _apply_ssh_rbac(db.query(func.count(SSHLoginLog.id)), current_user).filter(
        SSHLoginLog.status == 'failed'
    ).scalar() or 0

    unique_ips = _apply_ssh_rbac(db.query(SSHLoginLog.source_ip), current_user).distinct().count()

    last_scan = _apply_ssh_rbac(db.query(SSHLoginLog), current_user).order_by(SSHLoginLog.created_at.desc()).first()

    return {
        "total_servers": total_servers,
        "success_count": success_count,
        "failed_count": failed_count,
        "unique_ips": unique_ips,
        "last_updated": last_scan.created_at.isoformat() if last_scan and last_scan.created_at else None,
    }


def _escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


MAX_EXPORT_RECORDS = 5000


@router.get("/export-data", response_model=dict)
async def export_ssh_report_data(
    hostname: Optional[str] = Query(None, max_length=255),
    search: Optional[str] = Query(None, max_length=255),
    ip_address: Optional[str] = Query(None, max_length=45),
    status: Optional[str] = Query(None, pattern="^(success|failed)$"),
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(5000, ge=1, le=MAX_EXPORT_RECORDS),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = _apply_ssh_rbac(db.query(SSHLoginLog), current_user)

    if hostname:
        query = query.filter(SSHLoginLog.hostname == hostname)
    if search:
        escaped = _escape_like(search)
        query = query.filter(
            (SSHLoginLog.hostname.ilike(f"%{escaped}%", escape="\\")) |
            (SSHLoginLog.ip_address.ilike(f"%{escaped}%", escape="\\"))
        )
    if ip_address:
        query = query.filter(SSHLoginLog.ip_address == ip_address)
    if status:
        query = query.filter(SSHLoginLog.status == status)
    if from_date:
        try:
            from_dt = datetime.fromisoformat(from_date)
            query = query.filter(SSHLoginLog.login_timestamp >= from_dt)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid from_date format")
    if to_date:
        try:
            to_dt = datetime.fromisoformat(to_date) + timedelta(days=1)
            query = query.filter(SSHLoginLog.login_timestamp < to_dt)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid to_date format")
    if from_date and to_date:
        try:
            fd = datetime.fromisoformat(from_date).date()
            td = datetime.fromisoformat(to_date).date()
            if (td - fd).days > 365:
                raise HTTPException(status_code=400, detail="Date range too large. Maximum 365 days allowed")
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format")

    total = query.count()
    records = query.order_by(SSHLoginLog.login_timestamp.desc()).offset((page - 1) * page_size).limit(page_size).all()

    log_activity(db, current_user.id, "EXPORT", "ssh-report", f"Exported {len(records)} SSH login records")

    return {
        "data": [_ssh_login_to_dict(r) for r in records],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/servers", response_model=dict)
async def get_all_servers(
    search: Optional[str] = Query(None, description="Search hostname or IP address"),
    status: Optional[str] = Query(None, pattern="^(failed|success)$", description="Filter by login status"),
    from_date: Optional[str] = Query(None, description="Filter by login timestamp (start)"),
    to_date: Optional[str] = Query(None, description="Filter by login timestamp (end)"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=10000),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get list of all servers with aggregated SSH login stats filtered by date range."""
    
    logger.info(f"[SSH-REPORT] Received request: from_date={from_date}, to_date={to_date}")

    query = _apply_ssh_rbac(db.query(
        SSHLoginLog.hostname,
        func.max(SSHLoginLog.scan_date).label('latest_scan'),
        func.max(SSHLoginLog.ip_address).label('ip_address'),
        func.count(SSHLoginLog.id).label('total_logins'),
        func.sum(case((SSHLoginLog.status == 'success', 1), else_=0)).label('success_count'),
        func.sum(case((SSHLoginLog.status == 'failed', 1), else_=0)).label('failed_count'),
    ), current_user)

    if search:
        escaped_search = search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        query = query.filter(
            (SSHLoginLog.hostname.ilike(f"%{escaped_search}%", escape="\\")) |
            (SSHLoginLog.ip_address.ilike(f"%{escaped_search}%", escape="\\"))
        )

    if from_date:
        try:
            from_dt = datetime.fromisoformat(from_date)
            query = query.filter(SSHLoginLog.login_timestamp >= from_dt)
            logger.info(f"[SSH-REPORT] Applied from_date filter: {from_dt}")
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid from_date format")
    if to_date:
        try:
            to_dt = datetime.fromisoformat(to_date) + timedelta(days=1)
            query = query.filter(SSHLoginLog.login_timestamp < to_dt)
            logger.info(f"[SSH-REPORT] Applied to_date filter: {to_dt}")
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid to_date format")

    if from_date and to_date:
        try:
            fd = datetime.fromisoformat(from_date).date()
            td = datetime.fromisoformat(to_date).date()
            if (td - fd).days > 365:
                raise HTTPException(status_code=400, detail="Date range too large. Maximum 365 days allowed")
        except ValueError:
            pass

    query = query.group_by(SSHLoginLog.hostname)

    if status == 'failed':
        query = query.having(func.sum(case((SSHLoginLog.status == 'failed', 1), else_=0)) > 0)
    if status == 'success':
        query = query.having(func.sum(case((SSHLoginLog.status == 'success', 1), else_=0)) > 0)

    total = query.count()
    servers = query.order_by(SSHLoginLog.hostname).offset((page - 1) * page_size).limit(page_size).all()
    
    logger.info(f"[SSH-REPORT] Found {total} servers")

    server_data = [
        {
            "hostname": s.hostname,
            "ip_address": s.ip_address or '',
            "scan_date": s.latest_scan.isoformat() if s.latest_scan else None,
            "total_logins": s.total_logins,
            "success_count": s.success_count,
            "failed_count": s.failed_count,
        }
        for s in servers
    ]

    # Get data range info (earliest and latest dates available)
    earliest_log = _apply_ssh_rbac(db.query(func.min(SSHLoginLog.login_timestamp)), current_user).scalar()
    latest_log = _apply_ssh_rbac(db.query(func.max(SSHLoginLog.login_timestamp)), current_user).scalar()
    
    data_range_info = {
        "earliest_date": earliest_log.date().isoformat() if earliest_log else None,
        "latest_date": latest_log.date().isoformat() if latest_log else None
    }
    
    logger.info(f"[SSH-REPORT] Data range: {data_range_info['earliest_date']} to {data_range_info['latest_date']}")

    return {
        "data": server_data,
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total": total,
            "total_pages": (total + page_size - 1) // page_size
        },
        "data_range": data_range_info
    }


@router.get("/servers/{hostname}", response_model=dict)
async def get_server_report(
    hostname: str,
    days: int = Query(30, ge=1, le=365),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get full report for a specific server"""

    start_date = date.today() - timedelta(days=days)

    logs = _apply_ssh_rbac(db.query(SSHLoginLog), current_user).filter(
        SSHLoginLog.hostname == hostname,
        SSHLoginLog.scan_date >= start_date
    ).order_by(SSHLoginLog.login_timestamp.desc()).all()

    if not logs:
        raise HTTPException(status_code=404, detail=f"No data found for server {hostname}")

    success_logs = [l for l in logs if l.status == 'success']
    failed_logs = [l for l in logs if l.status == 'failed']

    return {
        "hostname": hostname,
        "summary": {
            "total_logins": len(logs),
            "success_count": len(success_logs),
            "failed_count": len(failed_logs),
            "unique_users": len(set(l.username for l in logs)),
            "unique_source_ips": len(set(l.source_ip for l in logs)),
        },
        "logs": [_ssh_login_to_dict(l) for l in logs],
    }


@router.get("/servers/{hostname}/summary", response_model=dict)
async def get_server_summary(
    hostname: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get summary stats for a server"""

    stats = _apply_ssh_rbac(db.query(
        func.count(SSHLoginLog.id).label('total'),
        func.sum(case((SSHLoginLog.status == 'success', 1), else_=0)).label('success_count'),
        func.sum(case((SSHLoginLog.status == 'failed', 1), else_=0)).label('failed_count'),
    ), current_user).filter(SSHLoginLog.hostname == hostname).first()

    unique_users = _apply_ssh_rbac(db.query(SSHLoginLog.username), current_user).filter(
        SSHLoginLog.hostname == hostname
    ).distinct().count()

    unique_ips = _apply_ssh_rbac(db.query(SSHLoginLog.source_ip), current_user).filter(
        SSHLoginLog.hostname == hostname
    ).distinct().count()

    latest_scan = _apply_ssh_rbac(db.query(SSHLoginLog), current_user).filter(
        SSHLoginLog.hostname == hostname
    ).order_by(SSHLoginLog.scan_date.desc()).first()

    return {
        "hostname": hostname,
        "total_logins": stats.total if stats else 0,
        "success_count": stats.success_count if stats else 0,
        "failed_count": stats.failed_count if stats else 0,
        "unique_users": unique_users,
        "unique_source_ips": unique_ips,
        "last_scan_date": latest_scan.scan_date.isoformat() if latest_scan and latest_scan.scan_date else None,
    }


@router.get("/servers/{hostname}/daily-history", response_model=dict)
async def get_daily_history(
    hostname: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(30, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get daily SSH login history grouped by scan_date (includes gap dates with 0)"""

    min_date = _apply_ssh_rbac(db.query(func.min(SSHLoginLog.scan_date)), current_user).filter(
        SSHLoginLog.hostname == hostname
    ).scalar()

    max_date = _apply_ssh_rbac(db.query(func.max(SSHLoginLog.scan_date)), current_user).filter(
        SSHLoginLog.hostname == hostname
    ).scalar()

    if not min_date or not max_date:
        return {
            "hostname": hostname,
            "total_records": 0,
            "data": [],
            "pagination": {"page": 1, "page_size": page_size, "total_records": 0, "total_pages": 0, "has_next": False, "has_prev": False}
        }

    all_dates = []
    current = max_date
    while current >= min_date:
        all_dates.append(current)
        current -= timedelta(days=1)

    total_dates = len(all_dates)
    start_idx = (page - 1) * page_size
    end_idx = start_idx + page_size
    page_dates = all_dates[start_idx:end_idx]

    data_by_date = {}
    if page_dates:
        date_stats = _apply_ssh_rbac(db.query(
            SSHLoginLog.scan_date,
            func.count(SSHLoginLog.id).label('total'),
            func.sum(case((SSHLoginLog.status == 'success', 1), else_=0)).label('success_count'),
            func.sum(case((SSHLoginLog.status == 'failed', 1), else_=0)).label('failed_count'),
        ), current_user).filter(
            SSHLoginLog.hostname == hostname,
            SSHLoginLog.scan_date.in_(page_dates)
        ).group_by(SSHLoginLog.scan_date).all()

        for row in date_stats:
            data_by_date[row.scan_date] = {
                "total": row.total,
                "success_count": row.success_count,
                "failed_count": row.failed_count,
            }

    daily_data = []
    for d in page_dates:
        if d in data_by_date:
            daily_data.append({
                "scan_date": d.isoformat(),
                "total": data_by_date[d]["total"],
                "success_count": data_by_date[d]["success_count"],
                "failed_count": data_by_date[d]["failed_count"],
            })
        else:
            daily_data.append({
                "scan_date": d.isoformat(),
                "total": 0,
                "success_count": 0,
                "failed_count": 0,
            })

    total_pages = (total_dates + page_size - 1) // page_size if total_dates > 0 else 0

    return {
        "hostname": hostname,
        "total_records": total_dates,
        "data": daily_data,
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total_records": total_dates,
            "total_pages": total_pages,
            "has_next": page < total_pages,
            "has_prev": page > 1
        }
    }


@router.get("/servers/{hostname}/successful-logins", response_model=dict)
async def get_successful_logins(
    hostname: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get successful login details for a server"""

    total = _apply_ssh_rbac(db.query(SSHLoginLog), current_user).filter(
        SSHLoginLog.hostname == hostname,
        SSHLoginLog.status == 'success'
    ).count()

    logs = _apply_ssh_rbac(db.query(SSHLoginLog), current_user).filter(
        SSHLoginLog.hostname == hostname,
        SSHLoginLog.status == 'success'
    ).order_by(SSHLoginLog.login_timestamp.desc()).offset((page - 1) * page_size).limit(page_size).all()

    total_pages = (total + page_size - 1) // page_size if total > 0 else 0

    return {
        "hostname": hostname,
        "total_records": total,
        "data": [_ssh_login_to_dict(l) for l in logs],
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total_records": total,
            "total_pages": total_pages,
            "has_next": page < total_pages,
            "has_prev": page > 1
        }
    }


@router.get("/servers/{hostname}/failed-logins", response_model=dict)
async def get_failed_logins(
    hostname: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get failed login details for a server"""

    total = _apply_ssh_rbac(db.query(SSHLoginLog), current_user).filter(
        SSHLoginLog.hostname == hostname,
        SSHLoginLog.status == 'failed'
    ).count()

    logs = _apply_ssh_rbac(db.query(SSHLoginLog), current_user).filter(
        SSHLoginLog.hostname == hostname,
        SSHLoginLog.status == 'failed'
    ).order_by(SSHLoginLog.login_timestamp.desc()).offset((page - 1) * page_size).limit(page_size).all()

    total_pages = (total + page_size - 1) // page_size if total > 0 else 0

    return {
        "hostname": hostname,
        "total_records": total,
        "data": [_ssh_login_to_dict(l) for l in logs],
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total_records": total,
            "total_pages": total_pages,
            "has_next": page < total_pages,
            "has_prev": page > 1
        }
    }


@router.get("/servers/{hostname}/top-users", response_model=dict)
async def get_top_users(
    hostname: str,
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get top user login ranking for a server"""

    top_users = _apply_ssh_rbac(db.query(
        SSHLoginLog.username,
        func.count(SSHLoginLog.id).label('total')
    ), current_user).filter(
        SSHLoginLog.hostname == hostname,
        SSHLoginLog.status == 'success'
    ).group_by(SSHLoginLog.username).order_by(desc('total')).limit(limit).all()

    return {
        "hostname": hostname,
        "data": [{"username": u.username, "total": u.total} for u in top_users],
    }


@router.get("/servers/{hostname}/top-failed-ips", response_model=dict)
async def get_top_failed_ips(
    hostname: str,
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get top failed IP ranking for a server"""

    top_ips = _apply_ssh_rbac(db.query(
        SSHLoginLog.source_ip,
        func.count(SSHLoginLog.id).label('total'),
        func.max(SSHLoginLog.severity).label('max_severity')
    ), current_user).filter(
        SSHLoginLog.hostname == hostname,
        SSHLoginLog.status == 'failed'
    ).group_by(SSHLoginLog.source_ip).order_by(desc('total')).limit(limit).all()

    return {
        "hostname": hostname,
        "data": [{"source_ip": ip.source_ip, "total": ip.total, "max_severity": ip.max_severity} for ip in top_ips],
    }


@router.delete("/servers/{hostname}", response_model=dict)
async def delete_server_data(
    hostname: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete all SSH login data for a specific server. Superadmin only."""
    if current_user.role != "superadmin":
        raise HTTPException(status_code=403, detail="Superadmin access required")

    deleted = db.query(SSHLoginLog).filter(
        SSHLoginLog.hostname == hostname
    ).delete(synchronize_session='fetch')

    db.commit()

    log_activity(db, current_user.id, "DELETE", "ssh-report", f"Deleted {deleted} SSH login records for server {hostname}")

    return {
        "status": "success",
        "message": f"Deleted {deleted} records for server {hostname}",
        "deleted_count": deleted
    }


@router.get("/reports/daily", response_model=dict)
async def get_ssh_daily_report(
    date_str: str = Query(None, alias="date"),
    from_date: str = Query(None, alias="from_date"),
    to_date: str = Query(None, alias="to_date"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Daily SSH login report — aggregated per server for a given date or date range."""

    # Determine date range
    if from_date and to_date:
        try:
            start_date = datetime.strptime(from_date, "%Y-%m-%d").date()
            end_date = datetime.strptime(to_date, "%Y-%m-%d").date()
            if start_date > end_date:
                raise HTTPException(status_code=400, detail="from_date must be before or equal to to_date")
            if (end_date - start_date).days > 365:
                raise HTTPException(status_code=400, detail="Date range too large. Maximum 365 days allowed")
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    elif date_str:
        try:
            start_date = datetime.strptime(date_str, "%Y-%m-%d").date()
            end_date = start_date
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    else:
        latest = _apply_ssh_rbac(db.query(SSHLoginLog.scan_date), current_user).order_by(SSHLoginLog.scan_date.desc()).first()
        start_date = latest[0] if latest else date.today()
        end_date = start_date

    range_start = datetime.combine(start_date, datetime.min.time()).replace(tzinfo=timezone.utc)
    range_end = datetime.combine(end_date, datetime.max.time()).replace(tzinfo=timezone.utc)

    query = _apply_ssh_rbac(db.query(
        SSHLoginLog.hostname,
        func.max(SSHLoginLog.ip_address).label('ip_address'),
        func.count(SSHLoginLog.id).label('total_logins'),
        func.sum(case((SSHLoginLog.status == 'success', 1), else_=0)).label('success_count'),
        func.sum(case((SSHLoginLog.status == 'failed', 1), else_=0)).label('failed_count'),
        func.count(func.distinct(SSHLoginLog.username)).label('unique_users'),
        func.count(func.distinct(SSHLoginLog.source_ip)).label('unique_ips'),
    ), current_user).filter(
        SSHLoginLog.login_timestamp >= range_start,
        SSHLoginLog.login_timestamp <= range_end,
    ).group_by(SSHLoginLog.hostname).order_by(SSHLoginLog.hostname).all()

    servers_data = [
        {
            "hostname": s.hostname,
            "ip_address": s.ip_address or '',
            "total_logins": s.total_logins,
            "success_count": s.success_count,
            "failed_count": s.failed_count,
            "unique_users": s.unique_users,
            "unique_ips": s.unique_ips,
        }
        for s in query
    ]

    total_servers = len(servers_data)
    total_logins = sum(s['total_logins'] for s in servers_data)
    success_count = sum(s['success_count'] for s in servers_data)
    failed_count = sum(s['failed_count'] for s in servers_data)
    unique_ips_all = len(set(
        ip for s in servers_data for ip in (s['unique_ips'],)
    ))

    top_failed_usernames = _apply_ssh_rbac(db.query(
        SSHLoginLog.username,
        func.count(SSHLoginLog.id).label('count'),
    ), current_user).filter(
        SSHLoginLog.status == 'failed',
        SSHLoginLog.login_timestamp >= range_start,
        SSHLoginLog.login_timestamp <= range_end,
    ).group_by(SSHLoginLog.username).order_by(func.count(SSHLoginLog.id).desc()).all()

    top_source_ips = _apply_ssh_rbac(db.query(
        SSHLoginLog.source_ip,
        func.count(SSHLoginLog.id).label('count'),
    ), current_user).filter(
        SSHLoginLog.status == 'failed',
        SSHLoginLog.login_timestamp >= range_start,
        SSHLoginLog.login_timestamp <= range_end,
    ).group_by(SSHLoginLog.source_ip).order_by(func.count(SSHLoginLog.id).desc()).all()

    # Format date range for response
    date_range = start_date.isoformat() if start_date == end_date else f"{start_date.isoformat()} to {end_date.isoformat()}"

    return {
        "date": date_range,
        "from_date": start_date.isoformat(),
        "to_date": end_date.isoformat(),
        "summary": {
            "total_servers": total_servers,
            "total_logins": total_logins,
            "success_count": success_count,
            "failed_count": failed_count,
            "unique_ips": unique_ips_all,
        },
        "servers": servers_data,
        "top_failed_usernames": [
            {"username": u.username, "count": u.count}
            for u in top_failed_usernames
        ],
        "top_source_ips": [
            {"source_ip": s.source_ip, "count": s.count}
            for s in top_source_ips
        ],
    }


@router.get("/export", response_model=dict)
async def export_ssh_report_pdf(
    from_date: str = Query(...),
    to_date: str = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Export SSH login data per server per date (for PDF). Mirrors Backup Check /export pattern."""

    try:
        start_date = datetime.strptime(from_date, "%Y-%m-%d").date()
        end_date = datetime.strptime(to_date, "%Y-%m-%d").date()
        if start_date > end_date:
            raise HTTPException(status_code=400, detail="from_date must be before or equal to to_date")
        if (end_date - start_date).days > 365:
            raise HTTPException(status_code=400, detail="Date range too large. Maximum 365 days allowed")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")

    range_start = datetime.combine(start_date, datetime.min.time()).replace(tzinfo=timezone.utc)
    range_end = datetime.combine(end_date, datetime.max.time()).replace(tzinfo=timezone.utc)

    records = _apply_ssh_rbac(db.query(
        SSHLoginLog.hostname,
        SSHLoginLog.scan_date,
        func.count(SSHLoginLog.id).label('total_logins'),
        func.sum(case((SSHLoginLog.status == 'success', 1), else_=0)).label('success_count'),
        func.sum(case((SSHLoginLog.status == 'failed', 1), else_=0)).label('failed_count'),
    ), current_user).filter(
        SSHLoginLog.login_timestamp >= range_start,
        SSHLoginLog.login_timestamp <= range_end,
    ).group_by(SSHLoginLog.hostname, SSHLoginLog.scan_date).order_by(SSHLoginLog.scan_date, SSHLoginLog.hostname).all()

    return {
        "records": [
            {
                "hostname": r.hostname,
                "date": r.scan_date.isoformat(),
                "total_logins": r.total_logins,
                "success_count": r.success_count,
                "failed_count": r.failed_count,
            }
            for r in records
        ],
        "total": len(records),
        "from_date": from_date,
        "to_date": to_date,
    }
