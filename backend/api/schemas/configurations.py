"""Configuration item schemas"""
from typing import List, Optional
from .base import OrmModel


class ConfigurationItemResponse(OrmModel):
    id: int
    asset_id: int
    parameter: str
    value: str
    category: Optional[str] = None
    category_id: Optional[int] = None
    notes: Optional[str] = None
    last_checked: Optional[str] = None
    created_by: Optional[str] = None
    updated_by: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    version: Optional[int] = None


class ConfigurationListPaginatedResponse(OrmModel):
    data: List[ConfigurationItemResponse]
    pagination: dict


class ConfigurationStatsResponse(OrmModel):
    total: int
    by_category: dict
    by_asset: dict


class ConfigurationHistoryResponse(OrmModel):
    id: int
    config_id: Optional[int] = None
    asset_id: Optional[int] = None
    parameter: Optional[str] = None
    old_value: str
    new_value: str
    change_reason: Optional[str] = None
    change_request_id: Optional[str] = None
    changed_by: Optional[str] = None
    changed_at: Optional[str] = None


class ConfigurationHistoryListResponse(OrmModel):
    config_id: int
    parameter: str
    history: List[ConfigurationHistoryResponse]
