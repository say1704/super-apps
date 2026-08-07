"""IRMC check and folder schemas"""
from typing import List, Optional
from .base import OrmModel


class IRMCCheckResponse(OrmModel):
    id: int
    server_name: str
    check_date: str
    screenshot_path: Optional[str] = None
    notes: Optional[str] = None
    status: str = "pending"
    created_at: Optional[str] = None
    created_by: Optional[int] = None


class IRMCListPaginatedResponse(OrmModel):
    data: List[IRMCCheckResponse]
    pagination: dict


class IrmcFolderResponse(OrmModel):
    id: int
    name: str
    description: Optional[str] = None
    color: str = "blue"
    created_by: Optional[int] = None
    created_at: Optional[str] = None
    checks_count: int = 0


class IrmcFolderListPaginatedResponse(OrmModel):
    data: List[IrmcFolderResponse]
    pagination: dict


class IrmcFolderCreate(OrmModel):
    name: str
    description: Optional[str] = None
    color: str = "blue"


class IrmcFolderUpdate(OrmModel):
    name: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None


class IrmcFolderChecksResponse(OrmModel):
    folder: IrmcFolderResponse
    checks: List[IRMCCheckResponse]
