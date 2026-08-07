"""IRMC Folder CRUD - Modular router for folder-based screenshot management"""
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional

from database import get_db
from models import User, IrmcFolder, IRMCCheck
from api.dependencies import get_current_user, log_activity
from api.dependencies import get_offset, calculate_pagination
from api.schemas import (
    IrmcFolderListPaginatedResponse, IrmcFolderResponse, IrmcFolderCreate,
    IrmcFolderUpdate, MessageResponse, IRMCListPaginatedResponse, IRMCCheckResponse
)

router = APIRouter(prefix="/irmc-folders", tags=["IRMC Folders"])


@router.get("", response_model=IrmcFolderListPaginatedResponse)
async def get_folders(
    page: int = 1, page_size: int = 20,
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    admin = current_user.role == "superadmin"
    total = db.query(IrmcFolder).count()
    offset = get_offset(page, page_size)
    folders = db.query(IrmcFolder).order_by(IrmcFolder.created_at.desc()).offset(offset).limit(page_size).all()

    folder_ids = [f.id for f in folders]
    counts = {}
    if folder_ids:
        checks_q = db.query(IRMCCheck.folder_id, func.count(IRMCCheck.id)).filter(
            IRMCCheck.folder_id.in_(folder_ids)
        )
        if not admin:
            role_user_ids = db.query(User.id).filter(User.role == current_user.role)
            checks_q = checks_q.filter(IRMCCheck.created_by.in_(role_user_ids))
        for row in checks_q.group_by(IRMCCheck.folder_id).all():
            counts[row[0]] = row[1]

    result = []
    for f in folders:
        result.append({
            "id": f.id,
            "name": f.name,
            "description": f.description,
            "color": f.color,
            "created_by": f.created_by,
            "created_at": str(f.created_at) if f.created_at else None,
            "checks_count": counts.get(f.id, 0),
        })
    pagination = calculate_pagination(page, page_size, total)
    return {"data": result, "pagination": pagination.dict()}


@router.post("", response_model=IrmcFolderResponse)
async def create_folder(
    folder: IrmcFolderCreate,
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    item = IrmcFolder(
        name=folder.name,
        description=folder.description,
        color=folder.color,
        created_by=current_user.id,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    log_activity(db, current_user.id, "CREATE", "IRMC Folder", f"Created folder {item.name}")
    return {
        "id": item.id,
        "name": item.name,
        "description": item.description,
        "color": item.color,
        "created_by": item.created_by,
        "created_at": str(item.created_at) if item.created_at else None,
        "checks_count": 0,
    }


@router.put("/{folder_id}", response_model=IrmcFolderResponse)
async def update_folder(
    folder_id: int, folder_update: IrmcFolderUpdate,
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    item = db.query(IrmcFolder).filter(IrmcFolder.id == folder_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Folder not found")
    if folder_update.name is not None:
        item.name = folder_update.name
    if folder_update.description is not None:
        item.description = folder_update.description
    if folder_update.color is not None:
        item.color = folder_update.color
    db.commit()
    db.refresh(item)
    log_activity(db, current_user.id, "UPDATE", "IRMC Folder", f"Updated folder {item.name}")

    admin = current_user.role == "superadmin"
    checks_q = db.query(func.count(IRMCCheck.id)).filter(IRMCCheck.folder_id == item.id)
    if not admin:
        role_user_ids = db.query(User.id).filter(User.role == current_user.role)
        checks_q = checks_q.filter(IRMCCheck.created_by.in_(role_user_ids))
    checks_count = checks_q.scalar() or 0

    return {
        "id": item.id,
        "name": item.name,
        "description": item.description,
        "color": item.color,
        "created_by": item.created_by,
        "created_at": str(item.created_at) if item.created_at else None,
        "checks_count": checks_count,
    }


@router.delete("/{folder_id}", response_model=MessageResponse)
async def delete_folder(
    folder_id: int,
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    item = db.query(IrmcFolder).filter(IrmcFolder.id == folder_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Folder not found")
    folder_name = item.name
    db.query(IRMCCheck).filter(IRMCCheck.folder_id == folder_id).update({"folder_id": None})
    db.delete(item)
    db.commit()
    log_activity(db, current_user.id, "DELETE", "IRMC Folder", f"Deleted folder {folder_name}")
    return {"message": f"Folder '{folder_name}' deleted"}


@router.get("/{folder_id}/checks", response_model=IRMCListPaginatedResponse)
async def get_folder_checks(
    folder_id: int, page: int = 1, page_size: int = 20,
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    folder = db.query(IrmcFolder).filter(IrmcFolder.id == folder_id).first()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    query = db.query(IRMCCheck).filter(IRMCCheck.folder_id == folder_id)
    total = query.count()
    offset = get_offset(page, page_size)
    records = query.order_by(IRMCCheck.created_at.desc()).offset(offset).limit(page_size).all()
    pagination = calculate_pagination(page, page_size, total)
    return {"data": records, "pagination": pagination.dict()}
