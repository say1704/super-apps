"""Document and category schemas"""
from typing import List, Optional
from .base import OrmModel


class CategoryCreate(OrmModel):
    name: str
    description: Optional[str] = None
    icon: str = "\U0001f4c1"
    color: str = "#6b7280"
    sort_order: int = 0


class CategoryUpdate(OrmModel):
    name: Optional[str] = None
    description: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    sort_order: Optional[int] = None
    is_active: Optional[int] = None


class DocumentResponse(OrmModel):
    id: int
    title: str
    category: str
    doc_type: str
    file_path: Optional[str] = None
    content_html: Optional[str] = None
    summary: Optional[str] = None
    tags: Optional[str] = None
    status: str
    version: int
    download_count: int
    view_count: int
    approved_by: Optional[int] = None
    approved_at: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    created_by: Optional[int] = None
    creator_role: Optional[str] = None


class CategoryResponse(OrmModel):
    id: int
    name: str
    description: Optional[str] = None
    icon: str
    color: str
    sort_order: int
    is_active: int
    created_at: Optional[str] = None


class DocumentListPaginatedResponse(OrmModel):
    data: List[DocumentResponse]
    pagination: dict


class DocumentStatsResponse(OrmModel):
    total: int
    by_category: dict
    by_status: dict
    by_type: dict


class DocumentVersionResponse(OrmModel):
    id: int
    document_id: int
    version: int
    file_path: str
    created_at: Optional[str] = None
    created_by: Optional[int] = None


class DocumentActionResponse(OrmModel):
    message: str


class DocumentBulkDeleteResponse(OrmModel):
    message: str
    count: int


class DocumentTemplateResponse(OrmModel):
    id: int
    name: str
    category: str
    file_path: str
    created_at: Optional[str] = None


class DocumentCategoryListResponse(OrmModel):
    categories: List[CategoryResponse]
