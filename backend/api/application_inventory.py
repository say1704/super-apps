"""Application & Software Inventory - read API.

Data diisi oleh proses SAR (proses ke-2, lihat capacity_planning._import_inventory_pass).
Endpoint ini hanya membaca: dipakai tab "Daftar Apps" di detail server Server Capacity,
termasuk komparasi antar-tanggal.
"""
import logging
from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_, desc
from sqlalchemy.orm import Session

from database import get_db
from models import User, InventorySnapshot, InventoryJar, InventorySoftware
from api.dependencies import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/application-inventory", tags=["Application Inventory"])


def _host_filter(model, hostname: str):
    """Cocokkan berdasarkan nama host ATAU IP koneksi (khusus snapshot punya ip_address)."""
    if model is InventorySnapshot:
        return or_(model.hostname == hostname, model.ip_address == hostname)
    return model.hostname == hostname


def _latest_snapshot(db: Session, hostname: str) -> Optional[InventorySnapshot]:
    return (
        db.query(InventorySnapshot)
        .filter(_host_filter(InventorySnapshot, hostname))
        .order_by(desc(InventorySnapshot.collection_date))
        .first()
    )


def _items_for(db: Session, real_host: str, d: date):
    jars = (
        db.query(InventoryJar)
        .filter(InventoryJar.hostname == real_host, InventoryJar.collection_date == d)
        .order_by(InventoryJar.jar_name)
        .all()
    )
    software = (
        db.query(InventorySoftware)
        .filter(InventorySoftware.hostname == real_host, InventorySoftware.collection_date == d)
        .order_by(InventorySoftware.name)
        .all()
    )
    return jars, software


def _parse_date(s: str) -> date:
    try:
        return datetime.strptime(s, "%Y-%m-%d").date()
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail=f"Tanggal tidak valid: {s} (format YYYY-MM-DD)")


@router.get("/servers/{hostname}")
async def get_server_inventory(
    hostname: str,
    date_str: Optional[str] = Query(None, alias="date"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Snapshot inventory (terbaru, atau tanggal tertentu) + daftar JAR & software."""
    if date_str:
        snap = (
            db.query(InventorySnapshot)
            .filter(_host_filter(InventorySnapshot, hostname), InventorySnapshot.collection_date == _parse_date(date_str))
            .first()
        )
    else:
        snap = _latest_snapshot(db, hostname)

    if not snap:
        return {"hostname": hostname, "snapshot": None, "jars": [], "software": []}

    jars, software = _items_for(db, snap.hostname, snap.collection_date)
    return {
        "hostname": snap.hostname,
        "snapshot": snap.to_dict(),
        "jars": [j.to_dict() for j in jars],
        "software": [s.to_dict() for s in software],
    }


@router.get("/servers/{hostname}/dates")
async def get_inventory_dates(
    hostname: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Daftar tanggal koleksi yang tersedia (desc) untuk picker komparasi."""
    rows = (
        db.query(InventorySnapshot.collection_date)
        .filter(_host_filter(InventorySnapshot, hostname))
        .order_by(desc(InventorySnapshot.collection_date))
        .all()
    )
    return {"hostname": hostname, "dates": [r[0].isoformat() for r in rows if r[0]]}


@router.get("/servers/{hostname}/compare")
async def compare_inventory(
    hostname: str,
    from_date: str = Query(..., alias="from"),
    to_date: str = Query(..., alias="to"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Komparasi inventory antara dua tanggal untuk satu host.

    JAR dibandingkan berdasarkan `jar_name`; software berdasarkan `name` (beda `version`
    -> changed). `from` = tanggal lama (basis), `to` = tanggal baru.
    """
    snap = _latest_snapshot(db, hostname)
    real_host = snap.hostname if snap else hostname
    d_from = _parse_date(from_date)
    d_to = _parse_date(to_date)

    jars_from, sw_from = _items_for(db, real_host, d_from)
    jars_to, sw_to = _items_for(db, real_host, d_to)

    # --- JAR: bandingkan set jar_name ---
    from_jar = {j.jar_name: j.to_dict() for j in jars_from if j.jar_name}
    to_jar = {j.jar_name: j.to_dict() for j in jars_to if j.jar_name}
    jar_added = [to_jar[n] for n in to_jar if n not in from_jar]
    jar_removed = [from_jar[n] for n in from_jar if n not in to_jar]

    # --- Software: bandingkan by name, deteksi perubahan versi ---
    from_sw = {s.name: s.to_dict() for s in sw_from}
    to_sw = {s.name: s.to_dict() for s in sw_to}
    sw_added = [to_sw[n] for n in to_sw if n not in from_sw]
    sw_removed = [from_sw[n] for n in from_sw if n not in to_sw]
    sw_changed = [
        {"name": n, "from_version": from_sw[n].get("version"), "to_version": to_sw[n].get("version"),
         "arch": to_sw[n].get("arch"), "executable": to_sw[n].get("executable")}
        for n in to_sw
        if n in from_sw and (from_sw[n].get("version") != to_sw[n].get("version"))
    ]

    return {
        "hostname": real_host,
        "from": d_from.isoformat(),
        "to": d_to.isoformat(),
        "has_from": bool(jars_from or sw_from),
        "has_to": bool(jars_to or sw_to),
        "jars": {"added": jar_added, "removed": jar_removed},
        "software": {"added": sw_added, "removed": sw_removed, "changed": sw_changed},
        "summary": {
            "jar_added": len(jar_added), "jar_removed": len(jar_removed),
            "sw_added": len(sw_added), "sw_removed": len(sw_removed), "sw_changed": len(sw_changed),
        },
    }


@router.get("/export")
async def export_inventory(
    hostname: str = Query(...),
    date_str: Optional[str] = Query(None, alias="date"),
    kind: str = Query("software", pattern="^(software|jar)$"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Data datar (JAR atau software) untuk satu host+tanggal (default snapshot terbaru)."""
    if date_str:
        d = _parse_date(date_str)
        snap = (
            db.query(InventorySnapshot)
            .filter(_host_filter(InventorySnapshot, hostname), InventorySnapshot.collection_date == d)
            .first()
        )
    else:
        snap = _latest_snapshot(db, hostname)
    if not snap:
        return {"hostname": hostname, "kind": kind, "date": None, "rows": []}

    jars, software = _items_for(db, snap.hostname, snap.collection_date)
    rows = [j.to_dict() for j in jars] if kind == "jar" else [s.to_dict() for s in software]
    return {"hostname": snap.hostname, "kind": kind, "date": snap.collection_date.isoformat(), "rows": rows}
