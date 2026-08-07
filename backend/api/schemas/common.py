"""Common and pagination schemas"""
from typing import List, Optional, Any
from .base import OrmModel


class PaginationInfo(OrmModel):
    page: int
    page_size: int
    total_records: int
    total_pages: int
    has_next: bool
    has_prev: bool


class MessageResponse(OrmModel):
    message: str


class BulkOperationResponse(OrmModel):
    message: str
    count: int


class PasswordResetResponse(OrmModel):
    message: str
    reset_token: Optional[str] = None
    expires_in: Optional[str] = None


class UserModulesResponse(OrmModel):
    modules: dict


class UserListPaginatedResponse(OrmModel):
    data: List[Any]
    pagination: dict


class RoleListPaginatedResponse(OrmModel):
    data: List[Any]
    pagination: dict


class AllModulesResponse(OrmModel):
    modules: list


class VersionResponse(OrmModel):
    message: str
    version: int
