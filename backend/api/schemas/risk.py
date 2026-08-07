"""Risk assessment schemas"""
from typing import List, Optional
from .base import OrmModel


class RiskStatsResponse(OrmModel):
    total: int
    critical_risk: int
    overdue_treatment: int
    in_progress: int
    high_risk: int
    medium_risk: int
    low_risk: int
    selesai: int
    belum_dimulai: int
    ditunda: int


class RiskAssessmentResponse(OrmModel):
    id: int
    title: str
    description: Optional[str] = None
    risk_level: str
    status: str
    mitigation: Optional[str] = None
    created_at: Optional[str] = None
    created_by: Optional[int] = None


class RiskAssessmentListPaginatedResponse(OrmModel):
    data: List[RiskAssessmentResponse]
    pagination: dict


class RiskItemResponse(OrmModel):
    id: int
    assessment_id: int
    risk_description: str
    likelihood: int
    impact: int
    risk_score: int
    mitigation: Optional[str] = None
    status: str
    created_at: Optional[str] = None


class RiskItemListPaginatedResponse(OrmModel):
    data: List[RiskItemResponse]
    pagination: dict


class InterestedPartyResponse(OrmModel):
    id: int
    name: str
    type: str
    needs_expectations: Optional[str] = None
    created_at: Optional[str] = None


class InterestedPartyListPaginatedResponse(OrmModel):
    data: List[InterestedPartyResponse]
    pagination: dict


class PeluangResponse(OrmModel):
    id: int
    title: str
    description: Optional[str] = None
    action: Optional[str] = None
    status: str
    created_at: Optional[str] = None


class PeluangListPaginatedResponse(OrmModel):
    data: List[PeluangResponse]
    pagination: dict


class IsuMatrixResponse(OrmModel):
    id: int
    issue: str
    type: str
    impact: Optional[str] = None
    action: Optional[str] = None
    created_at: Optional[str] = None


class IsuMatrixListPaginatedResponse(OrmModel):
    data: List[IsuMatrixResponse]
    pagination: dict


class RiskStatsFullResponse(OrmModel):
    total: int
    open: int
    closed: int
    high_risk: int
    medium_risk: int
    low_risk: int
    by_level: dict
