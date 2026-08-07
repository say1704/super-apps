from fastapi import APIRouter, Depends, HTTPException, Form, Request
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime
from database import get_db
from models import AssetConfiguration, ConfigChangeHistory, AssetCommon, User, ConfigCategory
from api.dependencies import get_current_user, SECRET_KEY, ALGORITHM, log_activity
from utils.optimistic_lock import check_version_conflict, increment_version, get_client_version
from utils.timezone import utcnow, to_iso
from api.schemas import (
    ConfigurationItemResponse, ConfigurationListPaginatedResponse,
    ConfigurationHistoryListResponse, MessageResponse,
)

router = APIRouter()


def get_config_by_id(config_id: int, db: Session):
    return db.query(AssetConfiguration).filter(AssetConfiguration.id == config_id).first()


# ==================== CRUD for Asset Configurations ====================

@router.get("/configurations/assets/{asset_id}", response_model=dict)
async def get_configurations(
    asset_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all configurations for a specific asset"""
    configs = db.query(AssetConfiguration).filter(
        AssetConfiguration.asset_id == asset_id
    ).order_by(AssetConfiguration.last_checked.desc()).all()

    from models import AssetCommon as AssetModel
    asset = db.query(AssetModel).filter(AssetModel.id == asset_id).first()
    
    result = []
    for c in configs:
        result.append({
            "id": c.id,
            "asset_id": c.asset_id,
            "parameter": c.parameter,
            "value": c.value,
            "category": c.category,
            "category_id": c.category_id,
            "notes": c.notes,
            "last_checked": to_iso(c.last_checked),
            "created_by": c.created_by,
            "updated_by": c.updated_by,
            "created_at": to_iso(c.created_at),
            "updated_at": to_iso(c.updated_at),
        })

    return {
        "data": result,
        "asset": {
            "id": asset.id,
            "asset_code": asset.asset_code,
            "name": asset.name,
            "category": asset.category,
            "sub_category": asset.sub_category,
        } if asset else None,
    }


@router.post("/configurations", response_model=ConfigurationItemResponse)
async def create_configuration(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    form = await request.form()
    asset_id = form.get('asset_id')
    if not asset_id:
        raise HTTPException(status_code=400, detail="asset_id is required")

    config = AssetConfiguration(
        asset_id=int(asset_id),
        parameter=form.get('parameter'),
        value=form.get('value'),
        category=form.get('category', 'operational'),
        notes=form.get('notes', ''),
        last_checked=utcnow(),
        created_by=current_user.username if current_user else 'system',
        updated_by=current_user.username if current_user else 'system',
    )
    db.add(config)
    db.commit()
    db.refresh(config)

    # Log creation in change history
    history = ConfigChangeHistory(
        config_id=config.id,
        asset_id=config.asset_id,
        parameter=config.parameter,
        old_value='',
        new_value=config.value,
        change_reason='Configuration created',
        changed_by=current_user.username if current_user else 'system',
    )
    db.add(history)
    db.commit()

    log_activity(db, current_user.id, "CREATE", "configurations", f"Created configuration: {config.parameter}")

    return {
        "id": config.id,
        "asset_id": config.asset_id,
        "parameter": config.parameter,
        "value": config.value,
        "category": config.category,
        "notes": config.notes,
        "last_checked": to_iso(config.last_checked),
        "created_by": config.created_by,
        "updated_by": config.updated_by,
        "created_at": to_iso(config.created_at),
        "updated_at": to_iso(config.updated_at),
    }


@router.put("/configurations/{config_id}", response_model=ConfigurationItemResponse)
async def update_configuration(
    config_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    form = await request.form()
    config = get_config_by_id(config_id, db)
    if not config:
        raise HTTPException(status_code=404, detail="Configuration not found")

    client_version = get_client_version(request)
    check_version_conflict(config, client_version)

    old_parameter = config.parameter
    old_value = config.value
    new_parameter = form.get('parameter', config.parameter)
    new_value = form.get('value', config.value)
    parameter_changed = old_parameter != new_parameter
    value_changed = old_value != new_value

    if parameter_changed or value_changed:
        history_parts = []
        if parameter_changed:
            history_parts.append(f"Parameter: '{old_parameter}' → '{new_parameter}'")
        if value_changed:
            history_parts.append(f"Value: '{old_value}' → '{new_value}'")

        history = ConfigChangeHistory(
            config_id=config_id,
            asset_id=config.asset_id,
            parameter=new_parameter,
            old_value=old_value if not parameter_changed else f"[param:{old_parameter}] {old_value}",
            new_value=new_value if not parameter_changed else f"[param:{new_parameter}] {new_value}",
            change_reason=form.get('change_reason', 'Configuration update'),
            changed_by=current_user.username if current_user else 'system',
        )
        db.add(history)

    # Update fields
    if form.get('parameter'): config.parameter = form.get('parameter')
    if form.get('value') is not None: config.value = form.get('value')
    if form.get('category'): config.category = form.get('category')
    if form.get('notes') is not None: config.notes = form.get('notes')
    config.last_checked = utcnow()
    config.updated_by = current_user.username if current_user else 'system'
    config.updated_at = utcnow()
    new_version = increment_version(config)
    db.commit()
    db.refresh(config)

    log_activity(db, current_user.id, "UPDATE", "configurations", f"Updated configuration {config_id}")

    return {
        "id": config.id,
        "asset_id": config.asset_id,
        "parameter": config.parameter,
        "value": config.value,
        "category": config.category,
        "notes": config.notes,
        "last_checked": to_iso(config.last_checked),
        "created_by": config.created_by,
        "updated_by": config.updated_by,
        "created_at": to_iso(config.created_at),
        "updated_at": to_iso(config.updated_at),
        "version": new_version,
    }


@router.delete("/configurations/{config_id}", response_model=MessageResponse)
async def delete_configuration(
    config_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    config = get_config_by_id(config_id, db)
    if not config:
        raise HTTPException(status_code=404, detail="Configuration not found")

    # Log deletion in change history before deleting
    history = ConfigChangeHistory(
        config_id=config_id,
        asset_id=config.asset_id,
        parameter=config.parameter,
        old_value=config.value,
        new_value='[DELETED]',
        change_reason='Configuration deleted',
        changed_by=current_user.username if current_user else 'system',
    )
    db.add(history)
    db.commit()

    db.delete(config)
    db.commit()
    log_activity(db, current_user.id, "DELETE", "configurations", f"Deleted configuration {config_id}")
    return {"message": "Configuration deleted successfully"}


# ==================== Change History ====================

@router.get("/configurations/{config_id}/history", response_model=ConfigurationHistoryListResponse)
async def get_change_history(
    config_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get change history for a specific configuration"""
    config = get_config_by_id(config_id, db)
    if not config:
        raise HTTPException(status_code=404, detail="Configuration not found")

    history = db.query(ConfigChangeHistory).filter(
        ConfigChangeHistory.config_id == config_id
    ).order_by(ConfigChangeHistory.changed_at.desc()).all()

    return {
        "config_id": config_id,
        "parameter": config.parameter,
        "history": [
            {
                "id": h.id,
                "old_value": h.old_value,
                "new_value": h.new_value,
                "change_reason": h.change_reason,
                "change_request_id": h.change_request_id,
                "changed_by": h.changed_by,
                "changed_at": to_iso(h.changed_at),
            }
            for h in history
        ]
    }


@router.get("/configurations/assets/{asset_id}/history", response_model=dict)
async def get_asset_change_history(
    asset_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all change history for configurations of a specific asset"""
    from models import AssetCommon as AssetModel
    asset = db.query(AssetModel).filter(AssetModel.id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    # Fetch all history for this asset — including deleted configs (config_id=NULL, asset_id set)
    history = db.query(ConfigChangeHistory).filter(
        ConfigChangeHistory.asset_id == asset_id
    ).order_by(ConfigChangeHistory.changed_at.desc()).all()

    return {
        "asset_id": asset_id,
        "asset_name": asset.name,
        "asset_code": asset.asset_code,
        "history": [
            {
                "id": h.id,
                "config_id": h.config_id,
                "parameter": h.parameter or 'Unknown',
                "old_value": h.old_value,
                "new_value": h.new_value,
                "change_reason": h.change_reason,
                "change_request_id": h.change_request_id,
                "changed_by": h.changed_by,
                "changed_at": to_iso(h.changed_at),
            }
            for h in history
        ]
    }


# ==================== CONFIGURATION CATEGORY CRUD ====================

@router.get("/config-categories", response_model=dict)
async def get_config_categories(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if db.query(ConfigCategory).count() == 0:
        defaults = [
            {"name": "Security", "color": "red", "sort_order": 1, "description": "Security-related configurations"},
            {"name": "Performance", "color": "yellow", "sort_order": 2, "description": "Performance optimization settings"},
            {"name": "Operational", "color": "blue", "sort_order": 3, "description": "Day-to-day operational settings"},
            {"name": "Network", "color": "green", "sort_order": 4, "description": "Network and firewall settings"},
        ]
        for d in defaults:
            db.add(ConfigCategory(**d))
        db.commit()
    cats = db.query(ConfigCategory).order_by(ConfigCategory.sort_order, ConfigCategory.name).all()
    return {"data": [{"id": c.id, "name": c.name, "color": c.color, "sort_order": c.sort_order, "description": c.description} for c in cats]}


@router.post("/config-categories", response_model=dict)
async def create_config_category(request: Request, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    form = await request.form()
    name = form.get("name")
    if not name:
        raise HTTPException(status_code=400, detail="name is required")
    existing = db.query(ConfigCategory).filter(ConfigCategory.name == name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Category already exists")
    cat = ConfigCategory(name=name, color=form.get("color", "blue"), sort_order=int(form.get("sort_order", 0)), description=form.get("description", ""))
    db.add(cat)
    db.commit()
    db.refresh(cat)
    log_activity(db, current_user.id, "CREATE", "configurations", f"Created config category: {name}")
    return {"id": cat.id, "name": cat.name, "color": cat.color, "sort_order": cat.sort_order, "description": cat.description}


@router.put("/config-categories/{cat_id}", response_model=dict)
async def update_config_category(cat_id: int, request: Request, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    form = await request.form()
    cat = db.query(ConfigCategory).filter(ConfigCategory.id == cat_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")

    client_version = get_client_version(request)
    check_version_conflict(cat, client_version)

    if form.get("name"): cat.name = form.get("name")
    if form.get("color"): cat.color = form.get("color")
    if form.get("sort_order") is not None: cat.sort_order = int(form.get("sort_order"))
    if form.get("description") is not None: cat.description = form.get("description")
    new_version = increment_version(cat)
    db.commit()
    db.refresh(cat)
    log_activity(db, current_user.id, "UPDATE", "configurations", f"Updated config category {cat_id}")
    return {"id": cat.id, "name": cat.name, "color": cat.color, "sort_order": cat.sort_order, "description": cat.description, "version": new_version}


@router.delete("/config-categories/{cat_id}", response_model=MessageResponse)
async def delete_config_category(cat_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    cat = db.query(ConfigCategory).filter(ConfigCategory.id == cat_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    configs = db.query(AssetConfiguration).filter(AssetConfiguration.category_id == cat_id).all()
    for c in configs:
        c.category_id = None
        c.category = cat.name.lower()
    db.delete(cat)
    db.commit()
    log_activity(db, current_user.id, "DELETE", "configurations", f"Deleted config category {cat_id}")
    return {"message": "Config category deleted"}
