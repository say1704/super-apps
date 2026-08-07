"""Quality objectives schemas - redesigned flexible tracking system"""
from typing import List, Optional, Dict, Any
from .base import OrmModel


class QualityObjectiveResponse(OrmModel):
    id: int
    name: str
    category: str
    description: Optional[str] = None
    tracking_type: str
    period: str
    target_value: Optional[float] = None
    target_unit: Optional[str] = None
    evidence_types: Optional[str] = None
    checklist_items: Optional[str] = None
    is_active: bool
    owner_role: Optional[str] = None
    created_at: Optional[str] = None
    created_by: Optional[int] = None


class QualityObjectiveListPaginatedResponse(OrmModel):
    data: List[QualityObjectiveResponse]
    pagination: dict


class QualityEntryResponse(OrmModel):
    id: int
    objective_id: int
    entry_date: Optional[str] = None
    entry_period: str
    value: Optional[float] = None
    status: Optional[str] = None
    checklist_result: Optional[str] = None
    description: Optional[str] = None
    evidence_text: Optional[str] = None
    evidence_file: Optional[str] = None
    evidence_url: Optional[str] = None
    checked_by: Optional[int] = None
    created_at: Optional[str] = None


class QualityEntryListPaginatedResponse(OrmModel):
    data: List[QualityEntryResponse]
    pagination: dict


class QualityStatsResponse(OrmModel):
    total_objectives: int
    active_objectives: int
    total_entries: int
    by_category: dict
    by_tracking_type: dict


class QualityReportMonthData(OrmModel):
    period: str
    count: Optional[int] = None
    value: Optional[float] = None
    status: Optional[str] = None
    pass_count: Optional[int] = None
    fail_count: Optional[int] = None
    target_met: Optional[bool] = None


class QualityReportSummary(OrmModel):
    total: Optional[int] = None
    avg: Optional[float] = None
    pass_rate: Optional[str] = None
    target_met_count: Optional[int] = None
    total_periods: Optional[int] = None


class QualityReportObjective(OrmModel):
    id: int
    name: str
    tracking_type: str
    period: str
    target_value: Optional[float] = None
    target_unit: Optional[str] = None
    months: List[QualityReportMonthData]
    summary: QualityReportSummary


class QualityReportResponse(OrmModel):
    year: int
    objectives: List[QualityReportObjective]
