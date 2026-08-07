"""IRMC Check CRUD"""
import os
import uuid
import logging
from datetime import datetime
from fastapi import APIRouter, Depends, Query, Form, UploadFile, File, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import Optional

from utils.timezone import utcnow

from database import get_db
from models import User, IRMCCheck, IrmcFolder
from api.dependencies import get_current_user, log_activity, save_file
from api.dependencies import get_offset, calculate_pagination
from api.schemas import IRMCListPaginatedResponse, IRMCCheckResponse, MessageResponse

router = APIRouter(tags=["IRMC Check"])

logger = logging.getLogger(__name__)

ALLOWED_IMAGE_EXTENSIONS = {"png", "jpg", "jpeg", "gif", "webp"}
ALLOWED_IRMC_STATUSES = {"pass", "warning", "fail", "pending"}
MAX_SERVER_NAME_LEN = 255
MAX_IRMC_NOTES_LEN = 2000


def _escape_like(value: str) -> str:
    """Escape SQL LIKE wildcards to prevent injection."""
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _save_irmc_screenshot(file: UploadFile, server_name: str, check_date: str) -> str:
    """
    Save IRMC screenshot with traceable naming pattern.
    Pattern: {server_name}_{YYYY-MM-DD}_{uuid_short}.{ext}
    Example: uploads/irmc/10.150.70.11_2026-05-14_a1b2c3d4.png
    """
    folder = "uploads/irmc"
    os.makedirs(folder, exist_ok=True)

    original_name = file.filename or "upload"
    file_extension = original_name.split(".")[-1].lower() if "." in original_name else ""
    if not file_extension or file_extension not in ALLOWED_IMAGE_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"File type '.{file_extension}' not allowed. Allowed: {', '.join(sorted(ALLOWED_IMAGE_EXTENSIONS))}"
        )

    safe_server = server_name.replace("/", "_").replace("\\", "_").replace(" ", "_")
    date_str = str(check_date).replace(" ", "_")
    short_uuid = uuid.uuid4().hex[:8]
    unique_filename = f"{safe_server}_{date_str}_{short_uuid}.{file_extension}"
    file_path = os.path.join(folder, unique_filename)

    with open(file_path, "wb") as buffer:
        buffer.write(file.file.read())

    return file_path


@router.get("/irmc-check", response_model=IRMCListPaginatedResponse)
async def get_irmc_check(
    page: int = 1, page_size: int = 20, server_name: Optional[str] = None,
    folder_id: Optional[int] = None, status: Optional[str] = None,
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    admin = current_user.role == "superadmin"
    query = db.query(IRMCCheck)
    if not admin:
        role_user_ids = db.query(User.id).filter(User.role == current_user.role)
        query = query.filter(IRMCCheck.created_by.in_(role_user_ids))
    if server_name:
        escaped_name = _escape_like(server_name)
        query = query.filter(IRMCCheck.server_name.ilike(f"%{escaped_name}%", escape="\\"))
    if folder_id is not None:
        folder = db.query(IrmcFolder).filter(IrmcFolder.id == folder_id).first()
        if not folder:
            raise HTTPException(status_code=404, detail="Folder not found")
        query = query.filter(IRMCCheck.folder_id == folder_id)
    if status:
        query = query.filter(IRMCCheck.status == status)
    total = query.count()
    offset = get_offset(page, page_size)
    records = query.order_by(IRMCCheck.created_at.desc()).offset(offset).limit(page_size).all()
    pagination = calculate_pagination(page, page_size, total)
    return {"data": records, "pagination": pagination.dict()}


@router.post("/irmc-check", response_model=IRMCCheckResponse)
async def create_irmc_check(
    server_name: str = Form(...), check_date: str = Form(...), notes: str = Form(None),
    status: str = Form("pending"),
    folder_id: int = Form(None),
    screenshot: UploadFile = File(None), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    if folder_id is not None:
        folder = db.query(IrmcFolder).filter(IrmcFolder.id == folder_id).first()
        if not folder:
            raise HTTPException(status_code=404, detail="Folder not found")

    server_name = server_name.strip()
    if not server_name:
        raise HTTPException(status_code=400, detail="Server name is required")
    if len(server_name) > MAX_SERVER_NAME_LEN:
        raise HTTPException(status_code=400, detail=f"Server name too long (max {MAX_SERVER_NAME_LEN})")
    if notes and len(notes) > MAX_IRMC_NOTES_LEN:
        raise HTTPException(status_code=400, detail=f"Notes too long (max {MAX_IRMC_NOTES_LEN})")
    if status not in ALLOWED_IRMC_STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid status. Allowed: {', '.join(sorted(ALLOWED_IRMC_STATUSES))}")

    screenshot_path = None
    if screenshot:
        screenshot_path = _save_irmc_screenshot(screenshot, server_name, check_date)
    parsed_date = datetime.strptime(check_date, "%Y-%m-%d").date() if check_date else utcnow().date()
    item = IRMCCheck(
        server_name=server_name, check_date=parsed_date, screenshot_path=screenshot_path,
        notes=notes, status=status, folder_id=folder_id, created_by=current_user.id
    )
    db.add(item)
    db.commit()
    log_activity(db, current_user.id, "CREATE", "irmc", f"Created IRMC check for {server_name}")
    db.refresh(item)
    return item


@router.put("/irmc-check/{item_id}", response_model=IRMCCheckResponse)
async def update_irmc_check(
    item_id: int,
    server_name: str = Form(None), check_date: str = Form(None), notes: str = Form(None),
    status: str = Form(None),
    folder_id: int = Form(None),
    screenshot: UploadFile = File(None), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    admin = current_user.role == "superadmin"
    item = db.query(IRMCCheck).filter(IRMCCheck.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Not found")
    if not admin and item.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="You can only edit your own IRMC checks")

    if folder_id is not None:
        folder = db.query(IrmcFolder).filter(IrmcFolder.id == folder_id).first()
        if not folder:
            raise HTTPException(status_code=404, detail="Folder not found")
        item.folder_id = folder_id

    if server_name is not None:
        server_name = server_name.strip()
        if not server_name:
            raise HTTPException(status_code=400, detail="Server name is required")
        if len(server_name) > MAX_SERVER_NAME_LEN:
            raise HTTPException(status_code=400, detail=f"Server name too long (max {MAX_SERVER_NAME_LEN})")
        item.server_name = server_name

    if notes is not None:
        if len(notes) > MAX_IRMC_NOTES_LEN:
            raise HTTPException(status_code=400, detail=f"Notes too long (max {MAX_IRMC_NOTES_LEN})")
        item.notes = notes

    if status is not None:
        if status not in ALLOWED_IRMC_STATUSES:
            raise HTTPException(status_code=400, detail=f"Invalid status. Allowed: {', '.join(sorted(ALLOWED_IRMC_STATUSES))}")
        item.status = status

    if check_date:
        try:
            item.check_date = datetime.strptime(check_date, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")

    if screenshot and screenshot.filename:
        if item.screenshot_path and os.path.exists(item.screenshot_path):
            os.remove(item.screenshot_path)
        item.screenshot_path = _save_irmc_screenshot(screenshot, item.server_name, item.check_date)

    db.commit()
    log_activity(db, current_user.id, "UPDATE", "irmc", f"Updated IRMC check {item_id}")
    db.refresh(item)
    return item


@router.get("/irmc-check/{item_id}/screenshot")
async def get_irmc_screenshot(item_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Serve IRMC screenshot image file"""
    item = db.query(IRMCCheck).filter(IRMCCheck.id == item_id).first()
    if not item or not item.screenshot_path:
        raise HTTPException(status_code=404, detail="Screenshot not found")
    abs_path = os.path.abspath(item.screenshot_path)
    allowed_dir = os.path.abspath("uploads/irmc")
    if not abs_path.startswith(allowed_dir + os.sep):
        raise HTTPException(status_code=403, detail="Access denied")
    if not os.path.exists(abs_path):
        raise HTTPException(status_code=404, detail="File not found on disk")
    ext = os.path.splitext(abs_path)[1].lower()
    media_type_map = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif": "image/gif",
        ".webp": "image/webp",
    }
    media_type = media_type_map.get(ext, "application/octet-stream")
    return FileResponse(abs_path, media_type=media_type)


@router.get("/irmc-check/stats")
async def get_irmc_stats(
    from_date: Optional[str] = Query(None, description="Filter from date (YYYY-MM-DD)"),
    to_date: Optional[str] = Query(None, description="Filter to date (YYYY-MM-DD)"),
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    """Get IRMC check status summary with optional date range filter"""
    logger.info(f"[IRMC] Received stats request: from_date={from_date}, to_date={to_date}")
    
    admin = current_user.role == "superadmin"
    role_user_ids = db.query(User.id).filter(User.role == current_user.role)
    
    # Parse date range if provided
    start_date = None
    end_date = None
    if from_date and to_date:
        try:
            start_date = datetime.strptime(from_date, "%Y-%m-%d").date()
            end_date = datetime.strptime(to_date, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    
    base_q = db.query(IRMCCheck)
    if not admin:
        base_q = base_q.filter(IRMCCheck.created_by.in_(role_user_ids))
    
    # Apply date range filter if provided
    if start_date and end_date:
        base_q = base_q.filter(
            IRMCCheck.check_date >= start_date,
            IRMCCheck.check_date <= end_date
        )
        logger.info(f"[IRMC] Applied date filter: {start_date} to {end_date}")
    
    total = base_q.count()
    pass_count = base_q.filter(IRMCCheck.status == "pass").count()
    warning_count = base_q.filter(IRMCCheck.status == "warning").count()
    fail_count = base_q.filter(IRMCCheck.status == "fail").count()
    pending_count = base_q.filter(IRMCCheck.status == "pending").count()
    
    logger.info(f"[IRMC] Stats: total={total}, pass={pass_count}, warning={warning_count}, fail={fail_count}, pending={pending_count}")
    
    # Get data range info (earliest and latest dates available)
    all_checks_q = db.query(IRMCCheck)
    if not admin:
        all_checks_q = all_checks_q.filter(IRMCCheck.created_by.in_(role_user_ids))
    
    earliest_check = all_checks_q.order_by(IRMCCheck.check_date.asc()).first()
    latest_check = all_checks_q.order_by(IRMCCheck.check_date.desc()).first()
    
    data_range_info = {
        "earliest_date": earliest_check.check_date.isoformat() if earliest_check else None,
        "latest_date": latest_check.check_date.isoformat() if latest_check else None
    }
    
    logger.info(f"[IRMC] Data range: {data_range_info['earliest_date']} to {data_range_info['latest_date']}")
    
    return {
        "total": total,
        "pass": pass_count,
        "warning": warning_count,
        "fail": fail_count,
        "pending": pending_count,
        "data_range": data_range_info,
    }


@router.delete("/irmc-check/{item_id}", response_model=MessageResponse)
async def delete_irmc_check(item_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    admin = current_user.role == "superadmin"
    item = db.query(IRMCCheck).filter(IRMCCheck.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Not found")
    if not admin and item.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="You can only delete your own IRMC checks")
    if item.screenshot_path and os.path.exists(item.screenshot_path):
        os.remove(item.screenshot_path)
    db.delete(item)
    log_activity(db, current_user.id, "DELETE", "irmc", f"Deleted IRMC check {item_id}")
    db.commit()
    return {"message": "IRMC check deleted successfully"}
