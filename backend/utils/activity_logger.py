"""
Activity Logger - Auto-log all user activities
Usage: from utils.activity_logger import log_activity

Examples:
    log_activity(db, user, 'CREATE', 'assets', 'Created new asset', asset_id=asset.id)
    log_activity(db, user, 'UPDATE', 'assets', 'Updated asset name', asset_id=asset.id)
    log_activity(db, user, 'DELETE', 'assets', 'Deleted asset', asset_id=asset.id)
    log_activity(db, user, 'VIEW', 'assets', 'Viewed asset details', asset_id=asset.id)
    log_activity(db, user, 'EXPORT', 'assets', 'Exported assets to CSV', user_id=user.id)
"""

from sqlalchemy.orm import Session
from models import ActivityLog
from typing import Optional, Dict, Any
import logging

logger = logging.getLogger(__name__)

# Activity types
ACTIVITY_TYPES = {
    'CREATE': '➕ Create',
    'UPDATE': '✏️ Update',
    'DELETE': '🗑️ Delete',
    'VIEW': '👁️ View',
    'EXPORT': '📤 Export',
    'LOGIN': '🔑 Login',
    'LOGOUT': '🚪 Logout',
    'VIEW_PASSWORD': '👁️ View Password',
    'VIEW_PASSWORD_FAILED': '❌ Failed View Password',
}

# Module names
MODULE_NAMES = {
    'assets': 'Asset Register',
    'configurations': 'Configuration Management',
    'backup_check': 'Backup Check',
    'backup_analytics': 'Backup Analytics',
    'worklog': 'Worklog',
    'project_tasks': 'Project Tasks',
    'activity_logs': 'Activity Logs',
    'log_maintenance': 'Log Maintenance',
    'log_compression': 'Log Compression',
    'vulnerability': 'Vulnerability Report',
    'incident': 'Incident Report',
    'documentation': 'Documentation',
    'document_library': 'Document Library',
    'risk': 'Risk Assessment',
    'quality': 'Quality Objectives',
    'forms': 'Form Uploads',
    'monthly_check': 'Monthly Server Check',
    'configuration': 'Configuration Items',
    'irmc': 'IRMC Check',
    'authentication': 'Authentication',
    'settings': 'Settings',
    'penilaian_risiko': 'Risk Assessment',
    'interested_parties': 'Interested Parties',
    'peluang': 'Opportunities',
    'isu_matrix': 'Issue Matrix',
    'capacity': 'Server Capacity',
    'notifications': 'Notifications',
}


def log_activity(
    db: Session,
    user: Any,
    action: str,
    module: str,
    description: str,
    asset_id: Optional[int] = None,
    asset_code: Optional[str] = None,
    details: Optional[Dict] = None,
    ip_address: Optional[str] = None
):
    """
    Log user activity to database.
    NOTE: This function does NOT call db.commit(). The caller is responsible
    for committing the main transaction. Activity log is added to the same
    session and committed together with the primary operation.
    """
    try:
        details_json = None
        if details:
            import json
            details_json = json.dumps(details)

        if isinstance(user, int):
            user_id = user
        elif hasattr(user, 'id'):
            user_id = user.id
        else:
            user_id = None

        activity = ActivityLog(
            user_id=user_id,
            action=action,
            module=module,
            description=description,
            details=details_json,
            ip_address=ip_address,
            asset_id=asset_id,
            asset_code=asset_code
        )
        db.add(activity)
    except Exception as e:
        logger.warning("Failed to log activity: %s", e)
        try:
            db.rollback()
        except Exception:
            pass


def log_create(db: Session, user: Any, module: str, item_name: str, item_id: int = None, details: Dict = None):
    """Log CREATE activity"""
    log_activity(
        db=db,
        user=user,
        action='CREATE',
        module=module,
        description=f'Created new {item_name}',
        asset_id=item_id,
        details=details
    )


def log_update(db: Session, user: Any, module: str, item_name: str, item_id: int = None, details: Dict = None):
    """Log UPDATE activity"""
    log_activity(
        db=db,
        user=user,
        action='UPDATE',
        module=module,
        description=f'Updated {item_name}',
        asset_id=item_id,
        details=details
    )


def log_delete(db: Session, user: Any, module: str, item_name: str, item_id: int = None, details: Dict = None):
    """Log DELETE activity"""
    log_activity(
        db=db,
        user=user,
        action='DELETE',
        module=module,
        description=f'Deleted {item_name}',
        asset_id=item_id,
        details=details
    )


def log_view(db: Session, user: Any, module: str, item_name: str, item_id: int = None, details: Dict = None):
    """Log VIEW activity"""
    log_activity(
        db=db,
        user=user,
        action='VIEW',
        module=module,
        description=f'Viewed {item_name}',
        asset_id=item_id,
        details=details
    )


def log_export(db: Session, user: Any, module: str, description: str = 'Exported data', details: Dict = None):
    """Log EXPORT activity"""
    log_activity(
        db=db,
        user=user,
        action='EXPORT',
        module=module,
        description=description,
        details=details
    )


def log_login(db: Session, user: Any, ip_address: str = None):
    """Log LOGIN activity"""
    log_activity(
        db=db,
        user=user,
        action='LOGIN',
        module='authentication',
        description=f'User {user.username} logged in',
        ip_address=ip_address
    )


def log_logout(db: Session, user: Any, ip_address: str = None):
    """Log LOGOUT activity"""
    log_activity(
        db=db,
        user=user,
        action='LOGOUT',
        module='authentication',
        description=f'User {user.username} logged out',
        ip_address=ip_address
    )


def log_task_assigned(db: Session, user: Any, task_title: str, assignee: str, task_id: int = None):
    """Log task assignment activity"""
    log_activity(
        db=db,
        user=user,
        action='ASSIGN',
        module='project_tasks',
        description=f'Assigned task "{task_title}" to {assignee}',
        asset_id=task_id
    )


def log_incident_created(db: Session, user: Any, server_name: str, incident_type: str, incident_id: int = None):
    """Log incident creation activity"""
    log_activity(
        db=db,
        user=user,
        action='CREATE',
        module='incident',
        description=f'Created {incident_type} incident on {server_name}',
        asset_id=incident_id
    )
