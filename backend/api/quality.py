from utils.timezone import to_iso
"""Quality Objectives - Flexible Tracking System"""
import os
import json
from fastapi import APIRouter, Depends, Query, Form, Request, UploadFile, File, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, extract
from typing import Optional
from datetime import datetime, date

from database import get_db
from models import User, QualityObjective, QualityEntry
from api.dependencies import get_current_user, log_activity, save_file
from api.dependencies import get_offset, calculate_pagination
from utils.optimistic_lock import check_version_conflict, increment_version, get_client_version
from api.schemas import (
    QualityObjectiveResponse, QualityObjectiveListPaginatedResponse,
    QualityStatsResponse, QualityEntryResponse, QualityEntryListPaginatedResponse,
    QualityReportResponse, MessageResponse,
)

router = APIRouter(tags=["Quality"])


def _get_entry_period(entry_date: date, period: str) -> str:
    if period == "per_event":
        return entry_date.strftime("%Y-%m-%d")
    elif period == "monthly":
        return entry_date.strftime("%Y-%m")
    elif period == "quarterly":
        q = (entry_date.month - 1) // 3 + 1
        return f"{entry_date.year}-Q{q}"
    elif period == "yearly":
        return str(entry_date.year)
    return entry_date.strftime("%Y-%m")


@router.get("/quality-objectives", response_model=QualityObjectiveListPaginatedResponse)
async def get_quality_objectives(
    page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
    category: Optional[str] = Query(None), tracking_type: Optional[str] = Query(None),
    is_active: Optional[bool] = Query(None),
    sort_by: Optional[str] = Query(None), sort_order: Optional[str] = Query("desc"),
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    query = db.query(QualityObjective)
    if current_user.role != "superadmin":
        query = query.filter(QualityObjective.owner_role == current_user.role)
    if category:
        query = query.filter(QualityObjective.category == category)
    if tracking_type:
        query = query.filter(QualityObjective.tracking_type == tracking_type)
    if is_active is not None:
        query = query.filter(QualityObjective.is_active == is_active)

    sort_whitelist = {
        "name": QualityObjective.name,
        "category": QualityObjective.category,
        "created_at": QualityObjective.created_at,
        "tracking_type": QualityObjective.tracking_type,
    }
    if sort_by and sort_by in sort_whitelist:
        col = sort_whitelist[sort_by]
        query = query.order_by(col.asc() if sort_order.lower() == "asc" else col.desc())
    else:
        query = query.order_by(QualityObjective.created_at.desc())

    total_records = query.count()
    offset = get_offset(page, page_size)
    items = query.offset(offset).limit(page_size).all()
    return {"data": items, "pagination": calculate_pagination(page, page_size, total_records).dict()}


@router.get("/quality-objectives/stats", response_model=QualityStatsResponse)
async def get_quality_stats(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    base_query = db.query(QualityObjective)
    if current_user.role != "superadmin":
        base_query = base_query.filter(QualityObjective.owner_role == current_user.role)

    total = base_query.count()
    active = base_query.filter(QualityObjective.is_active == True).count()
    total_entries = db.query(QualityEntry).count()

    cat_counts = base_query.with_entities(
        QualityObjective.category, func.count(QualityObjective.id)
    ).group_by(QualityObjective.category).all()
    by_category = {c: count for c, count in cat_counts}

    type_counts = base_query.with_entities(
        QualityObjective.tracking_type, func.count(QualityObjective.id)
    ).group_by(QualityObjective.tracking_type).all()
    by_tracking_type = {t: count for t, count in type_counts}

    return {
        "total_objectives": total,
        "active_objectives": active,
        "total_entries": total_entries,
        "by_category": by_category,
        "by_tracking_type": by_tracking_type,
    }


@router.post("/quality-objectives", response_model=QualityObjectiveResponse)
async def create_quality_objective(
    name: str = Form(...), category: str = Form(...), tracking_type: str = Form(...),
    description: str = Form(None), period: str = Form("monthly"),
    target_value: Optional[float] = Form(None), target_unit: str = Form(None),
    evidence_types: str = Form("text"), checklist_items: str = Form(None),
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    item = QualityObjective(
        name=name, category=category, tracking_type=tracking_type,
        description=description, period=period,
        target_value=target_value, target_unit=target_unit,
        evidence_types=evidence_types, checklist_items=checklist_items,
        created_by=current_user.id, owner_role=current_user.role,
    )
    db.add(item)
    log_activity(db, current_user.id, "CREATE", "quality", f"Created quality objective: {name}")
    db.commit()
    db.refresh(item)
    return item


@router.put("/quality-objectives/{obj_id}", response_model=QualityObjectiveResponse)
async def update_quality_objective(
    obj_id: int, request: Request,
    name: str = Form(None), category: str = Form(None), tracking_type: str = Form(None),
    description: str = Form(None), period: str = Form(None),
    target_value: Optional[float] = Form(None), target_unit: str = Form(None),
    evidence_types: str = Form(None), checklist_items: str = Form(None),
    is_active: Optional[bool] = Form(None),
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    item = db.query(QualityObjective).filter(QualityObjective.id == obj_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Quality Objective not found")

    client_version = get_client_version(request)
    check_version_conflict(item, client_version)

    if name is not None: item.name = name
    if category is not None: item.category = category
    if tracking_type is not None: item.tracking_type = tracking_type
    if description is not None: item.description = description
    if period is not None: item.period = period
    if target_value is not None: item.target_value = target_value
    if target_unit is not None: item.target_unit = target_unit
    if evidence_types is not None: item.evidence_types = evidence_types
    if checklist_items is not None: item.checklist_items = checklist_items
    if is_active is not None: item.is_active = is_active

    increment_version(item)
    log_activity(db, current_user.id, "UPDATE", "quality", f"Updated quality objective {obj_id}")
    db.commit()
    db.refresh(item)
    return item


@router.delete("/quality-objectives/{obj_id}", response_model=MessageResponse)
async def delete_quality_objective(
    obj_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    item = db.query(QualityObjective).filter(QualityObjective.id == obj_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Quality Objective not found")
    db.query(QualityEntry).filter(QualityEntry.objective_id == obj_id).delete()
    db.delete(item)
    log_activity(db, current_user.id, "DELETE", "quality", f"Deleted quality objective {obj_id}")
    db.commit()
    return {"message": "deleted"}


@router.get("/quality-entries", response_model=QualityEntryListPaginatedResponse)
async def get_quality_entries(
    page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
    objective_id: Optional[int] = Query(None),
    year: Optional[int] = Query(None), month: Optional[int] = Query(None),
    status: Optional[str] = Query(None),
    sort_by: Optional[str] = Query(None), sort_order: Optional[str] = Query("desc"),
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    query = db.query(QualityEntry)
    if objective_id:
        query = query.filter(QualityEntry.objective_id == objective_id)
    if year:
        query = query.filter(extract("year", QualityEntry.entry_date) == year)
    if month:
        query = query.filter(extract("month", QualityEntry.entry_date) == month)
    if status:
        query = query.filter(QualityEntry.status == status)

    sort_whitelist = {
        "entry_date": QualityEntry.entry_date,
        "created_at": QualityEntry.created_at,
        "value": QualityEntry.value,
    }
    if sort_by and sort_by in sort_whitelist:
        col = sort_whitelist[sort_by]
        query = query.order_by(col.asc() if sort_order.lower() == "asc" else col.desc())
    else:
        query = query.order_by(QualityEntry.entry_date.desc())

    total_records = query.count()
    offset = get_offset(page, page_size)
    items = query.offset(offset).limit(page_size).all()
    return {"data": items, "pagination": calculate_pagination(page, page_size, total_records).dict()}


@router.post("/quality-entries", response_model=QualityEntryResponse)
async def create_quality_entry(
    objective_id: int = Form(...), entry_date: str = Form(...),
    value: Optional[float] = Form(None), status: str = Form(None),
    checklist_result: str = Form(None), description: str = Form(None),
    evidence_text: str = Form(None), evidence_url: str = Form(None),
    file: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    objective = db.query(QualityObjective).filter(QualityObjective.id == objective_id).first()
    if not objective:
        raise HTTPException(status_code=404, detail="Quality Objective not found")

    parsed_date = datetime.strptime(entry_date, "%Y-%m-%d").date()
    entry_period = _get_entry_period(parsed_date, objective.period)

    evidence_file = None
    if file and file.filename:
        evidence_file = save_file(file, "quality")

    item = QualityEntry(
        objective_id=objective_id, entry_date=parsed_date, entry_period=entry_period,
        value=value, status=status, checklist_result=checklist_result,
        description=description, evidence_text=evidence_text,
        evidence_file=evidence_file, evidence_url=evidence_url,
        checked_by=current_user.id,
    )
    db.add(item)
    log_activity(db, current_user.id, "CREATE", "quality", f"Logged quality entry for objective {objective_id}")
    db.commit()
    db.refresh(item)
    return item


@router.put("/quality-entries/{entry_id}", response_model=QualityEntryResponse)
async def update_quality_entry(
    entry_id: int, request: Request,
    entry_date: str = Form(None), value: Optional[float] = Form(None),
    status: str = Form(None), checklist_result: str = Form(None),
    description: str = Form(None), evidence_text: str = Form(None),
    evidence_url: str = Form(None),
    file: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    item = db.query(QualityEntry).filter(QualityEntry.id == entry_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Quality Entry not found")

    client_version = get_client_version(request)
    check_version_conflict(item, client_version)

    if entry_date is not None:
        parsed_date = datetime.strptime(entry_date, "%Y-%m-%d").date()
        item.entry_date = parsed_date
        objective = db.query(QualityObjective).filter(QualityObjective.id == item.objective_id).first()
        if objective:
            item.entry_period = _get_entry_period(parsed_date, objective.period)
    if value is not None: item.value = value
    if status is not None: item.status = status
    if checklist_result is not None: item.checklist_result = checklist_result
    if description is not None: item.description = description
    if evidence_text is not None: item.evidence_text = evidence_text
    if evidence_url is not None: item.evidence_url = evidence_url
    if file and file.filename:
        if item.evidence_file:
            old_path = os.path.join(item.evidence_file)
            if os.path.exists(old_path):
                os.remove(old_path)
        item.evidence_file = save_file(file, "quality")

    increment_version(item)
    log_activity(db, current_user.id, "UPDATE", "quality", f"Updated quality entry {entry_id}")
    db.commit()
    db.refresh(item)
    return item


@router.delete("/quality-entries/{entry_id}", response_model=MessageResponse)
async def delete_quality_entry(
    entry_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    item = db.query(QualityEntry).filter(QualityEntry.id == entry_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Quality Entry not found")
    if item.evidence_file:
        filepath = os.path.join(item.evidence_file)
        if os.path.exists(filepath):
            os.remove(filepath)
    db.delete(item)
    log_activity(db, current_user.id, "DELETE", "quality", f"Deleted quality entry {entry_id}")
    db.commit()
    return {"message": "deleted"}


@router.get("/quality-entries/{entry_id}/evidence")
async def download_entry_evidence(
    entry_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    item = db.query(QualityEntry).filter(QualityEntry.id == entry_id).first()
    if not item or not item.evidence_file:
        raise HTTPException(status_code=404, detail="Evidence file not found")
    filepath = os.path.join(item.evidence_file)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="File not found on disk")
    return FileResponse(filepath, filename=os.path.basename(filepath))


@router.get("/quality-report/summary", response_model=QualityReportResponse)
async def get_quality_report(
    year: int = Query(datetime.now().year),
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    objectives = db.query(QualityObjective).filter(QualityObjective.is_active == True).all()
    if current_user.role != "superadmin":
        objectives = [o for o in objectives if o.owner_role == current_user.role]

    report_objectives = []
    for obj in objectives:
        entries = db.query(QualityEntry).filter(
            QualityEntry.objective_id == obj.id,
            extract("year", QualityEntry.entry_date) == year,
        ).all()

        months = []
        summary_data = {}

        if obj.tracking_type == "counter":
            period_counts = {}
            for e in entries:
                period_counts[e.entry_period] = period_counts.get(e.entry_period, 0) + 1
            all_periods = sorted(set([e.entry_period for e in entries]))
            for p in all_periods:
                months.append({"period": p, "count": period_counts.get(p, 0)})
            total = sum(period_counts.values())
            summary_data = {"total": total, "avg": round(total / max(len(all_periods), 1), 1)}

        elif obj.tracking_type == "boolean":
            period_status = {}
            for e in entries:
                period_status[e.entry_period] = e.status
            all_periods = sorted(set(list(period_status.keys())))
            pass_count = sum(1 for s in period_status.values() if s == "pass")
            fail_count = sum(1 for s in period_status.values() if s == "fail")
            for p in all_periods:
                months.append({"period": p, "status": period_status.get(p)})
            total = pass_count + fail_count
            pass_rate = f"{round(pass_count / max(total, 1) * 100, 1)}%" if total > 0 else "N/A"
            summary_data = {"total": total, "pass": pass_count, "fail": fail_count, "pass_rate": pass_rate}

        elif obj.tracking_type == "percentage":
            period_values = {}
            for e in entries:
                if e.value is not None:
                    period_values[e.entry_period] = e.value
            all_periods = sorted(set(list(period_values.keys())))
            for p in all_periods:
                v = period_values.get(p)
                target_met = v >= obj.target_value if obj.target_value is not None and v is not None else None
                months.append({"period": p, "value": v, "target_met": target_met})
            values = list(period_values.values())
            avg = round(sum(values) / max(len(values), 1), 2) if values else None
            target_met_count = sum(1 for v in values if obj.target_value is not None and v >= obj.target_value)
            summary_data = {"avg": avg, "target_met_count": target_met_count, "total_periods": len(all_periods)}

        elif obj.tracking_type == "multi_checklist":
            for e in entries:
                months.append({
                    "period": e.entry_period,
                    "status": e.status,
                    "checklist_result": json.loads(e.checklist_result) if e.checklist_result else None,
                })
            total = len(entries)
            pass_count = sum(1 for e in entries if e.status == "pass")
            summary_data = {"total": total, "pass": pass_count, "fail": total - pass_count}

        elif obj.tracking_type == "score":
            period_values = {}
            for e in entries:
                if e.value is not None:
                    period_values[e.entry_period] = e.value
            all_periods = sorted(set(list(period_values.keys())))
            for p in all_periods:
                v = period_values.get(p)
                target_met = v >= obj.target_value if obj.target_value is not None and v is not None else None
                months.append({"period": p, "value": v, "target_met": target_met})
            values = list(period_values.values())
            avg = round(sum(values) / max(len(values), 1), 2) if values else None
            summary_data = {"avg": avg, "total_periods": len(all_periods)}

        report_objectives.append({
            "id": obj.id,
            "name": obj.name,
            "tracking_type": obj.tracking_type,
            "period": obj.period,
            "target_value": obj.target_value,
            "target_unit": obj.target_unit,
            "months": months,
            "summary": summary_data,
        })

    return {"year": year, "objectives": report_objectives}
