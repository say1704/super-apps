"""Log maintenance schemas"""
from typing import List, Optional
from .base import OrmModel


class LogMaintenanceResponse(OrmModel):
    id: int
    server: str
    path: Optional[str] = None
    script_execution: Optional[str] = None
    execution_date: Optional[str] = None
    size: Optional[str] = None
    notes: Optional[str] = None
    created_at: Optional[str] = None
    created_by: Optional[int] = None


class LogMaintenanceListPaginatedResponse(OrmModel):
    data: List[LogMaintenanceResponse]
    pagination: dict
