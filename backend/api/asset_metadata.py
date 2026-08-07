"""Asset Metadata CRUD API - Role-based management of categories, sub-categories, classifications, and statuses."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional, List
from pydantic import BaseModel

from database import get_db
from models import (
    User, AssetMetadataCategory, AssetMetadataSubCategory,
    AssetMetadataClassification, AssetMetadataStatus,
)
from api.dependencies import get_current_user, log_activity

router = APIRouter(prefix="/asset-metadata", tags=["Asset Metadata"])


# ==================== SCHEMAS ====================

class CategoryCreate(BaseModel):
    name: str
    description: Optional[str] = None
    sort_order: int = 0

class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    sort_order: Optional[int] = None

class CategoryResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    owner_role: str
    sort_order: int
    created_at: str

    class Config:
        from_attributes = True


class SubCategoryCreate(BaseModel):
    category_id: int
    name: str
    description: Optional[str] = None
    sort_order: int = 0

class SubCategoryUpdate(BaseModel):
    category_id: Optional[int] = None
    name: Optional[str] = None
    description: Optional[str] = None
    sort_order: Optional[int] = None

class SubCategoryResponse(BaseModel):
    id: int
    category_id: int
    name: str
    description: Optional[str]
    owner_role: str
    sort_order: int
    created_at: str

    class Config:
        from_attributes = True


class ClassificationCreate(BaseModel):
    name: str
    color: str = "#6B7280"
    sort_order: int = 0

class ClassificationUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
    sort_order: Optional[int] = None

class ClassificationResponse(BaseModel):
    id: int
    name: str
    color: str
    owner_role: str
    sort_order: int
    created_at: str

    class Config:
        from_attributes = True


class StatusCreate(BaseModel):
    name: str
    color: str = "#6B7280"
    sort_order: int = 0

class StatusUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
    sort_order: Optional[int] = None

class StatusResponse(BaseModel):
    id: int
    name: str
    color: str
    owner_role: str
    sort_order: int
    created_at: str

    class Config:
        from_attributes = True


# ==================== HELPERS ====================

def _apply_metadata_rbac(query, current_user: User, db: Session):
    """Filter metadata by owner_role. Superadmin sees all."""
    if current_user.role != "superadmin":
        return query.filter(AssetMetadataCategory.owner_role == current_user.role)
    return query


def _apply_subcat_rbac(query, current_user: User, db: Session):
    """Filter sub-categories by owner_role. Superadmin sees all."""
    if current_user.role != "superadmin":
        return query.filter(AssetMetadataSubCategory.owner_role == current_user.role)
    return query


def _apply_class_rbac(query, current_user: User, db: Session):
    """Filter classifications by owner_role. Superadmin sees all."""
    if current_user.role != "superadmin":
        return query.filter(AssetMetadataClassification.owner_role == current_user.role)
    return query


def _apply_status_rbac(query, current_user: User, db: Session):
    """Filter statuses by owner_role. Superadmin sees all."""
    if current_user.role != "superadmin":
        return query.filter(AssetMetadataStatus.owner_role == current_user.role)
    return query


def _to_dict(obj):
    """Convert ORM object to dict."""
    return {c.name: getattr(obj, c.name) for c in obj.__table__.columns}


# ==================== CATEGORIES CRUD ====================

@router.get("/categories", response_model=List[dict])
async def list_categories(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(AssetMetadataCategory).order_by(AssetMetadataCategory.sort_order, AssetMetadataCategory.name)
    query = _apply_metadata_rbac(query, current_user, db)
    items = query.all()
    return [_to_dict(i) for i in items]


@router.post("/categories", response_model=dict)
async def create_category(
    data: CategoryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    existing = db.query(AssetMetadataCategory).filter(
        AssetMetadataCategory.name == data.name,
        AssetMetadataCategory.owner_role == current_user.role,
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Category already exists for your role")

    item = AssetMetadataCategory(
        name=data.name,
        description=data.description,
        owner_role=current_user.role,
        sort_order=data.sort_order,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    log_activity(db, current_user.id, "CREATE", "assets", f"Created asset category: {data.name}")
    return _to_dict(item)


@router.put("/categories/{item_id}", response_model=dict)
async def update_category(
    item_id: int,
    data: CategoryUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    item = db.query(AssetMetadataCategory).filter(
        AssetMetadataCategory.id == item_id,
        AssetMetadataCategory.owner_role == current_user.role,
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Category not found or access denied")

    if data.name is not None:
        dup = db.query(AssetMetadataCategory).filter(
            AssetMetadataCategory.name == data.name,
            AssetMetadataCategory.owner_role == current_user.role,
            AssetMetadataCategory.id != item_id,
        ).first()
        if dup:
            raise HTTPException(status_code=400, detail="Category name already exists")
        item.name = data.name
    if data.description is not None:
        item.description = data.description
    if data.sort_order is not None:
        item.sort_order = data.sort_order

    db.commit()
    db.refresh(item)
    log_activity(db, current_user.id, "UPDATE", "assets", f"Updated asset category {item_id}")
    return _to_dict(item)


@router.delete("/categories/{item_id}", response_model=dict)
async def delete_category(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    item = db.query(AssetMetadataCategory).filter(
        AssetMetadataCategory.id == item_id,
        AssetMetadataCategory.owner_role == current_user.role,
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Category not found or access denied")

    db.delete(item)
    db.commit()
    log_activity(db, current_user.id, "DELETE", "assets", f"Deleted asset category {item_id}")
    return {"message": "Category deleted"}


# ==================== SUB-CATEGORIES CRUD ====================

@router.get("/sub-categories", response_model=List[dict])
async def list_sub_categories(
    category_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(AssetMetadataSubCategory).order_by(
        AssetMetadataSubCategory.category_id,
        AssetMetadataSubCategory.sort_order,
        AssetMetadataSubCategory.name,
    )
    query = _apply_subcat_rbac(query, current_user, db)
    if category_id:
        query = query.filter(AssetMetadataSubCategory.category_id == category_id)
    items = query.all()
    return [_to_dict(i) for i in items]


@router.post("/sub-categories", response_model=dict)
async def create_sub_category(
    data: SubCategoryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cat = db.query(AssetMetadataCategory).filter(
        AssetMetadataCategory.id == data.category_id,
        AssetMetadataCategory.owner_role == current_user.role,
    ).first()
    if not cat:
        raise HTTPException(status_code=400, detail="Parent category not found or access denied")

    existing = db.query(AssetMetadataSubCategory).filter(
        AssetMetadataSubCategory.name == data.name,
        AssetMetadataSubCategory.category_id == data.category_id,
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Sub-category already exists")

    item = AssetMetadataSubCategory(
        category_id=data.category_id,
        name=data.name,
        description=data.description,
        owner_role=current_user.role,
        sort_order=data.sort_order,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    log_activity(db, current_user.id, "CREATE", "assets", f"Created sub-category: {data.name}")
    return _to_dict(item)


@router.put("/sub-categories/{item_id}", response_model=dict)
async def update_sub_category(
    item_id: int,
    data: SubCategoryUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    item = db.query(AssetMetadataSubCategory).filter(
        AssetMetadataSubCategory.id == item_id,
        AssetMetadataSubCategory.owner_role == current_user.role,
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Sub-category not found or access denied")

    if data.name is not None:
        dup = db.query(AssetMetadataSubCategory).filter(
            AssetMetadataSubCategory.name == data.name,
            AssetMetadataSubCategory.category_id == (data.category_id or item.category_id),
            AssetMetadataSubCategory.id != item_id,
        ).first()
        if dup:
            raise HTTPException(status_code=400, detail="Sub-category name already exists")
        item.name = data.name
    if data.category_id is not None:
        cat = db.query(AssetMetadataCategory).filter(
            AssetMetadataCategory.id == data.category_id,
            AssetMetadataCategory.owner_role == current_user.role,
        ).first()
        if not cat:
            raise HTTPException(status_code=400, detail="Parent category not found")
        item.category_id = data.category_id
    if data.description is not None:
        item.description = data.description
    if data.sort_order is not None:
        item.sort_order = data.sort_order

    db.commit()
    db.refresh(item)
    log_activity(db, current_user.id, "UPDATE", "assets", f"Updated sub-category {item_id}")
    return _to_dict(item)


@router.delete("/sub-categories/{item_id}", response_model=dict)
async def delete_sub_category(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    item = db.query(AssetMetadataSubCategory).filter(
        AssetMetadataSubCategory.id == item_id,
        AssetMetadataSubCategory.owner_role == current_user.role,
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Sub-category not found or access denied")

    db.delete(item)
    db.commit()
    log_activity(db, current_user.id, "DELETE", "assets", f"Deleted sub-category {item_id}")
    return {"message": "Sub-category deleted"}


# ==================== CLASSIFICATIONS CRUD ====================

@router.get("/classifications", response_model=List[dict])
async def list_classifications(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(AssetMetadataClassification).order_by(
        AssetMetadataClassification.sort_order,
        AssetMetadataClassification.name,
    )
    query = _apply_class_rbac(query, current_user, db)
    items = query.all()
    return [_to_dict(i) for i in items]


@router.post("/classifications", response_model=dict)
async def create_classification(
    data: ClassificationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    existing = db.query(AssetMetadataClassification).filter(
        AssetMetadataClassification.name == data.name,
        AssetMetadataClassification.owner_role == current_user.role,
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Classification already exists for your role")

    item = AssetMetadataClassification(
        name=data.name,
        color=data.color,
        owner_role=current_user.role,
        sort_order=data.sort_order,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    log_activity(db, current_user.id, "CREATE", "assets", f"Created classification: {data.name}")
    return _to_dict(item)


@router.put("/classifications/{item_id}", response_model=dict)
async def update_classification(
    item_id: int,
    data: ClassificationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    item = db.query(AssetMetadataClassification).filter(
        AssetMetadataClassification.id == item_id,
        AssetMetadataClassification.owner_role == current_user.role,
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Classification not found or access denied")

    if data.name is not None:
        dup = db.query(AssetMetadataClassification).filter(
            AssetMetadataClassification.name == data.name,
            AssetMetadataClassification.owner_role == current_user.role,
            AssetMetadataClassification.id != item_id,
        ).first()
        if dup:
            raise HTTPException(status_code=400, detail="Classification name already exists")
        item.name = data.name
    if data.color is not None:
        item.color = data.color
    if data.sort_order is not None:
        item.sort_order = data.sort_order

    db.commit()
    db.refresh(item)
    log_activity(db, current_user.id, "UPDATE", "assets", f"Updated classification {item_id}")
    return _to_dict(item)


@router.delete("/classifications/{item_id}", response_model=dict)
async def delete_classification(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    item = db.query(AssetMetadataClassification).filter(
        AssetMetadataClassification.id == item_id,
        AssetMetadataClassification.owner_role == current_user.role,
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Classification not found or access denied")

    db.delete(item)
    db.commit()
    log_activity(db, current_user.id, "DELETE", "assets", f"Deleted classification {item_id}")
    return {"message": "Classification deleted"}


# ==================== STATUSES CRUD ====================

@router.get("/statuses", response_model=List[dict])
async def list_statuses(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(AssetMetadataStatus).order_by(
        AssetMetadataStatus.sort_order,
        AssetMetadataStatus.name,
    )
    query = _apply_status_rbac(query, current_user, db)
    items = query.all()
    return [_to_dict(i) for i in items]


@router.post("/statuses", response_model=dict)
async def create_status(
    data: StatusCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    existing = db.query(AssetMetadataStatus).filter(
        AssetMetadataStatus.name == data.name,
        AssetMetadataStatus.owner_role == current_user.role,
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Status already exists for your role")

    item = AssetMetadataStatus(
        name=data.name,
        color=data.color,
        owner_role=current_user.role,
        sort_order=data.sort_order,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    log_activity(db, current_user.id, "CREATE", "assets", f"Created status: {data.name}")
    return _to_dict(item)


@router.put("/statuses/{item_id}", response_model=dict)
async def update_status(
    item_id: int,
    data: StatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    item = db.query(AssetMetadataStatus).filter(
        AssetMetadataStatus.id == item_id,
        AssetMetadataStatus.owner_role == current_user.role,
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Status not found or access denied")

    if data.name is not None:
        dup = db.query(AssetMetadataStatus).filter(
            AssetMetadataStatus.name == data.name,
            AssetMetadataStatus.owner_role == current_user.role,
            AssetMetadataStatus.id != item_id,
        ).first()
        if dup:
            raise HTTPException(status_code=400, detail="Status name already exists")
        item.name = data.name
    if data.color is not None:
        item.color = data.color
    if data.sort_order is not None:
        item.sort_order = data.sort_order

    db.commit()
    db.refresh(item)
    log_activity(db, current_user.id, "UPDATE", "assets", f"Updated status {item_id}")
    return _to_dict(item)


@router.delete("/statuses/{item_id}", response_model=dict)
async def delete_status(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    item = db.query(AssetMetadataStatus).filter(
        AssetMetadataStatus.id == item_id,
        AssetMetadataStatus.owner_role == current_user.role,
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Status not found or access denied")

    db.delete(item)
    db.commit()
    log_activity(db, current_user.id, "DELETE", "assets", f"Deleted status {item_id}")
    return {"message": "Status deleted"}


# ==================== COMBINED ENDPOINT (for asset form) ====================

@router.get("/all", response_model=dict)
async def get_all_metadata(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get all metadata in one call for asset form dropdowns."""
    cat_query = db.query(AssetMetadataCategory).order_by(AssetMetadataCategory.sort_order, AssetMetadataCategory.name)
    cat_query = _apply_metadata_rbac(cat_query, current_user, db)
    categories = [_to_dict(i) for i in cat_query.all()]

    subcat_query = db.query(AssetMetadataSubCategory).order_by(
        AssetMetadataSubCategory.category_id,
        AssetMetadataSubCategory.sort_order,
        AssetMetadataSubCategory.name,
    )
    subcat_query = _apply_subcat_rbac(subcat_query, current_user, db)
    sub_categories = [_to_dict(i) for i in subcat_query.all()]

    class_query = db.query(AssetMetadataClassification).order_by(
        AssetMetadataClassification.sort_order,
        AssetMetadataClassification.name,
    )
    class_query = _apply_class_rbac(class_query, current_user, db)
    classifications = [_to_dict(i) for i in class_query.all()]

    status_query = db.query(AssetMetadataStatus).order_by(
        AssetMetadataStatus.sort_order,
        AssetMetadataStatus.name,
    )
    status_query = _apply_status_rbac(status_query, current_user, db)
    statuses = [_to_dict(i) for i in status_query.all()]

    return {
        "categories": categories,
        "sub_categories": sub_categories,
        "classifications": classifications,
        "statuses": statuses,
    }
