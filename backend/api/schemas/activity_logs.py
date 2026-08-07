"""Activity log schemas"""
from typing import List, Optional
from .base import OrmModel


class ActivityLogResponse(OrmModel):
    id: int
    user_id: Optional[int] = None
    action: str
    module: str
    description: Optional[str] = None
    asset_id: Optional[int] = None
    asset_code: Optional[str] = None
    created_at: Optional[str] = None
    timestamp: Optional[str] = None
    log_type: Optional[str] = None
    user: Optional[str] = None
    user_role: Optional[str] = None
    details: Optional[dict] = None
    ip_address: Optional[str] = None


class ActivityLogListPaginatedResponse(OrmModel):
    data: List[dict]
    pagination: dict
