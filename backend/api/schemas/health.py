"""Health check schemas"""
from typing import Optional
from .base import OrmModel


class HealthDetailResponse(OrmModel):
    status: str
    database: str
    smtp: Optional[str] = None
    disk_usage_percent: float
    memory_usage_percent: float
    cpu_usage_percent: float
    version: str


class HealthResponse(OrmModel):
    status: str
    version: str
    timestamp: str


class HealthLiveResponse(OrmModel):
    status: str


class HealthReadyResponse(OrmModel):
    status: str
    database: str
    disk_usage_percent: float
    memory_usage_percent: float
