from utils.timezone import utcnow
"""Asset Register Unified API - ISO 27001:2022 Compliant
Uses relational schema: asset_common + 5 extension tables
Frontend-compatible: returns same JSON format as before
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, Query, Form, Request

logger = logging.getLogger(__name__)
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, selectinload
from sqlalchemy import or_, and_, func
from typing import Optional
from datetime import datetime, date
import json

from database import get_db
from models import AssetCommon, AssetUsers, AssetHardware, AssetSoftware, AssetVirtualInfrastructure, AssetInformation
from models import User, AssetAuditLog, ActivityLog
from models import IRMCCheck, CapacityMetrics, DiskPartition, BackupHistory, SSHLoginLog
from utils.password_encrypt import encrypt_password, decrypt_password
from utils.asset_code_generator import get_next_asset_code
from utils.rate_limiter import limiter
from utils.pagination import calculate_pagination, get_offset
from utils.activity_logger import log_create, log_update, log_delete, log_view, log_export, log_activity
from api.dependencies import get_current_user
from utils.optimistic_lock import check_version_conflict, increment_version, get_client_version
from api.schemas import (
    AssetListPaginatedResponse, AssetStatsFullResponse, AssetNextCodeResponse,
    AssetCategoriesResponse, AssetListResponse, AssetCreateResponse,
    AssetUpdateResponse, AssetDeleteResponse, AssetPasswordDecryptResponse,
    AssetBulkResponse,
)

router = APIRouter(prefix="/assets", tags=["Assets Unified"])

ALLOWED_SORT_FIELDS = {"created_at", "updated_at", "name", "asset_code", "status", "classification", "category", "sub_category", "location", "owner_name", "assigned_to", "purchase_date", "price"}
MAX_EXPORT_RECORDS = 5000
MAX_NAME_LENGTH = 255
MAX_LOCATION_LENGTH = 255
MAX_OWNER_LENGTH = 255
MAX_ASSIGNED_LENGTH = 255
MAX_AUP_LENGTH = 2000

# Date columns per extension table
DATE_COLUMNS = {
    "users": {"created_date"},
    "hardware": {"first_used_date"},
    "software": set(),
    "virtual-infrastructure": set(),
    "information": {"effective_date", "review_date", "created_date", "disposal_date", "archive_date"},
}


def parse_date_value(val):
    """Convert date string to Python date object if needed"""
    if val is None or isinstance(val, date):
        return val
    if isinstance(val, str) and val.strip():
        try:
            return datetime.strptime(val.strip(), "%Y-%m-%d").date()
        except (ValueError, TypeError):
            return None
    return None


# ==================== CONSTANTS (Hardcoded Fallbacks) ====================

BUILTIN_CATEGORIES = ["users", "hardware", "software", "virtual-infrastructure", "information"]

BUILTIN_SUB_CATEGORIES = {
    "users": ["team_member", "ftp_user", "samba_192", "samba_sequis", "sig_member"],
    "hardware": [
        "server_rack", "server_tower", "kvm", "laptop", "disk_sas", "tape_cassette"
    ],
    "software": ["os_license", "application", "utility", "freeware"],
    "virtual-infrastructure": ["virtual_machine", "container", "cloud_instance"],
    "information": ["database", "document", "record", "archive"]
}

import re
CUSTOM_SUB_CATEGORY_PATTERN = re.compile(r'^[a-z][a-z0-9_]{2,49}$')

BUILTIN_CLASSIFICATION_LEVELS = ["public", "internal", "confidential"]
BUILTIN_STATUS_OPTIONS = ["active", "in-maintenance", "retired", "lost"]

AUTO_CLASSIFICATION = {
    "users": {
        "team_member": "internal",
        "ftp_user": "confidential",
        "samba_192": "confidential",
        "samba_sequis": "confidential",
        "sig_member": "internal"
    },
    "hardware": "internal",
    "software": "internal",
    "virtual-infrastructure": "internal",
    "information": {
        "database": "confidential",
        "record": "confidential",
        "document": "internal",
        "archive": "internal"
    }
}


def get_metadata_with_fallback(db: Session, current_user: User) -> dict:
    """Load metadata from DB with fallback to hardcoded builtins.
    Returns combined data: DB entries + builtin fallbacks.
    """
    from models import (
        AssetMetadataCategory, AssetMetadataSubCategory,
        AssetMetadataClassification, AssetMetadataStatus,
    )

    # Categories: DB entries for user's role + builtins
    cat_query = db.query(AssetMetadataCategory).order_by(
        AssetMetadataCategory.sort_order, AssetMetadataCategory.name
    )
    if current_user.role != "superadmin":
        cat_query = cat_query.filter(AssetMetadataCategory.owner_role == current_user.role)
    db_categories = cat_query.all()
    categories = [c.name for c in db_categories]
    # Ensure builtins are always available
    for bc in BUILTIN_CATEGORIES:
        if bc not in categories:
            categories.append(bc)

    # Sub-categories: DB entries for user's role + builtins
    subcat_query = db.query(AssetMetadataSubCategory).order_by(
        AssetMetadataSubCategory.category_id, AssetMetadataSubCategory.sort_order, AssetMetadataSubCategory.name
    )
    if current_user.role != "superadmin":
        subcat_query = subcat_query.filter(AssetMetadataSubCategory.owner_role == current_user.role)
    db_subcats = subcat_query.all()
    sub_categories = dict(BUILTIN_SUB_CATEGORIES)  # Start with builtins
    for sc in db_subcats:
        cat = db.query(AssetMetadataCategory).filter(AssetMetadataCategory.id == sc.category_id).first()
        if cat:
            if cat.name not in sub_categories:
                sub_categories[cat.name] = []
            if sc.name not in sub_categories[cat.name]:
                sub_categories[cat.name].append(sc.name)

    # Classifications: DB entries for user's role + builtins
    class_query = db.query(AssetMetadataClassification).order_by(
        AssetMetadataClassification.sort_order, AssetMetadataClassification.name
    )
    if current_user.role != "superadmin":
        class_query = class_query.filter(AssetMetadataClassification.owner_role == current_user.role)
    db_classifications = class_query.all()
    classification_levels = [c.name for c in db_classifications]
    for bc in BUILTIN_CLASSIFICATION_LEVELS:
        if bc not in classification_levels:
            classification_levels.append(bc)

    # Statuses: DB entries for user's role + builtins
    status_query = db.query(AssetMetadataStatus).order_by(
        AssetMetadataStatus.sort_order, AssetMetadataStatus.name
    )
    if current_user.role != "superadmin":
        status_query = status_query.filter(AssetMetadataStatus.owner_role == current_user.role)
    db_statuses = status_query.all()
    status_options = [s.name for s in db_statuses]
    for bs in BUILTIN_STATUS_OPTIONS:
        if bs not in status_options:
            status_options.append(bs)

    return {
        "categories": categories,
        "sub_categories": sub_categories,
        "classification_levels": classification_levels,
        "status_options": status_options,
    }


# Backward-compatible aliases (used by validation functions)
CATEGORIES = BUILTIN_CATEGORIES
SUB_CATEGORIES = BUILTIN_SUB_CATEGORIES
CLASSIFICATION_LEVELS = BUILTIN_CLASSIFICATION_LEVELS
STATUS_OPTIONS = BUILTIN_STATUS_OPTIONS


def is_valid_sub_category(sub_category: str) -> bool:
    return sub_category in SUB_CATEGORIES.get("hardware", []) or \
           bool(CUSTOM_SUB_CATEGORY_PATTERN.match(sub_category))

def normalize_sub_category(sub_category: str) -> str:
    return sub_category.lower().strip().replace(' ', '_').replace('-', '_')


# ==================== HELPER FUNCTIONS ====================

def get_auto_classification(category: str, sub_category: str) -> str:
    if category in AUTO_CLASSIFICATION:
        if isinstance(AUTO_CLASSIFICATION[category], dict):
            return AUTO_CLASSIFICATION[category].get(sub_category, "internal")
        return AUTO_CLASSIFICATION[category]
    return "internal"


def extension_model_for_category(category: str):
    """Return the SQLAlchemy model for the given category"""
    mapping = {
        "users": AssetUsers,
        "hardware": AssetHardware,
        "software": AssetSoftware,
        "virtual-infrastructure": AssetVirtualInfrastructure,
        "information": AssetInformation,
    }
    return mapping.get(category)


def extension_relationship_name(category: str) -> str:
    """Return the relationship name on AssetCommon for the given category"""
    mapping = {
        "users": "users",
        "hardware": "hardware",
        "software": "software",
        "virtual-infrastructure": "virtual_infrastructure",
        "information": "information",
    }
    return mapping.get(category)


def _escape_like(value: str) -> str:
    """Escape SQL LIKE special characters to prevent wildcard injection"""
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def attrs_to_dict(ext) -> dict:
    """Convert extension table row to attributes dict (frontend-compatible)"""
    if ext is None:
        return {}
    
    result = {}
    for col in ext.__table__.columns:
        if col.name in ("id", "asset_id"):
            continue
        val = getattr(ext, col.name, None)
        if val is not None:
            # Map column names to frontend attribute names
            result[col.name] = val
    return result


def build_asset_response(asset: AssetCommon, decrypt_pwd: bool = False, mask_pwd: bool = True) -> dict:
    """Build frontend-compatible response from AssetCommon + extension"""
    rel_name = extension_relationship_name(asset.category)
    ext = getattr(asset, rel_name, None)
    
    attributes = attrs_to_dict(ext)
    
    # Handle password fields
    pwd_fields = ["ftp_user", "samba_192", "samba_sequis"]
    if asset.sub_category in pwd_fields and "password_encrypted" in attributes:
        if decrypt_pwd:
            try:
                attributes["password"] = decrypt_password(attributes.pop("password_encrypted"))
            except (ValueError, TypeError):
                attributes["password"] = ""
        elif mask_pwd:
            attributes["password"] = "••••••••"
            attributes.pop("password_encrypted", None)
        else:
            attributes.pop("password_encrypted", None)
    
    return {
        "id": asset.id,
        "asset_code": asset.asset_code,
        "name": asset.name,
        "category": asset.category,
        "sub_category": asset.sub_category,
        "classification": asset.classification,
        "status": asset.status,
        "owner_name": asset.owner_name,
        "assigned_to": asset.assigned_to,
        "location": asset.location,
        "attributes": attributes,
        "purchase_date": str(asset.purchase_date) if asset.purchase_date else None,
        "warranty_until": str(asset.warranty_until) if asset.warranty_until else None,
        "disposal_date": str(asset.disposal_date) if asset.disposal_date else None,
        "price": asset.price,
        "acceptable_use_policy": asset.acceptable_use_policy,
        "created_by": asset.created_by,
        "updated_by": asset.updated_by,
        "created_at": str(asset.created_at),
        "updated_at": str(asset.updated_at)
    }


def create_extension_record(category: str, asset_id: int, attributes: dict, db: Session):
    """Create a record in the appropriate extension table"""
    model = extension_model_for_category(category)
    if model is None:
        raise HTTPException(status_code=400, detail=f"Invalid category: {category}")
    
    date_cols = DATE_COLUMNS.get(category, set())
    valid_columns = {c.name for c in model.__table__.columns if c.name not in ("id",)}
    
    data = {"asset_id": asset_id}
    
    # Handle password encryption BEFORE valid_columns filter
    # (password column doesn't exist in DB, only password_encrypted)
    if category == "users" and "password" in attributes and attributes["password"]:
        data["password_encrypted"] = encrypt_password(attributes["password"])
        attributes = {k: v for k, v in attributes.items() if k != "password"}
    
    for key, val in attributes.items():
        if key in valid_columns:
            if key in date_cols:
                data[key] = parse_date_value(val)
            else:
                data[key] = val
    
    record = model(**data)
    db.add(record)
    return record


def update_extension_record(category: str, asset_id: int, attributes: dict, db: Session):
    """Update or create the extension record"""
    import logging
    logger = logging.getLogger(__name__)
    
    model = extension_model_for_category(category)
    if model is None:
        return
    
    date_cols = DATE_COLUMNS.get(category, set())
    valid_columns = {c.name for c in model.__table__.columns if c.name not in ("id", "asset_id")}
    
    ext = db.query(model).filter(model.asset_id == asset_id).first()
    
    # Handle password encryption BEFORE valid_columns filter (for both create and update)
    if category == "users" and "password" in attributes:
        if attributes["password"]:
            logger.info(f"[ASSET] Encrypting password for asset_id={asset_id}")
            encrypted_pwd = encrypt_password(attributes["password"])
            if ext is None:
                attributes["password_encrypted"] = encrypted_pwd
                logger.info(f"[ASSET] Password added to new record attributes")
            else:
                setattr(ext, "password_encrypted", encrypted_pwd)
                logger.info(f"[ASSET] Password updated on existing record")
        else:
            logger.info(f"[ASSET] Password field is empty, skipping encryption")
        # Remove password from attributes to avoid processing it again
        attributes = {k: v for k, v in attributes.items() if k != "password"}
    
    if ext is None:
        data = {"asset_id": asset_id}
        
        for key, val in attributes.items():
            if key in valid_columns:
                if key in date_cols:
                    data[key] = parse_date_value(val)
                else:
                    data[key] = val
        db.add(model(**data))
        logger.info(f"[ASSET] Created new extension record for asset_id={asset_id}")
    else:
        for key, val in attributes.items():
            if key in valid_columns:
                if key in date_cols:
                    setattr(ext, key, parse_date_value(val))
                else:
                    setattr(ext, key, val)
        logger.info(f"[ASSET] Updated existing extension record for asset_id={asset_id}")


# ==================== API ENDPOINTS ====================

@router.get("", response_model=AssetListPaginatedResponse)
async def get_all_assets(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    category: Optional[str] = Query(None),
    sub_category: Optional[str] = Query(None),
    classification: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    location: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    sort_by: str = Query("created_at"),
    sort_order: str = Query("desc"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = db.query(AssetCommon).filter(AssetCommon.deleted_at.is_(None))
    
    if current_user and current_user.role != "superadmin":
        query = query.filter(AssetCommon.owner_role == current_user.role)
    
    if category:
        query = query.filter(AssetCommon.category == category)
    if sub_category:
        query = query.filter(AssetCommon.sub_category == sub_category)
    if classification:
        query = query.filter(AssetCommon.classification == classification)
    if status:
        query = query.filter(AssetCommon.status == status)
    if location:
        query = query.filter(AssetCommon.location.ilike(f"%{_escape_like(location)}%", escape="\\"))
    if search:
        escaped = _escape_like(search)
        query = query.filter(
            or_(
                AssetCommon.name.ilike(f"%{escaped}%", escape="\\"),
                AssetCommon.asset_code.ilike(f"%{escaped}%", escape="\\"),
                AssetCommon.owner_name.ilike(f"%{escaped}%", escape="\\"),
                AssetCommon.assigned_to.ilike(f"%{escaped}%", escape="\\")
            )
        )
    
    total = query.count()
    
    if sort_by in ALLOWED_SORT_FIELDS and hasattr(AssetCommon, sort_by):
        column = getattr(AssetCommon, sort_by)
        if sort_order.lower() == "asc":
            query = query.order_by(column.asc())
        else:
            query = query.order_by(column.desc())
    else:
        query = query.order_by(AssetCommon.created_at.desc())
    
    offset = get_offset(page, page_size)
    query = query.options(
        selectinload(AssetCommon.users),
        selectinload(AssetCommon.hardware),
        selectinload(AssetCommon.software),
        selectinload(AssetCommon.virtual_infrastructure),
        selectinload(AssetCommon.information),
    )
    records = query.offset(offset).limit(page_size).all()
    
    pagination = calculate_pagination(page, page_size, total)
    
    data = []
    for record in records:
        data.append(build_asset_response(record))
    
    return {
        "data": data,
        "pagination": pagination.dict()
    }


@router.get("/stats", response_model=AssetStatsFullResponse)
async def get_asset_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    base_query = db.query(AssetCommon).filter(AssetCommon.deleted_at.is_(None))
    if current_user and current_user.role != "superadmin":
        base_query = base_query.filter(AssetCommon.owner_role == current_user.role)

    stats = {
        "total": base_query.with_entities(func.count(AssetCommon.id)).scalar() or 0,
        "by_category": {},
        "by_classification": {},
        "by_status": {}
    }

    cat_rows = base_query.with_entities(AssetCommon.category, func.count(AssetCommon.id)).group_by(AssetCommon.category).all()
    stats["by_category"] = {row[0]: row[1] for row in cat_rows}

    class_rows = base_query.with_entities(AssetCommon.classification, func.count(AssetCommon.id)).group_by(AssetCommon.classification).all()
    stats["by_classification"] = {row[0]: row[1] for row in class_rows}

    status_rows = base_query.with_entities(AssetCommon.status, func.count(AssetCommon.id)).group_by(AssetCommon.status).all()
    stats["by_status"] = {row[0]: row[1] for row in status_rows}
    
    for classification in CLASSIFICATION_LEVELS:
        count = base_query.filter(AssetCommon.classification == classification).count()
        stats["by_classification"][classification] = count
    
    for status in STATUS_OPTIONS:
        count = base_query.filter(AssetCommon.status == status).count()
        stats["by_status"][status] = count
    
    return stats


@router.get("/next-code", response_model=AssetNextCodeResponse)
async def get_next_asset_code_endpoint(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    next_code = get_next_asset_code(db)
    return {"next_code": next_code}


@router.get("/categories", response_model=AssetCategoriesResponse)
async def get_categories(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get categories, sub-categories, classifications, and statuses.
    Combines DB entries (role-based) with builtin fallbacks.
    """
    metadata = get_metadata_with_fallback(db, current_user)
    return {
        "categories": metadata["categories"],
        "sub_categories": metadata["sub_categories"],
        "classification_levels": metadata["classification_levels"],
        "status_options": metadata["status_options"]
    }


@router.get("/export-data")
async def export_assets_data(
    search: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    sub_category: Optional[str] = Query(None),
    classification: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    location: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = db.query(AssetCommon).filter(AssetCommon.deleted_at.is_(None))

    if current_user and current_user.role != "superadmin":
        query = query.filter(AssetCommon.owner_role == current_user.role)

    if category:
        query = query.filter(AssetCommon.category == category)
    if sub_category:
        query = query.filter(AssetCommon.sub_category == sub_category)
    if classification:
        query = query.filter(AssetCommon.classification == classification)
    if status:
        query = query.filter(AssetCommon.status == status)
    if location:
        query = query.filter(AssetCommon.location.ilike(f"%{_escape_like(location)}%", escape="\\"))
    if search:
        escaped = _escape_like(search)
        query = query.filter(
            or_(
                AssetCommon.name.ilike(f"%{escaped}%", escape="\\"),
                AssetCommon.asset_code.ilike(f"%{escaped}%", escape="\\"),
                AssetCommon.owner_name.ilike(f"%{escaped}%", escape="\\"),
                AssetCommon.assigned_to.ilike(f"%{escaped}%", escape="\\")
            )
        )

    total = query.count()
    query = query.options(
        selectinload(AssetCommon.users),
        selectinload(AssetCommon.hardware),
        selectinload(AssetCommon.software),
        selectinload(AssetCommon.virtual_infrastructure),
        selectinload(AssetCommon.information),
    )
    records = query.limit(MAX_EXPORT_RECORDS).all()

    log_export(
        db=db,
        user=current_user,
        module='assets',
        description=f'Exported {len(records)} assets to data',
        details={'count': len(records), 'total_available': total}
    )

    return {
        "data": [build_asset_response(r) for r in records],
        "total": total,
        "exported": len(records),
    }


@router.get("/import-candidates")
async def get_import_candidates(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Candidate assets inferred from server sources (iRMC, Backup, SAR, SSH)."""
    distinct_names = {
        "irmc": [r[0] for r in db.query(IRMCCheck.server_name).distinct().all() if r[0]],
        "backup": [r[0] for r in db.query(BackupHistory.server_name).distinct().all() if r[0]],
        "sar": [r[0] for r in db.query(CapacityMetrics.hostname).distinct().all() if r[0]],
        "ssh": [r[0] for r in db.query(SSHLoginLog.hostname).distinct().all() if r[0]],
    }

    existing = db.query(AssetCommon.category, AssetCommon.name).filter(
        AssetCommon.deleted_at.is_(None)
    ).all()
    existing_keys = {(cat, _normalize_name(name)) for cat, name in existing}

    latest_rows = db.query(CapacityMetrics).filter(
        CapacityMetrics.id.in_(
            db.query(func.max(CapacityMetrics.id)).group_by(CapacityMetrics.hostname)
        )
    ).all()
    metrics_by_host = {}
    for m in latest_rows:
        metrics_by_host[m.hostname] = m

    parts = db.query(DiskPartition.hostname, DiskPartition.mount_point, DiskPartition.size).all()
    part_by_host = {}
    for host, mp, size in parts:
        if size:
            part_by_host.setdefault(host, {})[mp] = size

    groups = []
    new_count = 0
    existing_count = 0
    for source in ("irmc", "backup", "sar", "ssh"):
        category = SOURCE_CATEGORY[source]
        sub_category = SOURCE_SUB_CATEGORY[source]
        items = []
        for name in distinct_names[source]:
            if not name or name.strip() == "-":
                continue
            norm = _normalize_name(name)
            exists = (category, norm) in existing_keys
            attributes = {}
            note = SOURCE_LABEL[source]
            metric = (metrics_by_host.get(name) if source == "sar" else None)
            if metric:
                sysinfo = metric.system_info or {}
                attributes = {
                    "ip_address": metric.ip_address or metric.local_ip,
                    "os": sysinfo.get("os"),
                    "cpu": sysinfo.get("cpu"),
                    "ram": sysinfo.get("ram"),
                    "hypervisor": sysinfo.get("hypervisor"),
                }
                details = [SOURCE_LABEL[source]]
                if sysinfo.get("system"):
                    details.append("System: " + sysinfo["system"])
                if sysinfo.get("serial"):
                    details.append("Serial: " + sysinfo["serial"])
                if metric.public_ip:
                    details.append("Public IP: " + metric.public_ip)
                note = "; ".join(details)
            elif source in ("backup", "ssh"):
                if metrics_by_host.get(name):
                    attributes["ip_address"] = metrics_by_host[name].ip_address or metrics_by_host[name].local_ip
            if part_by_host.get(name):
                storage = ", ".join(f"{mp}: {size}" for mp, size in part_by_host[name].items())
                attributes["storage"] = storage
            items.append({
                "name": name,
                "source": source,
                "source_label": SOURCE_LABEL[source],
                "category": category,
                "sub_category": sub_category,
                "exists": exists,
                "attributes": {k: v for k, v in attributes.items() if v},
                "keterangan": note,
            })
            if exists:
                existing_count += 1
            else:
                new_count += 1
        if items:
            groups.append({
                "source": source,
                "source_label": SOURCE_LABEL[source],
                "category": category,
                "sub_category": sub_category,
                "items": items,
            })
    return {"groups": groups, "new_count": new_count, "existing_count": existing_count}


@router.get("/{asset_id}", response_model=AssetListResponse)
async def get_asset(
    asset_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    asset = db.query(AssetCommon).filter(
        AssetCommon.id == asset_id,
        AssetCommon.deleted_at.is_(None)
    ).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    if current_user.role != "superadmin" and asset.owner_role != current_user.role:
        raise HTTPException(status_code=403, detail="Access denied")
    
    return build_asset_response(asset)


@router.post("", response_model=AssetCreateResponse)
async def create_asset(
    name: str = Form(...),
    category: str = Form(...),
    sub_category: str = Form(...),
    classification: Optional[str] = Form(None),
    owner_name: Optional[str] = Form(None),
    assigned_to: Optional[str] = Form(None),
    location: Optional[str] = Form(None),
    status: str = Form("active"),
    purchase_date: Optional[str] = Form(None),
    warranty_until: Optional[str] = Form(None),
    price: Optional[float] = Form(None),
    acceptable_use_policy: Optional[str] = Form(None),
    attributes: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if not name.strip() or len(name) > MAX_NAME_LENGTH:
        raise HTTPException(status_code=400, detail=f"Name must be 1-{MAX_NAME_LENGTH} characters")
    if owner_name and len(owner_name) > MAX_OWNER_LENGTH:
        raise HTTPException(status_code=400, detail=f"Owner name exceeds {MAX_OWNER_LENGTH} characters")
    if assigned_to and len(assigned_to) > MAX_ASSIGNED_LENGTH:
        raise HTTPException(status_code=400, detail=f"Assigned to exceeds {MAX_ASSIGNED_LENGTH} characters")
    if location and len(location) > MAX_LOCATION_LENGTH:
        raise HTTPException(status_code=400, detail=f"Location exceeds {MAX_LOCATION_LENGTH} characters")
    if acceptable_use_policy and len(acceptable_use_policy) > MAX_AUP_LENGTH:
        raise HTTPException(status_code=400, detail=f"Acceptable use policy exceeds {MAX_AUP_LENGTH} characters")
    
    # Load metadata from DB with builtin fallback
    metadata = get_metadata_with_fallback(db, current_user)
    valid_categories = metadata["categories"]
    valid_sub_categories = metadata["sub_categories"]
    valid_classifications = metadata["classification_levels"]
    valid_statuses = metadata["status_options"]
    
    if category not in valid_categories:
        raise HTTPException(status_code=400, detail=f"Invalid category")
    
    sub_category = normalize_sub_category(sub_category)
    
    if category == "hardware":
        if not is_valid_sub_category(sub_category):
            raise HTTPException(status_code=400, detail=f"Invalid sub-category format")
    elif sub_category not in valid_sub_categories.get(category, []):
        raise HTTPException(status_code=400, detail=f"Invalid sub-category for {category}")
    
    asset_code = get_next_asset_code(db)
    
    if not classification:
        classification = get_auto_classification(category, sub_category)
    
    if classification not in valid_classifications:
        raise HTTPException(status_code=400, detail=f"Invalid classification")
    
    if status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status")
    
    attributes_dict = {}
    if attributes:
        try:
            attributes_dict = json.loads(attributes)
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="Invalid attributes JSON")
    
    purchase_date_obj = None
    warranty_until_obj = None
    if purchase_date:
        try:
            purchase_date_obj = datetime.strptime(purchase_date, "%Y-%m-%d").date()
        except (ValueError, TypeError):
            logger.warning("Invalid purchase_date format: %s", purchase_date)
    if warranty_until:
        try:
            warranty_until_obj = datetime.strptime(warranty_until, "%Y-%m-%d").date()
        except (ValueError, TypeError):
            logger.warning("Invalid warranty_until format: %s", warranty_until)
    
    asset = AssetCommon(
        asset_code=asset_code,
        name=name,
        category=category,
        sub_category=sub_category,
        classification=classification,
        owner_name=owner_name,
        assigned_to=assigned_to,
        location=location,
        status=status,
        purchase_date=purchase_date_obj,
        warranty_until=warranty_until_obj,
        price=price,
        acceptable_use_policy=acceptable_use_policy,
        created_by=current_user.username if current_user else "system",
        owner_role=current_user.role if current_user else None
    )
    
    db.add(asset)
    db.flush()  # Get asset.id
    
    # Create extension record
    create_extension_record(category, asset.id, attributes_dict, db)
    
    db.commit()
    db.refresh(asset)
    
    log_create(
        db=db,
        user=current_user,
        module='assets',
        item_name=f'{category} - {name}',
        item_id=asset.id,
        details={
            'asset_code': asset_code,
            'sub_category': sub_category,
            'classification': classification
        }
    )
    
    return {
        "message": "Asset created successfully",
        "asset_code": asset_code,
        "id": asset.id
    }


@router.put("/{asset_id}", response_model=AssetUpdateResponse)
async def update_asset(
    asset_id: int, request: Request,
    name: Optional[str] = Form(None),
    category: Optional[str] = Form(None),
    sub_category: Optional[str] = Form(None),
    classification: Optional[str] = Form(None),
    owner_name: Optional[str] = Form(None),
    assigned_to: Optional[str] = Form(None),
    location: Optional[str] = Form(None),
    status: Optional[str] = Form(None),
    purchase_date: Optional[str] = Form(None),
    warranty_until: Optional[str] = Form(None),
    disposal_date: Optional[str] = Form(None),
    price: Optional[float] = Form(None),
    acceptable_use_policy: Optional[str] = Form(None),
    attributes: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    asset = db.query(AssetCommon).filter(AssetCommon.id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    if current_user.role != "superadmin" and asset.owner_role != current_user.role:
        raise HTTPException(status_code=403, detail="Access denied")

    client_version = get_client_version(request)
    check_version_conflict(asset, client_version)
    
    # Load metadata from DB with builtin fallback
    metadata = get_metadata_with_fallback(db, current_user)
    valid_categories = metadata["categories"]
    valid_sub_categories = metadata["sub_categories"]
    valid_classifications = metadata["classification_levels"]
    valid_statuses = metadata["status_options"]
    
    if name is not None:
        if not name.strip() or len(name) > MAX_NAME_LENGTH:
            raise HTTPException(status_code=400, detail=f"Name must be 1-{MAX_NAME_LENGTH} characters")
        asset.name = name
    if category is not None:
        if category not in valid_categories:
            raise HTTPException(status_code=400, detail=f"Invalid category")
        asset.category = category
    if sub_category is not None:
        asset.sub_category = normalize_sub_category(sub_category)
        if asset.category == "hardware":
            if not is_valid_sub_category(asset.sub_category):
                raise HTTPException(status_code=400, detail=f"Invalid sub-category format")
        elif asset.sub_category not in valid_sub_categories.get(asset.category, []):
            raise HTTPException(status_code=400, detail=f"Invalid sub-category for {asset.category}")
        if not classification:
            classification = get_auto_classification(asset.category, asset.sub_category)
    if classification is not None:
        if classification not in valid_classifications:
            raise HTTPException(status_code=400, detail=f"Invalid classification")
        asset.classification = classification
    if owner_name is not None:
        if len(owner_name) > MAX_OWNER_LENGTH:
            raise HTTPException(status_code=400, detail=f"Owner name exceeds {MAX_OWNER_LENGTH} characters")
        asset.owner_name = owner_name
    if assigned_to is not None:
        if len(assigned_to) > MAX_ASSIGNED_LENGTH:
            raise HTTPException(status_code=400, detail=f"Assigned to exceeds {MAX_ASSIGNED_LENGTH} characters")
        asset.assigned_to = assigned_to
    if location is not None:
        if len(location) > MAX_LOCATION_LENGTH:
            raise HTTPException(status_code=400, detail=f"Location exceeds {MAX_LOCATION_LENGTH} characters")
        asset.location = location
    if status is not None:
        if status not in valid_statuses:
            raise HTTPException(status_code=400, detail=f"Invalid status")
        asset.status = status
    if price is not None:
        asset.price = price
    if acceptable_use_policy is not None:
        if len(acceptable_use_policy) > MAX_AUP_LENGTH:
            raise HTTPException(status_code=400, detail=f"Acceptable use policy exceeds {MAX_AUP_LENGTH} characters")
        asset.acceptable_use_policy = acceptable_use_policy
    
    if purchase_date is not None:
        try:
            asset.purchase_date = datetime.strptime(purchase_date, "%Y-%m-%d").date()
        except (ValueError, TypeError):
            logger.warning("Invalid purchase_date format: %s", purchase_date)
    if warranty_until is not None:
        try:
            asset.warranty_until = datetime.strptime(warranty_until, "%Y-%m-%d").date()
        except (ValueError, TypeError):
            logger.warning("Invalid warranty_until format: %s", warranty_until)
    if disposal_date is not None:
        try:
            asset.disposal_date = datetime.strptime(disposal_date, "%Y-%m-%d").date()
        except (ValueError, TypeError):
            logger.warning("Invalid disposal_date format: %s", disposal_date)
    
    if attributes is not None:
        try:
            attributes_dict = json.loads(attributes)
            update_extension_record(asset.category, asset.id, attributes_dict, db)
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="Invalid attributes JSON")
    
    asset.updated_by = current_user.username if current_user else "system"
    asset.updated_at = utcnow()
    increment_version(asset)
    
    db.commit()
    db.refresh(asset)
    
    log_update(
        db=db,
        user=current_user,
        module='assets',
        item_name=f'{asset.category} - {asset.name}',
        item_id=asset.id,
        details={
            'asset_code': asset.asset_code,
            'updated_fields': [k for k, v in locals().items() if k not in ['asset_id', 'db', 'current_user', 'asset'] and v is not None]
        }
    )
    
    return {"message": "Asset updated successfully", "asset_code": asset.asset_code}


@router.delete("/{asset_id}", response_model=AssetDeleteResponse)
async def delete_asset(
    asset_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    asset = db.query(AssetCommon).filter(
        AssetCommon.id == asset_id,
        AssetCommon.deleted_at.is_(None)
    ).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    if current_user.role != "superadmin" and asset.owner_role != current_user.role:
        raise HTTPException(status_code=403, detail="Access denied")
    
    asset_code = asset.asset_code
    asset_name = asset.name
    asset_category = asset.category
    
    asset.deleted_at = utcnow()
    db.commit()
    
    log_delete(
        db=db,
        user=current_user,
        module='assets',
        item_name=f'{asset_category} - {asset_name}',
        item_id=asset_id,
        details={'asset_code': asset_code}
    )
    
    return {"message": "Asset deleted successfully", "asset_code": asset_code}


@router.get("/export/csv")
async def export_assets_csv(
    category: Optional[str] = Query(None),
    classification: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    base_query = db.query(AssetCommon).filter(AssetCommon.deleted_at.is_(None))

    if current_user and current_user.role != "superadmin":
        base_query = base_query.filter(AssetCommon.owner_role == current_user.role)

    if category:
        base_query = base_query.filter(AssetCommon.category == category)
    if classification:
        base_query = base_query.filter(AssetCommon.classification == classification)
    if status:
        base_query = base_query.filter(AssetCommon.status == status)

    total = base_query.with_entities(func.count(AssetCommon.id)).scalar() or 0

    log_export(
        db=db,
        user=current_user,
        module='assets',
        description=f'Exported up to {MAX_EXPORT_RECORDS} assets to CSV (total available: {total})',
        details={
            'count': min(total, MAX_EXPORT_RECORDS),
            'total_available': total,
            'filters': {'category': category, 'classification': classification, 'status': status}
        }
    )

    timestamp = utcnow().strftime("%Y%m%d-%H%M")
    filename = f"assets-export-{timestamp}.csv"

    BATCH_SIZE = 500
    header = "\ufeffAsset Code,Name,Category,Sub-Category,Classification,Status,Owner,Assigned To,Location,Created At\n"

    def csv_generator():
        yield header.encode("utf-8")
        offset = 0
        while offset < MAX_EXPORT_RECORDS:
            batch = base_query.offset(offset).limit(BATCH_SIZE).all()
            if not batch:
                break
            lines = []
            for asset in batch:
                lines.append(
                    f'"{asset.asset_code}","{asset.name}","{asset.category}",'
                    f'"{asset.sub_category}","{asset.classification}","{asset.status}",'
                    f'"{asset.owner_name or ""}","{asset.assigned_to or ""}",'
                    f'"{asset.location or ""}","{asset.created_at}"\n'
                )
            yield "".join(lines).encode("utf-8")
            offset += BATCH_SIZE
            if len(batch) < BATCH_SIZE:
                break

    return StreamingResponse(
        csv_generator(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.post("/{asset_id}/decrypt-password", response_model=AssetPasswordDecryptResponse)
@limiter.limit("5/minute")
async def decrypt_asset_password(
    asset_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    try:
        body = await request.json()
        verification_password = body.get("verification_password", "")
    except Exception as e:
        raise HTTPException(status_code=400, detail="Invalid request data")
    
    asset = db.query(AssetCommon).filter(AssetCommon.id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    
    # Get extension record for password
    rel_name = extension_relationship_name(asset.category)
    ext = getattr(asset, rel_name, None)
    
    if ext is None:
        raise HTTPException(status_code=400, detail="Asset extension record not found")
    if not hasattr(ext, 'password_encrypted') or not ext.password_encrypted:
        raise HTTPException(status_code=400, detail="This asset has no password stored. Please edit and re-save the asset with a password.")
    
    client_ip = request.client.host if request.client else "unknown"
    
    import logging
    logger = logging.getLogger(__name__)
    logger.info(f"[DECRYPT] User {current_user.username} attempting to decrypt asset {asset_id}")
    
    if not current_user.verify_password(verification_password):
        logger.warning(f"[DECRYPT] Password verification failed for user {current_user.username}")
        audit_log = AssetAuditLog(
            asset_id=asset_id,
            asset_code=asset.asset_code,
            asset_name=asset.name,
            sub_category=asset.sub_category,
            action_type="view_password_failed",
            username=current_user.username,
            ip_address=client_ip,
            details={"reason": "Incorrect user password"}
        )
        db.add(audit_log)
        db.commit()
        
        log_activity(
            db=db,
            user=current_user,
            action='VIEW_PASSWORD_FAILED',
            module='assets',
            description=f'Failed to view password for asset "{asset.name}" (wrong password)',
            asset_id=asset_id,
            asset_code=asset.asset_code
        )
        db.commit()
        
        raise HTTPException(status_code=403, detail="Incorrect password. Please enter your own login password.")
    
    decrypted_password = ""
    try:
        decrypted = decrypt_password(ext.password_encrypted)
        decrypted_password = decrypted
        
        username_val = getattr(ext, 'username', '')
        group_val = getattr(ext, 'group_name', '')
        
        audit_log = AssetAuditLog(
            asset_id=asset_id,
            asset_code=asset.asset_code,
            asset_name=asset.name,
            sub_category=asset.sub_category,
            action_type="view_password",
            username=current_user.username,
            ip_address=client_ip,
            details={
                "username_viewed": username_val,
                "group_name": group_val
            }
        )
        db.add(audit_log)
        db.commit()
        
        log_activity(
            db=db,
            user=current_user,
            action='VIEW_PASSWORD',
            module='assets',
            description=f'Viewed password for asset "{asset.name}" ({asset.sub_category})',
            asset_id=asset_id,
            asset_code=asset.asset_code
        )
        db.commit()
        
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to decrypt password")
    
    return {
        "asset_id": asset_id,
        "sub_category": asset.sub_category,
        "password": decrypted_password
    }


# ==================== BULK ASSET ACTIONS ====================
@router.post("/bulk-delete", response_model=AssetBulkResponse)
@limiter.limit("10/minute")
async def bulk_delete_assets(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    body = await request.json()
    asset_ids = body.get("ids", [])
    if not asset_ids:
        raise HTTPException(status_code=400, detail="No asset IDs provided")
    filters = [AssetCommon.id.in_(asset_ids), AssetCommon.deleted_at.is_(None)]
    if current_user.role != "superadmin":
        filters.append(AssetCommon.owner_role == current_user.role)
    deleted_count = db.query(AssetCommon).filter(*filters).update(
        {AssetCommon.deleted_at: utcnow()}, synchronize_session='fetch'
    )
    if deleted_count == 0:
        raise HTTPException(status_code=403, detail="No assets found or you do not have permission")
    db.commit()
    log_delete(db, current_user, f"Bulk deleted {deleted_count} assets", module="assets")
    return {"message": f"Deleted {deleted_count} assets", "count": deleted_count}


@router.post("/bulk-status", response_model=AssetBulkResponse)
@limiter.limit("20/minute")
async def bulk_update_asset_status(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    body = await request.json()
    asset_ids = body.get("ids", [])
    new_status = body.get("status")
    if not asset_ids or not new_status:
        raise HTTPException(status_code=400, detail="Asset IDs and status required")
    
    metadata = get_metadata_with_fallback(db, current_user)
    valid_statuses = metadata["status_options"]
    
    if new_status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status")
    filters = [AssetCommon.id.in_(asset_ids), AssetCommon.deleted_at.is_(None)]
    if current_user.role != "superadmin":
        filters.append(AssetCommon.owner_role == current_user.role)
    updated_count = db.query(AssetCommon).filter(*filters).update(
        {AssetCommon.status: new_status}, synchronize_session='fetch'
    )
    if updated_count == 0:
        raise HTTPException(status_code=403, detail="No assets found or you do not have permission")
    db.commit()
    log_activity(db, current_user, "UPDATE", "assets", f"Bulk updated {updated_count} assets to {new_status}")
    return {"message": f"Updated {updated_count} assets to {new_status}", "count": updated_count}


@router.post("/bulk-classification", response_model=AssetBulkResponse)
@limiter.limit("20/minute")
async def bulk_update_classification(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    body = await request.json()
    asset_ids = body.get("ids", [])
    new_classification = body.get("classification")
    if not asset_ids or not new_classification:
        raise HTTPException(status_code=400, detail="Asset IDs and classification required")
    
    metadata = get_metadata_with_fallback(db, current_user)
    valid_classifications = metadata["classification_levels"]
    
    if new_classification not in valid_classifications:
        raise HTTPException(status_code=400, detail=f"Invalid classification")
    filters = [AssetCommon.id.in_(asset_ids), AssetCommon.deleted_at.is_(None)]
    if current_user.role != "superadmin":
        filters.append(AssetCommon.owner_role == current_user.role)
    updated_count = db.query(AssetCommon).filter(*filters).update(
        {AssetCommon.classification: new_classification}, synchronize_session='fetch'
    )
    if updated_count == 0:
        raise HTTPException(status_code=403, detail="No assets found or you do not have permission")
    db.commit()
    log_activity(db, current_user, "UPDATE", "assets", f"Bulk updated {updated_count} assets classification to {new_classification}")
    return {"message": f"Updated {updated_count} assets classification", "count": updated_count}


# ==================== IMPORT FROM SERVER SOURCES ====================
# Inferred asset entries from iRMC (hardware) and Backup/SAR/SSH (virtual infra).
# Dedupe per (category, name); "boleh 1 hardware + 1 virtual".
SOURCE_CATEGORY = {
    "irmc": "hardware",
    "backup": "virtual-infrastructure",
    "sar": "virtual-infrastructure",
    "ssh": "virtual-infrastructure",
}
SOURCE_SUB_CATEGORY = {
    "irmc": "server_rack",
    "backup": "virtual_machine",
    "sar": "virtual_machine",
    "ssh": "virtual_machine",
}
SOURCE_LABEL = {
    "irmc": "iRMC Check",
    "backup": "Backup Check",
    "sar": "SAR / Capacity Monitoring",
    "ssh": "SSH Report",
}


def _normalize_name(name: str) -> str:
    return (name or "").strip().lower()


@router.post("/import-from-servers")
async def import_from_servers(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create assets from selected candidates (name + category only, server-side mapping)."""
    body = await request.json()
    selections = body.get("selections") or []
    if not isinstance(selections, list) or len(selections) > 500:
        raise HTTPException(status_code=400, detail="selections must be a list of at most 500 items")

    metadata = get_metadata_with_fallback(db, current_user)
    valid_classifications = metadata["classification_levels"]
    existing = db.query(AssetCommon.category, AssetCommon.name).filter(
        AssetCommon.deleted_at.is_(None)
    ).all()
    existing_keys = {(cat, _normalize_name(name)) for cat, name in existing}

    imported = []
    skipped = []
    for sel in selections:
        name = (sel.get("name") or "").strip()
        category = (sel.get("category") or "").strip()
        if not name or category not in SOURCE_CATEGORY.values():
            skipped.append({"name": name, "category": category, "reason": "invalid selection"})
            continue
        norm = _normalize_name(name)
        if (category, norm) in existing_keys:
            skipped.append({"name": name, "category": category, "reason": "already exists"})
            continue

        sub_category = "server_rack" if category == "hardware" else "virtual_machine"
        classification = get_auto_classification(category, sub_category) or "internal"
        if classification not in valid_classifications:
            classification = "internal"

        attributes = {}
        note = None
        if category == "virtual-infrastructure":
            metric = db.query(CapacityMetrics).filter(
                CapacityMetrics.hostname == name
            ).order_by(CapacityMetrics.tanggal.desc(), CapacityMetrics.id.desc()).first()
            if metric:
                sysinfo = metric.system_info or {}
                attributes = {
                    "ip_address": metric.ip_address or metric.local_ip,
                    "os": sysinfo.get("os"),
                    "cpu": sysinfo.get("cpu"),
                    "ram": sysinfo.get("ram"),
                    "hypervisor": sysinfo.get("hypervisor"),
                }
                details = ["SAR/Backup/SSH"]
                if sysinfo.get("system"):
                    details.append("System: " + sysinfo["system"])
                if sysinfo.get("serial"):
                    details.append("Serial: " + sysinfo["serial"])
                if metric.public_ip:
                    details.append("Public IP: " + metric.public_ip)
                note = "; ".join(details)
            parts = db.query(DiskPartition).filter(
                DiskPartition.hostname == name,
                DiskPartition.size.isnot(None)
            ).order_by(DiskPartition.tanggal.desc()).all()
            if parts:
                sizes = {p.mount_point: p.size for p in parts}
                attributes["storage"] = ", ".join(f"{mp}: {size}" for mp, size in sizes.items())
            if not note:
                note = "Backup/SSH"
        else:
            note = "Sumber: iRMC Check"
        attributes = {k: v for k, v in attributes.items() if v}
        if note:
            attributes["keterangan"] = note

        asset_code = get_next_asset_code(db)
        asset = AssetCommon(
            asset_code=asset_code,
            name=name,
            category=category,
            sub_category=sub_category,
            classification=classification,
            status="active",
            created_by=current_user.username if current_user else "system",
            owner_role=current_user.role if current_user else None,
        )
        db.add(asset)
        db.flush()
        create_extension_record(category, asset.id, attributes, db)
        log_create(
            db=db,
            user=current_user,
            module='assets',
            item_name=f'{category} - {name}',
            item_id=asset.id,
            details={'asset_code': asset_code, 'sub_category': sub_category, 'classification': classification},
        )
        existing_keys.add((category, norm))
        imported.append({"name": name, "category": category, "asset_code": asset_code})

    db.commit()
    return {"message": f"{len(imported)} asset imported", "imported": imported, "skipped": skipped}
