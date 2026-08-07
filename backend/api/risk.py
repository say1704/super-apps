from fastapi import APIRouter, Depends, Query, Form, UploadFile, File, Request, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, or_
from typing import Optional
from datetime import datetime, date
from database import get_db
from models import (
    User, PenilaianRisiko, InterestedParty, Peluang, IsuMatrix,
    RiskAssessmentForm, RiskAssessmentLog, RiskAssessmentItem, OpportunityItem,
    IssueItem, ISMSNotes, ActivityLog,
)
from utils.timezone import utcnow, to_iso
from api.dependencies import get_current_user, log_activity, save_file, encrypt_password, is_password_encrypted, can_modify_record, get_offset, calculate_pagination
from utils.optimistic_lock import check_version_conflict, increment_version, get_client_version
from api.schemas import (
    RiskAssessmentListPaginatedResponse, RiskStatsResponse, RiskStatsFullResponse,
    RiskItemListPaginatedResponse, InterestedPartyListPaginatedResponse,
    PeluangListPaginatedResponse, IsuMatrixListPaginatedResponse,
    MessageResponse,
)

router = APIRouter(tags=["Risk Assessment"])

ALLOWED_PENILAIAN_SORT = {"created_at", "nama_isu", "nilai_risiko_dasar", "nilai_risiko_sisa", "nilai_risiko_target", "status_pelaksanaan"}
ALLOWED_INTERESTED_SORT = {"created_at", "interested_party", "risk", "opportunity"}
ALLOWED_PELUANG_SORT = {"created_at", "opportunities", "opportunity_grade", "action_plan_who", "action_plan_when"}
ALLOWED_ISU_SORT = {"created_at", "kategori", "issues", "risks", "opportunities"}


def _parse_target_waktu_date(tw):
    """Parse target_waktu string to date object. Returns None for quarter strings or invalid values."""
    if not tw:
        return None
    if isinstance(tw, str):
        if tw.startswith("Q."):
            return None
        try:
            return datetime.strptime(tw, "%Y-%m-%d").date()
        except ValueError:
            return None
    return tw


def _is_overdue(tw, status, today):
    """Check if a target_waktu is overdue. Handles string dates, date objects, and quarter strings."""
    if not tw or status == "Selesai":
        return False
    tw_date = _parse_target_waktu_date(tw)
    if tw_date is None:
        return False
    return tw_date < today


@router.get("/risk-assessment")
async def get_risk_assessments(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = db.query(RiskAssessmentForm)
    total_records = query.count()
    offset = get_offset(page, page_size)
    items = query.offset(offset).limit(page_size).all()
    return {
        "data": items,
        "pagination": calculate_pagination(page, page_size, total_records).dict()
    }


@router.post("/risk-assessment", response_model=MessageResponse)
async def create_risk_assessment(
    document_number: str = Form(None),
    version: str = Form("1.0"),
    date: str = Form(None),
    created_by: str = Form(None),
    reviewed_by: str = Form(None),
    approved_by: str = Form(None),
    classification: str = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    item = RiskAssessmentForm(
        document_number=document_number, version=version, date=date,
        created_by=created_by, reviewed_by=reviewed_by, approved_by=approved_by, classification=classification
    )
    db.add(item)
    log_activity(db, current_user.id, "CREATE", "risk", f"Created risk assessment {document_number or 'draft'}")
    db.commit()
    db.refresh(item)
    return item


@router.get("/risk-assessment/{form_id}/items", response_model=dict)
async def get_risk_items(
    form_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return {
        "logs": db.query(RiskAssessmentLog).filter(RiskAssessmentLog.form_id == form_id).all(),
        "items": db.query(RiskAssessmentItem).filter(RiskAssessmentItem.form_id == form_id).all(),
        "opportunities": db.query(OpportunityItem).filter(OpportunityItem.form_id == form_id).all(),
        "issues": db.query(IssueItem).filter(IssueItem.form_id == form_id).all(),
        "notes": db.query(ISMSNotes).filter(ISMSNotes.form_id == form_id).all(),
    }


@router.post("/risk-assessment/{form_id}/items", response_model=MessageResponse)
async def create_risk_item(
    form_id: int,
    interested_party: str = Form(None),
    needs: str = Form(None),
    expectations: str = Form(None),
    risk: str = Form(None),
    opportunity: str = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    item = RiskAssessmentItem(
        form_id=form_id, interested_party=interested_party, needs=needs,
        expectations=expectations, risk=risk, opportunity=opportunity
    )
    db.add(item)
    log_activity(db, current_user.id, "CREATE", "risk", f"Created risk item for form {form_id}")
    db.commit()
    db.refresh(item)
    return item


# --- SHEET 1: Penilaian Risiko ---

@router.get("/penilaian-risiko")
async def get_penilaian_risiko(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    sort_by: str = Query("created_at"),
    sort_order: str = Query("desc"),
    search: str = Query(""),
    status_filter: str = Query(""),
    risk_level_filter: str = Query(""),
    overdue_filter: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if sort_by not in ALLOWED_PENILAIAN_SORT:
        sort_by = "created_at"
    query = db.query(PenilaianRisiko).filter(PenilaianRisiko.deleted_at.is_(None))
    if current_user.role != "superadmin":
        query = query.filter(PenilaianRisiko.owner_role == current_user.role)
    if search:
        escaped = search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        s = f"%{escaped}%"
        query = query.filter(or_(
            PenilaianRisiko.nama_isu.ilike(s, escape="\\"), PenilaianRisiko.proses_bisnis.ilike(s, escape="\\"),
            PenilaianRisiko.risiko.ilike(s, escape="\\"), PenilaianRisiko.penanggung_jawab.ilike(s, escape="\\"),
        ))
    if status_filter:
        query = query.filter(PenilaianRisiko.status_pelaksanaan == status_filter)
    if risk_level_filter == "Tinggi":
        query = query.filter(PenilaianRisiko.nilai_risiko_dasar >= 10)
    elif risk_level_filter == "Sedang":
        query = query.filter(PenilaianRisiko.nilai_risiko_dasar >= 5, PenilaianRisiko.nilai_risiko_dasar < 10)
    elif risk_level_filter == "Rendah":
        query = query.filter(PenilaianRisiko.nilai_risiko_dasar < 5, PenilaianRisiko.nilai_risiko_dasar > 0)
    if overdue_filter:
        today = date.today()
        items_all = query.all()
        items = [i for i in items_all if _is_overdue(i.target_waktu, i.status_pelaksanaan, today)]
        total = len(items)
        items.sort(key=lambda x: getattr(x, sort_by, x.created_at) or x.created_at, reverse=(sort_order == "desc"))
        offset_idx = (page - 1) * page_size
        items = items[offset_idx:offset_idx + page_size]
    else:
        total = query.count()
        sort_col = getattr(PenilaianRisiko, sort_by, PenilaianRisiko.created_at)
        if sort_order == "asc":
            query = query.order_by(sort_col.asc())
        else:
            query = query.order_by(sort_col.desc())
        offset = (page - 1) * page_size
        items = query.offset(offset).limit(page_size).all()
    result = []
    for item in items:
        result.append({
            "id": item.id, "nama_isu": item.nama_isu, "proses_bisnis": item.proses_bisnis,
            "nama_asset": item.nama_asset, "kerentanan": item.kerentanan,
            "ancaman": item.ancaman, "risiko": item.risiko, "akibat_dampak": item.akibat_dampak,
            "frekuensi_sebelum": item.frekuensi_sebelum, "frekuensi_sebelum_desc": item.frekuensi_sebelum_desc,
            "dampak_sebelum": item.dampak_sebelum, "dampak_sebelum_desc": item.dampak_sebelum_desc,
            "dampak_sebelum_finansial": item.dampak_sebelum_finansial,
            "nilai_risiko_dasar": item.nilai_risiko_dasar,
            "pengendalian_yang_ada": item.pengendalian_yang_ada,
            "pemilihan_kontrol": item.pemilihan_kontrol,
            "frekuensi_sesudah": item.frekuensi_sesudah, "frekuensi_sesudah_desc": item.frekuensi_sesudah_desc,
            "dampak_sesudah": item.dampak_sesudah, "dampak_sesudah_desc": item.dampak_sesudah_desc,
            "dampak_sesudah_finansial": item.dampak_sesudah_finansial,
            "nilai_risiko_sisa": item.nilai_risiko_sisa,
            "pengendalian_tambahan": item.pengendalian_tambahan,
            "kebutuhan_sumber_daya": item.kebutuhan_sumber_daya,
            "penanggung_jawab": item.penanggung_jawab,
            "target_waktu": item.target_waktu if isinstance(item.target_waktu, str) else to_iso(item.target_waktu),
            "frekuensi_target": item.frekuensi_target, "frekuensi_target_desc": item.frekuensi_target_desc,
            "dampak_target": item.dampak_target, "dampak_target_desc": item.dampak_target_desc,
            "dampak_target_finansial": item.dampak_target_finansial,
            "nilai_risiko_target": item.nilai_risiko_target,
            "tanggal_peninjauan": to_iso(item.tanggal_peninjauan),
            "status_pelaksanaan": item.status_pelaksanaan,
            "isu_matrix_id": item.isu_matrix_id,
            "created_at": to_iso(item.created_at),
        })
    total_pages = (total + page_size - 1) // page_size
    return {
        "data": result,
        "pagination": {"page": page, "page_size": page_size, "total_records": total,
            "total_pages": total_pages, "has_next": page < total_pages, "has_prev": page > 1},
    }


@router.post("/penilaian-risiko", response_model=MessageResponse)
async def create_penilaian_risiko(
    nama_isu: str = Form(None),
    proses_bisnis: str = Form(None),
    nama_asset: str = Form(None),
    kerentanan: str = Form(None),
    ancaman: str = Form(None),
    risiko: str = Form(None),
    akibat_dampak: str = Form(None),
    frekuensi_sebelum: Optional[int] = Form(None),
    frekuensi_sebelum_desc: str = Form(None),
    dampak_sebelum: Optional[int] = Form(None),
    dampak_sebelum_desc: str = Form(None),
    dampak_sebelum_finansial: str = Form(None),
    pengendalian_yang_ada: str = Form(None),
    pemilihan_kontrol: str = Form(None),
    frekuensi_sesudah: Optional[int] = Form(None),
    frekuensi_sesudah_desc: str = Form(None),
    dampak_sesudah: Optional[int] = Form(None),
    dampak_sesudah_desc: str = Form(None),
    dampak_sesudah_finansial: str = Form(None),
    pengendalian_tambahan: str = Form(None),
    kebutuhan_sumber_daya: str = Form(None),
    penanggung_jawab: str = Form(None),
    target_waktu: str = Form(None),
    frekuensi_target: Optional[int] = Form(None),
    frekuensi_target_desc: str = Form(None),
    dampak_target: Optional[int] = Form(None),
    dampak_target_desc: str = Form(None),
    dampak_target_finansial: str = Form(None),
    tanggal_peninjauan: str = Form(None),
    status_pelaksanaan: str = Form("Belum Dimulai"),
    isu_matrix_id: Optional[int] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    nilai_dasar = (frekuensi_sebelum or 0) * (dampak_sebelum or 0)
    nilai_sisa = (frekuensi_sesudah or 0) * (dampak_sesudah or 0)
    nilai_target = (frekuensi_target or 0) * (dampak_target or 0)
    tw = target_waktu if target_waktu else None
    tp = None
    if tanggal_peninjauan:
        try:
            tp = datetime.strptime(tanggal_peninjauan, "%Y-%m-%d").date()
        except ValueError:
            tp = None
    item = PenilaianRisiko(
        nama_isu=nama_isu, proses_bisnis=proses_bisnis, nama_asset=nama_asset,
        kerentanan=kerentanan, ancaman=ancaman, risiko=risiko, akibat_dampak=akibat_dampak,
        frekuensi_sebelum=frekuensi_sebelum, frekuensi_sebelum_desc=frekuensi_sebelum_desc,
        dampak_sebelum=dampak_sebelum, dampak_sebelum_desc=dampak_sebelum_desc,
        dampak_sebelum_finansial=dampak_sebelum_finansial,
        nilai_risiko_dasar=nilai_dasar, pengendalian_yang_ada=pengendalian_yang_ada,
        pemilihan_kontrol=pemilihan_kontrol, frekuensi_sesudah=frekuensi_sesudah,
        frekuensi_sesudah_desc=frekuensi_sesudah_desc,
        dampak_sesudah=dampak_sesudah, dampak_sesudah_desc=dampak_sesudah_desc,
        dampak_sesudah_finansial=dampak_sesudah_finansial,
        nilai_risiko_sisa=nilai_sisa,
        pengendalian_tambahan=pengendalian_tambahan, kebutuhan_sumber_daya=kebutuhan_sumber_daya,
        penanggung_jawab=penanggung_jawab, target_waktu=tw,
        frekuensi_target=frekuensi_target, frekuensi_target_desc=frekuensi_target_desc,
        dampak_target=dampak_target, dampak_target_desc=dampak_target_desc,
        dampak_target_finansial=dampak_target_finansial,
        nilai_risiko_target=nilai_target, tanggal_peninjauan=tp,
        status_pelaksanaan=status_pelaksanaan, isu_matrix_id=isu_matrix_id,
        owner_role=current_user.role,
    )
    db.add(item)
    log_activity(db, current_user.id, "CREATE", "penilaian_risiko", f"Created penilaian risiko: {nama_isu or 'new'}")
    db.commit()
    db.refresh(item)
    return {"message": "created"}


@router.get("/penilaian-risiko/stats", response_model=RiskStatsResponse)
async def get_penilaian_risiko_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    today = date.today()
    base_query = db.query(PenilaianRisiko).filter(PenilaianRisiko.deleted_at.is_(None))
    if current_user.role != "superadmin":
        base_query = base_query.filter(PenilaianRisiko.owner_role == current_user.role)
    all_items = base_query.all()
    critical = sum(1 for i in all_items if (i.nilai_risiko_dasar or 0) >= 15)
    high_risk = sum(1 for i in all_items if (i.nilai_risiko_dasar or 0) >= 10)
    medium_risk = sum(1 for i in all_items if 5 <= (i.nilai_risiko_dasar or 0) < 10)
    low_risk = sum(1 for i in all_items if (i.nilai_risiko_dasar or 0) < 5 and (i.nilai_risiko_dasar or 0) > 0)
    overdue = sum(1 for i in all_items if _is_overdue(i.target_waktu, i.status_pelaksanaan, today))
    in_progress = sum(1 for i in all_items if i.status_pelaksanaan == "In Progress")
    selesai = sum(1 for i in all_items if i.status_pelaksanaan == "Selesai")
    belum_dimulai = sum(1 for i in all_items if i.status_pelaksanaan == "Belum Dimulai")
    ditunda = sum(1 for i in all_items if i.status_pelaksanaan == "Ditunda")
    return {
        "total": len(all_items), "critical_risk": critical, "overdue_treatment": overdue,
        "in_progress": in_progress, "high_risk": high_risk, "medium_risk": medium_risk,
        "low_risk": low_risk, "selesai": selesai, "belum_dimulai": belum_dimulai, "ditunda": ditunda,
    }


@router.put("/penilaian-risiko/{item_id}", response_model=MessageResponse)
async def update_penilaian_risiko(
    item_id: int, request: Request,
    nama_isu: str = Form(None),
    proses_bisnis: str = Form(None),
    nama_asset: str = Form(None),
    kerentanan: str = Form(None),
    ancaman: str = Form(None),
    risiko: str = Form(None),
    akibat_dampak: str = Form(None),
    frekuensi_sebelum: Optional[int] = Form(None),
    frekuensi_sebelum_desc: str = Form(None),
    dampak_sebelum: Optional[int] = Form(None),
    dampak_sebelum_desc: str = Form(None),
    dampak_sebelum_finansial: str = Form(None),
    pengendalian_yang_ada: str = Form(None),
    pemilihan_kontrol: str = Form(None),
    frekuensi_sesudah: Optional[int] = Form(None),
    frekuensi_sesudah_desc: str = Form(None),
    dampak_sesudah: Optional[int] = Form(None),
    dampak_sesudah_desc: str = Form(None),
    dampak_sesudah_finansial: str = Form(None),
    pengendalian_tambahan: str = Form(None),
    kebutuhan_sumber_daya: str = Form(None),
    penanggung_jawab: str = Form(None),
    target_waktu: str = Form(None),
    frekuensi_target: Optional[int] = Form(None),
    frekuensi_target_desc: str = Form(None),
    dampak_target: Optional[int] = Form(None),
    dampak_target_desc: str = Form(None),
    dampak_target_finansial: str = Form(None),
    tanggal_peninjauan: str = Form(None),
    status_pelaksanaan: str = Form(None),
    isu_matrix_id: Optional[int] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    item = db.query(PenilaianRisiko).filter(PenilaianRisiko.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Not found")

    client_version = get_client_version(request)
    check_version_conflict(item, client_version)

    if frekuensi_sebelum is not None or dampak_sebelum is not None:
        item.frekuensi_sebelum = frekuensi_sebelum if frekuensi_sebelum is not None else item.frekuensi_sebelum
        item.dampak_sebelum = dampak_sebelum if dampak_sebelum is not None else item.dampak_sebelum
        item.nilai_risiko_dasar = (item.frekuensi_sebelum or 0) * (item.dampak_sebelum or 0)
    if frekuensi_sesudah is not None or dampak_sesudah is not None:
        item.frekuensi_sesudah = frekuensi_sesudah if frekuensi_sesudah is not None else item.frekuensi_sesudah
        item.dampak_sesudah = dampak_sesudah if dampak_sesudah is not None else item.dampak_sesudah
        item.nilai_risiko_sisa = (item.frekuensi_sesudah or 0) * (item.dampak_sesudah or 0)
    if frekuensi_target is not None or dampak_target is not None:
        item.frekuensi_target = frekuensi_target if frekuensi_target is not None else item.frekuensi_target
        item.dampak_target = dampak_target if dampak_target is not None else item.dampak_target
        item.nilai_risiko_target = (item.frekuensi_target or 0) * (item.dampak_target or 0)
    if target_waktu is not None:
        if target_waktu:
            try:
                item.target_waktu = datetime.strptime(target_waktu, "%Y-%m-%d").date()
            except ValueError:
                item.target_waktu = target_waktu
        else:
            item.target_waktu = None
    if tanggal_peninjauan is not None:
        if tanggal_peninjauan:
            try:
                item.tanggal_peninjauan = datetime.strptime(tanggal_peninjauan, "%Y-%m-%d").date()
            except ValueError:
                item.tanggal_peninjauan = tanggal_peninjauan
        else:
            item.tanggal_peninjauan = None

    for field, value in [
        ("nama_isu", nama_isu), ("proses_bisnis", proses_bisnis), ("nama_asset", nama_asset),
        ("kerentanan", kerentanan), ("ancaman", ancaman), ("risiko", risiko),
        ("akibat_dampak", akibat_dampak), ("pengendalian_yang_ada", pengendalian_yang_ada),
        ("pemilihan_kontrol", pemilihan_kontrol), ("pengendalian_tambahan", pengendalian_tambahan),
        ("kebutuhan_sumber_daya", kebutuhan_sumber_daya), ("penanggung_jawab", penanggung_jawab),
        ("status_pelaksanaan", status_pelaksanaan), ("isu_matrix_id", isu_matrix_id),
        ("frekuensi_sebelum_desc", frekuensi_sebelum_desc),
        ("dampak_sebelum_desc", dampak_sebelum_desc), ("dampak_sebelum_finansial", dampak_sebelum_finansial),
        ("frekuensi_sesudah_desc", frekuensi_sesudah_desc),
        ("dampak_sesudah_desc", dampak_sesudah_desc), ("dampak_sesudah_finansial", dampak_sesudah_finansial),
        ("frekuensi_target_desc", frekuensi_target_desc),
        ("dampak_target_desc", dampak_target_desc), ("dampak_target_finansial", dampak_target_finansial),
    ]:
        if value is not None:
            setattr(item, field, value)
    increment_version(item)
    log_activity(db, current_user.id, "UPDATE", "penilaian_risiko", f"Updated penilaian risiko {item_id}")
    db.commit()
    return {"message": "updated"}


@router.delete("/penilaian-risiko/{item_id}", response_model=MessageResponse)
async def delete_penilaian_risiko(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    item = db.query(PenilaianRisiko).filter(PenilaianRisiko.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Not found")
    item.deleted_at = utcnow()
    log_activity(db, current_user.id, "DELETE", "penilaian_risiko", f"Deleted penilaian risiko {item_id}")
    db.commit()
    return {"message": "soft_deleted"}


# --- SHEET 2: Interested Parties ---

@router.get("/interested-parties")
async def get_interested_parties(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    sort_by: str = Query("created_at"),
    sort_order: str = Query("desc"),
    search: str = Query(""),
    risk_filter: str = Query(""),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if sort_by not in ALLOWED_INTERESTED_SORT:
        sort_by = "created_at"
    query = db.query(InterestedParty).filter(InterestedParty.deleted_at.is_(None))
    if current_user.role != "superadmin":
        query = query.filter(InterestedParty.owner_role == current_user.role)
    if search:
        escaped = search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        s = f"%{escaped}%"
        query = query.filter(or_(
            InterestedParty.interested_party.ilike(s, escape="\\"), InterestedParty.needs.ilike(s, escape="\\"),
            InterestedParty.expectations.ilike(s, escape="\\"),
        ))
    if risk_filter:
        query = query.filter(InterestedParty.risk == risk_filter)
    total = query.count()
    sort_col = getattr(InterestedParty, sort_by, InterestedParty.created_at)
    if sort_order == "asc":
        query = query.order_by(sort_col.asc())
    else:
        query = query.order_by(sort_col.desc())
    offset = (page - 1) * page_size
    items = query.offset(offset).limit(page_size).all()
    result = []
    for item in items:
        result.append({
            "id": item.id, "interested_party": item.interested_party,
            "needs": item.needs, "expectations": item.expectations,
            "risk": item.risk, "opportunity": item.opportunity,
            "created_at": to_iso(item.created_at),
        })
    total_pages = (total + page_size - 1) // page_size
    return {
        "data": result,
        "pagination": {"page": page, "page_size": page_size, "total_records": total,
            "total_pages": total_pages, "has_next": page < total_pages, "has_prev": page > 1},
    }


@router.get("/interested-parties/stats")
async def get_interested_parties_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get interested parties summary by risk level"""
    base_query = db.query(InterestedParty).filter(InterestedParty.deleted_at.is_(None))
    if current_user.role != "superadmin":
        base_query = base_query.filter(InterestedParty.owner_role == current_user.role)
    all_items = base_query.all()
    high = sum(1 for i in all_items if i.risk == "High")
    medium = sum(1 for i in all_items if i.risk == "Medium")
    low = sum(1 for i in all_items if i.risk == "Low")
    return {"total": len(all_items), "high": high, "medium": medium, "low": low}


@router.post("/interested-parties", response_model=MessageResponse)
async def create_interested_party(
    interested_party: str = Form(None),
    needs: str = Form(None),
    expectations: str = Form(None),
    risk: str = Form(None),
    opportunity: str = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    item = InterestedParty(
        interested_party=interested_party, needs=needs,
        expectations=expectations, risk=risk, opportunity=opportunity,
        owner_role=current_user.role,
    )
    db.add(item)
    log_activity(db, current_user.id, "CREATE", "interested_parties", f"Created interested party: {interested_party or 'new'}")
    db.commit()
    db.refresh(item)
    return {"message": "created"}


@router.put("/interested-parties/{item_id}", response_model=MessageResponse)
async def update_interested_party(
    item_id: int, request: Request,
    interested_party: str = Form(None),
    needs: str = Form(None),
    expectations: str = Form(None),
    risk: str = Form(None),
    opportunity: str = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    item = db.query(InterestedParty).filter(InterestedParty.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Not found")

    client_version = get_client_version(request)
    check_version_conflict(item, client_version)

    for field, value in [
        ("interested_party", interested_party), ("needs", needs),
        ("expectations", expectations), ("risk", risk), ("opportunity", opportunity)
    ]:
        if value is not None:
            setattr(item, field, value)
    increment_version(item)
    log_activity(db, current_user.id, "UPDATE", "interested_parties", f"Updated interested party {item_id}")
    db.commit()
    return {"message": "updated"}


@router.delete("/interested-parties/{item_id}", response_model=MessageResponse)
async def delete_interested_party(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    item = db.query(InterestedParty).filter(InterestedParty.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Not found")
    item.deleted_at = utcnow()
    log_activity(db, current_user.id, "DELETE", "interested_parties", f"Deleted interested party {item_id}")
    db.commit()
    return {"message": "soft_deleted"}


# --- SHEET 3: Peluang ---

@router.get("/peluang")
async def get_peluang(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    sort_by: str = Query("created_at"),
    sort_order: str = Query("desc"),
    search: str = Query(""),
    who_filter: str = Query(""),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if sort_by not in ALLOWED_PELUANG_SORT:
        sort_by = "created_at"
    query = db.query(Peluang).filter(Peluang.deleted_at.is_(None))
    if current_user.role != "superadmin":
        query = query.filter(Peluang.owner_role == current_user.role)
    if search:
        escaped = search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        s = f"%{escaped}%"
        query = query.filter(or_(
            Peluang.opportunities.ilike(s, escape="\\"), Peluang.action_plan_who.ilike(s, escape="\\"),
            Peluang.keterangan.ilike(s, escape="\\"),
        ))
    if who_filter:
        query = query.filter(Peluang.action_plan_who == who_filter)
    total = query.count()
    sort_col = getattr(Peluang, sort_by, Peluang.created_at)
    if sort_order == "asc":
        query = query.order_by(sort_col.asc())
    else:
        query = query.order_by(sort_col.desc())
    offset = (page - 1) * page_size
    items = query.offset(offset).limit(page_size).all()
    result = []
    for item in items:
        result.append({
            "id": item.id, "opportunities": item.opportunities,
            "manfaat_diharapkan": item.manfaat_diharapkan, "manfaat_diharapkan_value": item.manfaat_diharapkan_value,
            "manfaat_diharapkan_desc": item.manfaat_diharapkan_desc,
            "manfaat_saat_ini": item.manfaat_saat_ini, "manfaat_saat_ini_value": item.manfaat_saat_ini_value,
            "manfaat_saat_ini_desc": item.manfaat_saat_ini_desc,
            "kebutuhan_sumber_daya": item.kebutuhan_sumber_daya,
            "sumber_daya_value": item.sumber_daya_value, "sumber_daya_desc": item.sumber_daya_desc,
            "opportunity_grade": item.opportunity_grade, "opportunity_grade_label": item.opportunity_grade_label,
            "action_plan_what": item.action_plan_what, "action_plan_resources": item.action_plan_resources,
            "action_plan_who": item.action_plan_who, "action_plan_when": item.action_plan_when,
            "action_plan_how": item.action_plan_how, "keterangan": item.keterangan,
            "created_at": to_iso(item.created_at),
        })
    total_pages = (total + page_size - 1) // page_size
    return {
        "data": result,
        "pagination": {"page": page, "page_size": page_size, "total_records": total,
            "total_pages": total_pages, "has_next": page < total_pages, "has_prev": page > 1},
    }


@router.get("/peluang/stats")
async def get_peluang_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get peluang summary by grade"""
    base_query = db.query(Peluang).filter(Peluang.deleted_at.is_(None))
    if current_user.role != "superadmin":
        base_query = base_query.filter(Peluang.owner_role == current_user.role)
    all_items = base_query.all()
    grade_i = sum(1 for i in all_items if i.opportunity_grade == "Grade I")
    grade_ii = sum(1 for i in all_items if i.opportunity_grade == "Grade II")
    grade_iii = sum(1 for i in all_items if i.opportunity_grade == "Grade III")
    grade_iv = sum(1 for i in all_items if i.opportunity_grade == "Grade IV")
    no_grade = sum(1 for i in all_items if not i.opportunity_grade)
    return {"total": len(all_items), "grade_i": grade_i, "grade_ii": grade_ii, "grade_iii": grade_iii, "grade_iv": grade_iv, "no_grade": no_grade}


@router.post("/peluang", response_model=MessageResponse)
async def create_peluang(
    opportunities: str = Form(None),
    manfaat_diharapkan: str = Form(None),
    manfaat_diharapkan_value: Optional[int] = Form(None),
    manfaat_diharapkan_desc: str = Form(None),
    manfaat_saat_ini: str = Form(None),
    manfaat_saat_ini_value: Optional[int] = Form(None),
    manfaat_saat_ini_desc: str = Form(None),
    kebutuhan_sumber_daya: str = Form(None),
    sumber_daya_value: Optional[int] = Form(None),
    sumber_daya_desc: str = Form(None),
    opportunity_grade: str = Form(None),
    opportunity_grade_label: str = Form(None),
    action_plan_what: str = Form(None),
    action_plan_resources: str = Form(None),
    action_plan_who: str = Form(None),
    action_plan_when: str = Form(None),
    action_plan_how: str = Form(None),
    keterangan: str = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    item = Peluang(
        opportunities=opportunities, manfaat_diharapkan=manfaat_diharapkan,
        manfaat_diharapkan_value=manfaat_diharapkan_value, manfaat_diharapkan_desc=manfaat_diharapkan_desc,
        manfaat_saat_ini=manfaat_saat_ini, manfaat_saat_ini_value=manfaat_saat_ini_value,
        manfaat_saat_ini_desc=manfaat_saat_ini_desc,
        kebutuhan_sumber_daya=kebutuhan_sumber_daya, sumber_daya_value=sumber_daya_value,
        sumber_daya_desc=sumber_daya_desc,
        opportunity_grade=opportunity_grade, opportunity_grade_label=opportunity_grade_label,
        action_plan_what=action_plan_what, action_plan_resources=action_plan_resources,
        action_plan_who=action_plan_who, action_plan_when=action_plan_when,
        action_plan_how=action_plan_how, keterangan=keterangan,
        owner_role=current_user.role,
    )
    db.add(item)
    log_activity(db, current_user.id, "CREATE", "peluang", f"Created peluang: {opportunities or 'new'}")
    db.commit()
    db.refresh(item)
    return {"message": "created"}


@router.put("/peluang/{item_id}", response_model=MessageResponse)
async def update_peluang(
    item_id: int, request: Request,
    opportunities: str = Form(None),
    manfaat_diharapkan: str = Form(None),
    manfaat_diharapkan_value: Optional[int] = Form(None),
    manfaat_diharapkan_desc: str = Form(None),
    manfaat_saat_ini: str = Form(None),
    manfaat_saat_ini_value: Optional[int] = Form(None),
    manfaat_saat_ini_desc: str = Form(None),
    kebutuhan_sumber_daya: str = Form(None),
    sumber_daya_value: Optional[int] = Form(None),
    sumber_daya_desc: str = Form(None),
    opportunity_grade: str = Form(None),
    opportunity_grade_label: str = Form(None),
    action_plan_what: str = Form(None),
    action_plan_resources: str = Form(None),
    action_plan_who: str = Form(None),
    action_plan_when: str = Form(None),
    action_plan_how: str = Form(None),
    keterangan: str = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    item = db.query(Peluang).filter(Peluang.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Not found")

    client_version = get_client_version(request)
    check_version_conflict(item, client_version)

    for field, value in [
        ("opportunities", opportunities), ("manfaat_diharapkan", manfaat_diharapkan),
        ("manfaat_diharapkan_value", manfaat_diharapkan_value), ("manfaat_diharapkan_desc", manfaat_diharapkan_desc),
        ("manfaat_saat_ini", manfaat_saat_ini), ("manfaat_saat_ini_value", manfaat_saat_ini_value),
        ("manfaat_saat_ini_desc", manfaat_saat_ini_desc), ("kebutuhan_sumber_daya", kebutuhan_sumber_daya),
        ("sumber_daya_value", sumber_daya_value), ("sumber_daya_desc", sumber_daya_desc),
        ("opportunity_grade", opportunity_grade), ("opportunity_grade_label", opportunity_grade_label),
        ("action_plan_what", action_plan_what), ("action_plan_resources", action_plan_resources),
        ("action_plan_who", action_plan_who), ("action_plan_when", action_plan_when),
        ("action_plan_how", action_plan_how), ("keterangan", keterangan)
    ]:
        if value is not None:
            setattr(item, field, value)
    increment_version(item)
    log_activity(db, current_user.id, "UPDATE", "peluang", f"Updated peluang {item_id}")
    db.commit()
    return {"message": "updated"}


@router.delete("/peluang/{item_id}", response_model=MessageResponse)
async def delete_peluang(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    item = db.query(Peluang).filter(Peluang.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Not found")
    item.deleted_at = utcnow()
    log_activity(db, current_user.id, "DELETE", "peluang", f"Deleted peluang {item_id}")
    db.commit()
    return {"message": "soft_deleted"}


# --- SHEET 4: Isu Matrix ---

@router.get("/isu-matrix")
async def get_isu_matrix(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    sort_by: str = Query("created_at"),
    sort_order: str = Query("desc"),
    search: str = Query(""),
    kategori_filter: str = Query(""),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if sort_by not in ALLOWED_ISU_SORT:
        sort_by = "created_at"
    query = db.query(IsuMatrix).filter(IsuMatrix.deleted_at.is_(None))
    if current_user.role != "superadmin":
        query = query.filter(IsuMatrix.owner_role == current_user.role)
    if search:
        escaped = search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        s = f"%{escaped}%"
        query = query.filter(or_(
            IsuMatrix.issues.ilike(s, escape="\\"), IsuMatrix.risks.ilike(s, escape="\\"),
            IsuMatrix.opportunities.ilike(s, escape="\\"),
        ))
    if kategori_filter:
        query = query.filter(IsuMatrix.kategori == kategori_filter)
    total = query.count()
    sort_col = getattr(IsuMatrix, sort_by, IsuMatrix.created_at)
    if sort_order == "asc":
        query = query.order_by(sort_col.asc())
    else:
        query = query.order_by(sort_col.desc())
    offset = (page - 1) * page_size
    items = query.offset(offset).limit(page_size).all()
    result = []
    for item in items:
        result.append({
            "id": item.id, "kategori": item.kategori, "issues": item.issues,
            "risks": item.risks, "opportunities": item.opportunities,
            "created_at": to_iso(item.created_at),
        })
    total_pages = (total + page_size - 1) // page_size
    return {
        "data": result,
        "pagination": {"page": page, "page_size": page_size, "total_records": total,
            "total_pages": total_pages, "has_next": page < total_pages, "has_prev": page > 1},
    }


@router.get("/isu-matrix/stats")
async def get_isu_matrix_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get isu matrix summary by kategori"""
    base_query = db.query(IsuMatrix).filter(IsuMatrix.deleted_at.is_(None))
    if current_user.role != "superadmin":
        base_query = base_query.filter(IsuMatrix.owner_role == current_user.role)
    all_items = base_query.all()
    internal = sum(1 for i in all_items if i.kategori == "Internal")
    eksternal = sum(1 for i in all_items if i.kategori == "Eksternal")
    no_kategori = sum(1 for i in all_items if not i.kategori)
    return {"total": len(all_items), "internal": internal, "eksternal": eksternal, "no_kategori": no_kategori}


@router.post("/isu-matrix", response_model=MessageResponse)
async def create_isu_matrix(
    kategori: str = Form(None),
    issues: str = Form(None),
    risks: str = Form(None),
    opportunities: str = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    item = IsuMatrix(kategori=kategori, issues=issues, risks=risks, opportunities=opportunities, owner_role=current_user.role)
    db.add(item)
    log_activity(db, current_user.id, "CREATE", "isu_matrix", f"Created isu matrix: {kategori or 'new'}")
    db.commit()
    db.refresh(item)
    return {"message": "created"}


@router.put("/isu-matrix/{item_id}", response_model=MessageResponse)
async def update_isu_matrix(
    item_id: int, request: Request,
    kategori: str = Form(None),
    issues: str = Form(None),
    risks: str = Form(None),
    opportunities: str = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    item = db.query(IsuMatrix).filter(IsuMatrix.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Not found")

    client_version = get_client_version(request)
    check_version_conflict(item, client_version)

    for field, value in [
        ("kategori", kategori), ("issues", issues),
        ("risks", risks), ("opportunities", opportunities)
    ]:
        if value is not None:
            setattr(item, field, value)
    increment_version(item)
    log_activity(db, current_user.id, "UPDATE", "isu_matrix", f"Updated isu matrix {item_id}")
    db.commit()
    return {"message": "updated"}


@router.delete("/isu-matrix/{item_id}", response_model=MessageResponse)
async def delete_isu_matrix(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    item = db.query(IsuMatrix).filter(IsuMatrix.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Not found")
    item.deleted_at = utcnow()
    log_activity(db, current_user.id, "DELETE", "isu_matrix", f"Deleted isu matrix {item_id}")
    db.commit()
    return {"message": "soft_deleted"}
