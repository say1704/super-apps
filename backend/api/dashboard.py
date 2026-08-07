"""Dashboard Stats Endpoints"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, case, desc
from datetime import datetime, timedelta, date
from typing import List
import re

from database import get_db
from models import (
    User, LogMaintenance, IRMCCheck, MonthlyServerCheck, VulnerabilityReport,
    IncidentReport, AssetCommon, FormUpload, RiskAssessmentForm, QualityObjective,
    ProjectTask, WorkLog, BackupHistory, Notification, DocumentLibrary, ConfigurationItem,
    LogCompression, PenilaianRisiko
)
from api.dependencies import get_current_user, get_worklog_filter, get_task_filter, get_document_filter
from api.dependencies import log_activity
from api.schemas import (
    DashboardStatsResponse, EnhancedDashboardResponse, ActivityItemResponse,
    InfrastructureStatusResponse, TodayFocusResponse, TaskItemResponse, PriorityMatrixResponse
)
from utils.cache import cache
from utils.timezone import to_iso, utcnow

router = APIRouter(tags=["Dashboard"])


def _is_admin(user: User) -> bool:
    return user.role == "superadmin"


def _parse_time_hours(time_str: str) -> float:
    """Parse time string like '2h', '30m', '1.5' into hours."""
    if not time_str:
        return 0.0
    s = time_str.lower().strip()
    try:
        if 'h' in s:
            match = re.search(r'([\d.]+)', s)
            return float(match.group(1)) if match else 0.0
        elif 'm' in s:
            match = re.search(r'([\d.]+)', s)
            return float(match.group(1)) / 60 if match else 0.0
        else:
            return float(s)
    except (ValueError, AttributeError, TypeError):
        return 0.0


@router.get("/dashboard/stats", response_model=DashboardStatsResponse)
async def get_dashboard_stats(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    cached = cache.get(f"dashboard_stats_{current_user.id}")
    if cached:
        return cached

    admin = _is_admin(current_user)
    wl_filter = get_worklog_filter(current_user)
    task_filter = get_task_filter(current_user)

    asset_q = db.query(
        func.count(AssetCommon.id).label('total'),
        func.count(case((AssetCommon.category == 'users', AssetCommon.id))).label('users'),
        func.count(case((AssetCommon.category == 'hardware', AssetCommon.id))).label('hardware'),
        func.count(case((AssetCommon.category == 'software', AssetCommon.id))).label('software'),
        func.count(case((AssetCommon.category == 'virtual-infrastructure', AssetCommon.id))).label('virtual_infra'),
        func.count(case((AssetCommon.category == 'information', AssetCommon.id))).label('information'),
    )
    if not admin:
        asset_q = asset_q.filter(AssetCommon.owner_role == current_user.role)
    asset_row = asset_q.one()

    incident_q = db.query(
        func.count(IncidentReport.id).label('total'),
        func.count(case((IncidentReport.status == 'Open', IncidentReport.id))).label('open'),
    )
    if not admin:
        incident_q = incident_q.filter(IncidentReport.owner_role == current_user.role)
    incident_row = incident_q.one()

    vuln_q = db.query(
        func.count(VulnerabilityReport.id).label('total'),
        func.sum(VulnerabilityReport.high_count).label('high_sum'),
    )
    if not admin:
        vuln_q = vuln_q.filter(VulnerabilityReport.owner_role == current_user.role)
    vuln_row = vuln_q.one()

    # User-specific counts
    wl_query = db.query(WorkLog)
    if wl_filter is not None:
        wl_query = wl_query.filter(wl_filter)

    task_query = db.query(ProjectTask)
    if task_filter is not None:
        task_query = task_query.filter(task_filter)

    log_maintenance_q = db.query(func.count(LogMaintenance.id))
    if not admin:
        log_maintenance_q = log_maintenance_q.filter(LogMaintenance.owner_role == current_user.role)
    log_maintenance_count = log_maintenance_q.scalar() or 0

    quality_q = db.query(func.count(QualityObjective.id))
    if not admin:
        quality_q = quality_q.filter(QualityObjective.owner_role == current_user.role)
    quality_objectives_count = quality_q.scalar() or 0

    form_q = db.query(func.count(FormUpload.id))
    if not admin:
        form_q = form_q.filter(FormUpload.owner_role == current_user.role)
    form_uploads_count = form_q.scalar() or 0

    risk_q = db.query(func.count(PenilaianRisiko.id))
    if not admin:
        risk_q = risk_q.filter(PenilaianRisiko.owner_role == current_user.role)
    risk_assessments_count = risk_q.scalar() or 0

    compression_q = db.query(func.count(LogCompression.id))
    if not admin:
        compression_q = compression_q.filter(LogCompression.owner_role == current_user.role)
    log_compression_count = compression_q.scalar() or 0

    # Role-based subquery for tables without owner_role column
    role_user_ids = db.query(User.id).filter(User.role == current_user.role)

    irmc_q = db.query(func.count(IRMCCheck.id))
    if not admin:
        irmc_q = irmc_q.filter(IRMCCheck.created_by.in_(role_user_ids))
    irmc_checks_count = irmc_q.scalar() or 0

    monthly_q = db.query(func.count(MonthlyServerCheck.id))
    if not admin:
        monthly_q = monthly_q.filter(MonthlyServerCheck.created_by.in_(role_user_ids))
    monthly_checks_count = monthly_q.scalar() or 0

    # DocumentLibrary uses existing helper from dependencies.py
    doc_filter = get_document_filter(current_user, db)
    docs_q = db.query(func.count(DocumentLibrary.id))
    if doc_filter is not None:
        docs_q = docs_q.filter(doc_filter)
    documents_count = docs_q.scalar() or 0

    ci_q = db.query(func.count(ConfigurationItem.id))
    if not admin:
        ci_q = ci_q.filter(ConfigurationItem.created_by.in_(role_user_ids))
    configuration_items_count = ci_q.scalar() or 0

    result = {
        "total_users": db.query(func.count(User.id)).scalar() or 0 if admin else 1,
        "log_maintenance_count": log_maintenance_count,
        "irmc_checks_count": irmc_checks_count,
        "monthly_checks_count": monthly_checks_count,
        "vulnerability_reports_count": vuln_row.total or 0,
        "incident_reports_count": incident_row.total or 0,
        "documents_count": documents_count,
        "assets_total": asset_row.total or 0,
        "assets_users": asset_row.users or 0,
        "assets_hardware_count": asset_row.hardware or 0,
        "assets_software_count": asset_row.software or 0,
        "assets_vm_count": asset_row.virtual_infra or 0,
        "assets_information": asset_row.information or 0,
        "configuration_items_count": configuration_items_count,
        "form_uploads_count": form_uploads_count,
        "risk_assessments_count": risk_assessments_count,
        "quality_objectives_count": quality_objectives_count,
        "log_compression_count": log_compression_count,
        "open_incidents": incident_row.open or 0,
        "high_vulnerabilities": vuln_row.high_sum or 0,
        "active_tasks": task_query.filter(ProjectTask.status != "done").count() if not admin else db.query(func.count(ProjectTask.id)).filter(ProjectTask.status != "done").scalar() or 0,
    }
    cache.set(f"dashboard_stats_{current_user.id}", result, ttl=60)
    return result


@router.get("/dashboard/enhanced", response_model=EnhancedDashboardResponse)
async def get_enhanced_dashboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cached = cache.get(f"enhanced_dashboard_{current_user.id}")
    if cached:
        return cached
    today = utcnow().date()
    week_start = today - timedelta(days=today.weekday())
    admin = _is_admin(current_user)
    wl_filter = get_worklog_filter(current_user)
    task_filter = get_task_filter(current_user)

    # Task queries - filter by user for non-admin
    task_q = db.query(func.count(ProjectTask.id))
    if task_filter is not None:
        task_q = task_q.filter(task_filter)
    today_tasks_count = task_q.filter(func.date(ProjectTask.due_date) == today).scalar() or 0
    overdue_tasks_count = db.query(func.count(ProjectTask.id)).filter(
        ProjectTask.due_date < today, ProjectTask.status != "done"
    )
    if task_filter is not None:
        overdue_tasks_count = overdue_tasks_count.filter(task_filter)
    overdue_tasks_count = overdue_tasks_count.scalar() or 0

    # Worklog queries - filter by user for non-admin
    wl_q = db.query(func.count(WorkLog.id))
    if wl_filter is not None:
        wl_q = wl_q.filter(wl_filter)
    week_worklogs_count = wl_q.filter(WorkLog.date >= week_start, WorkLog.date <= today).scalar() or 0

    wl_cat_q = db.query(WorkLog.category, func.count(WorkLog.id).label('count'))
    if wl_filter is not None:
        wl_cat_q = wl_cat_q.filter(wl_filter)
    week_time_by_category = wl_cat_q.filter(
        WorkLog.date >= week_start, WorkLog.date <= today
    ).group_by(WorkLog.category).all()

    total_hours_week = 0
    wl_time_q = db.query(WorkLog.actual_time)
    if wl_filter is not None:
        wl_time_q = wl_time_q.filter(wl_filter)
    week_worklogs_time = wl_time_q.filter(WorkLog.date >= week_start, WorkLog.date <= today).all()
    for row in week_worklogs_time:
        if row[0]:
            total_hours_week += _parse_time_hours(row[0])

    # Task status stats - filter by user for non-admin
    task_status_q = db.query(ProjectTask.status, func.count(ProjectTask.id).label('count'))
    if task_filter is not None:
        task_status_q = task_status_q.filter(task_filter)
    task_status_stats = task_status_q.group_by(ProjectTask.status).all()
    task_status_map = {row[0]: row[1] for row in task_status_stats}
    total_tasks = sum(task_status_map.values())
    todo_tasks = task_status_map.get("todo", 0)
    doing_tasks = task_status_map.get("doing", 0)
    done_tasks = task_status_map.get("done", 0)
    completion_rate = round((done_tasks / total_tasks * 100) if total_tasks > 0 else 0, 1)

    # Task priority stats - filter by user for non-admin
    task_priority_q = db.query(ProjectTask.priority, func.count(ProjectTask.id).label('count'))
    if task_filter is not None:
        task_priority_q = task_priority_q.filter(task_filter)
    task_priority_stats = task_priority_q.filter(ProjectTask.status != "done").group_by(ProjectTask.priority).all()
    task_priority_map = {row[0]: row[1] for row in task_priority_stats}
    urgent_tasks = task_priority_map.get("high", 0)
    normal_tasks = task_priority_map.get("medium", 0)
    low_tasks = task_priority_map.get("low", 0)

    seven_days_ago = today - timedelta(days=7)

    # Activity queries - filter by user for non-admin
    wl_act_q = db.query(func.date(WorkLog.date).label('log_date'), func.count(WorkLog.id).label('count'))
    if wl_filter is not None:
        wl_act_q = wl_act_q.filter(wl_filter)
    worklog_activity = wl_act_q.filter(WorkLog.date >= seven_days_ago).group_by(func.date(WorkLog.date)).all()

    incident_act_q = db.query(
        func.date(IncidentReport.created_at).label('log_date'), func.count(IncidentReport.id).label('count')
    )
    if not admin:
        incident_act_q = incident_act_q.filter(IncidentReport.owner_role == current_user.role)
    incident_activity = incident_act_q.filter(
        IncidentReport.created_at >= seven_days_ago
    ).group_by(func.date(IncidentReport.created_at)).all()

    vuln_act_q = db.query(
        func.date(VulnerabilityReport.created_at).label('log_date'), func.count(VulnerabilityReport.id).label('count')
    )
    if not admin:
        vuln_act_q = vuln_act_q.filter(VulnerabilityReport.owner_role == current_user.role)
    vuln_activity = vuln_act_q.filter(
        VulnerabilityReport.created_at >= seven_days_ago
    ).group_by(func.date(VulnerabilityReport.created_at)).all()

    task_act_q = db.query(func.date(ProjectTask.created_at).label('log_date'), func.count(ProjectTask.id).label('count'))
    if task_filter is not None:
        task_act_q = task_act_q.filter(task_filter)
    task_activity = task_act_q.filter(ProjectTask.created_at >= seven_days_ago).group_by(func.date(ProjectTask.created_at)).all()

    lm_activity_q = db.query(
        func.date(LogMaintenance.created_at).label('log_date'), func.count(LogMaintenance.id).label('count')
    )
    if not admin:
        lm_activity_q = lm_activity_q.filter(LogMaintenance.owner_role == current_user.role)
    lm_activity = lm_activity_q.filter(LogMaintenance.created_at >= seven_days_ago
    ).group_by(func.date(LogMaintenance.created_at)).all()

    activity_map = {}
    for row in worklog_activity:
        d = str(row.log_date)
        activity_map[d] = activity_map.get(d, 0) + row.count
    for row in incident_activity:
        d = str(row.log_date)
        activity_map[d] = activity_map.get(d, 0) + row.count
    for row in vuln_activity:
        d = str(row.log_date)
        activity_map[d] = activity_map.get(d, 0) + row.count
    for row in task_activity:
        d = str(row.log_date)
        activity_map[d] = activity_map.get(d, 0) + row.count
    for row in lm_activity:
        d = str(row.log_date)
        activity_map[d] = activity_map.get(d, 0) + row.count

    recent_activity = [{"date": d, "count": c} for d, c in sorted(activity_map.items())]

    today_wl_q = db.query(WorkLog.actual_time)
    if wl_filter is not None:
        today_wl_q = today_wl_q.filter(wl_filter)
    today_worklogs_time = today_wl_q.filter(WorkLog.date == today).all()
    today_hours = 0
    for row in today_worklogs_time:
        if row[0]:
            today_hours += _parse_time_hours(row[0])

    overdue_tasks_q = db.query(ProjectTask).filter(
        ProjectTask.due_date < today, ProjectTask.status != "done"
    )
    if task_filter is not None:
        overdue_tasks_q = overdue_tasks_q.filter(task_filter)
    overdue_tasks = overdue_tasks_q.order_by(ProjectTask.due_date).limit(10).all()

    result = {
        "today": {"tasks": today_tasks_count, "worklogs": len(today_worklogs_time), "hours": round(today_hours, 1)},
        "week": {
            "worklogs": week_worklogs_count,
            "hours": round(total_hours_week, 1),
            "by_category": [{"name": c.category, "count": c.count} for c in week_time_by_category]
        },
        "tasks": {"total": total_tasks, "todo": todo_tasks, "doing": doing_tasks, "done": done_tasks, "completion_rate": completion_rate},
        "priority": {"urgent": urgent_tasks, "normal": normal_tasks, "low": low_tasks},
        "overdue": overdue_tasks_count,
        "overdue_tasks": [serialize_task(t) for t in overdue_tasks],
        "recent_activity": recent_activity
    }
    cache.set(f"enhanced_dashboard_{current_user.id}", result, ttl=60)
    return result


def serialize_task(task):
    return {
        "id": task.id,
        "title": task.title,
        "description": task.description,
        "status": task.status,
        "assignee": task.assignee,
        "priority": task.priority,
        "due_date": to_iso(task.due_date) if task.due_date else None,
        "tags": task.tags,
        "created_at": to_iso(task.created_at) if task.created_at else None,
        "completed_at": to_iso(task.completed_at) if task.completed_at else None,
    }


@router.get("/tasks/today-focus", response_model=TodayFocusResponse)
async def get_today_focus(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    today = utcnow().date()
    task_filter = get_task_filter(current_user)
    base_q = db.query(ProjectTask)
    if task_filter is not None:
        base_q = base_q.filter(task_filter)
    high_priority = base_q.filter(
        ProjectTask.priority == "high", ProjectTask.status != "done"
    ).order_by(ProjectTask.due_date).limit(3).all()
    due_today = base_q.filter(
        func.date(ProjectTask.due_date) == today, ProjectTask.status != "done"
    ).all()
    in_progress = base_q.filter(ProjectTask.status == "doing").all()
    return {
        "top_priorities": [serialize_task(t) for t in high_priority],
        "due_today": [serialize_task(t) for t in due_today],
        "in_progress": [serialize_task(t) for t in in_progress],
    }


@router.get("/tasks/priority-matrix", response_model=PriorityMatrixResponse)
async def get_priority_matrix(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    task_filter = get_task_filter(current_user)
    base_q = db.query(ProjectTask)
    if task_filter is not None:
        base_q = base_q.filter(task_filter)
    urgent = base_q.filter(
        ProjectTask.priority == "high", ProjectTask.status != "done"
    ).order_by(ProjectTask.due_date).all()
    normal = base_q.filter(
        ProjectTask.priority == "medium", ProjectTask.status != "done"
    ).order_by(ProjectTask.due_date).all()
    low = base_q.filter(
        ProjectTask.priority == "low", ProjectTask.status != "done"
    ).order_by(ProjectTask.due_date).all()
    backlog_q = db.query(ProjectTask).filter(ProjectTask.status == "done")
    if task_filter is not None:
        backlog_q = backlog_q.filter(task_filter)
    backlog = backlog_q.order_by(ProjectTask.completed_at.desc()).limit(10).all()
    return {
        "urgent": [serialize_task(t) for t in urgent],
        "normal": [serialize_task(t) for t in normal],
        "low": [serialize_task(t) for t in low],
        "backlog": [serialize_task(t) for t in backlog],
    }


MODULE_LABELS = {
    "worklog": "Worklog",
    "incident": "Incident",
    "vulnerability": "Vulnerability",
    "task": "Task",
    "log_maintenance": "L&M",
}

MODULE_ICONS = {
    "worklog": "📅",
    "incident": "⚠️",
    "vulnerability": "🔒",
    "task": "✅",
    "log_maintenance": "📝",
}

MODULE_COLORS = {
    "worklog": "text-green-600 dark:text-green-400",
    "incident": "text-red-600 dark:text-red-400",
    "vulnerability": "text-orange-600 dark:text-orange-400",
    "task": "text-blue-600 dark:text-blue-400",
    "log_maintenance": "text-purple-600 dark:text-purple-400",
}

ACTION_VERBS = {
    "worklog": "logged work",
    "incident": "reported incident",
    "vulnerability": "added vulnerability",
    "task_created": "created task",
    "task_updated": "updated task",
    "log_maintenance": "added L&M record",
}


@router.get("/dashboard/recent-activity", response_model=List[ActivityItemResponse])
async def get_recent_activity(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cached = cache.get(f"recent_activity_{current_user.id}")
    if cached:
        return cached

    wl_filter = get_worklog_filter(current_user)
    task_filter = get_task_filter(current_user)
    admin = _is_admin(current_user)

    activities = []

    worklogs_q = db.query(WorkLog, User.full_name).join(
        User, WorkLog.user_id == User.id, isouter=True
    )
    if wl_filter is not None:
        worklogs_q = worklogs_q.filter(wl_filter)
    worklogs = worklogs_q.order_by(desc(WorkLog.date)).limit(8).all()
    for wl, user_name in worklogs:
        target = wl.task.title if wl.task else "general"
        activities.append({
            "id": f"wl_{wl.id}",
            "module": "worklog",
            "icon": MODULE_ICONS["worklog"],
            "color": MODULE_COLORS["worklog"],
            "user": user_name or "Unknown",
            "action": "logged work on",
            "target": target,
            "link": "/modules/worklog",
            "created_at": to_iso(wl.date) if wl.date else None,
        })

    incidents_q = db.query(IncidentReport, User.full_name).join(
        User, IncidentReport.created_by == User.id, isouter=True
    )
    if not admin:
        incidents_q = incidents_q.filter(IncidentReport.created_by == current_user.id)
    incidents = incidents_q.order_by(desc(IncidentReport.created_at)).limit(4).all()
    for inc, user_name in incidents:
        activities.append({
            "id": f"inc_{inc.id}",
            "module": "incident",
            "icon": MODULE_ICONS["incident"],
            "color": MODULE_COLORS["incident"],
            "user": user_name or "Unknown",
            "action": f"reported incident on {inc.server_name}",
            "target": inc.incident_type or "Unknown",
            "link": f"/modules/incident?id={inc.id}",
            "created_at": to_iso(inc.created_at) if inc.created_at else None,
        })

    vulns_q = db.query(VulnerabilityReport, User.full_name).join(
        User, VulnerabilityReport.created_by == User.id, isouter=True
    )
    if not admin:
        vulns_q = vulns_q.filter(VulnerabilityReport.created_by == current_user.id)
    vulns = vulns_q.order_by(desc(VulnerabilityReport.created_at)).limit(4).all()
    for v, user_name in vulns:
        activities.append({
            "id": f"vuln_{v.id}",
            "module": "vulnerability",
            "icon": MODULE_ICONS["vulnerability"],
            "color": MODULE_COLORS["vulnerability"],
            "user": user_name or "Unknown",
            "action": f"scan on {v.server_ip}",
            "target": v.tools or "Unknown",
            "link": f"/modules/vulnerability?id={v.id}",
            "created_at": to_iso(v.created_at) if v.created_at else None,
        })

    tasks_q = db.query(ProjectTask, User.full_name).join(
        User, ProjectTask.created_by == User.id, isouter=True
    )
    if task_filter is not None:
        tasks_q = tasks_q.filter(task_filter)
    tasks = tasks_q.order_by(desc(ProjectTask.created_at)).limit(4).all()
    for t, user_name in tasks:
        activities.append({
            "id": f"task_{t.id}",
            "module": "task",
            "icon": MODULE_ICONS["task"],
            "color": MODULE_COLORS["task"],
            "user": user_name or "Unknown",
            "action": "created task",
            "target": t.title,
            "link": f"/modules/tasks?id={t.id}",
            "created_at": to_iso(t.created_at) if t.created_at else None,
        })

    lms_q = db.query(LogMaintenance, User.full_name).join(
        User, LogMaintenance.created_by == User.id, isouter=True
    )
    if not admin:
        lms_q = lms_q.filter(LogMaintenance.owner_role == current_user.role)
    lms = lms_q.order_by(desc(LogMaintenance.created_at)).limit(4).all()
    for lm, user_name in lms:
        activities.append({
            "id": f"lm_{lm.id}",
            "module": "log_maintenance",
            "icon": MODULE_ICONS["log_maintenance"],
            "color": MODULE_COLORS["log_maintenance"],
            "user": user_name or "Unknown",
            "action": f"L&M on {lm.server}",
            "target": lm.notes[:50] if lm.notes else f"Record #{lm.id}",
            "link": "/modules/log-maintenance",
            "created_at": to_iso(lm.created_at) if lm.created_at else None,
        })

    activities.sort(
        key=lambda x: x["created_at"] or "",
        reverse=True,
    )

    result = activities[:20]
    cache.set(f"recent_activity_{current_user.id}", result, ttl=30)
    return result


@router.get("/dashboard/infrastructure-status", response_model=InfrastructureStatusResponse)
async def get_infrastructure_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cached = cache.get(f"infrastructure_status_{current_user.id}")
    if cached:
        return cached

    today = utcnow().date()

    latest_backup_subq = db.query(
        BackupHistory.server_name,
        func.max(BackupHistory.backup_date).label("latest_date"),
    ).group_by(BackupHistory.server_name).subquery()

    latest_backups = db.query(BackupHistory).join(
        latest_backup_subq,
        (BackupHistory.server_name == latest_backup_subq.c.server_name) &
        (BackupHistory.backup_date == latest_backup_subq.c.latest_date),
    ).all()

    ok_count = sum(1 for b in latest_backups if b.status == "OK")
    warning_count = sum(1 for b in latest_backups if b.status == "Warning")
    critical_count = sum(1 for b in latest_backups if b.status == "Critical")
    total_servers = len(latest_backups)

    last_backup_date = None
    if latest_backups:
        last_backup_date = max(b.backup_date for b in latest_backups)

    days_since = None
    if last_backup_date:
        days_since = (today - last_backup_date).days

    result = {
        "last_backup_date": str(last_backup_date) if last_backup_date else None,
        "days_since_backup": days_since,
        "total_servers": total_servers,
        "ok_count": ok_count,
        "warning_count": warning_count,
        "critical_count": critical_count,
    }
    cache.set(f"infrastructure_status_{current_user.id}", result, ttl=60)
    return result
