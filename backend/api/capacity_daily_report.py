"""Daily Capacity Report — ISO 27001:2022 Annex A 8.6 Capacity Management audit evidence."""
import logging
from collections import defaultdict
from datetime import datetime, date
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session, aliased
from sqlalchemy import func

from database import get_db
from models import CapacityMetrics, User, NetworkInterface
from api.dependencies import get_current_user, log_activity
from api.capacity_planning import aggregate_network_by_date, compute_month_sla

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/capacity-reports", tags=["Capacity Reports"])


def _server_to_dict(record: CapacityMetrics, db: Session = None) -> dict:
    if record.disk_usr_local_syb_pct is not None:
        disk_label = record.disk_usr_local_syb_label or '/usr/local/syb'
        disk_data_val = record.disk_usr_local_syb_pct
    elif record.disk_data_pct is not None:
        disk_label = record.disk_data_label or '/Backup'
        disk_data_val = record.disk_data_pct
    else:
        disk_label = '-'
        disk_data_val = None

    alert_detail = '-'
    if record.alert_reason:
        metric = record.alert_reason.split(':')[0].strip() if ':' in record.alert_reason else 'Resource'
        val = ''
        if 'RAM' in record.alert_reason and record.ram_peak is not None:
            val = f"{record.ram_peak:.1f}%"
        elif 'CPU' in record.alert_reason and record.cpu_peak is not None:
            val = f"{record.cpu_peak:.1f}%"
        elif 'Disk' in record.alert_reason and record.disk_root_pct is not None:
            val = f"{record.disk_root_pct}%"
        alert_detail = f"{metric} {val} > threshold 90%" if val else record.alert_reason

    result = {
        "hostname": record.hostname,
        "ip_address": record.ip_address or '',
        "status": record.status,
        "alert_detail": alert_detail,
        "cpu_peak": round(record.cpu_peak or 0, 2),
        "cpu_peak_time": record.cpu_peak_time or '-',
        "cpu_peak_max": round(record.cpu_peak_max or 0, 2),
        "ram_peak": round(record.ram_peak or 0, 2),
        "ram_peak_time": record.ram_peak_time or '-',
        "ram_peak_max": round(record.ram_peak_max or 0, 2),
        "disk_root_pct": record.disk_root_pct or 0,
        "disk_data_pct": disk_data_val,
        "disk_data_label": disk_label,
        "alert_reason": record.alert_reason,
        "tanggal": record.tanggal.isoformat() if hasattr(record.tanggal, 'isoformat') else str(record.tanggal),
    }

    if db:
        network_summary = aggregate_network_by_date(db, record.hostname, record.tanggal)
        if network_summary:
            result.update(network_summary)
        else:
            result.update({
                "total_rx": None,
                "total_tx": None,
                "total_packet_drop": None,
                "internet_status": None
            })

        result["network_interfaces"] = _network_interfaces_detail(db, record)

    return result


def _network_interfaces_detail(db: Session, record: CapacityMetrics) -> list:
    """Build per-interface network detail list for a server/date (mirrors /servers & /history)."""
    net_records = db.query(NetworkInterface).filter(
        NetworkInterface.hostname == record.hostname,
        NetworkInterface.tanggal == record.tanggal
    ).all()

    eth_lookup = {}
    if record.ethernet_interfaces:
        try:
            for entry in record.ethernet_interfaces:
                name = entry.get('interface_name')
                if name:
                    eth_lookup[name] = entry
        except Exception:
            eth_lookup = {}

    return [{
        'interface_name': net.interface_name,
        'speed': net.speed or '-',
        'total_rx': net.total_rx or '0 MB',
        'total_tx': net.total_tx or '0 MB',
        'total_packet_drop': net.total_packet_drop or 0,
        'internet_status': net.internet_status or 'TIDAK TERHUBUNG',
        'ip_address': (eth_lookup.get(net.interface_name, {}) or {}).get('ip_address') or '-',
        'mac_address': (eth_lookup.get(net.interface_name, {}) or {}).get('mac_address') or '-'
    } for net in net_records]


@router.get("/daily")
def get_daily_capacity_report(
    date_str: str = Query(None, alias="date"),
    from_date: str = Query(None, alias="from_date"),
    to_date: str = Query(None, alias="to_date"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Daily capacity report — latest metrics per server, optionally filtered by date or date range."""
    start_date = None
    end_date = None

    if from_date and to_date:
        try:
            start_date = datetime.strptime(from_date, "%Y-%m-%d").date()
            end_date = datetime.strptime(to_date, "%Y-%m-%d").date()
            if start_date > end_date:
                raise HTTPException(status_code=400, detail="from_date must be before or equal to to_date")
            if (end_date - start_date).days > 365:
                raise HTTPException(status_code=400, detail="Date range too large. Maximum 365 days allowed")
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    elif date_str:
        try:
            start_date = datetime.strptime(date_str, "%Y-%m-%d").date()
            end_date = start_date
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")

    # Query servers with latest metrics within date range
    m1 = aliased(CapacityMetrics)
    m2 = aliased(CapacityMetrics)

    base_q = db.query(m1.hostname, func.max(m1.tanggal).label('max_tgl'))
    if start_date:
        base_q = base_q.filter(m1.tanggal >= start_date, m1.tanggal <= end_date)
    subq = base_q.group_by(m1.hostname).subquery()

    servers = db.query(m2).join(
        subq,
        (m2.hostname == subq.c.hostname) &
        (m2.tanggal == subq.c.max_tgl),
    ).order_by(m2.hostname).all()

    servers_data = [_server_to_dict(s) for s in servers]

    total = len(servers_data)
    ok_count = sum(1 for s in servers_data if s['status'] == 'ok')
    warning_count = sum(1 for s in servers_data if s['status'] == 'warning')
    critical_count = sum(1 for s in servers_data if s['status'] == 'critical')

    avg_cpu = round(sum(s['cpu_peak'] for s in servers_data) / total, 2) if total else 0
    avg_ram = round(sum(s['ram_peak'] for s in servers_data) / total, 2) if total else 0
    avg_disk_root = round(sum(s['disk_root_pct'] for s in servers_data) / total, 2) if total else 0

    # Format date range for response
    if start_date and end_date:
        date_range = start_date.isoformat() if start_date == end_date else f"{start_date.isoformat()} to {end_date.isoformat()}"
    else:
        date_range = date.today().isoformat()

    return {
        "date": date_range,
        "from_date": (start_date or date.today()).isoformat(),
        "to_date": (end_date or date.today()).isoformat(),
        "summary": {
            "total_servers": total,
            "ok_count": ok_count,
            "warning_count": warning_count,
            "critical_count": critical_count,
            "avg_cpu": avg_cpu,
            "avg_ram": avg_ram,
            "avg_disk_root": avg_disk_root,
        },
        "servers": servers_data,
    }


@router.get("/export", response_model=dict)
def export_capacity_report(
    from_date: str = Query(...),
    to_date: str = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Export capacity data per server per date (for PDF). Mirrors Backup Check / SSH Report /export pattern."""

    try:
        start_date = datetime.strptime(from_date, "%Y-%m-%d").date()
        end_date = datetime.strptime(to_date, "%Y-%m-%d").date()
        if start_date > end_date:
            raise HTTPException(status_code=400, detail="from_date must be before or equal to to_date")
        if (end_date - start_date).days > 365:
            raise HTTPException(status_code=400, detail="Date range too large. Maximum 365 days allowed")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")

    records = db.query(CapacityMetrics).filter(
        CapacityMetrics.tanggal >= start_date,
        CapacityMetrics.tanggal <= end_date,
    ).order_by(CapacityMetrics.tanggal, CapacityMetrics.hostname).all()

    log_activity(db, current_user.id, "EXPORT", "capacity",
                 f"Exported capacity report (PDF) from {from_date} to {to_date}")
    db.commit()

    return {
        "records": [_server_to_dict(r, db) for r in records],
        "total": len(records),
        "from_date": from_date,
        "to_date": to_date,
    }


@router.get("/sla-export", response_model=dict)
def export_sla_report(
    from_date: str = Query(...),
    to_date: str = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """SLA analysis per server per month — days with data / days in month (for PDF). Mirrors /export pattern."""

    try:
        start_date = datetime.strptime(from_date, "%Y-%m-%d").date()
        end_date = datetime.strptime(to_date, "%Y-%m-%d").date()
        if start_date > end_date:
            raise HTTPException(status_code=400, detail="from_date must be before or equal to to_date")
        if (end_date - start_date).days > 365:
            raise HTTPException(status_code=400, detail="Date range too large. Maximum 365 days allowed")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")

    records = db.query(CapacityMetrics).filter(
        CapacityMetrics.tanggal >= start_date,
        CapacityMetrics.tanggal <= end_date,
    ).order_by(CapacityMetrics.hostname, CapacityMetrics.tanggal).all()

    if not records:
        return {
            "rows": [], "total": 0,
            "from_date": from_date, "to_date": to_date,
            "summary": {"servers": 0, "avg_sla": 0.0},
        }

    # Aggregate per (hostname, year-month): distinct dates + latest record (for uptime snapshot)
    days_by_key = defaultdict(set)
    latest_by_key = {}
    for r in records:
        key = (r.hostname, r.tanggal.strftime('%Y-%m'))
        days_by_key[key].add(r.tanggal)
        if key not in latest_by_key or r.tanggal > latest_by_key[key].tanggal:
            latest_by_key[key] = r

    rows = []
    sla_values = []
    for (hostname, ym), dates in days_by_key.items():
        year, month = map(int, ym.split('-'))
        computed = compute_month_sla(list(dates), year, month, end_date)
        if computed is None:
            continue
        coverage = computed["coverage_pct"]
        if coverage is not None:
            sla_values.append(coverage)
        latest = latest_by_key[(hostname, ym)]
        system_info = latest.system_info or {}
        rows.append({
            "hostname": hostname,
            "year_month": ym,
            "days_of_data": computed["days_of_data"],
            "days_in_month": computed["days_in_month"],
            "days_monitored": computed["days_monitored"],
            "days_no_data": computed["days_no_data"],
            "days_down": computed["days_down"],
            "coverage_pct": coverage,
            "uptime": system_info.get("uptime") or "-",
            "uptime_date": latest.tanggal.isoformat(),
            "status": computed["status"],
        })

    rows.sort(key=lambda r: (r["hostname"], r["year_month"]))
    summary = {
        "servers": len({r["hostname"] for r in rows}),
        "avg_sla": round(sum(sla_values) / len(sla_values), 2) if sla_values else 0.0,
    }

    log_activity(db, current_user.id, "EXPORT", "capacity",
                 f"Exported SLA analysis (PDF) from {from_date} to {to_date}")
    db.commit()

    return {
        "rows": rows,
        "total": len(rows),
        "from_date": from_date,
        "to_date": to_date,
        "summary": summary,
    }
