from utils.timezone import utcnow
from utils.timezone import to_iso
"""Document Library CRUD + Categories + Versions"""
import os
import re
import uuid
import logging
from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, Query, Form, UploadFile, File, HTTPException, Request
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, or_
import bleach

from database import get_db
from models import User, DocumentLibrary, DocumentVersion, DocumentCategory
from api.dependencies import get_current_user, log_activity, _save_upload_file
from api.dependencies import get_document_filter, can_modify_document
from api.dependencies import get_offset, calculate_pagination
from utils.optimistic_lock import check_version_conflict, increment_version, get_client_version
from api.schemas import (
    CategoryCreate, CategoryUpdate, CategoryResponse, DocumentResponse,
    DocumentListPaginatedResponse, DocumentStatsResponse, DocumentActionResponse,
    DocumentBulkDeleteResponse, DocumentVersionResponse,
)

router = APIRouter(tags=["Documents"])
logger = logging.getLogger(__name__)

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'uploads', 'documents')
ALLOWED_EXTENSIONS = {'.pdf', '.docx', '.txt', '.md', '.html'}
ALLOWED_DOC_SORT = {"title", "category", "doc_type", "status", "created_at", "updated_at", "version"}
MAX_BULK_IDS = 100

ALLOWED_HTML_TAGS = [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'br', 'hr', 'strong', 'em', 'u',
    's', 'sub', 'sup', 'blockquote', 'pre', 'code', 'ul', 'ol', 'li', 'a',
    'table', 'thead', 'tbody', 'tr', 'th', 'td', 'img', 'div', 'span',
]
ALLOWED_HTML_ATTRS = {
    'a': ['href', 'title', 'target'],
    'img': ['src', 'alt', 'width', 'height'],
    'td': ['colspan', 'rowspan', 'style'],
    'th': ['colspan', 'rowspan', 'style'],
    'div': ['style', 'class'],
    'span': ['style', 'class'],
    'table': ['border', 'cellpadding', 'cellspacing', 'style'],
    'pre': ['class'],
    'code': ['class'],
}
ALLOWED_HTML_PROTOCOLS = {'http', 'https', 'mailto'}


def _sanitize_html(html: Optional[str]) -> Optional[str]:
    """Sanitize HTML content to prevent XSS."""
    if html is None:
        return None
    return bleach.clean(html, tags=ALLOWED_HTML_TAGS, attributes=ALLOWED_HTML_ATTRS, protocols=ALLOWED_HTML_PROTOCOLS, strip=True)


def _validate_path_within_uploads(file_path: str) -> str:
    """Validate that a file path resolves within the uploads directory."""
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    abs_path = os.path.realpath(os.path.join(base_dir, file_path))
    uploads_dir = os.path.realpath(os.path.join(base_dir, 'uploads'))
    if not abs_path.startswith(uploads_dir):
        raise HTTPException(status_code=403, detail="Access denied: invalid file path")
    return abs_path


@router.get("/documents", response_model=DocumentListPaginatedResponse)
async def get_documents(
    page: int = Query(1, ge=1), page_size: int = Query(10, ge=1, le=100),
    search: Optional[str] = None, category: Optional[str] = None,
    doc_type: Optional[str] = None, status_filter: Optional[str] = Query(None, alias="status"),
    start_date: Optional[str] = None, end_date: Optional[str] = None,
    sort_by: str = "updated_at", sort_order: str = "desc",
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    if sort_by not in ALLOWED_DOC_SORT:
        sort_by = "updated_at"

    query = db.query(DocumentLibrary)
    doc_filter = get_document_filter(current_user, db)
    if doc_filter is not None:
        query = query.filter(doc_filter)
    if search:
        escaped = search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        s = f"%{escaped}%"
        query = query.filter(or_(DocumentLibrary.title.ilike(s, escape="\\"), DocumentLibrary.summary.ilike(s, escape="\\"),
            DocumentLibrary.tags.ilike(s, escape="\\"), DocumentLibrary.content_html.ilike(s, escape="\\")))
    if category:
        query = query.filter(DocumentLibrary.category == category)
    if doc_type:
        query = query.filter(DocumentLibrary.doc_type == doc_type)
    if status_filter:
        query = query.filter(DocumentLibrary.status == status_filter)
    if start_date:
        try:
            query = query.filter(DocumentLibrary.created_at >= datetime.fromisoformat(start_date))
        except (ValueError, TypeError):
            raise HTTPException(status_code=400, detail="Invalid start_date format")
    if end_date:
        try:
            query = query.filter(DocumentLibrary.created_at <= datetime.fromisoformat(end_date))
        except (ValueError, TypeError):
            raise HTTPException(status_code=400, detail="Invalid end_date format")
    total = query.count()
    offset = get_offset(page, page_size)
    sort_col = getattr(DocumentLibrary, sort_by, DocumentLibrary.updated_at)
    query = query.order_by(sort_col.asc() if sort_order == "asc" else sort_col.desc())
    records = query.offset(offset).limit(page_size).all()
    pagination = calculate_pagination(page, page_size, total)

    creator_ids = {r.created_by for r in records if r.created_by}
    creators = {}
    if creator_ids:
        for u in db.query(User).filter(User.id.in_(creator_ids)).all():
            creators[u.id] = u.role

    result_data = []
    for r in records:
        d = {c.name: getattr(r, c.name) for c in DocumentLibrary.__table__.columns}
        d["creator_role"] = creators.get(r.created_by)
        result_data.append(d)
    return {"data": result_data, "pagination": pagination.model_dump()}


@router.get("/documents/stats", response_model=DocumentStatsResponse)
async def get_document_stats(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    base_query = db.query(DocumentLibrary)
    doc_filter = get_document_filter(current_user, db)
    if doc_filter is not None:
        base_query = base_query.filter(doc_filter)
    total = base_query.count()
    by_category = {}
    for row in base_query.with_entities(DocumentLibrary.category, func.count(DocumentLibrary.id)).group_by(DocumentLibrary.category).all():
        by_category[row[0]] = row[1]
    by_type = {}
    for row in base_query.with_entities(DocumentLibrary.doc_type, func.count(DocumentLibrary.id)).group_by(DocumentLibrary.doc_type).all():
        by_type[row[0]] = row[1]
    by_status = {}
    for row in base_query.with_entities(DocumentLibrary.status, func.count(DocumentLibrary.id)).group_by(DocumentLibrary.status).all():
        by_status[row[0]] = row[1]
    return {"total": total, "by_category": by_category, "by_type": by_type, "by_status": by_status}


# ==================== CATEGORIES (static paths before parameterized) ====================
def _to_cat_dict(c):
    return {"id": c.id, "name": c.name, "description": c.description, "icon": c.icon, "color": c.color,
        "sort_order": c.sort_order, "is_active": c.is_active,
        "created_at": to_iso(c.created_at),
        "updated_at": to_iso(c.updated_at), "created_by": c.created_by}


@router.get("/documents/categories", response_model=List[CategoryResponse])
async def get_document_categories(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    categories = db.query(DocumentCategory).order_by(DocumentCategory.sort_order, DocumentCategory.name).all()
    return [_to_cat_dict(c) for c in categories]


@router.post("/documents/categories", response_model=CategoryResponse)
async def create_document_category(payload: CategoryCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    existing = db.query(DocumentCategory).filter(DocumentCategory.name == payload.name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Category already exists")
    cat = DocumentCategory(name=payload.name, description=payload.description, icon=payload.icon,
        color=payload.color, sort_order=payload.sort_order, created_by=current_user.id)
    db.add(cat)
    log_activity(db, current_user.id, "CREATE", "document_category", f"Created category: {payload.name}")
    db.commit()
    db.refresh(cat)
    return _to_cat_dict(cat)


@router.put("/documents/categories/{cat_id}", response_model=CategoryResponse)
async def update_document_category(cat_id: int, request: Request, payload: CategoryUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    cat = db.query(DocumentCategory).filter(DocumentCategory.id == cat_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")

    client_version = get_client_version(request)
    check_version_conflict(cat, client_version)

    if payload.name and payload.name != cat.name:
        dup = db.query(DocumentCategory).filter(DocumentCategory.name == payload.name, DocumentCategory.id != cat_id).first()
        if dup:
            raise HTTPException(status_code=400, detail="Category name already exists")
    old_name = cat.name
    if payload.name is not None: cat.name = payload.name
    if payload.description is not None: cat.description = payload.description
    if payload.icon is not None: cat.icon = payload.icon
    if payload.color is not None: cat.color = payload.color
    if payload.sort_order is not None: cat.sort_order = payload.sort_order
    if payload.is_active is not None: cat.is_active = payload.is_active
    increment_version(cat)
    log_activity(db, current_user.id, "UPDATE", "document_category", f"Updated category: {old_name}")
    db.commit()
    db.refresh(cat)
    return _to_cat_dict(cat)


@router.delete("/documents/categories/{cat_id}", response_model=DocumentActionResponse)
async def delete_document_category(cat_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    cat = db.query(DocumentCategory).filter(DocumentCategory.id == cat_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    doc_count = db.query(DocumentLibrary).filter(DocumentLibrary.category == cat.name).count()
    if doc_count > 0:
        cat.is_active = 0
        log_activity(db, current_user.id, "DELETE", "document_category", f"Deactivated category: {cat.name} ({doc_count} docs affected)")
        db.commit()
        return {"message": f"Category deactivated (has {doc_count} documents)"}
    db.delete(cat)
    log_activity(db, current_user.id, "DELETE", "document_category", f"Deleted category: {cat.name}")
    db.commit()
    return {"message": "Category deleted"}


# ==================== DOCUMENT CRUD ====================
@router.post("/documents", response_model=DocumentResponse)
async def create_document(
    title: str = Form(...), category: str = Form("SOP"), doc_type: str = Form("text"),
    summary: Optional[str] = Form(None), tags: Optional[str] = Form(None),
    content_html: Optional[str] = Form(None), change_note: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    file_path = None
    if doc_type == 'uploaded' and file:
        file_path = _save_upload_file(file, ALLOWED_EXTENSIONS)
    sanitized_html = _sanitize_html(content_html)
    item = DocumentLibrary(title=title, category=category, doc_type=doc_type, file_path=file_path,
        content_html=sanitized_html, summary=summary, tags=tags, status="draft", created_by=current_user.id, version=1)
    db.add(item)
    db.commit()
    db.refresh(item)
    db.add(DocumentVersion(document_id=item.id, version_number=1, content_html=sanitized_html,
        file_path=file_path, summary=summary, changed_by=current_user.id, change_note=change_note or "Initial version"))
    log_activity(db, current_user.id, "CREATE", "document_library", f"Created document: {title}")
    db.commit()
    db.refresh(item)
    return item


@router.put("/documents/{doc_id}", response_model=DocumentResponse)
async def update_document(
    doc_id: int, request: Request, title: str = Form(...), category: str = Form(...), doc_type: str = Form("text"),
    summary: Optional[str] = Form(None), tags: Optional[str] = Form(None),
    content_html: Optional[str] = Form(None), change_note: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    item = db.query(DocumentLibrary).filter(DocumentLibrary.id == doc_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Document not found")
    if not can_modify_document(current_user, item, db):
        raise HTTPException(status_code=403, detail="You can only edit documents from your role group")

    client_version = get_client_version(request)
    check_version_conflict(item, client_version)

    sanitized_html = _sanitize_html(content_html)
    if change_note or sanitized_html != item.content_html or item.summary != summary:
        db.add(DocumentVersion(document_id=item.id, version_number=item.version or 1,
            content_html=item.content_html, file_path=item.file_path, summary=item.summary,
            changed_by=current_user.id, change_note=change_note or "Content updated"))
        if item.status == "approved":
            item.status = "draft"
            item.approved_at = None
            item.approved_by = None
    item.title = title
    item.category = category
    item.doc_type = doc_type
    item.summary = summary
    item.tags = tags
    item.content_html = sanitized_html
    if doc_type == 'uploaded' and file:
        if item.file_path:
            try:
                abs_path = _validate_path_within_uploads(item.file_path)
                if os.path.exists(abs_path):
                    os.remove(abs_path)
            except HTTPException as e:
                logger.warning("Path validation failed for old file %s: %s", item.file_path, e)
            except OSError as e:
                logger.warning("Failed to delete old document file %s: %s", item.file_path, e)
        item.file_path = _save_upload_file(file, ALLOWED_EXTENSIONS)
    item.version = (item.version or 1) + 1
    increment_version(item)
    log_activity(db, current_user.id, "UPDATE", "document_library", f"Updated document: {title} (v{item.version})")
    db.commit()
    db.refresh(item)
    return item


@router.get("/documents/{doc_id}", response_model=DocumentResponse)
async def get_single_document(doc_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    item = db.query(DocumentLibrary).filter(DocumentLibrary.id == doc_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Document not found")
    doc_filter = get_document_filter(current_user, db)
    if doc_filter is not None:
        check = db.query(DocumentLibrary.id).filter(DocumentLibrary.id == doc_id, doc_filter).first()
        if not check:
            raise HTTPException(status_code=403, detail="You can only view documents from your role group")
    return {"id": item.id, "title": item.title, "category": item.category, "doc_type": item.doc_type,
        "file_path": item.file_path, "content_html": item.content_html, "summary": item.summary,
        "tags": item.tags, "version": item.version, "status": item.status,
        "download_count": item.download_count, "view_count": item.view_count,
        "approved_by": item.approved_by, "approved_at": item.approved_at,
        "created_at": item.created_at, "updated_at": item.updated_at, "created_by": item.created_by}


@router.delete("/documents/{doc_id}", response_model=DocumentActionResponse)
async def delete_document(doc_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    item = db.query(DocumentLibrary).filter(DocumentLibrary.id == doc_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Not found")
    if not can_modify_document(current_user, item, db):
        raise HTTPException(status_code=403, detail="You can only delete documents from your role group")
    if item.file_path:
        try:
            abs_path = _validate_path_within_uploads(item.file_path)
            if os.path.exists(abs_path):
                os.remove(abs_path)
        except HTTPException as e:
            logger.warning("Path validation failed for file %s: %s", item.file_path, e)
        except OSError as e:
            logger.warning("Failed to delete document file %s: %s", item.file_path, e)
    title = item.title
    db.delete(item)
    log_activity(db, current_user.id, "DELETE", "document_library", f"Deleted document: {title}")
    db.commit()
    return {"message": "Document deleted"}


@router.post("/documents/bulk-delete", response_model=DocumentBulkDeleteResponse)
async def bulk_delete_documents(ids: str = Query(...), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    id_list = [int(x.strip()) for x in ids.split(',') if x.strip()]
    if len(id_list) > MAX_BULK_IDS:
        raise HTTPException(status_code=400, detail=f"Maximum {MAX_BULK_IDS} IDs allowed per bulk operation")
    if current_user.role == "superadmin":
        items = db.query(DocumentLibrary).filter(DocumentLibrary.id.in_(id_list)).all()
    else:
        same_role_users = db.query(User.id).filter(User.role == current_user.role).all()
        user_ids = [u[0] for u in same_role_users]
        items = db.query(DocumentLibrary).filter(DocumentLibrary.id.in_(id_list), DocumentLibrary.created_by.in_(user_ids)).all()
    for item in items:
        if item.file_path:
            try:
                abs_path = _validate_path_within_uploads(item.file_path)
                if os.path.exists(abs_path):
                    os.remove(abs_path)
            except HTTPException as e:
                logger.warning("Path validation failed for bulk file %s: %s", item.file_path, e)
            except OSError as e:
                logger.warning("Failed to delete bulk document file %s: %s", item.file_path, e)
        db.delete(item)
    log_activity(db, current_user.id, "DELETE", "document_library", f"Bulk deleted {len(items)} documents")
    db.commit()
    return {"message": f"Deleted {len(items)} document(s)", "count": len(items)}


# ==================== PARAMETERIZED DOCUMENT ROUTES ====================
@router.get("/documents/{doc_id}/download")
async def download_document(doc_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    item = db.query(DocumentLibrary).filter(DocumentLibrary.id == doc_id).first()
    if not item or not item.file_path:
        raise HTTPException(status_code=404, detail="Document or file not found")
    doc_filter = get_document_filter(current_user, db)
    if doc_filter is not None:
        check = db.query(DocumentLibrary.id).filter(DocumentLibrary.id == doc_id, doc_filter).first()
        if not check:
            raise HTTPException(status_code=403, detail="You can only download documents from your role group")
    item.download_count = (item.download_count or 0) + 1
    db.commit()
    abs_path = _validate_path_within_uploads(item.file_path)
    if not os.path.exists(abs_path):
        raise HTTPException(status_code=404, detail="File not found on disk")
    return FileResponse(abs_path, filename=item.file_path.split('/')[-1])


@router.get("/documents/{doc_id}/view", response_model=DocumentActionResponse)
async def view_document(doc_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    item = db.query(DocumentLibrary).filter(DocumentLibrary.id == doc_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Document not found")
    doc_filter = get_document_filter(current_user, db)
    if doc_filter is not None:
        check = db.query(DocumentLibrary.id).filter(DocumentLibrary.id == doc_id, doc_filter).first()
        if not check:
            raise HTTPException(status_code=403, detail="You can only view documents from your role group")
    item.view_count = (item.view_count or 0) + 1
    db.commit()
    return {"message": "Document viewed"}


def _can_manage_approval(current_user: User, item, db: Session) -> bool:
    """Check if user can approve/reject/submit a document."""
    if current_user.role == "superadmin":
        return True
    doc_filter = get_document_filter(current_user, db)
    if doc_filter is not None:
        check = db.query(DocumentLibrary.id).filter(DocumentLibrary.id == item.id, doc_filter).first()
        return check is not None
    return False


@router.post("/documents/{doc_id}/approve", response_model=DocumentResponse)
async def approve_document(doc_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    item = db.query(DocumentLibrary).filter(DocumentLibrary.id == doc_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Not found")
    if not _can_manage_approval(current_user, item, db):
        raise HTTPException(status_code=403, detail="You can only manage documents from your role group")
    if item.status != "pending_approval":
        raise HTTPException(status_code=400, detail="Document must be in pending_approval status")
    item.status = "approved"
    item.approved_by = current_user.id
    item.approved_at = utcnow()
    log_activity(db, current_user.id, "APPROVE", "document_library", f"Approved: {item.title}")
    db.commit()
    db.refresh(item)
    return item


@router.post("/documents/{doc_id}/reject", response_model=DocumentResponse)
async def reject_document(doc_id: int, reason: str = Form(...), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    item = db.query(DocumentLibrary).filter(DocumentLibrary.id == doc_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Not found")
    if not _can_manage_approval(current_user, item, db):
        raise HTTPException(status_code=403, detail="You can only manage documents from your role group")
    if item.status != "pending_approval":
        raise HTTPException(status_code=400, detail="Document must be in pending_approval status")
    item.status = "rejected"
    safe_reason = bleach.clean(reason.strip()[:500], tags=[], attributes={}, strip=True)
    log_activity(db, current_user.id, "REJECT", "document_library", f"Rejected: {item.title} ({safe_reason})")
    db.commit()
    db.refresh(item)
    return item


@router.post("/documents/{doc_id}/submit", response_model=DocumentResponse)
async def submit_for_approval(doc_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    item = db.query(DocumentLibrary).filter(DocumentLibrary.id == doc_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Not found")
    if not can_modify_document(current_user, item, db):
        raise HTTPException(status_code=403, detail="You can only submit your own documents")
    if item.status not in ("draft", "rejected"):
        raise HTTPException(status_code=400, detail="Document must be in draft or rejected status")
    item.status = "pending_approval"
    log_activity(db, current_user.id, "SUBMIT", "document_library", f"Submitted for approval: {item.title}")
    db.commit()
    db.refresh(item)
    return item


@router.get("/documents/{doc_id}/versions", response_model=List[DocumentVersionResponse])
async def get_document_versions(doc_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    doc_filter = get_document_filter(current_user, db)
    if doc_filter is not None:
        check = db.query(DocumentLibrary.id).filter(DocumentLibrary.id == doc_id, doc_filter).first()
        if not check:
            raise HTTPException(status_code=403, detail="You can only view versions of documents from your role group")
    versions = db.query(DocumentVersion).filter(DocumentVersion.document_id == doc_id).order_by(DocumentVersion.version_number.desc()).all()
    return versions


@router.post("/documents/{doc_id}/duplicate", response_model=DocumentResponse)
async def duplicate_document(doc_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    orig = db.query(DocumentLibrary).filter(DocumentLibrary.id == doc_id).first()
    if not orig:
        raise HTTPException(status_code=404, detail="Not found")
    doc_filter = get_document_filter(current_user, db)
    if doc_filter is not None:
        check = db.query(DocumentLibrary.id).filter(DocumentLibrary.id == doc_id, doc_filter).first()
        if not check:
            raise HTTPException(status_code=403, detail="You can only duplicate documents from your role group")
    new_doc = DocumentLibrary(title=f"{orig.title} (Copy)", category=orig.category, doc_type=orig.doc_type,
        file_path=orig.file_path, content_html=orig.content_html, summary=orig.summary, tags=orig.tags,
        status="draft", created_by=current_user.id)
    db.add(new_doc)
    log_activity(db, current_user.id, "CREATE", "document_library", f"Duplicated document: {orig.title} -> {new_doc.title}")
    db.commit()
    db.refresh(new_doc)
    return new_doc


@router.post("/documents/templates/{template_name}", response_model=DocumentResponse)
async def create_from_template(template_name: str, title: str = Form(...), summary: Optional[str] = Form(None),
    tags: Optional[str] = Form(None), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    templates = {
        "SOP": {"category": "SOP", "content_html": "<h1>Standard Operating Procedure</h1><h2>1. Purpose</h2><p>Describe the purpose of this SOP.</p><h2>2. Scope</h2><p>Define the scope and applicability.</p><h2>3. Responsibilities</h2><p>List responsible parties.</p><h2>4. Procedure</h2><ol><li>Step 1</li><li>Step 2</li><li>Step 3</li></ol><h2>5. References</h2><p>Related documents or standards.</p><h2>6. Revision History</h2><table><tr><th>Version</th><th>Date</th><th>Author</th><th>Description</th></tr><tr><td>1.0</td><td></td><td></td><td>Initial release</td></tr></table>"},
        "work_instruction": {"category": "Work Instruction", "content_html": "<h1>Work Instruction</h1><h2>Task Name</h2><p>Brief description of the task.</p><h2>Prerequisites</h2><ul><li>Requirement 1</li><li>Requirement 2</li></ul><h2>Steps</h2><table border='1'><tr><th>Step</th><th>Action</th><th>Notes</th></tr><tr><td>1</td><td></td><td></td></tr><tr><td>2</td><td></td><td></td></tr></table><h2>Safety Precautions</h2><p>List safety measures required.</p><h2>Tools Required</h2><p>List tools and equipment needed.</p>"},
        "maintenance_report": {"category": "Maintenance Report", "content_html": "<h1>Maintenance Report</h1><h2>Equipment/System</h2><p>Name and identifier.</p><h2>Date</h2><p>MM/DD/YYYY</p><h2>Technician</h2><p>Name of technician.</p><h2>Work Performed</h2><p>Detailed description of maintenance activities.</p><h2>Findings</h2><p>Issues discovered during maintenance.</p><h2>Recommendations</h2><p>Suggested follow-up actions.</p><h2>Status</h2><p>Completed / Pending / Requires attention</p>"},
    }
    if template_name not in templates:
        raise HTTPException(status_code=404, detail=f"Template not found. Available: {', '.join(templates.keys())}")
    tmpl = templates[template_name]
    doc = DocumentLibrary(title=title, category=tmpl["category"], doc_type="text",
        content_html=tmpl["content_html"], summary=summary, tags=tags, status="draft", created_by=current_user.id)
    db.add(doc)
    log_activity(db, current_user.id, "CREATE", "document_library", f"Created from template: {template_name} - {title}")
    db.commit()
    db.refresh(doc)
    return doc
