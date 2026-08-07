"""Worklog and checklist schemas"""
from typing import List, Optional
from .base import OrmModel


class WorklogStatsResponse(OrmModel):
    total: int
    in_progress: int
    done: int
    cancelled: int = 0
    categories: List[dict] = []
    total_estimated_hours: float = 0
    total_actual_hours: float = 0
    total_estimated_time: str = "0"
    total_actual_time: str = "0"


class ChecklistItemResponse(OrmModel):
    id: int
    worklog_id: int
    name: str
    notes: Optional[str] = None
    is_completed: bool
    sort_order: int
    created_at: Optional[str] = None


class WorklogResponse(OrmModel):
    id: int
    task_id: Optional[int] = None
    user_id: Optional[int] = None
    date: Optional[str] = None
    time: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    category: Optional[str] = None
    tags: Optional[str] = None
    estimated_time: Optional[str] = None
    actual_time: Optional[str] = None
    notes: Optional[str] = None
    photo_urls: List[str] = []
    created_at: Optional[str] = None
    version: Optional[int] = None
    checklist_total: Optional[int] = 0
    checklist_completed: Optional[int] = 0


class WorklogListPaginatedResponse(OrmModel):
    data: List[WorklogResponse]
    pagination: dict


class ChecklistListResponse(OrmModel):
    items: List[ChecklistItemResponse]
