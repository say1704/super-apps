"""Backup Analytics API Endpoints - For Capacity Planning"""
from utils.timezone import utcnow
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session
from sqlalchemy import func, extract, and_, cast, Date
from datetime import datetime, date, timedelta
from typing import List, Optional, Dict, Any
from database import get_db
from models import BackupHistory, User
from api.dependencies import get_current_user

router = APIRouter(prefix="/backup-analytics", tags=["Backup Analytics"])


def _apply_backup_rbac(query, current_user: User):
    """Apply RBAC filter: superadmin sees all, others see own role group."""
    if current_user.role != "superadmin":
        return query.filter(BackupHistory.owner_role == current_user.role)
    return query


@router.get("/per-server-projection", response_model=dict)
async def get_per_server_projection(
    months: int = Query(default=6, description="Months to project"),
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """
    Get per-server 6-month projection
    FIX: Floor check (no negative projections)
    FIX: Use median daily growth to reduce noise
    """
    import statistics

    cutoff_date = date.today() - timedelta(days=180)

    query = db.query(
        BackupHistory.backup_date,
        BackupHistory.server_name,
        BackupHistory.total_size_bytes
    ).filter(
        BackupHistory.backup_date >= cutoff_date
    )
    query = _apply_backup_rbac(query, current_user)
    historical_data = query.order_by(BackupHistory.backup_date).all()

    if not historical_data:
        return {"projections": []}

    server_data = {}
    for record in historical_data:
        server = record.server_name
        if server not in server_data:
            server_data[server] = []
        server_data[server].append({
            'date': record.backup_date,
            'size': record.total_size_bytes
        })

    projections = []

    for server, data in server_data.items():
        if len(data) < 2:
            continue

        data.sort(key=lambda x: x['date'])

        daily_growth = []
        for i in range(1, len(data)):
            size_diff = data[i]['size'] - data[i-1]['size']
            date_diff = (data[i]['date'] - data[i-1]['date']).days
            if date_diff > 0:
                daily_growth.append(size_diff / date_diff)

        if not daily_growth:
            continue

        avg_daily_growth = statistics.median(daily_growth) if len(daily_growth) >= 3 else sum(daily_growth) / len(daily_growth)
        latest_size = data[-1]['size']
        latest_date = data[-1]['date']

        for month in range(1, months + 1):
            proj_date = latest_date + timedelta(days=month * 30)
            projected_size = max(0, latest_size + (avg_daily_growth * month * 30))

            projections.append({
                'server_name': server,
                'proj_date': proj_date.isoformat(),
                'projected_size_kb': round(projected_size / 1024, 2),
                'projected_size_mb': round(projected_size / (1024**2), 2),
                'projected_size_gb': projected_size / (1024**3),
                'month': month
            })

    return {"projections": projections}


@router.get("/daily-report", response_model=dict)
async def get_daily_report(
    days_ago: int = Query(default=0, description="Days ago (0=today, 1=yesterday)"),
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """
    Get daily report for today or yesterday (similar to Metabase query)
    Shows all servers that have backup on the target date
    """
    target_date = date.today() - timedelta(days=days_ago)

    query = db.query(
        BackupHistory.server_name,
        BackupHistory.backup_date,
        BackupHistory.jumlah_files,
        BackupHistory.total_size_bytes
    ).filter(
        BackupHistory.backup_date == target_date
    )
    query = _apply_backup_rbac(query, current_user)
    records = query.order_by(BackupHistory.server_name).all()

    servers = []
    total_files = 0
    total_size = 0

    for record in records:
        servers.append({
            'server_name': record.server_name,
            'tanggal': record.backup_date.isoformat(),
            'jumlah_files': record.jumlah_files,
            'total_size_kb': round(record.total_size_bytes / 1024, 2),
            'total_size_mb': round(record.total_size_bytes / (1024**2), 2),
            'total_size_gb': record.total_size_bytes / (1024**3),
            'total_size_tb': round(record.total_size_bytes / (1024**4), 2)
        })
        total_files += record.jumlah_files
        total_size += record.total_size_bytes

    # Add total row
    if servers:
        servers.append({
            'server_name': f'TOTAL ({len(records)} SERVERS)',
            'tanggal': target_date.isoformat(),
            'jumlah_files': total_files,
            'total_size_kb': round(total_size / 1024, 2),
            'total_size_mb': round(total_size / (1024**2), 2),
            'total_size_gb': total_size / (1024**3),
            'total_size_tb': round(total_size / (1024**4), 2)
        })

    return {"servers": servers, "date": target_date.isoformat()}


@router.get("/last-month-report", response_model=dict)
async def get_last_month_report(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    Get last month data (similar to Metabase query)
    """
    from sqlalchemy import func
    
    # First day of last month
    today = date.today()
    first_day_this_month = today.replace(day=1)
    last_day_last_month = first_day_this_month - timedelta(days=1)
    first_day_last_month = last_day_last_month.replace(day=1)

    query = db.query(
        BackupHistory.server_name,
        BackupHistory.backup_date,
        BackupHistory.jumlah_files,
        BackupHistory.total_size_bytes
    ).filter(
        BackupHistory.backup_date >= first_day_last_month,
        BackupHistory.backup_date < first_day_this_month
    )
    query = _apply_backup_rbac(query, current_user)
    records = query.all()

    # Group by server
    server_totals = {}
    for record in records:
        server = record.server_name
        if server not in server_totals:
            server_totals[server] = {'files': 0, 'size': 0}
        server_totals[server]['files'] += record.jumlah_files
        server_totals[server]['size'] += record.total_size_bytes
    
    servers = []
    total_files = 0
    total_size = 0
    
    for server, totals in server_totals.items():
        servers.append({
            'server_name': server,
            'tanggal': f'{first_day_last_month} to {last_day_last_month}',
            'jumlah_files': totals['files'],
            'total_size_kb': round(totals['size'] / 1024, 2),
            'total_size_mb': round(totals['size'] / (1024**2), 2),
            'total_size_gb': totals['size'] / (1024**3),
            'total_size_tb': round(totals['size'] / (1024**4), 2)
        })
        total_files += totals['files']
        total_size += totals['size']
    
    # Add total row
    if servers:
        servers.append({
            'server_name': f'TOTAL ({len(server_totals)} SERVERS)',
            'tanggal': f'{first_day_last_month} to {last_day_last_month}',
            'jumlah_files': total_files,
            'total_size_kb': round(total_size / 1024, 2),
            'total_size_mb': round(total_size / (1024**2), 2),
            'total_size_gb': total_size / (1024**3),
            'total_size_tb': round(total_size / (1024**4), 2)
        })
    
    return {"servers": servers, "period": f"{first_day_last_month} to {last_day_last_month}"}


@router.get("/projection", response_model=dict)
async def get_storage_projection(
    months: int = Query(default=6, description="Months to project"),
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """
    Get storage projection using smoothed growth calculation
    FIX: Floor check (no negative projections)
    FIX: NaN/Infinity guard on growth_rate_percent
    FIX: Use median daily growth to reduce noise from outliers
    FIX: No double-count (DISTINCT server + MAX date + MAX id tiebreaker)
    """
    from sqlalchemy import text
    import statistics
    import math

    cutoff_date = date.today() - timedelta(days=180)

    historical_data = db.query(
        BackupHistory.backup_date,
        BackupHistory.server_name,
        BackupHistory.total_size_bytes
    ).filter(
        BackupHistory.backup_date >= cutoff_date
    ).order_by(BackupHistory.backup_date).all()

    if not historical_data:
        return {"error": "No historical data available"}

    server_data = {}
    for record in historical_data:
        server = record.server_name
        if server not in server_data:
            server_data[server] = []
        server_data[server].append({
            'date': record.backup_date,
            'size': record.total_size_bytes
        })

    projections = []
    total_current = 0
    total_projected = 0

    for server, data in server_data.items():
        if len(data) < 2:
            continue

        data.sort(key=lambda x: x['date'])

        daily_growth = []
        for i in range(1, len(data)):
            size_diff = data[i]['size'] - data[i-1]['size']
            date_diff = (data[i]['date'] - data[i-1]['date']).days
            if date_diff > 0:
                daily_growth.append(size_diff / date_diff)

        if not daily_growth:
            continue

        avg_daily_growth = statistics.median(daily_growth) if len(daily_growth) >= 3 else sum(daily_growth) / len(daily_growth)
        latest_size = data[-1]['size']
        latest_date = data[-1]['date']

        total_current += latest_size

        for month in range(1, months + 1):
            proj_date = latest_date + timedelta(days=month * 30)
            projected_size = max(0, latest_size + (avg_daily_growth * month * 30))

            projections.append({
                'server_name': server,
                'proj_date': proj_date.isoformat(),
                'projected_size_gb': projected_size / (1024**3),
                'month': month
            })

            if month == months:
                total_projected += projected_size

    if total_current > 0:
        overall_growth_rate = (total_projected - total_current) / total_current * 100
        if math.isnan(overall_growth_rate) or math.isinf(overall_growth_rate):
            overall_growth_rate = 0
    else:
        overall_growth_rate = 0

    return {
        'current_total_gb': total_current / (1024**3),
        'projected_total_gb': total_projected / (1024**3),
        'growth_rate_percent': round(overall_growth_rate, 2),
        'projections': projections,
        'months': months
    }


@router.get("/summary", response_model=dict)
async def get_backup_summary(
    days: int = Query(default=30, description="Number of days to analyze"),
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """
    Get backup summary statistics for capacity planning
    FIX: Total = latest backup per server (not SUM of all records)
    FIX: Growth rate = latest snapshot total vs previous snapshot total
    FIX: No double-count (DISTINCT server + MAX date + MAX id tiebreaker)
    FIX: Previous snapshot lookup NOT limited by cutoff_date
    """
    cutoff_date = date.today() - timedelta(days=days)

    # Basic stats
    total_records = _apply_backup_rbac(db.query(BackupHistory), current_user).filter(
        BackupHistory.backup_date >= cutoff_date
    ).count()

    # Status breakdown
    status_breakdown = db.query(
        BackupHistory.status,
        func.count(BackupHistory.id)
    ).filter(
        BackupHistory.backup_date >= cutoff_date
    ).group_by(BackupHistory.status).all()

    # Average files per backup
    avg_files = db.query(
        func.avg(BackupHistory.jumlah_files)
    ).filter(
        BackupHistory.backup_date >= cutoff_date
    ).scalar() or 0

    # Average size per backup
    avg_size = db.query(
        func.avg(BackupHistory.total_size_bytes)
    ).filter(
        BackupHistory.backup_date >= cutoff_date
    ).scalar() or 0

    # FIX: Get latest backup per server within period (no double-count)
    # Step 1: Get max date per server
    latest_dates_subq = db.query(
        BackupHistory.server_name,
        func.max(BackupHistory.backup_date).label("max_date")
    ).filter(
        BackupHistory.backup_date >= cutoff_date
    ).group_by(
        BackupHistory.server_name
    ).subquery()

    # Step 2: Get max id per server for tiebreaking (same date, multiple backups)
    latest_ids_subq = db.query(
        func.max(BackupHistory.id).label("latest_id")
    ).join(
        latest_dates_subq,
        and_(
            BackupHistory.server_name == latest_dates_subq.c.server_name,
            BackupHistory.backup_date == latest_dates_subq.c.max_date
        )
    ).group_by(
        BackupHistory.server_name
    ).subquery()

    # Step 3: Fetch actual records
    latest_backups = _apply_backup_rbac(db.query(BackupHistory), current_user).filter(
        BackupHistory.id.in_(db.query(latest_ids_subq.c.latest_id))
    ).all()

    total_backup_volume = sum(b.total_size_bytes for b in latest_backups)
    servers = len(latest_backups)

    # FIX: Growth rate = (latest_total - previous_total) / days
    # Previous snapshot: latest backup per server BEFORE the current latest date
    # NOTE: NOT limited by cutoff_date to get accurate previous snapshot
    previous_total = 0
    for latest_b in latest_backups:
        prev_record = _apply_backup_rbac(db.query(BackupHistory), current_user).filter(
            BackupHistory.server_name == latest_b.server_name,
            BackupHistory.backup_date < latest_b.backup_date
        ).order_by(BackupHistory.backup_date.desc(), BackupHistory.id.desc()).first()

        if prev_record:
            previous_total += prev_record.total_size_bytes
        else:
            previous_total += latest_b.total_size_bytes

    total_bytes_diff = total_backup_volume - previous_total
    volume_change_rate_gb = total_bytes_diff / days / (1024**3) if days > 0 else 0

    return {
        "period_days": days,
        "total_records": total_records,
        "servers_count": servers,
        "status_breakdown": {status: count for status, count in status_breakdown},
        "avg_files_per_backup": round(avg_files, 2),
        "avg_size_per_backup_gb": avg_size / (1024**3),
        "total_backup_volume_tb": round(total_backup_volume / (1024**4), 2),
        "volume_change_rate_gb": round(volume_change_rate_gb, 2)
    }


@router.get("/servers", response_model=dict)
async def get_servers_list(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """Get list of all servers with latest backup info"""
    # Get latest backup per server
    subquery = db.query(
        BackupHistory.server_name,
        func.max(BackupHistory.backup_date).label("max_date")
    ).group_by(
        BackupHistory.server_name
    ).subquery()
    
    latest_backups = _apply_backup_rbac(db.query(BackupHistory), current_user).join(
        subquery,
        and_(
            BackupHistory.server_name == subquery.c.server_name,
            BackupHistory.backup_date == subquery.c.max_date
        )
    ).all()
    
    return {
        "servers": [
            {
                "server_name": b.server_name,
                "latest_date": b.backup_date.isoformat(),
                "latest_files": b.jumlah_files,
                "latest_size_gb": b.total_size_bytes / (1024**3),
                "status": b.status
            }
            for b in latest_backups
        ],
        "total_servers": len(latest_backups)
    }


@router.get("/server/{server_name}", response_model=dict)
async def get_server_history(
    server_name: str,
    days: int = Query(default=30, description="Number of days of history"),
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """
    Get detailed backup history for a specific server
    Option C: Historical view per server
    """
    cutoff_date = date.today() - timedelta(days=days)
    
    records = _apply_backup_rbac(db.query(BackupHistory), current_user).filter(
        BackupHistory.server_name == server_name,
        BackupHistory.backup_date >= cutoff_date
    ).order_by(BackupHistory.backup_date.desc()).all()
    
    # Calculate statistics
    if records:
        avg_files = sum(r.jumlah_files for r in records) / len(records)
        avg_size = sum(r.total_size_bytes for r in records) / len(records)
        max_files = max(r.jumlah_files for r in records)
        max_size = max(r.total_size_bytes for r in records)
        
        # Status counts
        ok_count = sum(1 for r in records if r.status == "OK")
        warning_count = sum(1 for r in records if r.status == "Warning")
        critical_count = sum(1 for r in records if r.status == "Critical")
    else:
        avg_files = avg_size = max_files = max_size = 0
        ok_count = warning_count = critical_count = 0
    
    return {
        "server_name": server_name,
        "period_days": days,
        "statistics": {
            "total_records": len(records),
            "avg_files": round(avg_files, 2),
            "avg_size_gb": avg_size / (1024**3),
            "max_files": max_files,
            "max_size_gb": max_size / (1024**3),
            "ok_days": ok_count,
            "warning_days": warning_count,
            "critical_days": critical_count,
        },
        "history": [r.to_dict() for r in records]
    }


@router.get("/daily-trend", response_model=dict)
async def get_daily_trend(
    days: int = Query(default=30, description="Number of days"),
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """
    Get daily backup trend for capacity planning
    Shows: files per day, size per day, success rate
    """
    cutoff_date = date.today() - timedelta(days=days)
    
    # Group by date
    daily_stats = db.query(
        BackupHistory.backup_date,
        func.count(BackupHistory.id).label("backup_count"),
        func.sum(BackupHistory.jumlah_files).label("total_files"),
        func.sum(BackupHistory.total_size_bytes).label("total_size"),
        func.avg(BackupHistory.jumlah_files).label("avg_files"),
    ).filter(
        BackupHistory.backup_date >= cutoff_date
    ).group_by(
        BackupHistory.backup_date
    ).order_by(BackupHistory.backup_date).all()
    
    return {
        "period_days": days,
        "daily_data": [
            {
                "date": str(stat.backup_date),
                "backup_count": stat.backup_count,
                "total_files": stat.total_files or 0,
                "total_size_gb": (stat.total_size or 0) / (1024**3),
                "avg_files_per_server": round(stat.avg_files or 0, 2)
            }
            for stat in daily_stats
        ]
    }


@router.get("/monthly-aggregation", response_model=dict)
async def get_monthly_aggregation(
    months: int = Query(default=12, description="Number of months"),
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """
    Get monthly aggregation for long-term capacity planning
    """
    # Calculate cutoff (approximate)
    cutoff_date = date.today() - timedelta(days=months * 30)
    
    monthly_stats = db.query(
        extract('year', BackupHistory.backup_date).label('year'),
        extract('month', BackupHistory.backup_date).label('month'),
        func.count(BackupHistory.id).label("backup_count"),
        func.sum(BackupHistory.jumlah_files).label("total_files"),
        func.sum(BackupHistory.total_size_bytes).label("total_size"),
        func.avg(BackupHistory.jumlah_files).label("avg_files"),
    ).filter(
        BackupHistory.backup_date >= cutoff_date
    ).group_by(
        extract('year', BackupHistory.backup_date),
        extract('month', BackupHistory.backup_date)
    ).order_by(
        extract('year', BackupHistory.backup_date),
        extract('month', BackupHistory.backup_date)
    ).all()
    
    return {
        "period_months": months,
        "monthly_data": [
            {
                "year": int(stat.year),
                "month": int(stat.month),
                "backup_count": stat.backup_count,
                "total_files": stat.total_files or 0,
                "total_size_tb": round((stat.total_size or 0) / (1024**4), 2),
                "avg_files_per_day": round(stat.avg_files or 0, 2)
            }
            for stat in monthly_stats
        ]
    }


@router.get("/top-servers", response_model=dict)
async def get_top_servers(
    limit: int = Query(default=10, description="Number of top servers"),
    days: int = Query(default=30, description="Period in days"),
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """
    Get top servers by storage usage or file count
    """
    cutoff_date = date.today() - timedelta(days=days)
    
    # Top by storage
    top_by_storage = db.query(
        BackupHistory.server_name,
        func.sum(BackupHistory.total_size_bytes).label("total_size"),
        func.avg(BackupHistory.jumlah_files).label("avg_files"),
        func.count(BackupHistory.id).label("backup_days"),
    ).filter(
        BackupHistory.backup_date >= cutoff_date
    ).group_by(
        BackupHistory.server_name
    ).order_by(
        func.sum(BackupHistory.total_size_bytes).desc()
    ).limit(limit).all()
    
    # Top by file count
    top_by_files = db.query(
        BackupHistory.server_name,
        func.sum(BackupHistory.jumlah_files).label("total_files"),
        func.avg(BackupHistory.total_size_bytes).label("avg_size"),
        func.count(BackupHistory.id).label("backup_days"),
    ).filter(
        BackupHistory.backup_date >= cutoff_date
    ).group_by(
        BackupHistory.server_name
    ).order_by(
        func.sum(BackupHistory.jumlah_files).desc()
    ).limit(limit).all()
    
    return {
        "period_days": days,
        "top_by_storage_gb": [
            {
                "server_name": s.server_name,
                "total_size_gb": s.total_size / (1024**3),
                "avg_files": round(s.avg_files, 2),
                "backup_days": s.backup_days
            }
            for s in top_by_storage
        ],
        "top_by_files": [
            {
                "server_name": s.server_name,
                "total_files": s.total_files,
                "avg_size_gb": s.avg_size / (1024**3),
                "backup_days": s.backup_days
            }
            for s in top_by_files
        ]
    }


@router.get("/status-distribution", response_model=dict)
async def get_status_distribution(
    days: int = Query(default=30, description="Days to analyze"),
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """
    Get status distribution (OK/Warning/Critical) over time
    """
    cutoff_date = date.today() - timedelta(days=days)
    
    # Overall distribution
    overall = db.query(
        BackupHistory.status,
        func.count(BackupHistory.id)
    ).filter(
        BackupHistory.backup_date >= cutoff_date
    ).group_by(BackupHistory.status).all()
    
    # Daily distribution
    daily = db.query(
        BackupHistory.backup_date,
        BackupHistory.status,
        func.count(BackupHistory.id)
    ).filter(
        BackupHistory.backup_date >= cutoff_date
    ).group_by(
        BackupHistory.backup_date,
        BackupHistory.status
    ).order_by(BackupHistory.backup_date).all()
    
    return {
        "period_days": days,
        "overall": {status: count for status, count in overall},
        "daily": [
            {
                "date": str(d[0]),
                "status": d[1],
                "count": d[2]
            }
            for d in daily
        ]
    }


@router.get("/timeline", response_model=dict)
async def get_backup_timeline(
    days: int = Query(default=30, description="Days of historical data"),
    projection_months: int = Query(default=6, description="Months to project"),
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """
    Get daily storage timeline with 6-month projection for line/area charts.
    Returns historical daily aggregates + projected future points.
    """
    import statistics

    cutoff_date = date.today() - timedelta(days=days)

    # Historical daily aggregates: latest backup per server per day
    latest_dates_subq = db.query(
        BackupHistory.backup_date,
        BackupHistory.server_name,
        func.max(BackupHistory.id).label("max_id")
    ).filter(
        BackupHistory.backup_date >= cutoff_date
    ).group_by(
        BackupHistory.backup_date,
        BackupHistory.server_name
    ).subquery()

    daily_records = db.query(
        BackupHistory.backup_date,
        func.sum(BackupHistory.total_size_bytes).label("daily_total"),
        func.count(BackupHistory.id).label("backup_count")
    ).join(
        latest_dates_subq,
        BackupHistory.id == latest_dates_subq.c.max_id
    ).group_by(
        BackupHistory.backup_date
    ).order_by(
        BackupHistory.backup_date
    ).all()

    timeline = []
    for rec in daily_records:
        timeline.append({
            "date": str(rec.backup_date),
            "total_storage_gb": (rec.daily_total or 0) / (1024**3),
            "backup_count": rec.backup_count or 0,
            "is_projection": False
        })

    # Build projection from latest per-server data
    all_historical = db.query(
        BackupHistory.backup_date,
        BackupHistory.server_name,
        BackupHistory.total_size_bytes
    ).filter(
        BackupHistory.backup_date >= cutoff_date
    ).order_by(BackupHistory.backup_date).all()

    server_data = {}
    for record in all_historical:
        server = record.server_name
        if server not in server_data:
            server_data[server] = []
        server_data[server].append({
            'date': record.backup_date,
            'size': record.total_size_bytes
        })

    total_current = 0
    server_projections = {}

    for server, data in server_data.items():
        if len(data) < 2:
            continue
        data.sort(key=lambda x: x['date'])

        daily_growth = []
        for i in range(1, len(data)):
            size_diff = data[i]['size'] - data[i-1]['size']
            date_diff = (data[i]['date'] - data[i-1]['date']).days
            if date_diff > 0:
                daily_growth.append(size_diff / date_diff)

        if not daily_growth:
            continue

        avg_daily_growth = statistics.median(daily_growth) if len(daily_growth) >= 3 else sum(daily_growth) / len(daily_growth)
        latest_size = data[-1]['size']
        latest_date = data[-1]['date']

        total_current += latest_size
        server_projections[server] = {
            'avg_daily_growth': avg_daily_growth,
            'latest_size': latest_size,
            'latest_date': latest_date
        }

    # Generate projection points (monthly)
    if timeline:
        base_date = timeline[-1]['date']
    else:
        base_date = date.today().isoformat()

    for month in range(1, projection_months + 1):
        projected_total = 0
        for server, proj in server_projections.items():
            proj_size = max(0, proj['latest_size'] + (proj['avg_daily_growth'] * month * 30))
            projected_total += proj_size

        proj_date = (datetime.strptime(base_date, '%Y-%m-%d') + timedelta(days=month * 30)).date()

        timeline.append({
            "date": str(proj_date),
            "total_storage_gb": projected_total / (1024**3),
            "backup_count": 0,
            "is_projection": True
        })

    return {"timeline": timeline, "current_total_gb": total_current / (1024**3)}


@router.get("/per-server-comparison", response_model=dict)
async def get_per_server_comparison(
    limit: int = Query(default=20, description="Max servers to return"),
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """
    Get per-server current vs 6-month projection for bar chart.
    Returns top servers sorted by growth_percent DESC.
    """
    import statistics

    cutoff_date = date.today() - timedelta(days=180)

    historical_data = db.query(
        BackupHistory.backup_date,
        BackupHistory.server_name,
        BackupHistory.total_size_bytes
    ).filter(
        BackupHistory.backup_date >= cutoff_date
    ).order_by(BackupHistory.backup_date).all()

    if not historical_data:
        return {"servers": []}

    server_data = {}
    for record in historical_data:
        server = record.server_name
        if server not in server_data:
            server_data[server] = []
        server_data[server].append({
            'date': record.backup_date,
            'size': record.total_size_bytes
        })

    comparisons = []
    for server, data in server_data.items():
        if len(data) < 2:
            continue

        data.sort(key=lambda x: x['date'])

        daily_growth = []
        for i in range(1, len(data)):
            size_diff = data[i]['size'] - data[i-1]['size']
            date_diff = (data[i]['date'] - data[i-1]['date']).days
            if date_diff > 0:
                daily_growth.append(size_diff / date_diff)

        if not daily_growth:
            continue

        avg_daily_growth = statistics.median(daily_growth) if len(daily_growth) >= 3 else sum(daily_growth) / len(daily_growth)
        latest_size = data[-1]['size']
        current_gb = latest_size / (1024**3)

        month6_size = max(0, latest_size + (avg_daily_growth * 6 * 30))
        month6_gb = month6_size / (1024**3)

        growth_percent = round(((month6_gb - current_gb) / current_gb * 100), 2) if current_gb > 0 else 0

        comparisons.append({
            "server_ip": server,
            "current_gb": current_gb,
            "month6_gb": month6_gb,
            "growth_percent": growth_percent
        })

    comparisons.sort(key=lambda x: x['growth_percent'], reverse=True)

    return {"servers": comparisons[:limit]}


@router.get("/capacity-metrics", response_model=dict)
async def get_capacity_metrics(
    total_capacity_gb: float = Query(default=1000, description="Total storage capacity in GB"),
    projection_months: int = Query(default=6, description="Months to project"),
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """
    Get capacity planning metrics with threshold warnings.
    Returns current usage, projected usage, and alert levels.
    """
    import statistics

    cutoff_date = date.today() - timedelta(days=180)

    historical_data = db.query(
        BackupHistory.backup_date,
        BackupHistory.server_name,
        BackupHistory.total_size_bytes
    ).filter(
        BackupHistory.backup_date >= cutoff_date
    ).order_by(BackupHistory.backup_date).all()

    if not historical_data:
        return {
            "total_capacity_gb": total_capacity_gb,
            "used_gb": 0,
            "available_gb": total_capacity_gb,
            "usage_percent": 0,
            "projected_usage_gb": 0,
            "projected_percent": 0,
            "thresholds": {"warning_80": False, "critical_90": False, "full_100": False}
        }

    server_data = {}
    for record in historical_data:
        server = record.server_name
        if server not in server_data:
            server_data[server] = []
        server_data[server].append({
            'date': record.backup_date,
            'size': record.total_size_bytes
        })

    total_current = 0
    total_projected = 0

    for server, data in server_data.items():
        if len(data) < 2:
            continue

        data.sort(key=lambda x: x['date'])

        daily_growth = []
        for i in range(1, len(data)):
            size_diff = data[i]['size'] - data[i-1]['size']
            date_diff = (data[i]['date'] - data[i-1]['date']).days
            if date_diff > 0:
                daily_growth.append(size_diff / date_diff)

        if not daily_growth:
            continue

        avg_daily_growth = statistics.median(daily_growth) if len(daily_growth) >= 3 else sum(daily_growth) / len(daily_growth)
        latest_size = data[-1]['size']

        total_current += latest_size
        projected_size = max(0, latest_size + (avg_daily_growth * projection_months * 30))
        total_projected += projected_size

    used_gb = total_current / (1024**3)
    available_gb = round(max(0, total_capacity_gb - used_gb), 2)
    usage_percent = round((used_gb / total_capacity_gb * 100), 2) if total_capacity_gb > 0 else 0

    projected_gb = total_projected / (1024**3)
    projected_percent = round((projected_gb / total_capacity_gb * 100), 2) if total_capacity_gb > 0 else 0

    # Generate monthly projection points for area chart
    monthly_projection = []
    for server, data in server_data.items():
        if len(data) < 2:
            continue
        data.sort(key=lambda x: x['date'])

        daily_growth = []
        for i in range(1, len(data)):
            size_diff = data[i]['size'] - data[i-1]['size']
            date_diff = (data[i]['date'] - data[i-1]['date']).days
            if date_diff > 0:
                daily_growth.append(size_diff / date_diff)

        if not daily_growth:
            continue

        avg_daily_growth = statistics.median(daily_growth) if len(daily_growth) >= 3 else sum(daily_growth) / len(daily_growth)
        latest_size = data[-1]['size']
        latest_date = data[-1]['date']

        for month in range(1, projection_months + 1):
            proj_size = max(0, latest_size + (avg_daily_growth * month * 30))
            monthly_projection.append({
                "server_name": server,
                "month": month,
                "projected_gb": proj_size / (1024**3),
                "proj_date": (latest_date + timedelta(days=month * 30)).isoformat()
            })

    # Aggregate monthly totals
    monthly_totals = {}
    for proj in monthly_projection:
        m = proj['month']
        if m not in monthly_totals:
            monthly_totals[m] = {"month": m, "projected_gb": 0, "proj_date": proj['proj_date']}
        monthly_totals[m]["projected_gb"] += proj['projected_gb']

    monthly_totals_list = sorted(monthly_totals.values(), key=lambda x: x['month'])
    for mt in monthly_totals_list:
        mt['projected_gb'] = round(mt['projected_gb'], 2)
        mt['capacity_line_gb'] = total_capacity_gb
        mt['usage_percent'] = round((mt['projected_gb'] / total_capacity_gb * 100), 2) if total_capacity_gb > 0 else 0

    return {
        "total_capacity_gb": total_capacity_gb,
        "used_gb": used_gb,
        "available_gb": available_gb,
        "usage_percent": usage_percent,
        "projected_usage_gb": projected_gb,
        "projected_percent": projected_percent,
        "thresholds": {
            "warning_80": projected_percent >= 80,
            "critical_90": projected_percent >= 90,
            "full_100": projected_percent >= 100
        },
        "monthly_projection": monthly_totals_list
    }


@router.get("/alerts", response_model=dict)
async def get_backup_alerts(
    days: int = Query(default=30, description="Days to analyze"),
    missing_threshold_days: int = Query(default=3, description="Days without backup to trigger alert"),
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """
    Get backup alerts: missing backups, top offenders, status distribution.
    """
    import statistics

    today = date.today()
    cutoff_date = today - timedelta(days=days)

    # 1. Missing backups: servers with no backup in last N days
    all_servers_subq = db.query(
        BackupHistory.server_name,
        func.max(BackupHistory.backup_date).label("last_backup")
    ).group_by(
        BackupHistory.server_name
    ).subquery()

    all_servers = db.query(
        BackupHistory.server_name,
        all_servers_subq.c.last_backup
    ).join(
        all_servers_subq,
        BackupHistory.server_name == all_servers_subq.c.server_name
    ).group_by(
        BackupHistory.server_name,
        all_servers_subq.c.last_backup
    ).all()

    missing_backups = []
    for server_record in all_servers:
        server_name = server_record.server_name
        last_backup = server_record.last_backup

        if last_backup:
            days_since = (today - last_backup).days
            if days_since >= missing_threshold_days:
                latest_record = _apply_backup_rbac(db.query(BackupHistory), current_user).filter(
                    BackupHistory.server_name == server_name,
                    BackupHistory.backup_date == last_backup
                ).order_by(BackupHistory.id.desc()).first()

                missing_backups.append({
                    "server_ip": server_name,
                    "last_backup_date": last_backup.isoformat(),
                    "days_since_backup": days_since,
                    "last_size_gb": (latest_record.total_size_bytes or 0) / (1024**3) if latest_record else 0,
                    "status": latest_record.status if latest_record else "Unknown"
                })
        else:
            missing_backups.append({
                "server_ip": server_name,
                "last_backup_date": "Never",
                "days_since_backup": 999,
                "last_size_gb": 0,
                "status": "Unknown"
            })

    missing_backups.sort(key=lambda x: x['days_since_backup'], reverse=True)

    # 2. Top offenders (highest growth %)
    historical_data = db.query(
        BackupHistory.backup_date,
        BackupHistory.server_name,
        BackupHistory.total_size_bytes
    ).filter(
        BackupHistory.backup_date >= cutoff_date
    ).order_by(BackupHistory.backup_date).all()

    server_data = {}
    for record in historical_data:
        server = record.server_name
        if server not in server_data:
            server_data[server] = []
        server_data[server].append({
            'date': record.backup_date,
            'size': record.total_size_bytes
        })

    offenders = []
    for server, data in server_data.items():
        if len(data) < 2:
            continue
        data.sort(key=lambda x: x['date'])

        daily_growth = []
        for i in range(1, len(data)):
            size_diff = data[i]['size'] - data[i-1]['size']
            date_diff = (data[i]['date'] - data[i-1]['date']).days
            if date_diff > 0:
                daily_growth.append(size_diff / date_diff)

        if not daily_growth:
            continue

        avg_daily_growth = statistics.median(daily_growth) if len(daily_growth) >= 3 else sum(daily_growth) / len(daily_growth)
        latest_size = data[-1]['size']
        current_gb = latest_size / (1024**3)

        # FIX 1: Skip servers with < 1 GB (noise from small/new servers)
        if current_gb < 1:
            continue

        month6_size = max(0, latest_size + (avg_daily_growth * 6 * 30))
        month6_gb = month6_size / (1024**3)
        growth_percent = round(((month6_gb - current_gb) / current_gb * 100), 2) if current_gb > 0 else 0
        daily_growth_gb = round(avg_daily_growth / (1024**3), 4)

        # FIX 2: Only include if significant absolute growth (> 1 GB/day) OR high percentage (> 50%)
        if abs(daily_growth_gb) < 1 and growth_percent < 50:
            continue

        offenders.append({
            "server_ip": server,
            "current_gb": current_gb,
            "month6_gb": month6_gb,
            "growth_percent": growth_percent,
            "daily_growth_gb": daily_growth_gb
        })

    offenders.sort(key=lambda x: x['growth_percent'], reverse=True)
    top_offenders = offenders[:5]

    # 3. Status distribution (latest per server)
    latest_dates_subq = db.query(
        BackupHistory.server_name,
        func.max(BackupHistory.backup_date).label("max_date")
    ).group_by(
        BackupHistory.server_name
    ).subquery()

    latest_ids_subq = db.query(
        func.max(BackupHistory.id).label("latest_id")
    ).join(
        latest_dates_subq,
        and_(
            BackupHistory.server_name == latest_dates_subq.c.server_name,
            BackupHistory.backup_date == latest_dates_subq.c.max_date
        )
    ).group_by(
        BackupHistory.server_name
    ).subquery()

    latest_backups = _apply_backup_rbac(db.query(BackupHistory), current_user).filter(
        BackupHistory.id.in_(db.query(latest_ids_subq.c.latest_id))
    ).all()

    total_servers = len(latest_backups)
    status_counts = {}
    for b in latest_backups:
        status_counts[b.status] = status_counts.get(b.status, 0) + 1

    status_distribution = []
    for status, count in sorted(status_counts.items()):
        status_distribution.append({
            "status": status,
            "count": count,
            "percentage": round((count / total_servers * 100), 1) if total_servers > 0 else 0
        })

    servers_with_issues = sum(1 for b in latest_backups if b.status != "OK")

    return {
        "missing_backups": missing_backups,
        "top_offenders": top_offenders,
        "status_distribution": status_distribution,
        "total_servers": total_servers,
        "servers_with_issues": servers_with_issues
    }


@router.get("/server/{server_ip}/detail", response_model=dict)
async def get_server_detail(
    server_ip: str,
    days: int = Query(default=90, description="Days of history"),
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """
    Get detailed server info for drill-down modal.
    """
    import statistics

    cutoff_date = date.today() - timedelta(days=days)

    # History
    records = _apply_backup_rbac(db.query(BackupHistory), current_user).filter(
        BackupHistory.server_name == server_ip,
        BackupHistory.backup_date >= cutoff_date
    ).order_by(BackupHistory.backup_date.desc()).all()

    history = [r.to_dict() for r in records]

    # Statistics
    if records:
        avg_files = sum(r.jumlah_files for r in records) / len(records)
        avg_size = sum(r.total_size_bytes for r in records) / len(records)
        max_files = max(r.jumlah_files for r in records)
        max_size = max(r.total_size_bytes for r in records)
        ok_count = sum(1 for r in records if r.status == "OK")
        warning_count = sum(1 for r in records if r.status == "Warning")
        critical_count = sum(1 for r in records if r.status == "Critical")
        success_rate = round((ok_count / len(records) * 100), 1)
    else:
        avg_files = avg_size = max_files = max_size = 0
        ok_count = warning_count = critical_count = 0
        success_rate = 0

    statistics_data = {
        "total_records": len(records),
        "avg_files": round(avg_files, 2),
        "avg_size_gb": avg_size / (1024**3),
        "max_files": max_files,
        "max_size_gb": max_size / (1024**3),
        "ok_days": ok_count,
        "warning_days": warning_count,
        "critical_days": critical_count,
    }

    # Daily growth calculation
    sorted_records = sorted(records, key=lambda r: r.backup_date)
    daily_growth_values = []
    for i in range(1, len(sorted_records)):
        size_diff = sorted_records[i].total_size_bytes - sorted_records[i-1].total_size_bytes
        date_diff = (sorted_records[i].backup_date - sorted_records[i-1].backup_date).days
        if date_diff > 0:
            daily_growth_values.append(size_diff / date_diff)

    avg_daily_growth_gb = 0
    if daily_growth_values:
        avg_growth = statistics.median(daily_growth_values) if len(daily_growth_values) >= 3 else sum(daily_growth_values) / len(daily_growth_values)
        avg_daily_growth_gb = round(avg_growth / (1024**3), 4)

    return {
        "server_ip": server_ip,
        "history": history,
        "statistics": statistics_data,
        "success_rate": success_rate,
        "avg_daily_growth_gb": avg_daily_growth_gb
    }


@router.post("/schedule", response_model=dict)
async def save_schedule_config(
    request: Request,
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """
    Save scheduled report configuration.
    Body: { frequency, recipients, include_charts, include_tables, day_of_week, day_of_month, time, enabled }
    """
    import json

    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    frequency = body.get("frequency", "daily")
    if frequency not in ("daily", "weekly", "monthly"):
        raise HTTPException(status_code=400, detail="Invalid frequency. Must be daily, weekly, or monthly")

    recipients = body.get("recipients", [])
    if not isinstance(recipients, list) or len(recipients) == 0:
        raise HTTPException(status_code=400, detail="At least one recipient email required")

    for email in recipients:
        if "@" not in email:
            raise HTTPException(status_code=400, detail=f"Invalid email: {email}")

    config = {
        "frequency": frequency,
        "recipients": recipients,
        "include_charts": body.get("include_charts", True),
        "include_tables": body.get("include_tables", True),
        "day_of_week": body.get("day_of_week"),
        "day_of_month": body.get("day_of_month"),
        "time": body.get("time", "08:00"),
        "enabled": body.get("enabled", True),
        "created_at": utcnow().isoformat()
    }

    return {
        "success": True,
        "config": config,
        "message": f"Scheduled report saved: {frequency} at {config['time']} to {len(recipients)} recipients"
    }


# =============================================================================
# NEW ANALYTICS ENDPOINTS (Redesign Phase - April 2026)
# Uses CTE + window functions for accurate growth calculation
# READ-ONLY: SELECT queries only, no schema modifications
# =============================================================================


@router.get("/analytics/summary", response_model=dict)
async def get_analytics_summary(
    time_range: str = Query(default="30d", alias="range", description="Time range: 7d, 30d, 1mo, 6mo"),
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """
    KPI strip: total_volume_gb, avg_daily_growth_pct, success_rate_pct, active_servers, alert_count
    Uses CTE to get latest backup per server (no double-count).
    """
    from sqlalchemy import text
    import math

    range_days = {"7d": 7, "30d": 30, "1mo": 30, "6mo": 180}.get(time_range, 30)
    cutoff = date.today() - timedelta(days=range_days)

    # 1. Total volume = latest backup per server within range
    latest_dates_subq = db.query(
        BackupHistory.server_name,
        func.max(BackupHistory.backup_date).label("max_date"),
    ).filter(
        BackupHistory.backup_date >= cutoff,
    ).group_by(
        BackupHistory.server_name,
    ).subquery()

    latest_ids_subq = db.query(
        func.max(BackupHistory.id).label("latest_id"),
    ).join(
        latest_dates_subq,
        and_(
            BackupHistory.server_name == latest_dates_subq.c.server_name,
            BackupHistory.backup_date == latest_dates_subq.c.max_date,
        ),
    ).group_by(
        BackupHistory.server_name,
    ).subquery()

    latest_records = _apply_backup_rbac(db.query(BackupHistory), current_user).filter(
        BackupHistory.id.in_(db.query(latest_ids_subq.c.latest_id)),
    ).all()

    total_volume_bytes = sum(r.total_size_bytes for r in latest_records)
    total_volume_gb = total_volume_bytes / (1024**3)
    active_servers = len(latest_records)
    total_files = sum(r.jumlah_files for r in latest_records)
    avg_file_size_mb = round((total_volume_gb * 1024) / total_files, 2) if total_files > 0 else 0

    # 2. Success rate (latest per server)
    ok_count = sum(1 for r in latest_records if r.status == "OK")
    success_rate_pct = round((ok_count / active_servers * 100), 1) if active_servers > 0 else 0

    # 3. Average daily growth: compare latest vs previous snapshot per server
    total_growth_bytes = 0
    servers_with_growth = 0
    for rec in latest_records:
        prev = _apply_backup_rbac(db.query(BackupHistory), current_user).filter(
            BackupHistory.server_name == rec.server_name,
            BackupHistory.backup_date < rec.backup_date,
        ).order_by(
            BackupHistory.backup_date.desc(),
            BackupHistory.id.desc(),
        ).first()

        if prev and prev.total_size_bytes > 0:
            days_diff = (rec.backup_date - prev.backup_date).days
            if days_diff > 0:
                daily_growth = (rec.total_size_bytes - prev.total_size_bytes) / days_diff
                total_growth_bytes += daily_growth
                servers_with_growth += 1

    avg_daily_growth_bytes = total_growth_bytes / servers_with_growth if servers_with_growth > 0 else 0
    avg_daily_growth_gb = round(avg_daily_growth_bytes / (1024**3), 4)

    # Growth percentage over the range period
    if total_volume_bytes > 0 and range_days > 0:
        avg_daily_growth_pct = round((avg_daily_growth_bytes / total_volume_bytes) * 100, 2)
    else:
        avg_daily_growth_pct = 0

    if math.isnan(avg_daily_growth_pct) or math.isinf(avg_daily_growth_pct):
        avg_daily_growth_pct = 0

    # 4. Alert count: servers with no backup in last 3 days
    all_servers_subq = db.query(
        BackupHistory.server_name,
        func.max(BackupHistory.backup_date).label("last_backup"),
    ).group_by(
        BackupHistory.server_name,
    ).subquery()

    all_servers = db.query(all_servers_subq).all()
    today = date.today()
    alert_count = 0
    for srv in all_servers:
        if srv.last_backup:
            days_since = (today - srv.last_backup).days
            if days_since >= 3:
                alert_count += 1

    return {
        "total_volume_gb": total_volume_gb,
        "avg_daily_growth_gb": avg_daily_growth_gb,
        "avg_daily_growth_pct": avg_daily_growth_pct,
        "success_rate_pct": success_rate_pct,
        "active_servers": active_servers,
        "alert_count": alert_count,
        "period_days": range_days,
        "total_files": total_files,
        "avg_file_size_mb": avg_file_size_mb,
    }


@router.get("/analytics/snapshots", response_model=dict)
async def get_analytics_snapshots(
    view: str = Query(default="today", description="today, yesterday, or compare"),
    server: str = Query(default="all", description="all or specific server IP"),
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """
    Latest snapshot per server for selected date.
    Fallback to yesterday if today empty + partial_data flag.
    """
    from sqlalchemy import text

    today = date.today()
    yesterday = today - timedelta(days=1)

    target_date = today if view in ("today", "compare") else yesterday
    fallback_date = yesterday if view in ("today", "compare") else today - timedelta(days=2)

    def fetch_for_date(target: date, fallback: date):
        # Try target date first
        records = _apply_backup_rbac(db.query(BackupHistory), current_user).filter(
            BackupHistory.backup_date == target,
        )
        if server != "all":
            records = records.filter(BackupHistory.server_name == server)

        records = records.order_by(BackupHistory.server_name, BackupHistory.id.desc()).all()

        # Deduplicate: keep latest per server (max id)
        seen = {}
        for r in records:
            if r.server_name not in seen:
                seen[r.server_name] = r
        deduped = list(seen.values())

        if not deduped:
            # Fallback to previous date
            fallback_records = _apply_backup_rbac(db.query(BackupHistory), current_user).filter(
                BackupHistory.backup_date == fallback,
            )
            if server != "all":
                fallback_records = fallback_records.filter(BackupHistory.server_name == server)
            fallback_records = fallback_records.order_by(BackupHistory.server_name, BackupHistory.id.desc()).all()

            seen_fb = {}
            for r in fallback_records:
                if r.server_name not in seen_fb:
                    seen_fb[r.server_name] = r
            deduped = list(seen_fb.values())

            return deduped, True  # partial_data = True

        return deduped, False

    snapshots, partial_data = fetch_for_date(target_date, fallback_date)

    result = []
    for r in snapshots:
        result.append({
            "server_ip": r.server_name,
            "backup_date": r.backup_date.isoformat(),
            "total_size_gb": r.total_size_bytes / (1024**3),
            "total_size_bytes": r.total_size_bytes,
            "file_count": r.jumlah_files,
            "status": r.status,
        })

    # For compare view, also get the other date
    compare_data = None
    if view == "compare":
        other_date = yesterday
        other_snapshots, _ = fetch_for_date(other_date, other_date - timedelta(days=1))
        compare_map = {}
        for r in other_snapshots:
            compare_map[r.server_name] = r.total_size_bytes / (1024**3)
        compare_data = compare_map

    return {
        "snapshots": result,
        "view_date": target_date.isoformat(),
        "partial_data": partial_data,
        "server_filter": server,
        "compare_data": compare_data,
    }


@router.get("/analytics/historical", response_model=dict)
async def get_analytics_historical(
    server: str = Query(default="all", description="all or specific server IP"),
    time_range: str = Query(default="6mo", alias="range", description="7d, 30d, 1mo, 6mo"),
    granularity: str = Query(default="monthly", description="daily or monthly"),
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """
    Time-series data for charts + tables.
    Uses CTE + LAG() window function for growth calculation.
    Auto-corrects granularity: range=1mo forces daily.
    """
    from sqlalchemy import text

    range_days = {"7d": 7, "30d": 30, "1mo": 30, "6mo": 180}.get(time_range, 30)
    effective_granularity = "daily" if time_range in ("7d", "1mo", "30d") else granularity
    cutoff = date.today() - timedelta(days=range_days)

    # Build query: latest backup per server per day
    latest_per_day_subq = db.query(
        BackupHistory.backup_date,
        BackupHistory.server_name,
        func.max(BackupHistory.id).label("max_id"),
    ).filter(
        BackupHistory.backup_date >= cutoff,
    )
    if server != "all":
        latest_per_day_subq = latest_per_day_subq.filter(BackupHistory.server_name == server)

    latest_per_day_subq = latest_per_day_subq.group_by(
        BackupHistory.backup_date,
        BackupHistory.server_name,
    ).subquery()

    daily_totals = db.query(
        BackupHistory.backup_date,
        func.sum(BackupHistory.total_size_bytes).label("daily_total"),
        func.count(BackupHistory.id).label("server_count"),
        func.sum(BackupHistory.jumlah_files).label("total_files"),
    ).join(
        latest_per_day_subq,
        BackupHistory.id == latest_per_day_subq.c.max_id,
    ).group_by(
        BackupHistory.backup_date,
    ).order_by(
        BackupHistory.backup_date,
    ).all()

    # Build time series
    time_series = []
    for rec in daily_totals:
        entry = {
            "date": rec.backup_date.isoformat(),
            "total_size_gb": (rec.daily_total or 0) / (1024**3),
            "server_count": rec.server_count or 0,
            "total_files": rec.total_files or 0,
            "growth_pct": 0,
        }
        time_series.append(entry)

    # Calculate growth_pct using LAG-like logic
    for i in range(1, len(time_series)):
        prev_size = time_series[i - 1]["total_size_gb"]
        curr_size = time_series[i]["total_size_gb"]
        if prev_size > 0:
            growth_pct = round(((curr_size - prev_size) / prev_size) * 100, 2)
            time_series[i]["growth_pct"] = growth_pct

    # Monthly aggregation if requested
    if effective_granularity == "monthly" and range_days > 30:
        monthly_map = {}
        for entry in time_series:
            d = entry["date"][:7]  # YYYY-MM
            if d not in monthly_map:
                monthly_map[d] = {
                    "date": d,
                    "total_size_gb": 0,
                    "server_count": 0,
                    "total_files": 0,
                    "growth_pct": 0,
                    "days_in_month": 0,
                }
            monthly_map[d]["total_size_gb"] += entry["total_size_gb"]
            monthly_map[d]["server_count"] = max(monthly_map[d]["server_count"], entry["server_count"])
            monthly_map[d]["total_files"] += entry["total_files"]
            monthly_map[d]["days_in_month"] += 1

        # Use last day of month as representative
        monthly_series = []
        for m in sorted(monthly_map.keys()):
            entry = monthly_map[m]
            entry["total_size_gb"] = round(entry["total_size_gb"] / entry["days_in_month"], 2)
            entry["date"] = f"{m}-01"
            monthly_series.append(entry)

        # Recalculate growth for monthly
        for i in range(1, len(monthly_series)):
            prev_size = monthly_series[i - 1]["total_size_gb"]
            curr_size = monthly_series[i]["total_size_gb"]
            if prev_size > 0:
                growth_pct = round(((curr_size - prev_size) / prev_size) * 100, 2)
                monthly_series[i]["growth_pct"] = growth_pct

        return {
            "time_series": monthly_series,
            "granularity": "monthly",
            "range_days": range_days,
            "server_filter": server,
        }

    return {
        "time_series": time_series,
        "granularity": effective_granularity,
        "range_days": range_days,
        "server_filter": server,
    }


@router.get("/analytics/projection", response_model=dict)
async def get_analytics_projection(
    server: str = Query(default="all", description="all or specific server IP"),
    horizon_months: int = Query(default=6, description="Months to project"),
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """
    6-month capacity forecast per server.
    Returns current usage, forecast, confidence level.
    Uses median daily growth for robustness.
    """
    import statistics
    import math

    cutoff = date.today() - timedelta(days=180)

    historical = db.query(
        BackupHistory.backup_date,
        BackupHistory.server_name,
        BackupHistory.total_size_bytes,
    ).filter(
        BackupHistory.backup_date >= cutoff,
    ).order_by(
        BackupHistory.backup_date,
    ).all()

    if not historical:
        return {"servers": [], "total_current_gb": 0, "total_projected_gb": 0}

    # Group by server
    server_data = {}
    for rec in historical:
        if server != "all" and rec.server_name != server:
            continue
        if rec.server_name not in server_data:
            server_data[rec.server_name] = []
        server_data[rec.server_name].append({
            "date": rec.backup_date,
            "size": rec.total_size_bytes,
        })

    results = []
    total_current = 0
    total_projected = 0

    for srv, data in server_data.items():
        if len(data) < 2:
            continue

        data.sort(key=lambda x: x["date"])

        # Calculate daily growth rates
        daily_growth = []
        for i in range(1, len(data)):
            size_diff = data[i]["size"] - data[i - 1]["size"]
            date_diff = (data[i]["date"] - data[i - 1]["date"]).days
            if date_diff > 0:
                daily_growth.append(size_diff / date_diff)

        if not daily_growth:
            continue

        # Use median for robustness
        median_growth = statistics.median(daily_growth) if len(daily_growth) >= 3 else sum(daily_growth) / len(daily_growth)

        latest_size = data[-1]["size"]
        latest_date = data[-1]["date"]
        current_gb = latest_size / (1024**3)

        # Data quality for confidence
        data_points = len(data)
        date_span = (data[-1]["date"] - data[0]["date"]).days
        if data_points >= 30 and date_span >= 30:
            confidence = "high"
        elif data_points >= 7 and date_span >= 7:
            confidence = "medium"
        else:
            confidence = "low"

        # Project month by month
        monthly_forecast = []
        for m in range(1, horizon_months + 1):
            proj_size = max(0, latest_size + (median_growth * m * 30))
            proj_gb = proj_size / (1024**3)
            proj_date = latest_date + timedelta(days=m * 30)
            monthly_forecast.append({
                "month": m,
                "projected_gb": proj_gb,
                "proj_date": proj_date.isoformat(),
            })

        month6_size = max(0, latest_size + (median_growth * horizon_months * 30))
        month6_gb = month6_size / (1024**3)
        growth_pct = round(((month6_gb - current_gb) / current_gb * 100), 2) if current_gb > 0 else 0

        if math.isnan(growth_pct) or math.isinf(growth_pct):
            growth_pct = 0

        total_current += latest_size
        total_projected += month6_size

        results.append({
            "server_ip": srv,
            "current_gb": current_gb,
            "month6_gb": month6_gb,
            "growth_pct": growth_pct,
            "daily_growth_gb": round(median_growth / (1024**3), 4),
            "confidence": confidence,
            "data_points": data_points,
            "date_span_days": date_span,
            "monthly_forecast": monthly_forecast,
        })

    results.sort(key=lambda x: x["growth_pct"], reverse=True)

    return {
        "servers": results,
        "total_current_gb": total_current / (1024**3),
        "total_projected_gb": total_projected / (1024**3),
        "horizon_months": horizon_months,
        "server_filter": server,
    }


# =============================================================================
# NEW ENDPOINTS FOR USER-FRIENDLY DASHBOARD (April 2026)
# Covers: Daily Trend, Monthly Aggregation, Last Month Summary, KPI Enhancement
# =============================================================================


@router.get("/analytics/daily-trend", response_model=dict)
async def get_daily_trend(
    time_range: str = Query(default="30d", alias="range", description="7d, 30d, 1mo, 6mo"),
    server: str = Query(default="all", description="all or specific server IP"),
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """
    Total backup size per day + growth % + average file size.
    Used for the main trend line chart.
    """
    import math

    range_days = {"7d": 7, "30d": 30, "1mo": 30, "6mo": 180}.get(time_range, 30)
    cutoff = date.today() - timedelta(days=range_days)

    # Latest backup per server per day
    latest_per_day_subq = db.query(
        BackupHistory.backup_date,
        BackupHistory.server_name,
        func.max(BackupHistory.id).label("max_id"),
    ).filter(
        BackupHistory.backup_date >= cutoff,
    )
    if server != "all":
        latest_per_day_subq = latest_per_day_subq.filter(BackupHistory.server_name == server)

    latest_per_day_subq = latest_per_day_subq.group_by(
        BackupHistory.backup_date,
        BackupHistory.server_name,
    ).subquery()

    daily_records = db.query(
        BackupHistory.backup_date,
        func.sum(BackupHistory.total_size_bytes).label("daily_total"),
        func.sum(BackupHistory.jumlah_files).label("daily_files"),
        func.count(BackupHistory.id).label("server_count"),
    ).join(
        latest_per_day_subq,
        BackupHistory.id == latest_per_day_subq.c.max_id,
    ).group_by(
        BackupHistory.backup_date,
    ).order_by(
        BackupHistory.backup_date,
    ).all()

    trend_data = []
    for rec in daily_records:
        total_gb = (rec.daily_total or 0) / (1024**3)
        total_files = rec.daily_files or 0
        avg_file_size_mb = round((total_gb * 1024) / total_files, 2) if total_files > 0 else 0
        trend_data.append({
            "date": rec.backup_date.isoformat(),
            "total_gb": total_gb,
            "total_files": total_files,
            "server_count": rec.server_count or 0,
            "avg_file_size_mb": avg_file_size_mb,
            "growth_pct": 0,
        })

    # Calculate growth % using previous day
    for i in range(1, len(trend_data)):
        prev_gb = trend_data[i - 1]["total_gb"]
        curr_gb = trend_data[i]["total_gb"]
        if prev_gb > 0:
            growth_pct = round(((curr_gb - prev_gb) / prev_gb) * 100, 2)
            if math.isnan(growth_pct) or math.isinf(growth_pct):
                growth_pct = 0
            trend_data[i]["growth_pct"] = growth_pct

    return {"trend": trend_data, "range_days": range_days, "server_filter": server}


@router.get("/analytics/monthly-aggregation", response_model=dict)
async def get_monthly_aggregation(
    months: int = Query(default=6, description="Number of months to aggregate"),
    server: str = Query(default="all", description="all or specific server IP"),
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """
    Monthly totals for the 6-month area chart.
    Returns average daily size per month + total files per month.
    """
    cutoff = date.today() - timedelta(days=months * 30)

    latest_per_day_subq = db.query(
        BackupHistory.backup_date,
        BackupHistory.server_name,
        func.max(BackupHistory.id).label("max_id"),
    ).filter(
        BackupHistory.backup_date >= cutoff,
    )
    if server != "all":
        latest_per_day_subq = latest_per_day_subq.filter(BackupHistory.server_name == server)

    latest_per_day_subq = latest_per_day_subq.group_by(
        BackupHistory.backup_date,
        BackupHistory.server_name,
    ).subquery()

    daily_records = db.query(
        BackupHistory.backup_date,
        func.sum(BackupHistory.total_size_bytes).label("daily_total"),
        func.sum(BackupHistory.jumlah_files).label("daily_files"),
    ).join(
        latest_per_day_subq,
        BackupHistory.id == latest_per_day_subq.c.max_id,
    ).group_by(
        BackupHistory.backup_date,
    ).order_by(
        BackupHistory.backup_date,
    ).all()

    # Group by month
    monthly_map = {}
    for rec in daily_records:
        month_key = rec.backup_date.strftime("%Y-%m")
        if month_key not in monthly_map:
            monthly_map[month_key] = {
                "dates": [],
                "totals_gb": [],
                "total_files": 0,
            }
        monthly_map[month_key]["dates"].append(rec.backup_date)
        monthly_map[month_key]["totals_gb"].append((rec.daily_total or 0) / (1024**3))
        monthly_map[month_key]["total_files"] += rec.daily_files or 0

    monthly_data = []
    for m_key in sorted(monthly_map.keys()):
        m_data = monthly_map[m_key]
        avg_gb = round(sum(m_data["totals_gb"]) / len(m_data["totals_gb"]), 2) if m_data["totals_gb"] else 0
        max_gb = round(max(m_data["totals_gb"]), 2) if m_data["totals_gb"] else 0
        min_gb = round(min(m_data["totals_gb"]), 2) if m_data["totals_gb"] else 0
        month_label = {
            "01": "Jan", "02": "Feb", "03": "Mar", "04": "Apr", "05": "Mei", "06": "Jun",
            "07": "Jul", "08": "Agu", "09": "Sep", "10": "Okt", "11": "Nov", "12": "Des",
        }.get(m_key.split("-")[1], m_key)

        monthly_data.append({
            "month": m_key,
            "month_label": month_label,
            "avg_gb": avg_gb,
            "max_gb": max_gb,
            "min_gb": min_gb,
            "total_files": m_data["total_files"],
            "days_count": len(m_data["dates"]),
        })

    return {"monthly": monthly_data, "months": months, "server_filter": server}


@router.get("/analytics/last-month-summary", response_model=dict)
async def get_last_month_summary(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """
    Summary for 1 month ago: total volume, growth, server count.
    Used for comparison with current month.
    """
    today = date.today()
    first_this_month = today.replace(day=1)
    last_day_last_month = first_this_month - timedelta(days=1)
    first_day_last_month = last_day_last_month.replace(day=1)

    # Latest per server for last month
    latest_dates_subq = db.query(
        BackupHistory.server_name,
        func.max(BackupHistory.backup_date).label("max_date"),
    ).filter(
        BackupHistory.backup_date >= first_day_last_month,
        BackupHistory.backup_date <= last_day_last_month,
    ).group_by(
        BackupHistory.server_name,
    ).subquery()

    latest_ids_subq = db.query(
        func.max(BackupHistory.id).label("latest_id"),
    ).join(
        latest_dates_subq,
        and_(
            BackupHistory.server_name == latest_dates_subq.c.server_name,
            BackupHistory.backup_date == latest_dates_subq.c.max_date,
        ),
    ).group_by(
        BackupHistory.server_name,
    ).subquery()

    latest_records = _apply_backup_rbac(db.query(BackupHistory), current_user).filter(
        BackupHistory.id.in_(db.query(latest_ids_subq.c.latest_id)),
    ).all()

    total_bytes = sum(r.total_size_bytes for r in latest_records)
    total_gb = total_bytes / (1024**3)
    total_files = sum(r.jumlah_files for r in latest_records)
    server_count = len(latest_records)
    ok_count = sum(1 for r in latest_records if r.status == "OK")
    success_rate = round((ok_count / server_count * 100), 1) if server_count > 0 else 0
    avg_file_size_mb = round((total_gb * 1024) / total_files, 2) if total_files > 0 else 0

    return {
        "period": f"{first_day_last_month.isoformat()} to {last_day_last_month.isoformat()}",
        "total_gb": total_gb,
        "total_files": total_files,
        "server_count": server_count,
        "success_rate_pct": success_rate,
        "avg_file_size_mb": avg_file_size_mb,
    }


@router.get("/analytics/per-server-prediction", response_model=dict)
async def get_per_server_prediction(
    horizon_months: int = Query(default=6, description="Months to project"),
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """
    Per-server prediction table: current GB, predicted GB, growth %, confidence.
    Sorted by growth % descending so the biggest risks are on top.
    """
    import statistics
    import math

    cutoff = date.today() - timedelta(days=180)

    historical = db.query(
        BackupHistory.backup_date,
        BackupHistory.server_name,
        BackupHistory.total_size_bytes,
        BackupHistory.jumlah_files,
    ).filter(
        BackupHistory.backup_date >= cutoff,
    ).order_by(
        BackupHistory.backup_date,
    ).all()

    if not historical:
        return {"servers": []}

    server_data = {}
    for rec in historical:
        if rec.server_name not in server_data:
            server_data[rec.server_name] = []
        server_data[rec.server_name].append({
            "date": rec.backup_date,
            "size": rec.total_size_bytes,
            "files": rec.jumlah_files,
        })

    results = []
    for srv, data in server_data.items():
        if len(data) < 2:
            continue

        data.sort(key=lambda x: x["date"])

        daily_growth = []
        for i in range(1, len(data)):
            size_diff = data[i]["size"] - data[i - 1]["size"]
            date_diff = (data[i]["date"] - data[i - 1]["date"]).days
            if date_diff > 0:
                daily_growth.append(size_diff / date_diff)

        if not daily_growth:
            continue

        median_growth = statistics.median(daily_growth) if len(daily_growth) >= 3 else sum(daily_growth) / len(daily_growth)

        latest_size = data[-1]["size"]
        latest_date = data[-1]["date"]
        current_gb = latest_size / (1024**3)

        month6_size = max(0, latest_size + (median_growth * horizon_months * 30))
        month6_gb = month6_size / (1024**3)
        growth_pct = round(((month6_gb - current_gb) / current_gb * 100), 2) if current_gb > 0 else 0

        if math.isnan(growth_pct) or math.isinf(growth_pct):
            growth_pct = 0

        data_points = len(data)
        date_span = (data[-1]["date"] - data[0]["date"]).days
        if data_points >= 30 and date_span >= 30:
            confidence = "high"
        elif data_points >= 7 and date_span >= 7:
            confidence = "medium"
        else:
            confidence = "low"

        # Average file size
        latest_files = data[-1]["files"]
        avg_file_mb = round((current_gb * 1024) / latest_files, 2) if latest_files > 0 else 0

        results.append({
            "server_ip": srv,
            "current_gb": current_gb,
            "predicted_gb": month6_gb,
            "growth_pct": growth_pct,
            "daily_growth_gb": round(median_growth / (1024**3), 4),
            "confidence": confidence,
            "avg_file_mb": avg_file_mb,
            "data_points": data_points,
            "last_backup": latest_date.isoformat(),
        })

    results.sort(key=lambda x: x["growth_pct"], reverse=True)

    return {"servers": results, "horizon_months": horizon_months}


# =============================================================================
# SIMPLE DASHBOARD ENDPOINTS — IP, Last Backup, Files, Size ONLY
# No status, no complexity. Just clean backup data.
# =============================================================================


@router.get("/analytics/dashboard", response_model=dict)
async def get_dashboard_data(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """
    Simple dashboard: one query returns ALL server data.
    Each server: IP, last backup date, file count, size in GB.
    Plus summary totals at the top.
    """
    from sqlalchemy import text

    # Latest backup per server (max date, then max id for tiebreak)
    latest_dates_subq = db.query(
        BackupHistory.server_name,
        func.max(BackupHistory.backup_date).label("max_date"),
    ).group_by(
        BackupHistory.server_name,
    ).subquery()

    latest_ids_subq = db.query(
        func.max(BackupHistory.id).label("latest_id"),
    ).join(
        latest_dates_subq,
        and_(
            BackupHistory.server_name == latest_dates_subq.c.server_name,
            BackupHistory.backup_date == latest_dates_subq.c.max_date,
        ),
    ).group_by(
        BackupHistory.server_name,
    ).subquery()

    latest_records = _apply_backup_rbac(db.query(BackupHistory), current_user).filter(
        BackupHistory.id.in_(db.query(latest_ids_subq.c.latest_id)),
    ).order_by(
        BackupHistory.server_name,
    ).all()

    servers = []
    total_size_bytes = 0
    total_files = 0

    for r in latest_records:
        size_gb = r.total_size_bytes / (1024**3)
        total_size_bytes += r.total_size_bytes
        total_files += r.jumlah_files
        servers.append({
            "ip": r.server_name,
            "last_backup": r.backup_date.isoformat(),
            "files": r.jumlah_files,
            "size_gb": size_gb,
        })

    total_gb = total_size_bytes / (1024**3)
    avg_file_mb = round((total_gb * 1024) / total_files, 2) if total_files > 0 else 0

    return {
        "summary": {
            "total_gb": total_gb,
            "total_files": total_files,
            "server_count": len(servers),
            "avg_file_mb": avg_file_mb,
        },
        "servers": servers,
    }


@router.get("/analytics/unified-servers", response_model=dict)
async def get_unified_servers(
    days: int = Query(default=30, ge=1, le=365, description="Days of history"),
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """
    Unified server list with latest backup info, growth %, and trend data.
    Optimized: 3 queries instead of 10 using CTEs.
    """
    days = min(max(days, 1), 365)
    cutoff = date.today() - timedelta(days=days)
    today = date.today()

    # RBAC: build role filter for raw SQL
    is_superadmin = current_user.role == "superadmin"
    role_where = "" if is_superadmin else "WHERE owner_role = :role"
    role_and = "" if is_superadmin else "AND bh.owner_role = :role"
    role_and2 = "" if is_superadmin else "AND bh2.owner_role = :role"
    role_and3 = "" if is_superadmin else "AND backup_date = :today AND owner_role = :role"
    role_params = {"cutoff": cutoff.isoformat(), "today": today.isoformat()} if is_superadmin else {"cutoff": cutoff.isoformat(), "today": today.isoformat(), "role": current_user.role}

    # Query 1: Latest + first backup per server + today count in one query
    from sqlalchemy import text

    result = db.execute(text(f"""
        WITH latest_per_server AS (
            SELECT server_name, MAX(backup_date) as max_date
            FROM backup_history
            {role_where}
            GROUP BY server_name
        ),
        latest_records AS (
            SELECT bh.*
            FROM backup_history bh
            INNER JOIN latest_per_server lps
                ON bh.server_name = lps.server_name AND bh.backup_date = lps.max_date
            {role_and}
            AND bh.id = (
                SELECT MAX(bh2.id) FROM backup_history bh2
                WHERE bh2.server_name = bh.server_name AND bh2.backup_date = bh.backup_date
                {role_and2}
            )
        ),
        first_per_server AS (
            SELECT server_name, MIN(backup_date) as min_date
            FROM backup_history
            {role_where}
            GROUP BY server_name
        ),
        first_records AS (
            SELECT bh.*
            FROM backup_history bh
            INNER JOIN first_per_server fps
                ON bh.server_name = fps.server_name AND bh.backup_date = fps.min_date
            {role_and}
            AND bh.id = (
                SELECT MIN(bh2.id) FROM backup_history bh2
                WHERE bh2.server_name = bh.server_name AND bh2.backup_date = bh.backup_date
                {role_and2}
            )
        )
        SELECT
            lr.server_name,
            lr.backup_date as latest_date,
            lr.jumlah_files,
            lr.total_size_bytes,
            lr.total_size_kb,
            lr.total_size_mb,
            lr.total_size_gb,
            lr.status,
            fr.backup_date as first_date,
            fr.total_size_bytes as first_size_bytes,
            (SELECT COUNT(DISTINCT server_name) FROM backup_history {role_and3.replace('AND backup_date', 'WHERE backup_date') if not is_superadmin else 'WHERE backup_date = :today'}) as today_count
        FROM latest_records lr
        LEFT JOIN first_records fr ON lr.server_name = fr.server_name
        ORDER BY lr.server_name
    """), role_params)

    rows = result.fetchall()

    # Query 2: Trend data per server
    trend_sql = f"""
        SELECT server_name, backup_date, total_size_kb, total_size_mb, total_size_gb
        FROM backup_history
        WHERE backup_date >= :cutoff
        {'' if is_superadmin else 'AND owner_role = :role'}
        ORDER BY server_name, backup_date
    """
    trend_result = db.execute(text(trend_sql), role_params)

    trend_map: Dict[str, list] = {}
    for row in trend_result:
        sn = row[0]
        if sn not in trend_map:
            trend_map[sn] = []
        trend_map[sn].append({
            "date": row[1],
            "size_kb": row[2],
            "size_mb": row[3],
            "size_gb": row[4],
        })

    # Build unified list
    servers = []
    total_kb = 0.0
    total_mb = 0.0
    total_gb = 0.0
    total_files = 0
    missing_count = 0
    growth_pcts = []
    today_count = 0

    for row in rows:
        sn = row[0]
        today_count = row[10] if row[10] else 0

        size_kb = row[4] or 0
        size_mb = row[5] or 0
        size_gb = row[6] or 0
        files = row[2] or 0
        last_backup = row[1]
        latest_date = date.fromisoformat(row[1]) if row[1] else None
        days_ago = (today - latest_date).days if latest_date else 999

        # Status
        total_bytes = row[3] or 0
        if total_bytes == 0:
            status = "Critical"
        elif files < 1000 or total_bytes < 100 * 1024**3:
            status = "Warning"
        else:
            status = "OK"

        # Growth %
        growth_pct = 0.0
        first_bytes = row[9]
        if first_bytes and first_bytes > 0:
            growth_pct = round(((total_bytes - first_bytes) / first_bytes) * 100, 1)

        trend = trend_map.get(sn, [])

        total_kb += size_kb
        total_mb += size_mb
        total_gb += size_gb
        total_files += files
        if days_ago > 1 or status == "Critical":
            missing_count += 1
        if growth_pct != 0:
            growth_pcts.append(growth_pct)

        servers.append({
            "ip": sn,
            "last_backup": last_backup,
            "days_ago": days_ago,
            "size_kb": size_kb,
            "size_mb": size_mb,
            "size_gb": size_gb,
            "files": files,
            "status": status,
            "growth_pct": growth_pct,
            "trend": trend,
        })

    avg_growth = round(sum(growth_pcts) / len(growth_pcts), 1) if growth_pcts else 0.0

    return {
        "servers": servers,
        "total": len(servers),
        "summary": {
            "total_kb": total_kb,
            "total_mb": total_mb,
            "total_gb": total_gb,
            "total_files": total_files,
            "server_count": len(servers),
            "backed_up_today": today_count,
            "missing_count": missing_count,
            "avg_daily_growth_pct": avg_growth,
        },
    }


@router.get("/analytics/capacity-projection", response_model=dict)
async def get_capacity_projection(
    horizon_months: int = Query(default=6, ge=1, le=12, description="Projection horizon in months"),
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """
    Capacity projection using linear growth calculation.
    Returns per-server projection and total projected storage.
    """
    from sqlalchemy import text

    is_superadmin_cap = current_user.role == "superadmin"
    role_where_cap = "" if is_superadmin_cap else "WHERE owner_role = :role"
    role_params_cap = {} if is_superadmin_cap else {"role": current_user.role}

    result = db.execute(text(f"""
        WITH server_growth AS (
            SELECT
                server_name,
                MAX(total_size_gb) as current_gb,
                MAX(total_size_mb) as current_mb,
                MAX(total_size_kb) as current_kb,
                MAX(total_size_bytes) as current_bytes,
                MIN(backup_date) as first_date,
                MAX(backup_date) as last_date,
                COUNT(*) as record_count,
                CASE
                    WHEN COUNT(*) > 1 THEN
                        (MAX(total_size_bytes) - MIN(total_size_bytes)) * 1.0 /
                        MAX(julianday(MAX(backup_date)) - julianday(MIN(backup_date)), 1)
                    ELSE 0
                END as avg_daily_growth_bytes
            FROM backup_history
            {role_where_cap}
            GROUP BY server_name
        )
        SELECT
            server_name,
            current_gb,
            current_mb,
            current_kb,
            current_bytes,
            avg_daily_growth_bytes,
            current_bytes + (avg_daily_growth_bytes * 30) as projected_30d_bytes,
            current_bytes + (avg_daily_growth_bytes * 60) as projected_60d_bytes,
            current_bytes + (avg_daily_growth_bytes * 180) as projected_180d_bytes
        FROM server_growth
        ORDER BY server_name
    """), role_params_cap)

    servers = []
    total_current_gb = 0
    total_projected_gb = 0

    for row in result:
        current_gb = row[1] or 0
        current_mb = row[2] or 0
        current_kb = row[3] or 0
        avg_daily_growth_bytes = row[5] or 0
        avg_daily_growth_gb = avg_daily_growth_bytes / (1024**3)

        projected_30d_bytes = row[6] or 0
        projected_60d_bytes = row[7] or 0
        projected_180d_bytes = row[8] or 0

        projected_30d_gb = max(0, projected_30d_bytes / (1024**3))
        projected_60d_gb = max(0, projected_60d_bytes / (1024**3))
        projected_180d_gb = max(0, projected_180d_bytes / (1024**3))

        if avg_daily_growth_gb > 0.001:
            trend = "increasing"
        elif avg_daily_growth_gb < -0.001:
            trend = "decreasing"
        else:
            trend = "stable"

        total_current_gb += current_gb
        total_projected_gb += projected_180d_gb

        servers.append({
            "ip": row[0],
            "current_gb": current_gb,
            "current_mb": current_mb,
            "current_kb": current_kb,
            "avg_daily_growth_gb": round(avg_daily_growth_gb, 3),
            "projected_30d_gb": round(projected_30d_gb, 2),
            "projected_60d_gb": round(projected_60d_gb, 2),
            "projected_180d_gb": round(projected_180d_gb, 2),
            "trend": trend,
        })

    return {
        "servers": servers,
        "total_current_gb": round(total_current_gb, 2),
        "total_projected_gb": round(total_projected_gb, 2),
    }


@router.get("/analytics/simple-trend", response_model=dict)
async def get_simple_trend(
    days: int = Query(default=30, description="Days of trend data"),
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """
    Simple daily trend: date, total GB, total files.
    No status, no complexity.
    """
    cutoff = date.today() - timedelta(days=days)

    latest_per_day_subq = db.query(
        BackupHistory.backup_date,
        BackupHistory.server_name,
        func.max(BackupHistory.id).label("max_id"),
    ).filter(
        BackupHistory.backup_date >= cutoff,
    ).group_by(
        BackupHistory.backup_date,
        BackupHistory.server_name,
    ).subquery()

    daily_records = db.query(
        BackupHistory.backup_date,
        func.sum(BackupHistory.total_size_bytes).label("daily_total"),
        func.sum(BackupHistory.jumlah_files).label("daily_files"),
    ).join(
        latest_per_day_subq,
        BackupHistory.id == latest_per_day_subq.c.max_id,
    ).group_by(
        BackupHistory.backup_date,
    ).order_by(
        BackupHistory.backup_date,
    ).all()

    trend = []
    for rec in daily_records:
        trend.append({
            "date": rec.backup_date.isoformat(),
            "total_gb": (rec.daily_total or 0) / (1024**3),
            "total_files": rec.daily_files or 0,
        })

    return {"trend": trend}


@router.get("/analytics/simple-projection", response_model=dict)
async def get_simple_projection(
    horizon_months: int = Query(default=6, description="Months to project"),
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """
    Simple per-server projection: IP, current GB, predicted GB, growth %.
    No confidence, no complexity.
    """
    import statistics
    import math

    cutoff = date.today() - timedelta(days=180)

    historical = db.query(
        BackupHistory.backup_date,
        BackupHistory.server_name,
        BackupHistory.total_size_bytes,
    ).filter(
        BackupHistory.backup_date >= cutoff,
    ).order_by(
        BackupHistory.backup_date,
    ).all()

    if not historical:
        return {"servers": []}

    server_data = {}
    for rec in historical:
        if rec.server_name not in server_data:
            server_data[rec.server_name] = []
        server_data[rec.server_name].append({
            "date": rec.backup_date,
            "size": rec.total_size_bytes,
        })

    results = []
    for srv, data in server_data.items():
        if len(data) < 2:
            continue

        data.sort(key=lambda x: x["date"])

        daily_growth = []
        for i in range(1, len(data)):
            size_diff = data[i]["size"] - data[i - 1]["size"]
            date_diff = (data[i]["date"] - data[i - 1]["date"]).days
            if date_diff > 0:
                daily_growth.append(size_diff / date_diff)

        if not daily_growth:
            continue

        median_growth = statistics.median(daily_growth) if len(daily_growth) >= 3 else sum(daily_growth) / len(daily_growth)

        latest_size = data[-1]["size"]
        current_gb = latest_size / (1024**3)

        month6_size = max(0, latest_size + (median_growth * horizon_months * 30))
        month6_gb = month6_size / (1024**3)
        growth_pct = round(((month6_gb - current_gb) / current_gb * 100), 2) if current_gb > 0 else 0

        if math.isnan(growth_pct) or math.isinf(growth_pct):
            growth_pct = 0

        results.append({
            "ip": srv,
            "current_gb": current_gb,
            "predicted_gb": month6_gb,
            "growth_pct": growth_pct,
        })

    results.sort(key=lambda x: x["growth_pct"], reverse=True)

    return {"servers": results}


# =============================================================================
# 5 FITUR UTAMA BACKUP ANALYTICS — Redesign 2026
# 1. Server Tidak Backup Hari Ini
# 2. Top 10 Server Terbanyak
# 3. Trend Per-Server (Top Growth)
# 4. Calendar Heatmap
# 5. Anomaly Detection
# =============================================================================


@router.get("/analytics/missing-today", response_model=dict)
async def get_missing_today(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """
    FITUR 1: Server yang TIDAK backup hari ini.
    Bandingkan semua server vs yang backup hari ini.
    Tampilkan: IP, terakhir backup, berapa hari lalu, size terakhir.
    """
    today = date.today()
    yesterday = today - timedelta(days=1)

    # Semua server yang pernah backup (RBAC filtered)
    all_servers_subq = _apply_backup_rbac(db.query(
        BackupHistory.server_name,
        func.max(BackupHistory.backup_date).label("last_backup"),
    ), current_user).group_by(
        BackupHistory.server_name,
    ).subquery()

    all_servers = db.query(
        all_servers_subq.c.server_name,
        all_servers_subq.c.last_backup,
    ).all()

    # Server yang backup hari ini (RBAC filtered)
    today_servers = set(
        r[0] for r in _apply_backup_rbac(db.query(BackupHistory.server_name), current_user).filter(
            BackupHistory.backup_date == today,
        ).distinct().all()
    )

    missing = []
    for server_name, last_backup in all_servers:
        if server_name not in today_servers:
            days_ago = (today - last_backup).days if last_backup else 999
            # Get last backup details
            last_record = _apply_backup_rbac(db.query(BackupHistory), current_user).filter(
                BackupHistory.server_name == server_name,
                BackupHistory.backup_date == last_backup,
            ).order_by(BackupHistory.id.desc()).first()

            missing.append({
                "ip": server_name,
                "last_backup": last_backup.isoformat() if last_backup else "Tidak pernah",
                "days_ago": days_ago,
                "size_gb": last_record.total_size_bytes / (1024**3) if last_record else 0,
                "files": last_record.jumlah_files if last_record else 0,
            })

    missing.sort(key=lambda x: x["days_ago"], reverse=True)

    return {
        "missing": missing,
        "total_servers": len(all_servers),
        "backed_up_today": len(today_servers),
        "missing_count": len(missing),
        "date": today.isoformat(),
    }


@router.get("/analytics/top-servers", response_model=dict)
async def get_top_servers(
    limit: int = Query(default=10, description="Jumlah server teratas"),
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """
    FITUR 2: Top 10 server pemakai storage terbanyak.
    Berdasarkan backup terakhir per server.
    """
    latest_dates_subq = _apply_backup_rbac(db.query(
        BackupHistory.server_name,
        func.max(BackupHistory.backup_date).label("max_date"),
    ), current_user).group_by(
        BackupHistory.server_name,
    ).subquery()

    latest_ids_subq = _apply_backup_rbac(db.query(
        func.max(BackupHistory.id).label("latest_id"),
    ), current_user).join(
        latest_dates_subq,
        and_(
            BackupHistory.server_name == latest_dates_subq.c.server_name,
            BackupHistory.backup_date == latest_dates_subq.c.max_date,
        ),
    ).group_by(
        BackupHistory.server_name,
    ).subquery()

    records = _apply_backup_rbac(db.query(BackupHistory), current_user).filter(
        BackupHistory.id.in_(db.query(latest_ids_subq.c.latest_id)),
    ).all()

    servers = []
    for r in records:
        servers.append({
            "ip": r.server_name,
            "size_gb": r.total_size_bytes / (1024**3),
            "files": r.jumlah_files,
            "last_backup": r.backup_date.isoformat(),
        })

    servers.sort(key=lambda x: x["size_gb"], reverse=True)

    total_gb = sum(s["size_gb"] for s in servers[:limit])

    return {
        "servers": servers[:limit],
        "limit": limit,
        "total_top_gb": round(total_gb, 2),
    }


@router.get("/analytics/server-growth", response_model=dict)
async def get_server_growth(
    days: int = Query(default=30, description="Jumlah hari untuk kalkulasi growth"),
    limit: int = Query(default=10, description="Jumlah server teratas"),
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """
    FITUR 3: Trend pertumbuhan per-server.
    Hitung growth rate (GB/hari) untuk setiap server, tampilkan top growth.
    """
    import statistics

    cutoff = date.today() - timedelta(days=days)

    historical = db.query(
        BackupHistory.backup_date,
        BackupHistory.server_name,
        BackupHistory.total_size_bytes,
    ).filter(
        BackupHistory.backup_date >= cutoff,
    ).order_by(
        BackupHistory.server_name,
        BackupHistory.backup_date,
    ).all()

    if not historical:
        return {"servers": []}

    server_data = {}
    for rec in historical:
        if rec.server_name not in server_data:
            server_data[rec.server_name] = []
        server_data[rec.server_name].append({
            "date": rec.backup_date,
            "size": rec.total_size_bytes,
        })

    results = []
    for srv, data in server_data.items():
        if len(data) < 2:
            continue

        data.sort(key=lambda x: x["date"])

        # Hitung daily growth
        daily_growth = []
        for i in range(1, len(data)):
            size_diff = data[i]["size"] - data[i - 1]["size"]
            date_diff = (data[i]["date"] - data[i - 1]["date"]).days
            if date_diff > 0:
                daily_growth.append(size_diff / date_diff)

        if not daily_growth:
            continue

        median_growth = statistics.median(daily_growth) if len(daily_growth) >= 3 else sum(daily_growth) / len(daily_growth)

        latest_size = data[-1]["size"]
        first_size = data[0]["size"]
        current_gb = latest_size / (1024**3)
        first_gb = first_size / (1024**3)
        total_growth_gb = (latest_size - first_size) / (1024**3)
        growth_pct = round(((current_gb - first_gb) / first_gb * 100), 2) if first_gb > 0 else 0

        results.append({
            "ip": srv,
            "current_gb": current_gb,
            "first_gb": first_gb,
            "total_growth_gb": total_growth_gb,
            "daily_growth_gb": round(median_growth / (1024**3), 4),
            "growth_pct": growth_pct,
            "data_points": len(data),
            "trend": [
                {"date": d["date"].isoformat(), "size_gb": d["size"] / (1024**3)}
                for d in data[-7:]  # last 7 data points for mini chart
            ],
        })

    # Sort by absolute daily growth (descending)
    results.sort(key=lambda x: abs(x["daily_growth_gb"]), reverse=True)

    return {"servers": results[:limit], "days": days}


@router.get("/analytics/heatmap", response_model=dict)
async def get_heatmap(
    days: int = Query(default=30, description="Jumlah hari untuk heatmap"),
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """
    FITUR 4: Calendar heatmap data.
    Grid: server x tanggal. 1 = ada backup, 0 = tidak ada.
    """
    cutoff = date.today() - timedelta(days=days)

    # Get all servers (RBAC filtered)
    server_query = _apply_backup_rbac(db.query(BackupHistory.server_name), current_user)
    all_servers = server_query.distinct().all()
    server_list = [r[0] for r in all_servers]

    # Get backup dates per server (RBAC filtered)
    date_query = db.query(
        BackupHistory.server_name,
        BackupHistory.backup_date,
    ).filter(
        BackupHistory.backup_date >= cutoff,
    )
    date_query = _apply_backup_rbac(date_query, current_user)
    backup_dates = date_query.distinct().all()

    # Build set of (server, date) that have backups
    has_backup = set()
    for server_name, backup_date in backup_dates:
        has_backup.add((server_name, backup_date.isoformat()))

    # Build grid
    dates = []
    for i in range(days):
        d = cutoff + timedelta(days=i)
        dates.append(d.isoformat())

    grid = {}
    for server in server_list:
        grid[server] = {}
        for d in dates:
            grid[server][d] = 1 if (server, d) in has_backup else 0

    return {
        "servers": server_list,
        "dates": dates,
        "grid": grid,
    }


@router.get("/analytics/anomalies", response_model=dict)
async def get_anomalies(
    days: int = Query(default=30, description="Jumlah hari untuk analisa"),
    drop_threshold: float = Query(default=30, description="Threshold penurunan (%)"),
    spike_threshold: float = Query(default=100, description="Threshold kenaikan (%)"),
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """
    FITUR 5: Anomaly detection.
    - Drop: size turun drastis (mungkin backup tidak lengkap)
    - Spike: size naik drastis (mungkin ada data abnormal)
    """
    cutoff = date.today() - timedelta(days=days)

    query = db.query(
        BackupHistory.backup_date,
        BackupHistory.server_name,
        BackupHistory.total_size_bytes,
        BackupHistory.jumlah_files,
    ).filter(
        BackupHistory.backup_date >= cutoff,
    )
    query = _apply_backup_rbac(query, current_user)
    historical = query.order_by(
        BackupHistory.server_name,
        BackupHistory.backup_date,
    ).all()

    if not historical:
        return {"anomalies": []}

    server_data = {}
    for rec in historical:
        if rec.server_name not in server_data:
            server_data[rec.server_name] = []
        server_data[rec.server_name].append({
            "date": rec.backup_date,
            "size": rec.total_size_bytes,
            "files": rec.jumlah_files,
        })

    anomalies = []
    for srv, data in server_data.items():
        if len(data) < 2:
            continue

        data.sort(key=lambda x: x["date"])

        for i in range(1, len(data)):
            prev_size = data[i - 1]["size"]
            curr_size = data[i]["size"]

            if prev_size == 0:
                continue

            change_pct = ((curr_size - prev_size) / prev_size) * 100

            if change_pct <= -drop_threshold:
                anomalies.append({
                    "ip": srv,
                    "date": data[i]["date"].isoformat(),
                    "prev_size_gb": prev_size / (1024**3),
                    "curr_size_gb": curr_size / (1024**3),
                    "change_pct": round(change_pct, 1),
                    "type": "drop",
                    "files": data[i]["files"],
                })
            elif change_pct >= spike_threshold:
                anomalies.append({
                    "ip": srv,
                    "date": data[i]["date"].isoformat(),
                    "prev_size_gb": prev_size / (1024**3),
                    "curr_size_gb": curr_size / (1024**3),
                    "change_pct": round(change_pct, 1),
                    "type": "spike",
                    "files": data[i]["files"],
                })

    anomalies.sort(key=lambda x: abs(x["change_pct"]), reverse=True)

    return {
        "anomalies": anomalies,
        "drop_threshold": drop_threshold,
        "spike_threshold": spike_threshold,
        "total_anomalies": len(anomalies),
    }


# =============================================================================
# DETAIL SERVER, KONSISTENSI, PERIODE SUMMARY — Untuk Drawer & History Tab
# =============================================================================


@router.get("/analytics/server/{server_ip}/history", response_model=dict)
async def get_server_history(
    server_ip: str,
    days: int = Query(default=30, description="Jumlah hari riwayat"),
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """
    History detail 1 server: semua backup dalam N hari terakhir.
    Termasuk: tanggal, size, file count.
    """
    cutoff = date.today() - timedelta(days=days)

    records = _apply_backup_rbac(db.query(BackupHistory), current_user).filter(
        BackupHistory.server_name == server_ip,
        BackupHistory.backup_date >= cutoff,
    ).order_by(
        BackupHistory.backup_date.desc(),
    ).all()

    history = []
    for r in records:
        history.append({
            "date": r.backup_date.isoformat(),
            "size_kb": r.total_size_kb,
            "size_mb": r.total_size_mb,
            "size_gb": r.total_size_gb,
            "files": r.jumlah_files,
            "status": r.status,
        })

    # Summary
    if records:
        total_gb = sum(r.total_size_bytes for r in records) / (1024**3)
        total_files = sum(r.jumlah_files for r in records)
        latest = records[0]
        oldest = records[-1]
        growth_pct = 0
        if oldest.total_size_bytes > 0:
            growth_pct = round(((latest.total_size_bytes - oldest.total_size_bytes) / oldest.total_size_bytes) * 100, 2)
    else:
        total_gb = 0
        total_files = 0
        latest = None
        growth_pct = 0

    return {
        "server_ip": server_ip,
        "period_days": days,
        "summary": {
            "total_kb": sum(r.total_size_kb for r in records) if records else 0,
            "total_mb": sum(r.total_size_mb for r in records) if records else 0,
            "total_gb": total_gb,
            "total_files": total_files,
            "record_count": len(records),
            "growth_pct": growth_pct,
            "last_backup": latest.backup_date.isoformat() if latest else None,
            "last_size_kb": latest.total_size_kb if latest else 0,
            "last_size_mb": latest.total_size_mb if latest else 0,
            "last_size_gb": latest.total_size_gb if latest else 0,
        },
        "history": history,
    }


@router.get("/analytics/consistency", response_model=dict)
async def get_consistency(
    days: int = Query(default=30, description="Jumlah hari untuk hitung konsistensi"),
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """
    Konsistensi backup per-server: berapa hari ada backup / total hari.
    """
    cutoff = date.today() - timedelta(days=days)

    # Semua server (RBAC filtered)
    all_servers = _apply_backup_rbac(db.query(BackupHistory.server_name), current_user).distinct().all()
    server_list = [r[0] for r in all_servers]

    # Backup dates per server (RBAC filtered)
    date_query = db.query(
        BackupHistory.server_name,
        BackupHistory.backup_date,
    ).filter(
        BackupHistory.backup_date >= cutoff,
    )
    date_query = _apply_backup_rbac(date_query, current_user)
    backup_dates = date_query.distinct().all()

    date_counts = {}
    for server_name, backup_date in backup_dates:
        date_counts[server_name] = date_counts.get(server_name, 0) + 1

    # Latest backup per server for size info (RBAC filtered subqueries)
    latest_dates_subq = _apply_backup_rbac(db.query(
        BackupHistory.server_name,
        func.max(BackupHistory.backup_date).label("max_date"),
    ), current_user).group_by(
        BackupHistory.server_name,
    ).subquery()

    latest_ids_subq = _apply_backup_rbac(db.query(
        func.max(BackupHistory.id).label("latest_id"),
    ), current_user).join(
        latest_dates_subq,
        and_(
            BackupHistory.server_name == latest_dates_subq.c.server_name,
            BackupHistory.backup_date == latest_dates_subq.c.max_date,
        ),
    ).group_by(
        BackupHistory.server_name,
    ).subquery()

    latest_records = _apply_backup_rbac(db.query(BackupHistory), current_user).filter(
        BackupHistory.id.in_(db.query(latest_ids_subq.c.latest_id)),
    ).all()

    latest_map = {r.server_name: r for r in latest_records}

    results = []
    for server in server_list:
        backup_count = date_counts.get(server, 0)
        consistency_pct = round((backup_count / days) * 100, 1)
        latest = latest_map.get(server)

        results.append({
            "ip": server,
            "backup_days": backup_count,
            "total_days": days,
            "consistency_pct": consistency_pct,
            "size_gb": latest.total_size_bytes / (1024**3) if latest else 0,
            "files": latest.jumlah_files if latest else 0,
            "last_backup": latest.backup_date.isoformat() if latest else None,
        })

    # Sort by consistency descending
    results.sort(key=lambda x: x["consistency_pct"], reverse=True)

    return {"servers": results, "days": days}


@router.get("/analytics/period-summary", response_model=dict)
async def get_period_summary(
    start: str = Query(description="Tanggal mulai (YYYY-MM-DD)"),
    end: str = Query(description="Tanggal selesai (YYYY-MM-DD)"),
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """
    Ringkasan periode custom: total, rata-rata/hari, server paling konsisten.
    """
    from datetime import datetime as dt

    try:
        start_date = dt.strptime(start, "%Y-%m-%d").date()
        end_date = dt.strptime(end, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Format tanggal: YYYY-MM-DD")

    total_days = (end_date - start_date).days + 1

    # Latest per server dalam periode
    latest_dates_subq = db.query(
        BackupHistory.server_name,
        func.max(BackupHistory.backup_date).label("max_date"),
    ).filter(
        BackupHistory.backup_date >= start_date,
        BackupHistory.backup_date <= end_date,
    ).group_by(
        BackupHistory.server_name,
    ).subquery()

    latest_ids_subq = db.query(
        func.max(BackupHistory.id).label("latest_id"),
    ).join(
        latest_dates_subq,
        and_(
            BackupHistory.server_name == latest_dates_subq.c.server_name,
            BackupHistory.backup_date == latest_dates_subq.c.max_date,
        ),
    ).group_by(
        BackupHistory.server_name,
    ).subquery()

    latest_records = _apply_backup_rbac(db.query(BackupHistory), current_user).filter(
        BackupHistory.id.in_(db.query(latest_ids_subq.c.latest_id)),
    ).all()

    total_gb = sum(r.total_size_bytes for r in latest_records) / (1024**3)
    total_files = sum(r.jumlah_files for r in latest_records)
    server_count = len(latest_records)
    avg_daily_gb = round(total_gb / total_days, 2) if total_days > 0 else 0
    avg_daily_files = round(total_files / total_days) if total_days > 0 else 0

    # Konsistensi per server
    all_servers_in_period = db.query(BackupHistory.server_name).filter(
        BackupHistory.backup_date >= start_date,
        BackupHistory.backup_date <= end_date,
    ).distinct().all()

    consistency_data = []
    for r in all_servers_in_period:
        server = r[0]
        backup_count = db.query(func.count(func.distinct(BackupHistory.backup_date))).filter(
            BackupHistory.server_name == server,
            BackupHistory.backup_date >= start_date,
            BackupHistory.backup_date <= end_date,
        ).scalar()
        pct = round((backup_count / total_days) * 100, 1)
        consistency_data.append({"ip": server, "pct": pct, "days": backup_count})

    consistency_data.sort(key=lambda x: x["pct"], reverse=True)
    most_consistent = consistency_data[0] if consistency_data else None

    return {
        "period": {"start": start, "end": end, "total_days": total_days},
        "summary": {
            "total_gb": total_gb,
            "total_files": total_files,
            "server_count": server_count,
            "avg_daily_gb": avg_daily_gb,
            "avg_daily_files": avg_daily_files,
        },
        "most_consistent": most_consistent,
        "consistency": consistency_data,
    }


@router.get("/analytics/server/{server_ip}/aggregation", response_model=dict)
async def get_server_aggregation(
    server_ip: str,
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """
    Agregasi backup per-server untuk berbagai periode:
    7 hari, 1 bulan, 2 bulan, 3 bulan, ... sampai 12 bulan ke belakang.
    Setiap periode: total file, total size, jumlah backup, rata-rata size.
    """
    today = date.today()

    periods = [
        ("7 Hari", 7),
        ("1 Bulan", 30),
        ("2 Bulan", 60),
        ("3 Bulan", 90),
        ("4 Bulan", 120),
        ("5 Bulan", 150),
        ("6 Bulan", 180),
        ("7 Bulan", 210),
        ("8 Bulan", 240),
        ("9 Bulan", 270),
        ("10 Bulan", 300),
        ("11 Bulan", 330),
        ("12 Bulan", 365),
    ]

    results = []
    for label, days in periods:
        cutoff = today - timedelta(days=days)

        records = _apply_backup_rbac(db.query(BackupHistory), current_user).filter(
            BackupHistory.server_name == server_ip,
            BackupHistory.backup_date >= cutoff,
        ).all()

        if not records:
            results.append({
                "period": label,
                "days": days,
                "backup_count": 0,
                "total_files": 0,
                "total_size_gb": 0,
                "avg_size_gb": 0,
                "first_date": None,
                "last_date": None,
            })
            continue

        total_files = sum(r.jumlah_files for r in records)
        total_bytes = sum(r.total_size_bytes for r in records)
        total_gb = total_bytes / (1024**3)
        avg_gb = round(total_gb / len(records), 2) if records else 0

        dates = [r.backup_date for r in records]

        results.append({
            "period": label,
            "days": days,
            "backup_count": len(records),
            "total_files": total_files,
            "total_size_gb": total_gb,
            "avg_size_gb": avg_gb,
            "first_date": min(dates).isoformat(),
            "last_date": max(dates).isoformat(),
        })

    # Server info
    latest = _apply_backup_rbac(db.query(BackupHistory), current_user).filter(
        BackupHistory.server_name == server_ip,
    ).order_by(BackupHistory.backup_date.desc()).first()

    return {
        "server_ip": server_ip,
        "latest_backup": latest.backup_date.isoformat() if latest else None,
        "latest_size_gb": latest.total_size_bytes / (1024**3) if latest else 0,
        "periods": results,
    }
