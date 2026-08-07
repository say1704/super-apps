"""Incident schemas"""
from typing import List, Optional
from .base import OrmModel


class IncidentResponse(OrmModel):
    id: int
    incident_date: Optional[str] = None
    server_name: Optional[str] = None
    incident_type: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    action_taken: Optional[str] = None
    file_path: Optional[str] = None
    created_at: Optional[str] = None
    created_by: Optional[int] = None


class IncidentListPaginatedResponse(OrmModel):
    data: List[IncidentResponse]
    pagination: dict
