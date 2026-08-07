"""Monthly server check schemas"""
from typing import List, Optional
from .base import OrmModel


class MonthlyCheckResponse(OrmModel):
    id: int
    ip_server: str
    month: str
    check_date: str
    status: Optional[str] = None
    notes: Optional[str] = None
    created_at: Optional[str] = None
    created_by: Optional[int] = None


class MonthlyCheckListPaginatedResponse(OrmModel):
    data: List[MonthlyCheckResponse]
    pagination: dict
