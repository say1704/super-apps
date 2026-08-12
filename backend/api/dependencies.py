from utils.timezone import utcnow
"""Shared dependencies for all API routers"""
import os
import uuid
import json
import time
from pathlib import Path
from datetime import datetime, timedelta, timezone
from typing import Optional, List, Dict
from fastapi import Depends, HTTPException, UploadFile, Cookie, Request
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from sqlalchemy import or_
from jose import JWTError, jwt

# Load .env file
from dotenv import load_dotenv
env_path = Path(__file__).parent.parent / ".env"
load_dotenv(dotenv_path=env_path)

from database import get_db
from models import User, UserModuleAccess, DocumentLibrary, AppSettings
from utils.activity_logger import log_activity as log_activity_util
from utils.sse_manager import manager as sse_manager, broadcast_event
from utils.password_encrypt import encrypt_password, decrypt_password, is_password_encrypted
from utils.pagination import get_offset, calculate_pagination


# ==================== CONSTANTS ====================
SECRET_KEY = os.environ.get("SECRET_KEY", "")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60
REFRESH_TOKEN_EXPIRE_DAYS = 1
COOKIE_SECURE = os.environ.get("COOKIE_SECURE", "true").lower() == "true"
COOKIE_PREFIX = "__Secure-" if COOKIE_SECURE else ""
COOKIE_ACCESS_KEY = f"{COOKIE_PREFIX}access_token"
COOKIE_REFRESH_KEY = f"{COOKIE_PREFIX}refresh_token"
ALLOWED_IPS = [ip.strip() for ip in os.environ.get("ALLOWED_IPS", "").split(",") if ip.strip()]

UPLOAD_ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'uploads')
os.makedirs("uploads", exist_ok=True)

ALLOWED_EXTENSIONS = {
    'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
    'png', 'jpg', 'jpeg', 'gif', 'bmp',
    'txt', 'csv', 'log', 'md',
    'zip', 'tar', 'gz', '7z',
}
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB

ALL_MODULES = [
    "dashboard", "log-management", "log-deletion", "log-compression", "ssh-report",
    "monthly-server-check", "irmc", "vulnerability", "incident",
    "documentation", "assets", "risk", "quality", "forms", "worklog",
    "tasks", "backup-analytics", "backup-check", "activity",
    "notifications", "settings", "ai", "audit-trail",
]

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token", auto_error=False)


# ==================== AUTH HELPERS ====================
def _decode_and_validate_token(token: str, db: Session) -> User:
    """Core token validation logic — shared by header and cookie auth."""
    import logging
    logger = logging.getLogger(__name__)
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")
        if not username:
            raise HTTPException(status_code=401, detail="Invalid token")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    if not user.is_active:
        raise HTTPException(status_code=401, detail="User account is disabled")
    if user.locked_until and user.locked_until.tzinfo is None:
        user.locked_until = user.locked_until.replace(tzinfo=timezone.utc)
    if user.locked_until and user.locked_until > utcnow():
        raise HTTPException(status_code=423, detail="Account is locked")
    token_iat = payload.get("iat")
    if token_iat and user.password_changed_at:
        if token_iat < user.password_changed_at.timestamp():
            raise HTTPException(status_code=401, detail="Token invalidated by password change")
    token_jti = payload.get("jti")
    if token_jti:
        from utils.session_manager import validate_session
        is_valid = validate_session(db, token_jti)
        logger.debug(f"[AUTH] Session validation result: {is_valid}")
        if not is_valid:
            raise HTTPException(status_code=401, detail="Session expired or revoked")
    return user


async def get_current_user(
    request: Request,
    db: Session = Depends(get_db),
):
    """Dual-source auth: tries cookie first, falls back to Authorization header."""
    import logging
    logger = logging.getLogger(__name__)

    # Cookie source (check both prefixed and unprefixed for backward compat)
    cookie_token = request.cookies.get(COOKIE_ACCESS_KEY) or request.cookies.get("access_token")

    # Authorization header source
    auth_header = request.headers.get("Authorization", "")
    header_token = auth_header[7:] if auth_header.startswith("Bearer ") else ""

    logger.debug(f"[AUTH] Cookie present: {bool(cookie_token)}, Header present: {bool(header_token)}")

    # Try header first (frontend always sends Bearer; cookie may be stale
    # from a previous deployment), then fall back to cookie.
    candidates = [header_token, cookie_token]
    for access_token in candidates:
        if not access_token:
            continue
        try:
            user = _decode_and_validate_token(access_token, db)
            logger.debug(f"[AUTH] User authenticated: {user.username}")
            return user
        except HTTPException:
            continue

    raise HTTPException(status_code=401, detail="Not authenticated")


async def require_superadmin(current_user: User = Depends(get_current_user)) -> User:
    """Restrict endpoint to superadmin role. Fails closed for any other role."""
    if current_user.role != "superadmin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    now = utcnow()
    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire, "iat": now})
    if "jti" not in to_encode:
        to_encode["jti"] = str(uuid.uuid4())
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def create_refresh_token(data: dict):
    to_encode = data.copy()
    now = utcnow()
    expire = now + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire, "iat": now, "type": "refresh"})
    if "jti" not in to_encode:
        to_encode["jti"] = str(uuid.uuid4())
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def create_otp_token(data: dict):
    """Create a short-lived token (5 min) for OTP flow — not valid for regular API access."""
    to_encode = data.copy()
    expire = utcnow() + timedelta(minutes=5)
    to_encode.update({"exp": expire, "type": "otp"})
    if "jti" not in to_encode:
        to_encode["jti"] = str(uuid.uuid4())
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def _decode_otp_token(token: str, db: Session):
    """Validate OTP token and return user. Only tokens with type='otp' are accepted."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("type") != "otp":
            raise HTTPException(status_code=401, detail="Invalid OTP token")
        username = payload.get("sub")
        if not username:
            raise HTTPException(status_code=401, detail="Invalid OTP token")
    except JWTError:
        raise HTTPException(status_code=401, detail="OTP token expired or invalid")
    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


# ==================== PASSWORD POLICY ====================
_security_settings_cache = {"data": None, "expiry": 0}
_SECURITY_SETTINGS_TTL = 30  # seconds

def get_security_settings(db: Session) -> dict:
    now = time.time()
    if _security_settings_cache["expiry"] > now:
        return _security_settings_cache["data"]

    settings = {}
    rows = db.query(AppSettings).filter(AppSettings.category == "security").all()
    for row in rows:
        settings[row.key] = row.value

    _security_settings_cache["data"] = settings
    _security_settings_cache["expiry"] = now + _SECURITY_SETTINGS_TTL
    return settings


def get_token_expiry(db: Session) -> tuple:
    """Get token expiry from security settings. Returns (access_minutes, refresh_days)."""
    settings = get_security_settings(db)
    access_minutes = int(settings.get("access_token_expire_minutes", str(ACCESS_TOKEN_EXPIRE_MINUTES)))
    refresh_days = int(settings.get("refresh_token_expire_days", str(REFRESH_TOKEN_EXPIRE_DAYS)))
    return access_minutes, refresh_days


def validate_password(password: str, settings: dict) -> Optional[str]:
    min_length = int(settings.get("min_password_length", "8"))
    require_upper = settings.get("require_uppercase", "true").lower() == "true"
    require_numbers = settings.get("require_numbers", "true").lower() == "true"
    require_special = settings.get("require_special_chars", "false").lower() == "true"

    if len(password) < min_length:
        return f"Password must be at least {min_length} characters"
    if require_upper and not any(c.isupper() for c in password):
        return "Password must contain at least one uppercase letter"
    if require_numbers and not any(c.isdigit() for c in password):
        return "Password must contain at least one number"
    if require_special and not any(c in "!@#$%^&*()_+-=[]{}|;:',.<>?/~`" for c in password):
        return "Password must contain at least one special character"
    return None


# ==================== ACTIVITY LOG ====================
def log_activity(db: Session, user_id: int, action: str, module: str, description: str,
                 asset_id: Optional[int] = None, asset_code: Optional[str] = None,
                 details: Optional[Dict] = None, ip_address: Optional[str] = None):
    """Wrapper for backward compatibility - delegates to utils.activity_logger"""
    log_activity_util(db=db, user=user_id, action=action, module=module, description=description,
                      asset_id=asset_id, asset_code=asset_code, details=details, ip_address=ip_address)


# ==================== FILE UPLOAD ====================
def _validate_filename(filename: str) -> str:
    import re
    filename = re.sub(r'[^a-zA-Z0-9_.\-]', '_', filename)
    if '..' in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    return filename


def save_file(file: UploadFile, subfolder: str = "") -> str:
    folder = f"uploads/{subfolder}" if subfolder else "uploads"
    os.makedirs(folder, exist_ok=True)

    file_extension = file.filename.split(".")[-1].lower() if "." in file.filename else ""
    if not file_extension or file_extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"File type '.{file_extension}' not allowed. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}"
        )

    file.file.seek(0, 2)
    file_size = file.file.tell()
    file.file.seek(0)
    if file_size > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"File too large ({file_size/1024/1024:.1f}MB). Maximum allowed: 50MB"
        )

    unique_filename = f"{uuid.uuid4()}.{file_extension}" if file_extension else uuid.uuid4().hex
    file_path = f"{folder}/{unique_filename}"
    with open(file_path, "wb") as buffer:
        buffer.write(file.file.read())
    return file_path


def _save_upload_file(file: UploadFile, allowed_ext: set = None) -> str:
    doc_upload_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'uploads', 'documents')
    os.makedirs(doc_upload_dir, exist_ok=True)
    if allowed_ext:
        ext = os.path.splitext(file.filename or '')[1].lower()
        if ext not in allowed_ext:
            raise HTTPException(status_code=400, detail=f"File type {ext} not allowed. Allowed: {', '.join(allowed_ext)}")

    file.file.seek(0, 2)
    file_size = file.file.tell()
    file.file.seek(0)
    if file_size > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail=f"File too large ({file_size/1024/1024:.1f}MB). Maximum allowed: 50MB")

    safe_name = _validate_filename(file.filename or 'upload')
    unique_name = f"{uuid.uuid4().hex[:8]}_{safe_name}"
    file_path = os.path.join(doc_upload_dir, unique_name)
    with open(file_path, "wb") as f:
        f.write(file.file.read())
    return f"uploads/documents/{unique_name}"


# ==================== PERMISSION HELPERS ====================
def get_worklog_filter(current_user: User):
    if current_user.role == "superadmin":
        return None
    from models import WorkLog
    return WorkLog.user_id == current_user.id


def get_task_filter(current_user: User):
    if current_user.role == "superadmin":
        return None
    from models import ProjectTask
    return or_(
        ProjectTask.created_by == current_user.id,
        ProjectTask.assignee == current_user.full_name,
    )


def can_modify_record(current_user: User, item) -> bool:
    if current_user.role == "superadmin":
        return True
    return getattr(item, "created_by", None) == current_user.id or getattr(item, "user_id", None) == current_user.id


def get_document_filter(current_user: User, db: Session):
    if current_user.role == "superadmin":
        return None
    same_role_users = db.query(User.id).filter(User.role == current_user.role).all()
    user_ids = [u[0] for u in same_role_users]
    return DocumentLibrary.created_by.in_(user_ids)


def can_modify_document(current_user: User, doc, db: Session) -> bool:
    if current_user.role == "superadmin":
        return True
    creator = db.query(User).filter(User.id == doc.created_by).first()
    return creator and creator.role == current_user.role


# ==================== MODULE RESOLUTION ====================
def resolve_user_modules(user, db: Session) -> List[str]:
    """Resolve user's module access using inherited RBAC logic.
    
    Tier 1: Superadmin → ALL_MODULES
    Tier 2: Regular user → Role modules (base) + overrides (add/remove)
    """
    if user.role == "superadmin":
        return list(ALL_MODULES)
    
    from models import Role
    role = db.query(Role).filter(Role.name == user.role).first()
    base_modules = set(json.loads(role.modules)) if role and role.modules else set()
    
    access_records = db.query(UserModuleAccess).filter(
        UserModuleAccess.user_id == user.id
    ).all()
    
    for a in access_records:
        if a.can_access:
            base_modules.add(a.module)
        else:
            base_modules.discard(a.module)
    
    return list(base_modules)
