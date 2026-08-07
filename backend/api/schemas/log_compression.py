"""Log compression schemas"""
from typing import List, Optional
from .base import OrmModel


class LogCompressionResponse(OrmModel):
    id: int
    server: str
    archive_info: str
    execution_date: str
    notes: Optional[str] = None
    created_at: Optional[str] = None
    created_by: Optional[int] = None


class LogCompressionListPaginatedResponse(OrmModel):
    data: List[LogCompressionResponse]
    pagination: dict
