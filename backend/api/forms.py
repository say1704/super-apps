"""Form Uploads CRUD + Form Types CRUD"""
import os
import logging
from datetime import datetime
from typing import List
from fastapi import APIRouter, Depends, Query, Form, UploadFile, File, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from database import get_db
from models import User, FormUpload, FormFolder, FormType
from api.dependencies import get_current_user, log_activity, save_file, can_modify_record
from api.dependencies import get_offset, calculate_pagination, _validate_filename
from utils.input_sanitizer import escape_like
from api.schemas import (
    FormListPaginatedResponse, FormUploadResponse, MessageResponse,
    FormFolderResponse, FormFolderTreeResponse, FormFolderCreate, FormFolderUpdate,
    FormTypeResponse, FormTypeCreate, FormTypeUpdate,
)

router = APIRouter(tags=["Form Uploads"])
logger = logging.getLogger(__name__)


def _seed_default_types(db: Session, user_role: str):
    defaults = [
        ("Change", "Change request forms", "blue", "📝", 0),
        ("Destruction", "Document destruction forms", "purple", "🗑️", 1),
    ]
    for name, desc, color, icon, sort in defaults:
        existing = db.query(FormType).filter(
            FormType.name == name, FormType.owner_role == user_role
        ).first()
        if not existing:
            item = FormType(name=name, description=desc, color=color, icon=icon,
                            sort_order=sort, owner_role=user_role)
            db.add(item)
    try:
        db.commit()
    except Exception:
        db.rollback()


def _build_folder_tree(folders: List[FormFolder], parent_id: int = None) -> List[dict]:
    children = [f for f in folders if f.parent_id == parent_id]
    result = []
    for f in children:
        node = {
            "id": f.id,
            "name": f.name,
            "description": f.description,
            "parent_id": f.parent_id,
            "children": _build_folder_tree(folders, f.id),
            "file_count": 0,
        }
        result.append(node)
    return result


# ==================== FORM TYPES CRUD ====================

@router.get("/form-types", response_model=List[FormTypeResponse])
async def get_form_types(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    _seed_default_types(db, current_user.role)
    query = db.query(FormType)
    if current_user.role != "superadmin":
        query = query.filter(FormType.owner_role == current_user.role)
    return query.order_by(FormType.sort_order, FormType.name).all()


@router.post("/form-types", response_model=FormTypeResponse)
async def create_form_type(
    type_data: FormTypeCreate,
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    name = type_data.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Form type name is required")
    if len(name) > 100:
        raise HTTPException(status_code=400, detail="Form type name too long (max 100 chars)")

    existing = db.query(FormType).filter(
        FormType.name.ilike(escape_like(name), escape="\\"),
        FormType.owner_role == current_user.role
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"Form type '{name}' already exists")

    description = type_data.description.strip()[:500] if type_data.description else None

    item = FormType(
        name=name, description=description, color=type_data.color or "blue",
        icon=type_data.icon or "📄", sort_order=type_data.sort_order or 0,
        owner_role=current_user.role, created_by=current_user.id,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    log_activity(db, current_user.id, "CREATE", "form_type", f"Created form type: {name}")
    return item


@router.put("/form-types/{type_id}", response_model=FormTypeResponse)
async def update_form_type(
    type_id: int, type_data: FormTypeUpdate,
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    item = db.query(FormType).filter(FormType.id == type_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Form type not found")
    if not can_modify_record(current_user, item):
        raise HTTPException(status_code=403, detail="You can only edit your own form types")

    if type_data.name is not None:
        name = type_data.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="Form type name cannot be empty")
        if len(name) > 100:
            raise HTTPException(status_code=400, detail="Form type name too long (max 100 chars)")
        dup = db.query(FormType).filter(
            FormType.name.ilike(escape_like(name), escape="\\"), FormType.id != type_id,
            FormType.owner_role == current_user.role
        ).first()
        if dup:
            raise HTTPException(status_code=409, detail=f"Form type '{name}' already exists")
        old_name = item.name
        item.name = name
        if old_name != name:
            db.query(FormUpload).filter(FormUpload.form_type == old_name).update({"form_type": name})

    if type_data.description is not None:
        item.description = type_data.description.strip()[:500] if type_data.description else None
    if type_data.color is not None:
        item.color = type_data.color
    if type_data.icon is not None:
        item.icon = type_data.icon
    if type_data.sort_order is not None:
        item.sort_order = type_data.sort_order
    if type_data.is_active is not None:
        item.is_active = type_data.is_active

    db.commit()
    db.refresh(item)
    log_activity(db, current_user.id, "UPDATE", "form_type", f"Updated form type: {item.name}")
    return item


@router.delete("/form-types/{type_id}", response_model=MessageResponse)
async def delete_form_type(
    type_id: int,
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    item = db.query(FormType).filter(FormType.id == type_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Form type not found")
    if not can_modify_record(current_user, item):
        raise HTTPException(status_code=403, detail="You can only delete your own form types")

    files_count = db.query(FormUpload).filter(FormUpload.form_type == item.name).count()
    if files_count > 0:
        raise HTTPException(status_code=400, detail=f"Cannot delete form type with {files_count} file(s). Delete or reassign files first.")

    db.delete(item)
    db.commit()
    log_activity(db, current_user.id, "DELETE", "form_type", f"Deleted form type: {item.name}")
    return {"message": "Form type deleted"}


# ==================== FORM FOLDERS CRUD ====================

@router.get("/form-folders/tree", response_model=List[FormFolderTreeResponse])
async def get_folder_tree(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    query = db.query(FormFolder)
    if current_user.role != "superadmin":
        query = query.filter(FormFolder.owner_role == current_user.role)
    folders = query.order_by(FormFolder.name).all()

    tree = _build_folder_tree(folders)

    if tree:
        file_counts = db.query(FormUpload.folder_id, FormUpload.id).all()
        count_map = {}
        for fid, _ in file_counts:
            count_map[fid] = count_map.get(fid, 0) + 1

        def _assign_counts(nodes):
            for node in nodes:
                node["file_count"] = count_map.get(node["id"], 0)
                if node["children"]:
                    _assign_counts(node["children"])
        _assign_counts(tree)

    return tree


@router.get("/form-folders", response_model=List[FormFolderResponse])
async def get_folders(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    query = db.query(FormFolder)
    if current_user.role != "superadmin":
        query = query.filter(FormFolder.owner_role == current_user.role)
    return query.order_by(FormFolder.name).all()


@router.post("/form-folders", response_model=FormFolderResponse)
async def create_folder(
    folder_data: FormFolderCreate,
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    name = folder_data.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Folder name is required")
    if len(name) > 100:
        raise HTTPException(status_code=400, detail="Folder name too long (max 100 chars)")

    if folder_data.parent_id is not None:
        parent = db.query(FormFolder).filter(FormFolder.id == folder_data.parent_id).first()
        if not parent:
            raise HTTPException(status_code=404, detail="Parent folder not found")
        if current_user.role != "superadmin" and parent.owner_role != current_user.role:
            raise HTTPException(status_code=403, detail="Cannot create folder in another role group")

    description = folder_data.description.strip()[:500] if folder_data.description else None

    item = FormFolder(
        name=name, description=description, parent_id=folder_data.parent_id,
        owner_role=current_user.role, created_by=current_user.id,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    log_activity(db, current_user.id, "CREATE", "form_folder", f"Created folder: {name}")
    return item


@router.put("/form-folders/{folder_id}", response_model=FormFolderResponse)
async def update_folder(
    folder_id: int, folder_data: FormFolderUpdate,
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    item = db.query(FormFolder).filter(FormFolder.id == folder_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Folder not found")
    if not can_modify_record(current_user, item):
        raise HTTPException(status_code=403, detail="You can only edit your own folders")

    if folder_data.name is not None:
        name = folder_data.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="Folder name cannot be empty")
        if len(name) > 100:
            raise HTTPException(status_code=400, detail="Folder name too long (max 100 chars)")
        item.name = name

    if folder_data.description is not None:
        item.description = folder_data.description.strip()[:500] if folder_data.description else None

    db.commit()
    db.refresh(item)
    log_activity(db, current_user.id, "UPDATE", "form_folder", f"Updated folder: {item.name}")
    return item


@router.delete("/form-folders/{folder_id}", response_model=MessageResponse)
async def delete_folder(
    folder_id: int,
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    item = db.query(FormFolder).filter(FormFolder.id == folder_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Folder not found")
    if not can_modify_record(current_user, item):
        raise HTTPException(status_code=403, detail="You can only delete your own folders")

    children_count = db.query(FormFolder).filter(FormFolder.parent_id == folder_id).count()
    if children_count > 0:
        raise HTTPException(status_code=400, detail="Cannot delete folder with subfolders. Delete subfolders first.")

    files_count = db.query(FormUpload).filter(FormUpload.folder_id == folder_id).count()
    if files_count > 0:
        raise HTTPException(status_code=400, detail=f"Cannot delete folder with {files_count} file(s). Move or delete files first.")

    db.delete(item)
    db.commit()
    log_activity(db, current_user.id, "DELETE", "form_folder", f"Deleted folder: {item.name}")
    return {"message": "Folder deleted"}


# ==================== FORM UPLOADS CRUD ====================

@router.get("/form-uploads", response_model=FormListPaginatedResponse)
async def get_form_uploads(
    page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
    folder_id: int = Query(None), search: str = Query(None), form_type: str = Query(None),
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    query = db.query(FormUpload)
    if current_user.role != "superadmin":
        query = query.filter(FormUpload.owner_role == current_user.role)
    if folder_id is not None:
        query = query.filter(FormUpload.folder_id == folder_id)
    if form_type:
        query = query.filter(FormUpload.form_type == form_type)
    if search:
        escaped_search = search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        query = query.filter(FormUpload.file_name.ilike(f"%{escaped_search}%", escape="\\"))
    total_records = query.count()
    offset = get_offset(page, page_size)
    items = query.offset(offset).limit(page_size).all()
    return {"data": items, "pagination": calculate_pagination(page, page_size, total_records).dict()}


@router.post("/form-uploads", response_model=FormUploadResponse)
async def create_form_upload(
    form_type: str = Form(...), upload_date: str = Form(...), pic: str = Form(None),
    notes: str = Form(None), folder_id: str = Form(None), file: UploadFile = File(...),
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    _seed_default_types(db, current_user.role)

    type_exists = db.query(FormType).filter(
        FormType.name == form_type, FormType.is_active == True,
        FormType.owner_role == current_user.role
    ).first()
    if not type_exists:
        available = db.query(FormType.name).filter(
            FormType.is_active == True, FormType.owner_role == current_user.role
        ).all()
        names = [r[0] for r in available]
        raise HTTPException(status_code=400, detail=f"Invalid form_type. Allowed: {', '.join(sorted(names))}")

    from datetime import date as date_type

    try:
        parsed_date = datetime.strptime(upload_date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid upload_date format. Use YYYY-MM-DD")

    resolved_folder_id = None
    if folder_id and folder_id.strip():
        try:
            fid = int(folder_id)
        except (ValueError, TypeError):
            raise HTTPException(status_code=400, detail="Invalid folder_id")
        folder = db.query(FormFolder).filter(FormFolder.id == fid).first()
        if not folder:
            raise HTTPException(status_code=404, detail="Folder not found")
        if current_user.role != "superadmin" and folder.owner_role != current_user.role:
            raise HTTPException(status_code=403, detail="Cannot upload to folder in another role group")
        resolved_folder_id = fid

    safe_pic = pic.strip()[:255] if pic else None
    safe_notes = notes.strip()[:1000] if notes else None
    safe_filename = _validate_filename(file.filename or "unknown")

    file_path = save_file(file, "forms")
    item = FormUpload(form_type=form_type, file_name=safe_filename, upload_date=parsed_date,
        pic=safe_pic, notes=safe_notes, file_path=file_path, created_by=current_user.id,
        owner_role=current_user.role, folder_id=resolved_folder_id)
    db.add(item)
    db.commit()
    db.refresh(item)
    log_activity(db, current_user.id, "CREATE", "form_upload", f"Uploaded {form_type} form")
    return item


@router.put("/form-uploads/{item_id}", response_model=FormUploadResponse)
async def update_form_upload(
    item_id: int,
    form_type: str = Form(None), upload_date: str = Form(None), pic: str = Form(None),
    notes: str = Form(None), folder_id: str = Form(None), file: UploadFile = File(None),
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    item = db.query(FormUpload).filter(FormUpload.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Form upload not found")
    if not can_modify_record(current_user, item):
        raise HTTPException(status_code=403, detail="You can only edit your own form uploads")

    if form_type:
        type_exists = db.query(FormType).filter(
            FormType.name == form_type, FormType.is_active == True,
            FormType.owner_role == current_user.role
        ).first()
        if not type_exists:
            raise HTTPException(status_code=400, detail=f"Invalid form_type: {form_type}")
        item.form_type = form_type

    if upload_date:
        try:
            item.upload_date = datetime.strptime(upload_date, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid upload_date format. Use YYYY-MM-DD")

    if pic is not None:
        item.pic = pic.strip()[:255] if pic.strip() else None
    if notes is not None:
        item.notes = notes.strip()[:1000] if notes.strip() else None

    if folder_id is not None:
        if folder_id.strip():
            try:
                fid = int(folder_id)
            except (ValueError, TypeError):
                raise HTTPException(status_code=400, detail="Invalid folder_id")
            folder = db.query(FormFolder).filter(FormFolder.id == fid).first()
            if not folder:
                raise HTTPException(status_code=404, detail="Folder not found")
            if current_user.role != "superadmin" and folder.owner_role != current_user.role:
                raise HTTPException(status_code=403, detail="Cannot upload to folder in another role group")
            item.folder_id = fid
        else:
            item.folder_id = None

    if file and file.filename:
        safe_filename = _validate_filename(file.filename or "unknown")
        file_path = save_file(file, "forms")
        if item.file_path and os.path.exists(item.file_path):
            try:
                os.remove(item.file_path)
            except OSError as e:
                logger.warning("Failed to delete old form file %s: %s", item.file_path, e)
        item.file_path = file_path
        item.file_name = safe_filename

    db.commit()
    db.refresh(item)
    log_activity(db, current_user.id, "UPDATE", "form_upload", f"Updated form upload: {item.file_name}")
    return item


@router.delete("/form-uploads/{item_id}", response_model=MessageResponse)
async def delete_form_upload(item_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    item = db.query(FormUpload).filter(FormUpload.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Form upload not found")
    if not can_modify_record(current_user, item):
        raise HTTPException(status_code=403, detail="You can only delete your own form uploads")
    if item.file_path and os.path.exists(item.file_path):
        try:
            os.remove(item.file_path)
        except OSError as e:
            logger.warning("Failed to delete form file %s: %s", item.file_path, e)
    db.delete(item)
    db.commit()
    log_activity(db, current_user.id, "DELETE", "form_upload", f"Deleted form upload: {item.file_name}")
    return {"message": "Form upload deleted"}


@router.get("/form-uploads/{item_id}/file")
async def download_form_file(item_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    item = db.query(FormUpload).filter(FormUpload.id == item_id).first()
    if not item or not item.file_path:
        raise HTTPException(status_code=404, detail="File not found")
    if not can_modify_record(current_user, item):
        raise HTTPException(status_code=403, detail="You can only download your own form uploads")
    if not os.path.exists(item.file_path):
        raise HTTPException(status_code=404, detail="File not found on disk")
    return FileResponse(item.file_path, filename=item.file_name)
