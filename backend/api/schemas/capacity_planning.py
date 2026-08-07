"""Capacity planning schemas"""
from typing import List, Optional, Any
from .base import OrmModel


class CapacityResponse(OrmModel):
    hostname: str
    tanggal: str
    cpu_user_avg: float
    ram_avg: float
    disk_root_pct: int
    disk_data_pct: int
    status: str


class ProjectionResponse(OrmModel):
    hostname: str
    current_usage: float
    projected_usage: float
    days_until_full: Optional[int] = None
    trend: str


class CapacityServerResponse(OrmModel):
    hostname: str
    ip: Optional[str] = None
    os: Optional[str] = None
    status: str
    last_scan: Optional[str] = None


class CapacityServerListResponse(OrmModel):
    servers: List[CapacityServerResponse]


class CapacityServerDetailResponse(OrmModel):
    hostname: str
    data: dict


class CapacityHistoryResponse(OrmModel):
    hostname: str
    history: List[Any]


class CapacityPartitionResponse(OrmModel):
    hostname: str
    mount_point: str
    size_gb: float
    used_gb: float
    usage_pct: float


class CapacityPartitionListResponse(OrmModel):
    partitions: List[CapacityPartitionResponse]


class CapacityProjectionDetailResponse(OrmModel):
    hostname: str
    current_usage: float
    projected_usage: float
    days_until_full: Optional[int] = None
    trend: str
