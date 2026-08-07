"""Dashboard schemas"""
from typing import List, Any, Optional
from .base import OrmModel


class DashboardStatsResponse(OrmModel):
    total_users: int
    log_maintenance_count: int
    irmc_checks_count: int
    monthly_checks_count: int
    vulnerability_reports_count: int
    incident_reports_count: int
    documents_count: int
    assets_total: int
    assets_users: int
    assets_hardware_count: int
    assets_software_count: int
    assets_vm_count: int
    assets_information: int
    configuration_items_count: int
    form_uploads_count: int
    risk_assessments_count: int
    log_compression_count: int
    quality_objectives_count: int
    open_incidents: int
    high_vulnerabilities: int
    active_tasks: int


class TaskItemResponse(OrmModel):
    id: int
    title: str
    description: Optional[str] = None
    status: str
    assignee: Optional[str] = None
    priority: str
    due_date: Optional[str] = None
    tags: str
    created_at: Optional[str] = None
    completed_at: Optional[str] = None


class TodayOverviewResponse(OrmModel):
    tasks: int
    worklogs: int
    hours: float


class WeekCategoryResponse(OrmModel):
    name: str
    count: int


class WeekOverviewResponse(OrmModel):
    worklogs: int
    hours: float
    by_category: List[WeekCategoryResponse]


class TaskBreakdownResponse(OrmModel):
    total: int
    todo: int
    doing: int
    done: int
    completion_rate: float


class PriorityBreakdownResponse(OrmModel):
    urgent: int
    normal: int
    low: int


class EnhancedDashboardResponse(OrmModel):
    today: TodayOverviewResponse
    week: WeekOverviewResponse
    tasks: TaskBreakdownResponse
    priority: PriorityBreakdownResponse
    overdue: int
    overdue_tasks: List[TaskItemResponse] = []
    recent_activity: List[Any] = []


class ActivityItemResponse(OrmModel):
    id: str
    module: str
    icon: str
    color: str
    user: str
    action: str
    target: str
    link: str
    created_at: Optional[str] = None


class InfrastructureStatusResponse(OrmModel):
    last_backup_date: Optional[str] = None
    days_since_backup: Optional[int] = None
    total_servers: int
    ok_count: int
    warning_count: int
    critical_count: int


class TodayFocusResponse(OrmModel):
    top_priorities: List[TaskItemResponse]
    due_today: List[TaskItemResponse]
    in_progress: List[TaskItemResponse]


class PriorityMatrixResponse(OrmModel):
    urgent: List[TaskItemResponse]
    normal: List[TaskItemResponse]
    low: List[TaskItemResponse]
    backlog: List[TaskItemResponse]
