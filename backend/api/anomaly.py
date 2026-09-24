"""AI Insights — cross-module anomaly findings API."""
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from database import get_db
from models import User, AnomalyFinding
from api.dependencies import get_current_user
from utils import anomaly_engine

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/anomaly", tags=["AI Insights"])


def _apply_rbac(query, user: User):
    """Superadmin lihat semua; selain itu finding dengan owner_role == role user
    ATAU finding umum (owner_role NULL, mis. capacity/incident yang sumbernya tak ber-owner)."""
    if getattr(user, "role", None) == "superadmin":
        return query
    return query.filter(or_(AnomalyFinding.owner_role == user.role, AnomalyFinding.owner_role.is_(None)))


@router.get("/findings")
async def list_findings(
    module: Optional[str] = None,
    severity: Optional[str] = None,
    status: Optional[str] = "open",
    limit: int = Query(200, le=1000),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = _apply_rbac(db.query(AnomalyFinding), current_user)
    if module:
        q = q.filter(AnomalyFinding.module == module)
    if severity:
        q = q.filter(AnomalyFinding.severity == severity)
    if status and status != "all":
        q = q.filter(AnomalyFinding.status == status)
    rows = q.order_by(AnomalyFinding.detected_at.desc()).limit(limit).all()
    return {"findings": [r.to_dict() for r in rows], "total": len(rows)}


@router.get("/summary")
async def summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = _apply_rbac(db.query(AnomalyFinding), current_user).filter(AnomalyFinding.status == "open")
    by_sev = dict(
        _apply_rbac(db.query(AnomalyFinding.severity, func.count(AnomalyFinding.id)), current_user)
        .filter(AnomalyFinding.status == "open")
        .group_by(AnomalyFinding.severity).all()
    )
    by_mod = dict(
        _apply_rbac(db.query(AnomalyFinding.module, func.count(AnomalyFinding.id)), current_user)
        .filter(AnomalyFinding.status == "open")
        .group_by(AnomalyFinding.module).all()
    )
    return {
        "open_total": q.count(),
        "by_severity": {k: int(v) for k, v in by_sev.items()},
        "by_module": {k: int(v) for k, v in by_mod.items()},
    }


@router.post("/scan")
async def scan(
    module: str = Query("all"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Jalankan deteksi on-demand (semua modul atau satu), simpan, narasikan yang penting."""
    if module and module != "all" and module not in anomaly_engine.DETECTORS:
        raise HTTPException(status_code=400, detail=f"Modul tidak dikenal: {module}")
    records = anomaly_engine.run_all(db) if module == "all" else anomaly_engine.run_module(db, module)
    new_findings = anomaly_engine.persist(db, records)
    try:
        await anomaly_engine.narrate(db, new_findings)
    except Exception as e:
        logger.debug("narrate on scan fail: %s", e)
    # Beri tahu sesi lain agar tabel AI Insights auto-refresh
    try:
        from api.dependencies import broadcast_event
        await broadcast_event("anomaly_detected", {"module": module, "new_findings": len(new_findings)})
    except Exception as e:
        logger.debug("broadcast anomaly_detected fail: %s", e)
    return {
        "scanned_module": module,
        "records": len(records),
        "new_findings": len(new_findings),
    }


@router.post("/{finding_id}/ack")
async def ack(finding_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return _set_status(db, current_user, finding_id, "ack")


@router.post("/{finding_id}/resolve")
async def resolve(finding_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return _set_status(db, current_user, finding_id, "resolved")


def _set_status(db: Session, user: User, finding_id: int, status: str):
    f = _apply_rbac(db.query(AnomalyFinding), user).filter(AnomalyFinding.id == finding_id).first()
    if not f:
        raise HTTPException(status_code=404, detail="Finding tidak ditemukan")
    f.status = status
    f.acked_by = user.id
    f.acked_at = datetime.now(timezone.utc)
    db.commit()
    return {"id": f.id, "status": f.status}


def _suppress_from_finding(db, user, finding_id, until, reason):
    from datetime import timedelta  # noqa
    from models import AnomalySuppression
    f = _apply_rbac(db.query(AnomalyFinding), user).filter(AnomalyFinding.id == finding_id).first()
    if not f:
        raise HTTPException(status_code=404, detail="Finding tidak ditemukan")
    db.add(AnomalySuppression(module=f.module, entity=f.entity, signal_type=f.signal_type,
                              until=until, reason=reason, created_by=user.id))
    f.status = "resolved"
    f.acked_by = user.id
    f.acked_at = datetime.now(timezone.utc)
    db.commit()
    return {"id": f.id, "suppressed": True, "until": until.isoformat() if until else None}


@router.post("/{finding_id}/snooze")
async def snooze(finding_id: int, days: int = Query(7, ge=1, le=365),
                 db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Diamkan sementara temuan serupa (module+entity+signal) selama N hari."""
    from datetime import timedelta
    until = datetime.now(timezone.utc) + timedelta(days=days)
    return _suppress_from_finding(db, current_user, finding_id, until, f"snooze {days}h")


@router.post("/{finding_id}/false_positive")
async def false_positive(finding_id: int, db: Session = Depends(get_db),
                         current_user: User = Depends(get_current_user)):
    """Tandai false positive → suppression permanen untuk module+entity+signal ini."""
    return _suppress_from_finding(db, current_user, finding_id, None, "false positive")


@router.get("/suppressions")
async def list_suppressions(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    from models import AnomalySuppression
    rows = db.query(AnomalySuppression).order_by(AnomalySuppression.created_at.desc()).limit(200).all()
    return {"suppressions": [s.to_dict() for s in rows]}


@router.delete("/suppressions/{supp_id}")
async def delete_suppression(supp_id: int, db: Session = Depends(get_db),
                             current_user: User = Depends(get_current_user)):
    from models import AnomalySuppression
    s = db.query(AnomalySuppression).filter(AnomalySuppression.id == supp_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Suppression tidak ditemukan")
    db.delete(s)
    db.commit()
    return {"deleted": supp_id}
