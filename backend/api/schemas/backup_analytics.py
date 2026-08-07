"""Backup analytics schemas"""
from typing import List, Optional, Any
from .base import OrmModel


class BackupStatsResponse(OrmModel):
    total_servers: int
    total_backups: int
    ok_count: int
    warning_count: int
    critical_count: int
    avg_size_mb: float


class AnomalyResponse(OrmModel):
    server_name: str
    date: str
    expected_mb: float
    actual_mb: float
    deviation: float


class BackupDailyReportResponse(OrmModel):
    date: str
    total_backups: int
    ok_count: int
    warning_count: int
    critical_count: int
    total_size_mb: float


class BackupServerResponse(OrmModel):
    server_name: str
    total_backups: int
    last_backup: Optional[str] = None
    status: str


class BackupServerListResponse(OrmModel):
    servers: List[BackupServerResponse]


class BackupServerDetailResponse(OrmModel):
    server_name: str
    backups: List[Any]


class BackupTimelineResponse(OrmModel):
    timeline: List[Any]


class BackupAlertResponse(OrmModel):
    alerts: List[Any]


class BackupHeatmapResponse(OrmModel):
    heatmap: List[Any]


class BackupConsistencyResponse(OrmModel):
    server_name: str
    consistency_score: float


class BackupPeriodSummaryResponse(OrmModel):
    period: str
    total_backups: int
    ok_count: int
    warning_count: int
    critical_count: int


class BackupMonthlyAggregationResponse(OrmModel):
    month: str
    total_backups: int
    total_size_mb: float


class BackupTopServersResponse(OrmModel):
    servers: List[Any]


class BackupStatusDistributionResponse(OrmModel):
    distribution: dict


class BackupDailyTrendResponse(OrmModel):
    trend: List[Any]
