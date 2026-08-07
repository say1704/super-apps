"""ISO 27001:2022 Compliance Reports — Daily, Weekly, Monthly aggregation."""
import logging
import functools
import importlib.util
import pathlib
from datetime import datetime, date, timedelta
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, extract

from database import get_db
from models import (
    User, BackupHistory, SSHLoginLog, CapacityMetrics,
    IncidentReport, IRMCCheck, VulnerabilityReport,
    PenilaianRisiko, ActivityLog, AssetCommon,
)
from api.dependencies import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Reports"])


@functools.lru_cache(maxsize=1)
def _legacy_quality_model():
    """Legacy v1 QualityObjective (tabel quality_objectives).

    Nama QualityObjective kini dipakai model v2 (paket models/quality.py),
    jadi blok laporan ini memuat models.py (v1) secara terpisah.
    """
    spec = importlib.util.spec_from_file_location(
        "legacy_models", pathlib.Path(__file__).resolve().parent.parent / "models.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _get_date_range(from_date: str, to_date: str, default_days: int):
    """Parse date range from query params, default to last N days."""
    today = date.today()
    if from_date:
        try:
            f = datetime.strptime(from_date, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(400, "Invalid from_date format, use YYYY-MM-DD")
    else:
        f = today - timedelta(days=default_days)
    if to_date:
        try:
            t = datetime.strptime(to_date, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(400, "Invalid to_date format, use YYYY-MM-DD")
    else:
        t = today
    if f > t:
        raise HTTPException(400, "from_date must be before to_date")
    return f, t


@router.get("/reports/daily")
def get_daily_report(
    date_str: str = Query(None, alias="date"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Daily operational report — backup, SSH failed, capacity alerts, open incidents, IRMC failures."""
    report_date = datetime.strptime(date_str, "%Y-%m-%d").date() if date_str else date.today()

    backup_servers = db.query(BackupHistory).filter(
        BackupHistory.backup_date == report_date
    ).all()
    backup_total = len(backup_servers)
    backup_ok = sum(1 for b in backup_servers if b.status == "OK")
    backup_warning = sum(1 for b in backup_servers if b.status == "Warning")
    backup_critical = sum(1 for b in backup_servers if b.status == "Critical")

    ssh_failed = db.query(SSHLoginLog).filter(
        SSHLoginLog.scan_date == report_date,
        SSHLoginLog.status == "failed",
    ).order_by(SSHLoginLog.login_timestamp.desc()).limit(20).all()
    ssh_unique_ips = len(set(s.source_ip for s in ssh_failed if s.source_ip))

    capacity = db.query(CapacityMetrics).filter(
        CapacityMetrics.tanggal == report_date,
        CapacityMetrics.status.in_(["warning", "critical"]),
    ).order_by(CapacityMetrics.status).all()

    incidents = db.query(IncidentReport).filter(
        IncidentReport.status.in_(["Open", "In Progress"])
    ).order_by(IncidentReport.created_at.desc()).limit(20).all()

    irmc = db.query(IRMCCheck).filter(
        IRMCCheck.check_date == report_date,
        IRMCCheck.status.in_(["fail", "warning"]),
    ).order_by(IRMCCheck.status).limit(20).all()

    return {
        "date": report_date.isoformat(),
        "backup": {
            "total_servers": backup_total,
            "ok_count": backup_ok,
            "warning_count": backup_warning,
            "critical_count": backup_critical,
            "success_rate": round(backup_ok / backup_total * 100, 1) if backup_total else 0,
            "servers": [
                {"server_name": b.server_name, "status": b.status,
                 "files": b.jumlah_files, "size_gb": round(b.total_size_gb or 0, 2)}
                for b in backup_servers
            ],
        },
        "ssh_failed": {
            "total": len(ssh_failed),
            "unique_ips": ssh_unique_ips,
            "top_logins": [
                {"source_ip": s.source_ip, "username": s.username,
                 "login_timestamp": s.login_timestamp.isoformat() if s.login_timestamp else None,
                 "hostname": s.hostname}
                for s in ssh_failed[:10]
            ],
        },
        "capacity_alerts": {
            "total": len(capacity),
            "servers": [
                {"hostname": c.hostname, "cpu": c.cpu_peak, "ram": c.ram_peak,
                 "disk_root": c.disk_root_pct, "disk_data": c.disk_data_pct, "status": c.status}
                for c in capacity
            ],
        },
        "open_incidents": {
            "total": len(incidents),
            "incidents": [
                {"id": i.id, "server_name": i.server_name, "incident_type": i.incident_type,
                 "status": i.status, "description": (i.description or "")[:100]}
                for i in incidents
            ],
        },
        "irmc_failures": {
            "total": len(irmc),
            "checks": [
                {"id": c.id, "server_name": c.server_name, "status": c.status,
                 "check_date": c.check_date.isoformat() if c.check_date else None}
                for c in irmc
            ],
        },
    }


@router.get("/reports/weekly")
def get_weekly_report(
    from_date: str = Query(None, alias="from"),
    to_date: str = Query(None, alias="to"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Weekly management report — incidents, vulnerabilities, risk progress, activity, backup."""
    f, t = _get_date_range(from_date, to_date, 7)
    f_dt = datetime.combine(f, datetime.min.time())
    t_dt = datetime.combine(t, datetime.max.time())

    incidents = db.query(IncidentReport).filter(
        IncidentReport.created_at.between(f_dt, t_dt)
    ).all()
    inc_by_status = {"Open": 0, "In Progress": 0, "Resolved": 0, "Closed": 0}
    inc_by_type = {}
    for inc in incidents:
        s = inc.status if inc.status in inc_by_status else "Open"
        inc_by_status[s] = inc_by_status.get(s, 0) + 1
        t = inc.incident_type or "Other"
        inc_by_type[t] = inc_by_type.get(t, 0) + 1

    vulns = db.query(VulnerabilityReport).filter(
        VulnerabilityReport.scan_date.between(f, t)
    ).all()
    vuln_high = sum(v.high_count or 0 for v in vulns)
    vuln_medium = sum(v.medium_count or 0 for v in vulns)
    vuln_low = sum(v.low_count or 0 for v in vulns)

    risk_items = db.query(PenilaianRisiko).filter(
        PenilaianRisiko.deleted_at.is_(None)
    ).all()
    now = date.today()
    overdue = sum(1 for r in risk_items if r.status_pelaksanaan != "Selesai"
                  and r.target_waktu and isinstance(r.target_waktu, date) and r.target_waktu < now)
    risk_by_status = {}
    for r in risk_items:
        s = r.status_pelaksanaan or "Belum Dimulai"
        risk_by_status[s] = risk_by_status.get(s, 0) + 1

    activities = db.query(ActivityLog).filter(
        ActivityLog.created_at.between(f_dt, t_dt)
    ).all()
    act_by_module = {}
    for a in activities:
        m = a.module or "other"
        act_by_module[m] = act_by_module.get(m, 0) + 1

    backup_records = db.query(BackupHistory).filter(
        BackupHistory.backup_date.between(f, t)
    ).all()
    backup_total = len(backup_records)
    backup_ok = sum(1 for b in backup_records if b.status == "OK")
    backup_servers = len(set(b.server_name for b in backup_records))

    return {
        "period": {"from": f.isoformat(), "to": t.isoformat()},
        "incidents": {
            "total": len(incidents),
            "by_status": inc_by_status,
            "by_type": inc_by_type,
        },
        "vulnerabilities": {
            "total_reports": len(vulns),
            "high_count": vuln_high,
            "medium_count": vuln_medium,
            "low_count": vuln_low,
        },
        "risk": {
            "total": len(risk_items),
            "overdue": overdue,
            "by_status": risk_by_status,
        },
        "activity": {
            "total": len(activities),
            "by_module": dict(sorted(act_by_module.items(), key=lambda x: -x[1])[:10]),
        },
        "backup": {
            "success_rate": round(backup_ok / backup_total * 100, 1) if backup_total else 0,
            "total_records": backup_total,
            "active_servers": backup_servers,
            "alert_count": backup_total - backup_ok,
        },
    }


@router.get("/reports/monthly")
def get_monthly_report(
    from_date: str = Query(None, alias="from"),
    to_date: str = Query(None, alias="to"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Monthly compliance report — executive KPI, assets, risk, incidents, backup, capacity, quality."""
    f, t = _get_date_range(from_date, to_date, 30)
    f_dt = datetime.combine(f, datetime.min.time())
    t_dt = datetime.combine(t, datetime.max.time())

    assets = db.query(AssetCommon).filter(
        AssetCommon.created_at.between(f_dt, t_dt),
        AssetCommon.deleted_at.is_(None),
    ).all()
    total_assets = db.query(AssetCommon).filter(
        AssetCommon.deleted_at.is_(None)
    ).count()
    by_category = {}
    by_classification = {}
    for a in assets:
        cat = a.category or "other"
        by_category[cat] = by_category.get(cat, 0) + 1
        cls = a.classification or "unclassified"
        by_classification[cls] = by_classification.get(cls, 0) + 1

    risk_items = db.query(PenilaianRisiko).filter(
        PenilaianRisiko.deleted_at.is_(None)
    ).all()
    risk_by_level = {"critical": 0, "high": 0, "medium": 0, "low": 0}
    for r in risk_items:
        val = r.nilai_risiko_sisa or r.nilai_risiko_dasar or 0
        if val >= 15:
            risk_by_level["critical"] += 1
        elif val >= 10:
            risk_by_level["high"] += 1
        elif val >= 5:
            risk_by_level["medium"] += 1
        else:
            risk_by_level["low"] += 1
    risk_by_status = {}
    for r in risk_items:
        s = r.status_pelaksanaan or "Belum Dimulai"
        risk_by_status[s] = risk_by_status.get(s, 0) + 1

    incidents = db.query(IncidentReport).filter(
        IncidentReport.created_at.between(f_dt, t_dt)
    ).all()
    total_incidents = db.query(IncidentReport).count()
    inc_by_month = {}
    inc_by_type = {}
    for inc in incidents:
        month_key = inc.created_at.strftime("%Y-%m") if inc.created_at else "unknown"
        inc_by_month[month_key] = inc_by_month.get(month_key, 0) + 1
        t = inc.incident_type or "Other"
        inc_by_type[t] = inc_by_type.get(t, 0) + 1

    backup_records = db.query(BackupHistory).filter(
        BackupHistory.backup_date.between(f, t)
    ).all()
    backup_total = len(backup_records)
    backup_ok = sum(1 for b in backup_records if b.status == "OK")
    backup_volume = sum(b.total_size_gb or 0 for b in backup_records)
    backup_servers = len(set(b.server_name for b in backup_records))

    capacity = db.query(CapacityMetrics).distinct(CapacityMetrics.hostname).all()
    _, t_date = _get_date_range(from_date, to_date, 30)
    latest_cap = db.query(CapacityMetrics).filter(
        CapacityMetrics.tanggal == t_date
    ).all()
    cap_ok = sum(1 for c in latest_cap if c.status == "ok")
    cap_warning = sum(1 for c in latest_cap if c.status == "warning")
    cap_critical = sum(1 for c in latest_cap if c.status == "critical")

    quality = db.query(_legacy_quality_model().QualityObjective).all()
    q_by_unit = {}
    for q in quality:
        u = q.work_unit or "Unassigned"
        q_by_unit[u] = q_by_unit.get(u, 0) + 1

    irmc_checks = db.query(IRMCCheck).filter(
        IRMCCheck.check_date.between(f, t)
    ).all()
    irmc_pass = sum(1 for c in irmc_checks if c.status == "pass")
    irmc_total = len(irmc_checks)

    return {
        "period": {"from": f.isoformat(), "to": t.isoformat()},
        "executive": {
            "total_assets": total_assets,
            "total_incidents": total_incidents,
            "total_risks": len(risk_items),
            "backup_rate": round(backup_ok / backup_total * 100, 1) if backup_total else 0,
            "irmc_pass_rate": round(irmc_pass / irmc_total * 100, 1) if irmc_total else 0,
            "capacity_alerts": cap_warning + cap_critical,
        },
        "assets": {
            "total": total_assets,
            "new_count": len(assets),
            "by_category": by_category,
            "by_classification": by_classification,
        },
        "risk": {
            "total": len(risk_items),
            "by_level": risk_by_level,
            "by_status": risk_by_status,
        },
        "incidents": {
            "total": len(incidents),
            "ongoing": sum(1 for inc in incidents if inc.status in ("Open", "In Progress")),
            "by_month": dict(sorted(inc_by_month.items())),
            "by_type": inc_by_type,
        },
        "backup": {
            "success_rate": round(backup_ok / backup_total * 100, 1) if backup_total else 0,
            "total_records": backup_total,
            "total_volume_gb": round(backup_volume, 2),
            "active_servers": backup_servers,
        },
        "capacity": {
            "total": len(latest_cap),
            "ok": cap_ok,
            "warning": cap_warning,
            "critical": cap_critical,
        },
        "quality": {
            "total": len(quality),
            "by_work_unit": q_by_unit,
        },
    }
