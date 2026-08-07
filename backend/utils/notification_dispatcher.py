"""
Notification Dispatcher - Route events to email and in-app notifications
"""
from sqlalchemy.orm import Session
from typing import Optional, List
from models import AppSettings, User, Notification
from utils.email_service import send_email, load_email_template
from utils.logger import get_logger

logger = get_logger(__name__)


def create_in_app_notification(
    db: Session,
    user_id: int,
    notif_type: str,
    title: str,
    message: str,
    link: Optional[str] = None,
) -> Optional[Notification]:
    """Create an in-app notification for a user"""
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            logger.warning(f"Cannot create notification: user {user_id} not found")
            return None
        
        notification = Notification(
            user_id=user_id,
            type=notif_type,
            title=title,
            message=message,
            link=link,
        )
        db.add(notification)
        db.commit()
        db.refresh(notification)
        
        # Also send SSE event if user is online
        from utils.sse_manager import manager as sse_manager
        import asyncio
        try:
            asyncio.create_task(sse_manager.send_event(user_id, "notification", {
                "id": notification.id,
                "type": notif_type,
                "title": title,
                "message": message,
            }))
        except Exception:
            pass
        
        return notification
    except Exception as e:
        logger.error(f"Failed to create in-app notification: {e}")
        db.rollback()
        return None


def get_notification_settings(db: Session) -> dict:
    """Read notification settings from AppSettings"""
    settings = {}
    rows = db.query(AppSettings).filter(AppSettings.category == "notification").all()
    for row in rows:
        settings[row.key] = row.value or ""
    return settings


def get_alert_recipients(db: Session) -> List[str]:
    """Get list of email recipients for alerts"""
    settings = get_notification_settings(db)
    recipients_str = settings.get("alert_recipients", "")
    if not recipients_str:
        return []
    return [r.strip() for r in recipients_str.split(",") if r.strip()]


def get_user_email(db: Session, username_or_fullname: str) -> Optional[str]:
    """Find user email by username (exact match first) or full name"""
    user = db.query(User).filter(User.username == username_or_fullname).first()
    if not user:
        user = db.query(User).filter(User.full_name == username_or_fullname).first()
    return user.email if user else None


def notify_task_assigned(db: Session, task_title: str, assignee: str, priority: str, 
                         due_date: Optional[str], assigned_by: str, description: str,
                         app_url: str = "http://localhost:3001"):
    """Send email and in-app notification when a task is assigned"""
    settings = get_notification_settings(db)
    if settings.get("task_assigned_email", "true").lower() != "true":
        return
    
    assignee_email = get_user_email(db, assignee)
    if not assignee_email:
        return
    
    # Find assignee user_id for in-app notification
    assignee_user = db.query(User).filter(User.username == assignee).first()
    if assignee_user:
        create_in_app_notification(
            db=db,
            user_id=assignee_user.id,
            notif_type="task_assigned",
            title=f"Task Assigned: {task_title}",
            message=f"You have been assigned to '{task_title}' (Priority: {priority})",
            link=f"{app_url}/modules/tasks",
        )
    
    html_body = load_email_template(
        "task_assigned",
        assignee_name=assignee,
        task_title=task_title,
        priority=priority,
        due_date=due_date or "Not set",
        assigned_by=assigned_by,
        description=description or "",
        app_url=app_url,
    )
    
    text_body = f"You've been assigned to task: {task_title}\nPriority: {priority}\nDue: {due_date or 'Not set'}"
    
    send_email(
        db=db,
        to=assignee_email,
        subject=f"[Super Apps] Task Assigned: {task_title}",
        body_text=text_body,
        body_html=html_body,
    )


def notify_incident_created(db: Session, server_name: str, incident_type: str, 
                            incident_date: str, status: str, reported_by: str,
                            description: str, app_url: str = "http://localhost:3001"):
    """Send email and in-app notification when a new incident is created"""
    settings = get_notification_settings(db)
    if settings.get("incident_email", "true").lower() != "true":
        return
    
    # Create in-app notifications for all superadmin users
    admins = db.query(User).filter(User.role == "superadmin").all()
    for admin in admins:
        create_in_app_notification(
            db=db,
            user_id=admin.id,
            notif_type="incident_created",
            title=f"Incident: {incident_type} on {server_name}",
            message=f"New incident reported by {reported_by}: {description[:100]}",
            link=f"{app_url}/modules/incident",
        )
    
    recipients = get_alert_recipients(db)
    if not recipients:
        return
    
    html_body = load_email_template(
        "incident_created",
        server_name=server_name,
        incident_type=incident_type,
        incident_date=incident_date,
        status=status,
        reported_by=reported_by,
        description=description or "",
        app_url=app_url,
    )
    
    text_body = f"New incident reported on {server_name}\nType: {incident_type}\nStatus: {status}"
    
    for recipient in recipients:
        send_email(
            db=db,
            to=recipient,
            subject=f"[Super Apps] New Incident: {incident_type} on {server_name}",
            body_text=text_body,
            body_html=html_body,
        )


def notify_backup_failed(db: Session, server_name: str, reason: str, 
                         backup_date: str, app_url: str = "http://localhost:3001"):
    """Send email and in-app notification when a backup fails"""
    settings = get_notification_settings(db)
    if settings.get("backup_failure_email", "true").lower() != "true":
        return
    
    # Create in-app notifications for all superadmin users
    admins = db.query(User).filter(User.role == "superadmin").all()
    for admin in admins:
        create_in_app_notification(
            db=db,
            user_id=admin.id,
            notif_type="backup_failed",
            title=f"Backup Failed: {server_name}",
            message=f"Backup failed on {backup_date}: {reason}",
            link=f"{app_url}/modules/backup-check",
        )
    
    recipients = get_alert_recipients(db)
    if not recipients:
        return
    
    html_body = load_email_template(
        "backup_failed",
        server_name=server_name,
        reason=reason,
        backup_date=backup_date,
        app_url=app_url,
    )
    
    text_body = f"Backup failed for {server_name}\nReason: {reason}"
    
    for recipient in recipients:
        send_email(
            db=db,
            to=recipient,
            subject=f"[Super Apps] Backup Failed: {server_name}",
            body_text=text_body,
            body_html=html_body,
        )


def notify_task_due_reminder(db: Session, task_title: str, assignee: str, 
                             due_date: str, priority: str, status: str,
                             app_url: str = "http://localhost:3001"):
    """Send email and in-app reminder for tasks due tomorrow"""
    settings = get_notification_settings(db)
    if settings.get("task_due_email", "true").lower() != "true":
        return
    
    assignee_email = get_user_email(db, assignee)
    if not assignee_email:
        return
    
    # Find assignee user_id for in-app notification
    assignee_user = db.query(User).filter(User.username == assignee).first()
    if assignee_user:
        create_in_app_notification(
            db=db,
            user_id=assignee_user.id,
            notif_type="task_due_reminder",
            title=f"Task Due Tomorrow: {task_title}",
            message=f"Reminder: '{task_title}' is due on {due_date} (Priority: {priority})",
            link=f"{app_url}/modules/tasks",
        )
    
    html_body = load_email_template(
        "task_due_reminder",
        assignee_name=assignee,
        task_title=task_title,
        due_date=due_date,
        priority=priority,
        status=status,
        when="tomorrow",
        app_url=app_url,
    )
    
    text_body = f"Reminder: Task '{task_title}' is due tomorrow ({due_date})"
    
    send_email(
        db=db,
        to=assignee_email,
        subject=f"[Super Apps] Task Due Tomorrow: {task_title}",
        body_text=text_body,
        body_html=html_body,
    )
