"""Form upload schemas"""
from typing import List, Optional
from .base import OrmModel


class FormTypeResponse(OrmModel):
    id: int
    name: str
    description: Optional[str] = None
    color: str
    icon: str
    sort_order: int
    is_active: bool
    owner_role: str
    created_by: Optional[int] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    version: Optional[int] = None


class FormTypeCreate(OrmModel):
    name: str
    description: Optional[str] = None
    color: Optional[str] = "blue"
    icon: Optional[str] = "📄"
    sort_order: Optional[int] = 0


class FormTypeUpdate(OrmModel):
    name: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None
    icon: Optional[str] = None
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None


class FormFolderResponse(OrmModel):
    id: int
    name: str
    description: Optional[str] = None
    parent_id: Optional[int] = None
    owner_role: str
    created_by: Optional[int] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    version: Optional[int] = None


class FormFolderTreeResponse(OrmModel):
    id: int
    name: str
    description: Optional[str] = None
    parent_id: Optional[int] = None
    children: List["FormFolderTreeResponse"] = []
    file_count: int = 0


class FormFolderCreate(OrmModel):
    name: str
    description: Optional[str] = None
    parent_id: Optional[int] = None


class FormFolderUpdate(OrmModel):
    name: Optional[str] = None
    description: Optional[str] = None


class FormUploadResponse(OrmModel):
    id: int
    form_type: str
    file_name: str
    upload_date: str
    pic: Optional[str] = None
    notes: Optional[str] = None
    file_path: Optional[str] = None
    folder_id: Optional[int] = None
    created_at: Optional[str] = None
    created_by: Optional[int] = None


class FormListPaginatedResponse(OrmModel):
    data: List[FormUploadResponse]
    pagination: dict
