"""Daily Capacity Report — ISO 27001:2022 Annex A 8.6 Capacity Management audit evidence."""
import logging
from datetime import datetime, date
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session, aliased
from sqlalchemy import func

from database import get_db
from models import CapacityMetrics, User, NetworkInterface
from api.dependencies import get_current_user, log_activity
from api.capacity_planning import aggregate_network_by_date

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
        "cpu_peak": round(record.cpu_peak or 0, 1),
        "cpu_peak_time": record.cpu_peak_time or '-',
        "ram_peak": round(record.ram_peak or 0, 1),
        "ram_peak_time": record.ram_peak_time or '-',
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

    avg_cpu = round(sum(s['cpu_peak'] for s in servers_data) / total, 1) if total else 0
    avg_ram = round(sum(s['ram_peak'] for s in servers_data) / total, 1) if total else 0
    avg_disk_root = round(sum(s['disk_root_pct'] for s in servers_data) / total, 1) if total else 0

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
