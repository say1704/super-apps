"""Asset schemas"""
from typing import List, Optional
from .base import OrmModel


class AssetStatsResponse(OrmModel):
    assets_total: int
    assets_hardware_count: int
    assets_software_count: int
    assets_vm_count: int
    configuration_items_count: int


class AssetResponse(OrmModel):
    id: int
    asset_code: str
    name: str
    category: str
    sub_category: Optional[str] = None
    classification: str
    owner_name: Optional[str] = None
    assigned_to: Optional[str] = None
    location: Optional[str] = None
    status: str
    purchase_date: Optional[str] = None
    warranty_until: Optional[str] = None
    disposal_date: Optional[str] = None
    price: Optional[float] = None
    created_by: Optional[str] = None
    updated_by: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class AssetListResponse(OrmModel):
    id: int
    asset_code: str
    name: str
    category: str
    sub_category: Optional[str] = None
    classification: str
    status: str
    owner_name: Optional[str] = None
    assigned_to: Optional[str] = None
    location: Optional[str] = None
    attributes: dict = {}
    purchase_date: Optional[str] = None
    warranty_until: Optional[str] = None
    disposal_date: Optional[str] = None
    price: Optional[float] = None
    acceptable_use_policy: Optional[str] = None
    created_by: Optional[str] = None
    updated_by: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class AssetListPaginatedResponse(OrmModel):
    data: List[AssetListResponse]
    pagination: dict


class AssetStatsFullResponse(OrmModel):
    total: int
    by_category: dict
    by_classification: dict
    by_status: dict


class AssetNextCodeResponse(OrmModel):
    next_code: str


class AssetCategoriesResponse(OrmModel):
    categories: List[str]
    sub_categories: dict
    classification_levels: List[str]
    status_options: List[str]


class AssetCreateResponse(OrmModel):
    message: str
    asset_code: str
    id: int


class AssetUpdateResponse(OrmModel):
    message: str
    asset_code: str


class AssetDeleteResponse(OrmModel):
    message: str
    asset_code: str


class AssetPasswordDecryptResponse(OrmModel):
    asset_id: int
    sub_category: str
    password: str


class AssetBulkResponse(OrmModel):
    message: str
    count: int
