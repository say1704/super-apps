"""
Email Service - Send emails using SMTP settings from database
Supports both sync (smtplib) and async (aiosmtplib) sending
"""
import smtplib
import aiosmtplib
import os
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional, List
from sqlalchemy.orm import Session
from models import SMTPSettings, AppSettings
from utils.logger import get_logger
from utils.password_encrypt import decrypt_password
from fastapi import Request

logger = get_logger(__name__)


SMTP_PASSWORD_PREFIX = "enc:"


def get_app_url(request: Request = None) -> str:
    """Detect app base URL from request headers, fallback to APP_URL env var."""
    if request:
        origin = request.headers.get("origin", "")
        if origin:
            return origin.rstrip("/")
        host = request.headers.get("host", "")
        if host:
            scheme = request.headers.get("x-forwarded-proto", "https")
            return f"{scheme}://{host}"
    app_url = os.environ.get("APP_URL", "")
    if app_url:
        return app_url.rstrip("/")
    if os.environ.get("NODE_ENV") == "production":
        raise RuntimeError("APP_URL environment variable is required in production")
    return "https://localhost"

def _decrypt_smtp_password(value: str) -> str:
    if not value or not value.startswith(SMTP_PASSWORD_PREFIX):
        return value
    return decrypt_password(value[len(SMTP_PASSWORD_PREFIX):])

def get_smtp_config(db: Session) -> dict:
    """Read SMTP configuration from database"""
    config = {}
    records = db.query(SMTPSettings).all()
    for r in records:
        config[r.key] = r.value or ""
    return {
        "host": config.get("smtp_host", ""),
        "port": int(config.get("smtp_port", "587")),
        "username": config.get("smtp_username", ""),
        "password": _decrypt_smtp_password(config.get("smtp_password", "")),
        "from_email": config.get("smtp_from_email", ""),
        "from_name": config.get("smtp_from_name", "Super Apps"),
        "use_tls": config.get("smtp_use_tls", "true").lower() == "true",
        "enabled": config.get("smtp_enabled", "true").lower() == "true",
    }


def _get_allowed_smtp_hosts(db: Session) -> list:
    """Get list of allowed SMTP hosts from AppSettings"""
    row = db.query(AppSettings).filter(
        AppSettings.category == "security",
        AppSettings.key == "allowed_smtp_hosts"
    ).first()
    if not row or not row.value:
        return []
    return [h.strip().lower() for h in row.value.split(",") if h.strip()]


def _validate_smtp_host_for_email(host: str, db: Session) -> bool:
    """Validate SMTP host against allowlist. Returns False if not allowed."""
    if not host:
        return False
    allowed = _get_allowed_smtp_hosts(db)
    if not allowed:
        logger.warning("SMTP host allowlist is empty - email sending blocked")
        return False
    return host.strip().lower() in allowed


def load_email_template(template_name: str, **kwargs) -> str:
    """Load HTML email template and substitute variables"""
    template_path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "templates", "email", f"{template_name}.html"
    )
    try:
        with open(template_path, "r", encoding="utf-8") as f:
            content = f.read()
        for key, value in kwargs.items():
            content = content.replace(f"{{{{{key}}}}}", str(value))
        return content
    except FileNotFoundError:
        return f"<p>{template_name} template not found</p>"


def _build_message(config: dict, to: str, subject: str, body_text: str, body_html: Optional[str] = None) -> MIMEMultipart:
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f'{config["from_name"]} <{config["from_email"]}>'
    msg["To"] = to
    msg.attach(MIMEText(body_text, "plain"))
    if body_html:
        msg.attach(MIMEText(body_html, "html"))
    return msg


def send_email(
    db: Session,
    to: str,
    subject: str,
    body_text: str,
    body_html: Optional[str] = None,
) -> bool:
    """Send an email using SMTP settings from database (sync)"""
    config = get_smtp_config(db)

    if not config["enabled"]:
        logger.info(f"SMTP disabled - would send to {to}: {subject}")
        return False

    if not all([config["host"], config["username"], config["password"], config["from_email"]]):
        logger.info(f"SMTP not configured - would send to {to}: {subject}")
        return False

    if not _validate_smtp_host_for_email(config["host"], db):
        logger.warning(f"SMTP host '{config['host']}' not in allowlist - email to {to} blocked")
        return False

    try:
        msg = _build_message(config, to, subject, body_text, body_html)

        port = config["port"]
        use_tls = config["use_tls"]

        if port == 465:
            server = smtplib.SMTP_SSL(config["host"], port, timeout=10)
        elif use_tls:
            server = smtplib.SMTP(config["host"], port, timeout=10)
            server.starttls()
        else:
            server = smtplib.SMTP(config["host"], port, timeout=10)

        server.login(config["username"], config["password"])
        server.sendmail(config["from_email"], [to], msg.as_string())
        server.quit()

        logger.info(f"Email sent to {to}: {subject}")
        return True

    except Exception as e:
        logger.error(f"Failed to send email to {to}: {e}")
        return False


async def send_email_async(
    to: str,
    subject: str,
    body_text: str,
    body_html: Optional[str] = None,
    config: Optional[dict] = None,
    db: Optional[Session] = None,
) -> bool:
    """Send an email asynchronously using aiosmtplib"""
    if not config:
        return False

    if not config["enabled"]:
        logger.info(f"SMTP disabled - would send to {to}: {subject}")
        return False

    if not all([config["host"], config["username"], config["password"], config["from_email"]]):
        logger.info(f"SMTP not configured - would send to {to}: {subject}")
        return False

    if db and not _validate_smtp_host_for_email(config["host"], db):
        logger.warning(f"SMTP host '{config['host']}' not in allowlist - email to {to} blocked")
        return False
    elif not db:
        logger.warning("send_email_async called without db - SMTP host validation skipped")

    try:
        msg = _build_message(config, to, subject, body_text, body_html)

        port = config["port"]
        use_tls = config["use_tls"]

        if port == 465:
            await aiosmtplib.send(
                msg,
                hostname=config["host"],
                port=port,
                username=config["username"],
                password=config["password"],
                use_tls=True,
                timeout=10,
            )
        else:
            await aiosmtplib.send(
                msg,
                hostname=config["host"],
                port=port,
                username=config["username"],
                password=config["password"],
                use_tls=False,
                start_tls=use_tls,
                timeout=10,
            )

        logger.info(f"Email sent to {to}: {subject}")
        return True

    except Exception as e:
        logger.error(f"Failed to send email to {to}: {e}")
        return False


def send_email_bulk(
    db: Session,
    recipients: List[str],
    subject: str,
    body_text: str,
    body_html: Optional[str] = None,
) -> dict:
    """Send email to multiple recipients (sync)"""
    results = {"sent": 0, "failed": 0, "errors": []}

    for recipient in recipients:
        if send_email(db, recipient, subject, body_text, body_html):
            results["sent"] += 1
        else:
            results["failed"] += 1
            results["errors"].append(recipient)

    return results
