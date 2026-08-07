"""Settings schemas (users, roles, SMTP, admin UI, backup schedule)"""
from typing import List, Optional, Any
from .base import OrmModel


class UserListResponse(OrmModel):
    id: int
    username: str
    email: str
    full_name: str
    role: str
    is_active: bool
    status: str
    last_login: Optional[str] = None
    modules: List[str] = []
    override_modules: List[str] = []


class RoleResponse(OrmModel):
    id: int
    name: str
    description: str
    modules: List[str]
    settings_tabs: List[str]
    is_system: bool
    created_at: Optional[str] = None


class RoleListResponse(OrmModel):
    roles: List[RoleResponse]


class BackupScheduleCreate(OrmModel):
    frequency: str = "daily"
    time: str = "02:00"
    day_of_week: Optional[int] = None
    day_of_month: Optional[int] = None
    enabled: bool = True
    retention_days: int = 30
    max_backups: int = 10


class BackupScheduleResponse(OrmModel):
    id: int
    frequency: str
    time: str
    day_of_week: Optional[int] = None
    day_of_month: Optional[int] = None
    enabled: bool
    retention_days: int
    max_backups: int
    last_run: Optional[str] = None
    next_run: Optional[str] = None
    created_at: Optional[str] = None


class SmtpTestResponse(OrmModel):
    message: str
    success: bool


class AdminUiResponse(OrmModel):
    enabled: bool
    url: Optional[str] = None


class SettingsBackupResponse(OrmModel):
    message: str
    filename: Optional[str] = None


class SettingsRestoreResponse(OrmModel):
    message: str


class SettingsListPaginatedResponse(OrmModel):
    data: List[Any]
    pagination: dict


class BackupScheduleListResponse(OrmModel):
    schedules: List[BackupScheduleResponse]
