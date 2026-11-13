"""Log Compression CRUD + Reports"""
from fastapi import APIRouter, Depends, Query, Form, Request, HTTPException
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session
from sqlalchemy import extract, distinct, func, and_, or_
from typing import Optional
from datetime import datetime
import logging
import threading
import uuid
import ipaddress

from database import get_db, SessionLocal
from models import User, LogCompression, LogCompressionRun, LogCompressionArchive
from api.dependencies import get_current_user, log_activity
from api.dependencies import get_offset, calculate_pagination
from api.schemas import LogCompressionResponse, LogCompressionListPaginatedResponse, MessageResponse
from utils.optimistic_lock import check_version_conflict, increment_version, get_client_version
from utils.timezone import utcnow
from utils.ssh_handler import SSHConnection
from utils.progress_tracker import create_progress_tracker, get_progress
from utils.log_compression_parser import parse_compression_log

router = APIRouter(tags=["Log Compression"])

logger = logging.getLogger(__name__)

ALLOWED_COMPRESSION_SORT = {"execution_date", "created_at", "server"}
MAX_PAGE_SIZE = 100
MAX_SERVER_LEN = 255
MAX_ARCHIVE_LEN = 500
MAX_NOTES_LEN = 1000


def _escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


@router.get("/log-compression/{item_id}", response_model=LogCompressionResponse)
async def get_log_compression_item(
    item_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    item = db.query(LogCompression).filter(
        LogCompression.id == item_id,
        LogCompression.deleted_at.is_(None)
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Log compression record not found")
    if current_user.role != "superadmin" and item.owner_role != current_user.role:
        raise HTTPException(status_code=403, detail="Access denied")
    return item


@router.get("/log-compression", response_model=LogCompressionListPaginatedResponse)
async def get_log_compression(
    page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=MAX_PAGE_SIZE), server: Optional[str] = None,
    year: Optional[int] = None, sort_by: str = "execution_date", sort_order: str = "desc",
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    query = db.query(LogCompression).filter(LogCompression.deleted_at.is_(None))
    if current_user.role != "superadmin":
        query = query.filter(LogCompression.owner_role == current_user.role)
    if server:
        query = query.filter(LogCompression.server.ilike(f"%{_escape_like(server)}%", escape="\\"))
    if year:
        query = query.filter(extract('year', LogCompression.execution_date) == year)
    total = query.count()
    offset = get_offset(page, page_size)
    sort_column = getattr(LogCompression, sort_by if sort_by in ALLOWED_COMPRESSION_SORT else "execution_date", LogCompression.execution_date)
    query = query.order_by(sort_column.asc() if sort_order.lower() == "asc" else sort_column.desc())
    records = query.offset(offset).limit(page_size).all()
    pagination = calculate_pagination(page, page_size, total)
    return {"data": records, "pagination": pagination.dict()}


@router.post("/log-compression", response_model=LogCompressionResponse)
async def create_log_compression(
    server: str = Form(...), archive_info: str = Form(...), execution_date: str = Form(...),
    notes: str = Form(None), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    server = server.strip()[:MAX_SERVER_LEN]
    if not server:
        raise HTTPException(status_code=400, detail="Server is required")
    archive_info = archive_info.strip()[:MAX_ARCHIVE_LEN]
    if not archive_info:
        raise HTTPException(status_code=400, detail="Archive info is required")
    if notes:
        notes = notes.strip()[:MAX_NOTES_LEN]
    try:
        exec_date = datetime.strptime(execution_date, '%Y-%m-%d').date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid execution_date format. Use YYYY-MM-DD")
    item = LogCompression(server=server, archive_info=archive_info, execution_date=exec_date, notes=notes, created_by=current_user.id, owner_role=current_user.role)
    db.add(item)
    log_activity(db, current_user.id, "CREATE", "Log Compression", f"Created archive {archive_info} on {server}")
    db.commit()
    db.refresh(item)
    return item


@router.put("/log-compression/{item_id}", response_model=LogCompressionResponse)
async def update_log_compression(
    item_id: int, request: Request, server: Optional[str] = None, archive_info: Optional[str] = None,
    execution_date: Optional[str] = None, notes: str = Form(None),
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    item = db.query(LogCompression).filter(LogCompression.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Log compression record not found")
    if current_user.role != "superadmin" and item.owner_role != current_user.role:
        raise HTTPException(status_code=403, detail="Access denied")

    client_version = get_client_version(request)
    check_version_conflict(item, client_version)

    if server:
        item.server = server.strip()[:MAX_SERVER_LEN]
    if archive_info:
        item.archive_info = archive_info.strip()[:MAX_ARCHIVE_LEN]
    if execution_date:
        try:
            item.execution_date = datetime.strptime(execution_date, '%Y-%m-%d').date()
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid execution_date format. Use YYYY-MM-DD")
    if notes is not None:
        item.notes = notes.strip()[:MAX_NOTES_LEN] if notes else item.notes
    increment_version(item)
    log_activity(db, current_user.id, "UPDATE", "Log Compression", f"Updated archive {item.archive_info}")
    db.commit()
    db.refresh(item)
    return item


@router.delete("/log-compression/{item_id}", response_model=MessageResponse)
async def delete_log_compression(item_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    item = db.query(LogCompression).filter(
        LogCompression.id == item_id,
        LogCompression.deleted_at.is_(None)
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Log compression record not found")
    if current_user.role != "superadmin" and item.owner_role != current_user.role:
        raise HTTPException(status_code=403, detail="Access denied")
    item.deleted_at = utcnow()
    log_activity(db, current_user.id, "DELETE", "Log Compression", f"Deleted archive {item.archive_info}")
    db.commit()
    return {"message": "Log compression record deleted"}


@router.get("/log-compression/reports/summary", response_model=dict)
async def get_compression_summary(
    server: Optional[str] = None, year: Optional[int] = None,
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    query = db.query(LogCompression).filter(LogCompression.deleted_at.is_(None))
    if current_user.role != "superadmin":
        query = query.filter(LogCompression.owner_role == current_user.role)
    if server:
        query = query.filter(LogCompression.server.ilike(f"%{_escape_like(server)}%", escape="\\"))
    if year:
        query = query.filter(extract('year', LogCompression.execution_date) == year)
    logs = query.all()
    server_stats = {}
    for log in logs:
        if log.server not in server_stats:
            server_stats[log.server] = {"server": log.server, "total_archives": 0, "last_compression": None}
        server_stats[log.server]["total_archives"] += 1
        if log.execution_date:
            if server_stats[log.server]["last_compression"] is None or log.execution_date.isoformat() > server_stats[log.server]["last_compression"]:
                server_stats[log.server]["last_compression"] = log.execution_date.isoformat()
    result = list(server_stats.values())
    result = sorted(result, key=lambda x: x["total_archives"], reverse=True)
    return {"summary": result, "total_servers": len(result), "total_archives": len(logs), "filters": {"server": server, "year": year}}


@router.get("/log-compression/reports/available-filters", response_model=dict)
async def get_compression_filters(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    base_query = db.query(LogCompression).filter(LogCompression.deleted_at.is_(None))
    if current_user.role != "superadmin":
        base_query = base_query.filter(LogCompression.owner_role == current_user.role)
    servers = base_query.with_entities(distinct(LogCompression.server)).order_by(LogCompression.server).all()
    years = base_query.with_entities(distinct(extract('year', LogCompression.execution_date))).order_by(extract('year', LogCompression.execution_date).desc()).all()
    return {"servers": [s[0] for s in servers if s[0]], "years": [int(y[0]) for y in years if y[0]]}


# ==================== SSH AUTO-SCAN + INSIGHT (Log Compressor) ====================
# Catatan: semua path di-namespace di bawah /log-compression/insight/... agar TIDAK
# terbentur route generik GET /log-compression/{item_id} (single-segment).

_MAX_SCAN_FILES = 2000


class CompressionScanRequest(BaseModel):
    nas_ip: str
    username: str
    password: str
    path: str
    port: int = 22
    overwrite: bool = False

    @field_validator("nas_ip")
    @classmethod
    def _v_ip(cls, v: str) -> str:
        v = v.strip()
        try:
            ipaddress.ip_address(v)
        except ValueError:
            raise ValueError("Format IP tidak valid")
        return v

    @field_validator("username")
    @classmethod
    def _v_user(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Username wajib")
        return v[:128]

    @field_validator("password")
    @classmethod
    def _v_pass(cls, v: str) -> str:
        if not v:
            raise ValueError("Password wajib")
        return v[:256]

    @field_validator("path")
    @classmethod
    def _v_path(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Path folder log wajib")
        return v[:512]


def _compression_rbac(query, current_user: User):
    if current_user.role != "superadmin":
        return query.filter(LogCompressionRun.owner_role == current_user.role)
    return query


def _run_to_dict(r: LogCompressionRun, with_archives: bool = False) -> dict:
    d = {
        "id": r.id, "run_id": r.run_id, "server": r.server, "folder": r.folder,
        "app_name": r.app_name, "mode": r.mode, "period_from": r.period_from,
        "period_to": r.period_to, "status": r.status, "apps_checked": r.apps_checked,
        "archives_created": r.archives_created, "archives_verified": r.archives_verified,
        "failed": r.failed, "files_in_archive": r.files_in_archive, "files_deleted": r.files_deleted,
        "size_original_bytes": r.size_original_bytes, "size_archive_bytes": r.size_archive_bytes,
        "savings_pct": r.savings_pct,
        "started_at": r.started_at.isoformat() if r.started_at else None,
        "finished_at": r.finished_at.isoformat() if r.finished_at else None,
        "log_filename": r.log_filename,
    }
    if with_archives:
        d["archives"] = [{
            "archive_path": a.archive_path, "year_month": a.year_month,
            "file_count": a.file_count, "size_original_bytes": a.size_original_bytes,
            "size_archive_bytes": a.size_archive_bytes, "keterangan": a.keterangan,
        } for a in sorted(r.archives, key=lambda x: x.year_month or "")]
    return d


def process_compression_scan(operation_id: str, req: CompressionScanRequest,
                             user_id: int, user_role: str, tracker):
    """Background: SSH ke host, baca file log_compression-*.log, parse tiap run, simpan (dedup)."""
    thread_db = SessionLocal()
    ssh = SSHConnection(host=req.nas_ip, username=req.username, password=req.password, port=req.port)
    try:
        ok, msg = ssh.connect()
        if not ok:
            tracker.error(msg)
            ssh.disconnect()
            return

        ok, files_with_size, msg = ssh.list_log_files(req.path)
        if not ok:
            tracker.error(msg)
            ssh.disconnect()
            return

        # hanya file compressor: log_compression-*.log
        log_files = [fp for fp, _sz in (files_with_size or [])
                     if "log_compression-" in fp.split("/")[-1] and fp.endswith(".log")]
        log_files = log_files[:_MAX_SCAN_FILES]
        total = len(log_files)
        if total == 0:
            tracker.update(0, 0, "Tidak ada file log_compression-*.log di folder")
            tracker.complete()
            ssh.disconnect()
            return

        tracker.update(0, total, "Mulai membaca file log...")
        runs_new = runs_updated = runs_skipped = runs_failed = 0

        for i, filepath in enumerate(log_files):
            fname = filepath.split("/")[-1]
            tracker.update(i + 1, total, fname)
            try:
                ok, content, _ = ssh.read_file_full(filepath)
                if not ok or not content:
                    runs_failed += 1
                    continue
                for parsed in parse_compression_log(content):
                    fp = parsed.get("fingerprint")
                    if not fp:
                        runs_failed += 1
                        continue
                    existing = _compression_rbac(
                        thread_db.query(LogCompressionRun).filter(
                            LogCompressionRun.run_id == fp,
                            LogCompressionRun.deleted_at.is_(None),
                        ), User(id=user_id, role=user_role)
                    ).first()
                    if existing:
                        if not req.overwrite:
                            runs_skipped += 1
                            continue
                        thread_db.delete(existing)  # cascade hapus archives
                        thread_db.flush()
                        runs_updated += 1
                    else:
                        runs_new += 1
                    run = LogCompressionRun(
                        run_id=fp, server=parsed.get("server"), folder=parsed.get("folder"),
                        app_name=parsed.get("app_name"), mode=parsed.get("mode"),
                        period_from=parsed.get("period_from"), period_to=parsed.get("period_to"),
                        status=parsed.get("status"), apps_checked=parsed.get("apps_checked") or 0,
                        archives_created=parsed.get("archives_created") or 0,
                        archives_verified=parsed.get("archives_verified") or 0,
                        failed=parsed.get("failed") or 0,
                        files_in_archive=parsed.get("files_in_archive") or 0,
                        files_deleted=parsed.get("files_deleted") or 0,
                        size_original_bytes=parsed.get("size_original_bytes"),
                        size_archive_bytes=parsed.get("size_archive_bytes"),
                        savings_pct=parsed.get("savings_pct"),
                        started_at=parsed.get("started_at"), finished_at=parsed.get("finished_at"),
                        log_filename=parsed.get("log_filename") or fname,
                        owner_role=user_role, created_by=user_id,
                    )
                    for a in parsed.get("archives", []):
                        run.archives.append(LogCompressionArchive(
                            archive_path=a.get("archive_path"), year_month=a.get("year_month"),
                            file_count=a.get("file_count") or 0,
                            size_original_bytes=a.get("size_original_bytes"),
                            size_archive_bytes=a.get("size_archive_bytes"),
                            keterangan=a.get("keterangan"),
                        ))
                    thread_db.add(run)
                    thread_db.commit()
            except Exception as e:
                thread_db.rollback()
                logger.warning("[LOGCOMP] gagal proses %s: %s", fname, e)
                runs_failed += 1

        store = get_progress(operation_id)
        tracker.complete()
        # simpan ringkasan ke progress store
        from utils.progress_tracker import progress_store, _progress_lock
        with _progress_lock:
            if operation_id in progress_store:
                progress_store[operation_id].update({
                    "runs_new": runs_new, "runs_updated": runs_updated,
                    "runs_skipped": runs_skipped, "runs_failed": runs_failed,
                    "files_scanned": total,
                })
        logger.info("[LOGCOMP] scan selesai: +%d baru, %d update, %d skip, %d gagal (dari %d file)",
                    runs_new, runs_updated, runs_skipped, runs_failed, total)
    except Exception as e:
        logger.error("[LOGCOMP] scan error: %s", e)
        tracker.error(str(e))
    finally:
        ssh.disconnect()
        thread_db.close()


@router.post("/log-compression/insight/scan", response_model=dict)
async def scan_compression(req: CompressionScanRequest, db: Session = Depends(get_db),
                           current_user: User = Depends(get_current_user)):
    """Mulai SSH auto-scan folder log compressor (jalan di background thread)."""
    operation_id = str(uuid.uuid4())
    tracker = create_progress_tracker(operation_id)
    threading.Thread(
        target=process_compression_scan,
        args=(operation_id, req, current_user.id, current_user.role, tracker),
        daemon=True,
    ).start()
    log_activity(db, current_user.id, "CREATE", "log_compression",
                 f"Scan compressor dimulai ke {req.nas_ip}:{req.path}")
    return {"operation_id": operation_id, "status": "started"}


@router.get("/log-compression/insight/progress/{operation_id}", response_model=dict)
async def compression_scan_progress(operation_id: str, current_user: User = Depends(get_current_user)):
    progress = get_progress(operation_id)
    if progress.get("status") == "not_found":
        raise HTTPException(status_code=404, detail="Operation not found")
    return progress


@router.post("/log-compression/insight/test-connection", response_model=dict)
async def compression_test_connection(req: CompressionScanRequest, db: Session = Depends(get_db),
                                      current_user: User = Depends(get_current_user)):
    ssh = SSHConnection(host=req.nas_ip, username=req.username, password=req.password, port=req.port)
    ok, msg = ssh.connect()
    ssh.disconnect()
    if ok:
        log_activity(db, current_user.id, "VIEW", "log_compression", f"Test koneksi ke {req.nas_ip}")
        return {"success": True, "message": msg}
    raise HTTPException(status_code=400, detail=msg)


@router.get("/log-compression/insight/runs", response_model=dict)
async def list_compression_runs(
    page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=MAX_PAGE_SIZE),
    server: Optional[str] = None, mode: Optional[str] = None,
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
):
    q = _compression_rbac(db.query(LogCompressionRun).filter(LogCompressionRun.deleted_at.is_(None)), current_user)
    if server:
        q = q.filter(LogCompressionRun.server.ilike(f"%{_escape_like(server)}%", escape="\\"))
    if mode:
        q = q.filter(LogCompressionRun.mode == mode)
    total = q.count()
    offset = get_offset(page, page_size)
    rows = q.order_by(LogCompressionRun.finished_at.desc().nullslast(),
                      LogCompressionRun.created_at.desc()).offset(offset).limit(page_size).all()
    return {"data": [_run_to_dict(r) for r in rows],
            "pagination": calculate_pagination(page, page_size, total).dict()}


@router.get("/log-compression/insight/runs/{run_pk}", response_model=dict)
async def get_compression_run(run_pk: int, db: Session = Depends(get_db),
                              current_user: User = Depends(get_current_user)):
    r = db.query(LogCompressionRun).filter(
        LogCompressionRun.id == run_pk, LogCompressionRun.deleted_at.is_(None)).first()
    if not r:
        raise HTTPException(status_code=404, detail="Run tidak ditemukan")
    if current_user.role != "superadmin" and r.owner_role != current_user.role:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    return _run_to_dict(r, with_archives=True)


@router.get("/log-compression/insight/summary", response_model=dict)
async def compression_insight_summary(db: Session = Depends(get_db),
                                      current_user: User = Depends(get_current_user)):
    """Agregat insight: hemat, disk dibebaskan (source dihapus), file, breakdown bulan/server/mode."""
    runs = _compression_rbac(
        db.query(LogCompressionRun).filter(LogCompressionRun.deleted_at.is_(None)), current_user
    ).all()
    run_ids = [r.id for r in runs]
    archives = []
    if run_ids:
        archives = db.query(LogCompressionArchive).filter(
            LogCompressionArchive.run_fk.in_(run_ids)).all()
    by_run = {r.id: r for r in runs}

    total_runs = len(runs)
    by_mode = {}
    space_compressed = space_after = files_archived = files_deleted = 0
    savings_vals = []
    for r in runs:
        by_mode[r.mode or "OTHER"] = by_mode.get(r.mode or "OTHER", 0) + 1
        if r.mode == "SAFE":
            space_compressed += r.size_original_bytes or 0
            space_after += r.size_archive_bytes or 0
            files_archived += r.files_in_archive or 0
            if r.savings_pct is not None:
                savings_vals.append(r.savings_pct)
        if r.mode == "DELETE_AFTER_VERIFY":
            files_deleted += r.files_deleted or 0

    # disk benar-benar dibebaskan: ukuran asli arsip (dari run SAFE) yang path-nya juga
    # muncul di run DELETE_AFTER_VERIFY (source sudah dihapus)
    verify_paths = {a.archive_path for a in archives
                    if by_run.get(a.run_fk) and by_run[a.run_fk].mode == "DELETE_AFTER_VERIFY"}
    orig_by_path = {}
    for a in archives:
        r = by_run.get(a.run_fk)
        if r and r.mode == "SAFE" and a.size_original_bytes:
            orig_by_path[a.archive_path] = a.size_original_bytes
    disk_reclaimed = sum(v for p, v in orig_by_path.items() if p in verify_paths)

    by_month = {}
    by_server = {}
    for a in archives:
        r = by_run.get(a.run_fk)
        if not r or r.mode != "SAFE":
            continue
        saved = (a.size_original_bytes or 0) - (a.size_archive_bytes or 0)
        if a.year_month:
            m = by_month.setdefault(a.year_month, {"saved_bytes": 0, "archives": 0, "original_bytes": 0})
            m["saved_bytes"] += saved
            m["original_bytes"] += a.size_original_bytes or 0
            m["archives"] += 1
    for r in runs:
        s = by_server.setdefault(r.server or "-", {"runs": 0, "files_deleted": 0})
        s["runs"] += 1
        s["files_deleted"] += r.files_deleted or 0

    return {
        "total_runs": total_runs,
        "by_mode": by_mode,
        "space_compressed_bytes": space_compressed,
        "space_after_bytes": space_after,
        "space_saved_bytes": max(space_compressed - space_after, 0),
        "disk_reclaimed_bytes": disk_reclaimed,
        "avg_savings_pct": round(sum(savings_vals) / len(savings_vals), 1) if savings_vals else 0,
        "files_archived": files_archived,
        "files_deleted": files_deleted,
        "by_month": [{"year_month": k, **v} for k, v in sorted(by_month.items())],
        "by_server": [{"server": k, **v} for k, v in sorted(by_server.items())],
    }
