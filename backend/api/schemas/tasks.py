"""Task and sprint schemas"""
from typing import List, Optional, Any
from pydantic import field_validator
from .base import OrmModel


class TaskStatsResponse(OrmModel):
    total: int
    todo: int
    doing: int
    done: int
    overdue: int


class SprintResponse(OrmModel):
    id: int
    name: str
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    status: str
    goal: Optional[str] = None
    task_ids: str
    created_at: Optional[str] = None
    created_by: Optional[int] = None


def _coerce_float(v: Any) -> Optional[float]:
    """Coerce DB string values to float, handling empty/invalid strings."""
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    if isinstance(v, str):
        v = v.strip()
        if v == "" or v == "-":
            return None
        try:
            return float(v)
        except (ValueError, TypeError):
            return None
    return None


class TaskResponse(OrmModel):
    id: int
    title: str
    description: Optional[str] = None
    status: str
    assignee: Optional[str] = None
    priority: str
    due_date: Optional[str] = None
    tags: str
    created_by: Optional[int] = None
    completed_at: Optional[str] = None
    estimated_hours: Optional[float] = None
    actual_hours: Optional[float] = None
    photo_urls: Optional[str] = "[]"
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    version: Optional[int] = None

    _coerce_est = field_validator("estimated_hours", mode="before")(_coerce_float)
    _coerce_act = field_validator("actual_hours", mode="before")(_coerce_float)


class TaskByIdsResponse(OrmModel):
    data: List[TaskResponse]


class TaskListPaginatedResponse(OrmModel):
    data: List[TaskResponse]
    pagination: dict


class TaskWorklogsResponse(OrmModel):
    worklogs: List[Any]


class TaskWorklogLinkResponse(OrmModel):
    id: int
    task_id: Optional[int] = None


class TaskCreateResponse(OrmModel):
    id: int
    title: str
    status: str


class TaskDeleteResponse(OrmModel):
    status: str


class TaskBulkResponse(OrmModel):
    status: str
    count: int


class SprintListPaginatedResponse(OrmModel):
    data: List[SprintResponse]
    pagination: dict


class SprintDeleteResponse(OrmModel):
    status: str
