from utils.timezone import utcnow
from utils.timezone import to_iso
"""Auth, User Management, and Role Management"""
import os
import secrets
import json
from datetime import datetime, timedelta
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Cookie, BackgroundTasks
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
from fastapi.security import OAuth2PasswordRequestForm

from database import get_db
from models import User, UserModuleAccess, Role, AppSettings
from api.dependencies import (
    get_current_user, create_access_token, create_refresh_token, create_otp_token,
    _decode_otp_token, require_superadmin,
    validate_password, get_security_settings, get_token_expiry, log_activity,
    ACCESS_TOKEN_EXPIRE_MINUTES, REFRESH_TOKEN_EXPIRE_DAYS, COOKIE_SECURE, COOKIE_ACCESS_KEY, COOKIE_REFRESH_KEY,
    resolve_user_modules,
)
from utils.session_manager import create_session, invalidate_user_sessions, generate_jti, get_active_session_count, evict_oldest_session, invalidate_session
from utils.email_service import get_smtp_config, send_email_async
from utils.email_otp import create_otp_for_user, send_otp_email, verify_otp
from utils.logger import get_logger
from utils.optimistic_lock import check_version_conflict, increment_version, get_client_version
from api.schemas import (
    Token, UserCreate, UserResponse, UserUpdate, ModuleAccess, UserWithModules,
    RefreshTokenRequest, RefreshTokenResponse, PasswordResetRequest, PasswordResetConfirm,
    RoleCreate, RoleUpdate, RoleResponse, OtpSendResponse,
    OtpLoginRequest, LoginResponse, UserRegister, UserApprovalRequest,
    SessionResponse, SessionListResponse, MessageResponse, BulkOperationResponse,
    PasswordResetResponse, UserModulesResponse, AllModulesResponse, VersionResponse,
    UserListPaginatedResponse, RoleListPaginatedResponse,
)
from api.dependencies import get_offset, calculate_pagination, ALL_MODULES
from utils.rate_limiter import limiter
from utils.logger import get_logger

logger = get_logger(__name__)

router = APIRouter(tags=["Auth"])


def _set_auth_cookies(response: JSONResponse, access_token: str, refresh_token: str):
    """Set httpOnly cookies for access and refresh tokens."""
    response.set_cookie(
        key=COOKIE_ACCESS_KEY,
        value=access_token,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite="strict" if COOKIE_SECURE else "lax",
        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        path="/",
    )
    response.set_cookie(
        key=COOKIE_REFRESH_KEY,
        value=refresh_token,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite="strict" if COOKIE_SECURE else "lax",
        max_age=REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
        path="/",
    )


def _clear_auth_cookies(response: JSONResponse):
    """Clear httpOnly auth cookies."""
    response.delete_cookie(key=COOKIE_ACCESS_KEY, path="/", samesite="strict" if COOKIE_SECURE else "lax")
    response.delete_cookie(key=COOKIE_REFRESH_KEY, path="/", samesite="strict" if COOKIE_SECURE else "lax")


def _get_client_ip(request: Request) -> Optional[str]:
    return request.client.host if request.client else None


def _log_failed_login(db: Session, request: Request, username: str, user_id: Optional[int], reason: str):
    log_activity(
        db,
        user_id,
        "LOGIN_FAILED",
        "authentication",
        f"Failed login: {reason} (username: {username})",
        ip_address=_get_client_ip(request),
    )
    db.commit()


@router.post("/token", response_model=LoginResponse)
@limiter.limit("5/minute")
async def login(request: Request, form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == form_data.username).first()
    if not user:
        _log_failed_login(db, request, form_data.username, None, "unknown username")
        raise HTTPException(status_code=401, detail="Incorrect username or password")
    if user.status != "active":
        if user.status == "pending_approval":
            _log_failed_login(db, request, user.username, user.id, "account pending approval")
            raise HTTPException(status_code=403, detail="Account pending admin approval")
        elif user.status == "rejected":
            _log_failed_login(db, request, user.username, user.id, "account rejected")
            raise HTTPException(status_code=403, detail="Account has been rejected")
        else:
            _log_failed_login(db, request, user.username, user.id, "account not active")
            raise HTTPException(status_code=403, detail="Account not active")
    if user.locked_until:
        if user.locked_until.tzinfo is None:
            from datetime import timezone
            user.locked_until = user.locked_until.replace(tzinfo=timezone.utc)
        if user.locked_until > utcnow():
            remaining = int((user.locked_until - utcnow()).total_seconds() / 60)
            _log_failed_login(db, request, user.username, user.id, "account locked")
            raise HTTPException(status_code=423, detail=f"Account locked. Try again in {remaining} minutes")
        user.login_attempts = 0
        user.locked_until = None
        db.commit()
    if not user.verify_password(form_data.password):
        user.login_attempts = (user.login_attempts or 0) + 1
        user.last_failed_login = utcnow()
        security_settings = get_security_settings(db)
        max_attempts = int(security_settings.get("max_login_attempts", "5"))
        lockout_minutes = int(security_settings.get("lockout_duration_minutes", "30"))
        if user.login_attempts >= max_attempts:
            user.locked_until = utcnow() + timedelta(minutes=lockout_minutes)
            db.commit()
            _log_failed_login(db, request, user.username, user.id, "account locked after too many attempts")
            raise HTTPException(status_code=423, detail=f"Account locked after {max_attempts} failed attempts. Try again in {lockout_minutes} minutes")
        db.commit()
        _log_failed_login(db, request, user.username, user.id, "incorrect password")
        raise HTTPException(status_code=401, detail="Incorrect username or password")
    user.login_attempts = 0
    user.locked_until = None
    user.last_failed_login = None
    user.last_login = utcnow()
    db.commit()
    from utils.activity_logger import log_login
    log_login(db, user, ip_address=request.client.host if request.client else None)

    # Check global OTP setting
    security_settings = get_security_settings(db)
    requires_otp = security_settings.get("otp_enabled", "false").lower() == "true"

    if requires_otp:
        otp_token = create_otp_token(data={"sub": user.username})
        response = JSONResponse(content={
            "requires_otp": True,
            "otp_token": otp_token,
            "user": {"id": user.id, "username": user.username, "email": user.email}
        })
        return response
    max_sessions = int(security_settings.get("max_concurrent_sessions", "0"))
    if max_sessions > 0:
        active_count = get_active_session_count(db, user.id)
        while active_count >= max_sessions:
            evicted = evict_oldest_session(db, user.id)
            if not evicted:
                break
            active_count -= 1
    session_jti = generate_jti()
    access_minutes, _ = get_token_expiry(db)
    access_token = create_access_token(data={"sub": user.username, "jti": session_jti}, expires_delta=timedelta(minutes=access_minutes))
    refresh_jti = generate_jti()
    refresh_token = create_refresh_token(data={"sub": user.username, "jti": refresh_jti})
    create_session(db, user.id, session_jti,
                   ip_address=request.client.host if request.client else None,
                   user_agent=request.headers.get("user-agent"),
                   refresh_jti=refresh_jti)
    modules = resolve_user_modules(user, db)
    role = db.query(Role).filter(Role.name == user.role).first()
    settings_tabs = json.loads(role.settings_tabs) if role and role.settings_tabs else ["general", "sessions"]
    response = JSONResponse(content={"user": {"id": user.id, "username": user.username, "role": user.role, "full_name": user.full_name, "modules": modules, "settings_tabs": settings_tabs}, "access_token": access_token, "refresh_token": refresh_token})
    _set_auth_cookies(response, access_token, refresh_token)
    return response


@router.post("/token/refresh", response_model=RefreshTokenResponse)
async def refresh_token(request: Request, response: JSONResponse,
    db: Session = Depends(get_db)):
    from jose import jwt, JWTError
    from api.dependencies import SECRET_KEY
    from utils.session_manager import invalidate_session, create_session, generate_jti, validate_refresh_jti, invalidate_by_refresh_jti
    refresh_token = request.cookies.get(COOKIE_REFRESH_KEY) or request.cookies.get("refresh_token")
    if not refresh_token:
        raise HTTPException(status_code=401, detail="No refresh token")
    try:
        payload = jwt.decode(refresh_token, SECRET_KEY, algorithms=["HS256"])
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid refresh token")
        username = payload.get("sub")
        old_jti = payload.get("jti")
        if not username:
            raise HTTPException(status_code=401, detail="Invalid refresh token")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    user = db.query(User).filter(User.username == username).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive")
    if user.status != "active":
        raise HTTPException(status_code=403, detail="Account not active")
    # Reject reuse of a rotated/revoked refresh token
    if old_jti and not validate_refresh_jti(db, old_jti):
        raise HTTPException(status_code=401, detail="Refresh token revoked or expired")
    # Rotate: invalidate old session, create new one
    if old_jti:
        invalidate_by_refresh_jti(db, old_jti)
    new_jti = generate_jti()
    new_access = create_access_token(data={"sub": user.username, "jti": new_jti}, expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    new_refresh = create_refresh_token(data={"sub": user.username, "jti": new_jti})
    create_session(db, user.id, new_jti, ip_address=request.client.host if request.client else None,
                   user_agent=request.headers.get("user-agent"), refresh_jti=new_jti)
    resp = JSONResponse(content={"access_token": new_access, "token_type": "bearer", "refresh_token": new_refresh})
    _set_auth_cookies(resp, new_access, new_refresh)
    return resp


@router.post("/auth/request-password-reset", response_model=MessageResponse)
@limiter.limit("3/minute")
async def request_password_reset(request: Request, data: PasswordResetRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == data.username).first()
    if not user:
        return {"message": "If the username exists, a reset token has been sent to your email"}
    token = secrets.token_urlsafe(32)
    user.reset_token = token
    user.reset_token_expires = utcnow() + timedelta(hours=1)
    db.commit()
    email_sent = False
    if user.email:
        try:
            from utils.email_service import load_email_template, get_app_url
            app_url = get_app_url(request)
            reset_url = f"{app_url}/reset-password?token={token}"
            html_body = load_email_template("password_reset", username=user.full_name or user.username,
                reset_token=token, expires_in="1 hour", ip_address=request.client.host if request.client else "unknown",
                reset_url=reset_url)
            text_body = f"Password reset requested for your account.\n\nReset token: {token}\nExpires in: 1 hour\n\nVisit {reset_url} to reset your password."
            config = get_smtp_config(db)
            background_tasks.add_task(send_email_async, user.email, "Password Reset Request - Super Apps", text_body, html_body, config, db)
            email_sent = True
        except Exception as e:
            logger.error(f"Failed to queue reset email: {e}")
    if email_sent:
        return {"message": "If the username exists, a reset token has been sent to your email"}
    else:
        logger.info(f"Password reset requested for {user.username} (SMTP not configured — token generated for admin retrieval)")
        return {"message": "If the username exists, a reset token has been sent to your email"}


@router.post("/auth/reset-password", response_model=MessageResponse)
@limiter.limit("3/minute")
async def reset_password(request: Request, data: PasswordResetConfirm, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.reset_token == data.reset_token).first()
    if not user:
        raise HTTPException(status_code=400, detail="Invalid reset token")
    if user.reset_token_expires < utcnow().replace(tzinfo=None):
        user.reset_token = None
        user.reset_token_expires = None
        db.commit()
        raise HTTPException(status_code=400, detail="Reset token expired")
    security_settings = get_security_settings(db)
    pw_error = validate_password(data.new_password, security_settings)
    if pw_error:
        raise HTTPException(status_code=400, detail=pw_error)
    user.hashed_password = User.hash_password(data.new_password)
    user.reset_token = None
    user.reset_token_expires = None
    user.login_attempts = 0
    user.locked_until = None
    user.password_changed_at = utcnow()
    invalidate_user_sessions(db, user.id)
    db.commit()
    log_activity(db, user.id, "PASSWORD_RESET", "authentication", f"Password reset for user {user.username}")
    return {"message": "Password reset successful"}


@router.post("/auth/register", response_model=MessageResponse)
@limiter.limit("3/minute")
async def register_user(data: UserRegister, request: Request, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    existing = db.query(User).filter((User.username == data.username) | (User.email == data.email)).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username or email already exists")
    security_settings = get_security_settings(db)
    pw_error = validate_password(data.password, security_settings)
    if pw_error:
        raise HTTPException(status_code=400, detail=pw_error)
    db_user = User(
        username=data.username,
        email=data.email,
        full_name=data.full_name,
        hashed_password=User.hash_password(data.password),
        role="viewer",
        status="pending_approval",
        is_active=False
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    log_activity(db, db_user.id, "REGISTER", "authentication", f"New user registration: {data.username}")
    admins = db.query(User).filter(User.role == "superadmin", User.email.isnot(None)).all()
    if admins:
        try:
            from utils.email_service import load_email_template, get_app_url
            app_url = get_app_url(request)
            config = get_smtp_config(db)
            for admin in admins:
                html_body = load_email_template("new_registration",
                    admin_name=admin.full_name or admin.username,
                    username=data.username,
                    full_name=data.full_name,
                    email=data.email,
                    approval_url=f"{app_url}/modules/settings")
                text_body = f"New user registration: {data.username} ({data.full_name}, {data.email}). Review at {app_url}/modules/settings"
                background_tasks.add_task(send_email_async, admin.email, f"New User Registration: {data.username}", text_body, html_body, config, db)
        except Exception as e:
            logger.error(f"Failed to queue admin notification email: {e}")
    return {"message": "Registration submitted. Waiting for admin approval."}


@router.post("/users", response_model=UserResponse)
@limiter.limit("5/minute")
async def create_user(user: UserCreate, request: Request, db: Session = Depends(get_db), current_user: User = Depends(require_superadmin)):
    existing = db.query(User).filter((User.username == user.username) | (User.email == user.email)).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username or email already exists")
    security_settings = get_security_settings(db)
    pw_error = validate_password(user.password, security_settings)
    if pw_error:
        raise HTTPException(status_code=400, detail=pw_error)
    db_user = User(username=user.username, email=user.email, full_name=user.full_name,
        role=user.role, hashed_password=User.hash_password(user.password))
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user


@router.get("/users/me", response_model=UserWithModules)
async def get_me(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    modules = resolve_user_modules(current_user, db)
    role = db.query(Role).filter(Role.name == current_user.role).first()
    settings_tabs = json.loads(role.settings_tabs) if role and role.settings_tabs else ["general", "sessions"]
    return {"id": current_user.id, "username": current_user.username, "email": current_user.email, "full_name": current_user.full_name, "role": current_user.role, "is_active": current_user.is_active, "status": current_user.status, "modules": modules, "settings_tabs": settings_tabs}


@router.get("/settings/users", response_model=UserListPaginatedResponse)
async def get_users(
    page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
    status: Optional[str] = Query(None),
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    query = db.query(User)
    if current_user.role != "superadmin":
        query = query.filter(User.role == current_user.role)
    if status:
        query = query.filter(User.status == status)
    total_records = query.count()
    offset = get_offset(page, page_size)
    users = query.offset(offset).limit(page_size).all()
    user_ids = [u.id for u in users]
    all_access = db.query(UserModuleAccess).filter(UserModuleAccess.user_id.in_(user_ids)).all() if user_ids else []
    access_by_user = {}
    for a in all_access:
        access_by_user.setdefault(a.user_id, []).append(a)
    result = []
    for u in users:
        user_access = access_by_user.get(u.id, [])
        override_modules = [a.module for a in user_access if a.can_access]
        resolved_modules = resolve_user_modules(u, db)
        result.append({"id": u.id, "username": u.username, "email": u.email, "full_name": u.full_name,
            "role": u.role, "is_active": u.is_active, "modules": resolved_modules, "override_modules": override_modules, "status": u.status,
            "last_login": to_iso(u.last_login)})
    return {"data": result, "pagination": calculate_pagination(page, page_size, total_records).dict()}


@router.post("/settings/users", response_model=UserResponse)
@limiter.limit("5/minute")
async def create_user_endpoint(request: Request, user: UserCreate, db: Session = Depends(get_db), current_user: User = Depends(require_superadmin)):
    existing = db.query(User).filter((User.username == user.username) | (User.email == user.email)).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username or email already exists")
    security_settings = get_security_settings(db)
    pw_error = validate_password(user.password, security_settings)
    if pw_error:
        raise HTTPException(status_code=400, detail=pw_error)
    db_user = User(username=user.username, email=user.email, full_name=user.full_name,
        role=user.role, hashed_password=User.hash_password(user.password))
    db.add(db_user)
    log_activity(db, current_user.id, "CREATE", "Settings", f"Created user {user.username}")
    db.commit()
    db.refresh(db_user)
    role = db.query(Role).filter(Role.name == user.role).first()
    if role and role.modules:
        mods = json.loads(role.modules)
        for mod in mods:
            db.add(UserModuleAccess(user_id=db_user.id, module=mod, can_access=True))
    db.commit()
    return db_user


@router.put("/settings/users/{user_id}", response_model=UserResponse)
async def update_user_endpoint(user_id: int, request: Request, data: UserUpdate, db: Session = Depends(get_db), current_user: User = Depends(require_superadmin)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    client_version = get_client_version(request)
    check_version_conflict(user, client_version)

    if data.email is not None and data.email != user.email:
        existing = db.query(User).filter(User.email == data.email, User.id != user_id).first()
        if existing:
            raise HTTPException(status_code=400, detail="Email already in use by another user")
        user.email = data.email
    if data.full_name is not None:
        user.full_name = data.full_name
    if data.role is not None and data.role != user.role:
        old_role = user.role
        user.role = data.role
        # Sync module access to new role's defaults
        db.query(UserModuleAccess).filter(UserModuleAccess.user_id == user_id).delete(synchronize_session='fetch')
        new_role = db.query(Role).filter(Role.name == data.role).first()
        if new_role and new_role.modules:
            for mod in json.loads(new_role.modules):
                db.add(UserModuleAccess(user_id=user_id, module=mod, can_access=True))
        log_activity(db, current_user.id, "UPDATE", "Settings", f"Changed user {user_id} role: {old_role} → {data.role}")
    elif data.role is not None:
        user.role = data.role
    if data.is_active is not None:
        user.is_active = data.is_active
    if data.password:
        security_settings = get_security_settings(db)
        pw_error = validate_password(data.password, security_settings)
        if pw_error:
            raise HTTPException(status_code=400, detail=pw_error)
        user.hashed_password = User.hash_password(data.password)
        user.password_changed_at = utcnow()
        invalidate_user_sessions(db, user.id)
    increment_version(user)
    log_activity(db, current_user.id, "UPDATE", "Settings", f"Updated user {user_id}")
    db.commit()
    db.refresh(user)
    return {"id": user.id, "username": user.username, "email": user.email, "full_name": user.full_name, "role": user.role, "is_active": user.is_active, "version": user.version}


@router.delete("/settings/users/{user_id}", response_model=MessageResponse)
async def delete_user_endpoint(user_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_superadmin)):
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    db.query(UserModuleAccess).filter(UserModuleAccess.user_id == user_id).delete(synchronize_session='fetch')
    db.delete(user)
    log_activity(db, current_user.id, "DELETE", "Settings", f"Deleted user {user_id}")
    db.commit()
    return {"message": "User deleted"}


@router.post("/settings/users/{user_id}/approve", response_model=MessageResponse)
async def approve_user(user_id: int, data: UserApprovalRequest, request: Request, background_tasks: BackgroundTasks, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "superadmin":
        raise HTTPException(status_code=403, detail="Admin access required")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.status != "pending_approval":
        raise HTTPException(status_code=400, detail=f"User status is '{user.status}', not pending_approval")
    role = db.query(Role).filter(Role.name == data.role).first()
    if not role:
        raise HTTPException(status_code=400, detail=f"Role '{data.role}' does not exist")
    user.status = "active"
    user.is_active = True
    user.role = data.role
    db.commit()
    db.query(UserModuleAccess).filter(UserModuleAccess.user_id == user_id).delete(synchronize_session='fetch')
    if role.modules:
        mods = json.loads(role.modules)
        for mod in mods:
            db.add(UserModuleAccess(user_id=user_id, module=mod, can_access=True))
    db.commit()
    try:
        from utils.email_service import load_email_template, get_app_url
        app_url = get_app_url(request)
        html_body = load_email_template("welcome",
            username=user.username,
            full_name=user.full_name,
            login_url=f"{app_url}/login")
        text_body = f"Welcome {user.full_name}! Your account has been approved. Login at {app_url}/login"
        config = get_smtp_config(db)
        background_tasks.add_task(send_email_async, user.email, "Welcome to Super Apps", text_body, html_body, config, db)
    except Exception as e:
        logger.error(f"Failed to queue welcome email: {e}")
    log_activity(db, current_user.id, "APPROVE", "authentication", f"Approved user {user.username} with role {data.role}")
    return {"message": f"User {user.username} approved with role '{data.role}'. Welcome email sent."}


@router.post("/settings/users/{user_id}/reject", response_model=MessageResponse)
async def reject_user(user_id: int, data: UserApprovalRequest, request: Request, background_tasks: BackgroundTasks, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "superadmin":
        raise HTTPException(status_code=403, detail="Admin access required")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.status != "pending_approval":
        raise HTTPException(status_code=400, detail=f"User status is '{user.status}', not pending_approval")
    user.status = "rejected"
    user.is_active = False
    db.commit()
    try:
        from utils.email_service import load_email_template
        reason = data.reason or "Not specified"
        html_body = load_email_template("rejection",
            username=user.username,
            full_name=user.full_name,
            reason=reason)
        text_body = f"Your registration has been rejected. Reason: {reason}"
        config = get_smtp_config(db)
        background_tasks.add_task(send_email_async, user.email, "Registration Rejected", text_body, html_body, config, db)
    except Exception as e:
        logger.error(f"Failed to queue rejection email: {e}")
    log_activity(db, current_user.id, "REJECT", "authentication", f"Rejected user {user.username}. Reason: {data.reason or 'Not specified'}")
    return {"message": f"User {user.username} rejected."}


@router.get("/settings/users/{user_id}/modules", response_model=UserModulesResponse)
async def get_user_modules(user_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "superadmin" and current_user.id != user_id:
        raise HTTPException(status_code=403, detail="Access denied")
    access_records = db.query(UserModuleAccess).filter(UserModuleAccess.user_id == user_id).all()
    return {a.module: a.can_access for a in access_records}


@router.put("/settings/users/{user_id}/modules", response_model=MessageResponse)
async def update_user_modules(user_id: int, modules: List[ModuleAccess], db: Session = Depends(get_db), current_user: User = Depends(require_superadmin)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    db.query(UserModuleAccess).filter(UserModuleAccess.user_id == user_id).delete(synchronize_session='fetch')
    for m in modules:
        db.add(UserModuleAccess(user_id=user_id, module=m.module, can_access=m.can_access))
    db.commit()
    log_activity(db, current_user.id, "UPDATE", "authentication", f"Updated module access for user {user_id}")
    return {"message": "Module access updated"}


@router.get("/settings/modules", response_model=AllModulesResponse)
async def get_available_modules(current_user: User = Depends(get_current_user)):
    return {"modules": ALL_MODULES}


@router.get("/settings/roles", response_model=RoleListPaginatedResponse)
async def get_roles(
    page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    query = db.query(Role)
    total_records = query.count()
    offset = get_offset(page, page_size)
    roles = query.offset(offset).limit(page_size).all()
    user_count_by_role = {}
    for row in db.query(User.role, func.count(User.id)).group_by(User.role).all():
        user_count_by_role[row[0]] = row[1]
    result = []
    for r in roles:
        mods = json.loads(r.modules) if r.modules else []
        tabs = json.loads(r.settings_tabs) if r.settings_tabs else ["general", "sessions"]
        result.append({"id": r.id, "name": r.name, "description": r.description, "modules": mods,
            "settings_tabs": tabs, "is_system": r.is_system, "user_count": user_count_by_role.get(r.name, 0)})
    return {"data": result, "pagination": calculate_pagination(page, page_size, total_records).dict()}


@router.post("/settings/roles", response_model=RoleResponse)
async def create_role(data: RoleCreate, db: Session = Depends(get_db), current_user: User = Depends(require_superadmin)):
    existing = db.query(Role).filter(Role.name == data.name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Role sudah ada")
    db_role = Role(name=data.name, description=data.description, modules=json.dumps(data.modules), settings_tabs=json.dumps(data.settings_tabs))
    db.add(db_role)
    log_activity(db, current_user.id, "CREATE", "Settings", f"Created role {data.name}")
    db.commit()
    db.refresh(db_role)

    from utils.asset_metadata_seeder import seed_role_metadata
    try:
        if seed_role_metadata(db, data.name):
            log_activity(db, current_user.id, "CREATE", "Settings", f"Seeded asset metadata for role {data.name}")
    except Exception as e:
        logger.warning(f"[ROLE] Failed to seed asset metadata for role {data.name}: {e}")

    return {"id": db_role.id, "name": db_role.name, "description": db_role.description, "modules": data.modules, "settings_tabs": data.settings_tabs, "is_system": False}


@router.put("/settings/roles/{role_id}", response_model=VersionResponse)
async def update_role(role_id: int, request: Request, data: RoleUpdate, db: Session = Depends(get_db), current_user: User = Depends(require_superadmin)):
    role = db.query(Role).filter(Role.id == role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")

    client_version = get_client_version(request)
    check_version_conflict(role, client_version)

    if data.name is not None:
        old_name = role.name
        role.name = data.name
        db.query(User).filter(User.role == old_name).update({"role": data.name})
    if data.description is not None:
        role.description = data.description
    if data.modules is not None:
        role.modules = json.dumps(data.modules)
        users = db.query(User).filter(User.role == role.name).all()
        user_ids = [u.id for u in users]
        if user_ids:
            db.query(UserModuleAccess).filter(UserModuleAccess.user_id.in_(user_ids)).delete(synchronize_session=False)
            new_access = [UserModuleAccess(user_id=uid, module=mod, can_access=True) for uid in user_ids for mod in data.modules]
            db.bulk_save_objects(new_access)
    if data.settings_tabs is not None:
        role.settings_tabs = json.dumps(data.settings_tabs)
    increment_version(role)
    log_activity(db, current_user.id, "UPDATE", "Settings", f"Updated role {role_id}")
    db.commit()
    return {"message": "Role updated", "version": role.version}


@router.delete("/settings/roles/{role_id}", response_model=MessageResponse)
async def delete_role(role_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_superadmin)):
    role = db.query(Role).filter(Role.id == role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    if role.is_system:
        raise HTTPException(status_code=400, detail="System role tidak bisa dihapus")
    user_count = db.query(User).filter(User.role == role.name).count()
    if user_count > 0:
        raise HTTPException(status_code=400, detail=f"Role masih digunakan oleh {user_count} user")
    db.delete(role)
    log_activity(db, current_user.id, "DELETE", "Settings", f"Deleted role {role_id}")
    db.commit()
    return {"message": "Role deleted"}


# ==================== BULK USER ACTIONS ====================
@router.post("/settings/users/bulk-delete", response_model=BulkOperationResponse)
@limiter.limit("10/minute")
async def bulk_delete_users(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role != "superadmin":
        raise HTTPException(status_code=403, detail="Admin access required")
    body = await request.json()
    user_ids = body.get("ids", [])
    if not user_ids:
        raise HTTPException(status_code=400, detail="No user IDs provided")
    if len(user_ids) > 100:
        raise HTTPException(status_code=400, detail="Maximum 100 users per bulk operation")
    if current_user.id in user_ids:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    db.query(UserModuleAccess).filter(UserModuleAccess.user_id.in_(user_ids)).delete(synchronize_session=False)
    deleted_count = db.query(User).filter(User.id.in_(user_ids)).delete(synchronize_session=False)
    db.commit()
    log_activity(db, current_user.id, "BULK_DELETE", "settings", f"Bulk deleted {deleted_count} users")
    return {"message": f"Deleted {deleted_count} users", "count": deleted_count}


@router.post("/settings/users/bulk-status", response_model=BulkOperationResponse)
@limiter.limit("10/minute")
async def bulk_update_user_status(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role != "superadmin":
        raise HTTPException(status_code=403, detail="Admin access required")
    body = await request.json()
    user_ids = body.get("ids", [])
    new_status = body.get("status")
    if not user_ids or not new_status:
        raise HTTPException(status_code=400, detail="User IDs and status required")
    if len(user_ids) > 100:
        raise HTTPException(status_code=400, detail="Maximum 100 users per bulk operation")
    if current_user.id in user_ids:
        raise HTTPException(status_code=400, detail="Cannot change your own status")
    is_active = new_status == "active"
    updated_count = db.query(User).filter(User.id.in_(user_ids)).update(
        {"status": new_status, "is_active": is_active}, synchronize_session=False
    )
    db.commit()
    log_activity(db, current_user.id, "bulk-status", "Settings", f"Bulk updated {updated_count} users to {new_status}")
    return {"message": f"Updated {updated_count} users to {new_status}", "count": updated_count}


@router.post("/settings/users/bulk-approve", response_model=BulkOperationResponse)
@limiter.limit("10/minute")
async def bulk_approve_users(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role != "superadmin":
        raise HTTPException(status_code=403, detail="Admin access required")
    body = await request.json()
    user_assignments = body.get("users", [])
    if not user_assignments:
        raise HTTPException(status_code=400, detail="No user assignments provided")
    if len(user_assignments) > 100:
        raise HTTPException(status_code=400, detail="Maximum 100 users per bulk operation")

    # Validate all roles first
    roles_cache = {}
    for assignment in user_assignments:
        role_name = assignment.get("role", "viewer")
        if role_name not in roles_cache:
            role_obj = db.query(Role).filter(Role.name == role_name).first()
            if not role_obj:
                raise HTTPException(status_code=400, detail=f"Role '{role_name}' does not exist")
            roles_cache[role_name] = role_obj

    # Collect all user IDs
    user_ids = [a.get("user_id") for a in user_assignments if a.get("user_id")]
    users = db.query(User).filter(User.id.in_(user_ids), User.status == "pending_approval").all()
    users_by_id = {u.id: u for u in users}

    approved_count = 0
    errors = []
    for assignment in user_assignments:
        uid = assignment.get("user_id")
        role_name = assignment.get("role", "viewer")
        if uid not in users_by_id:
            errors.append(f"User {uid} not found or not pending")
            continue
        user = users_by_id[uid]
        role_obj = roles_cache[role_name]
        user.status = "active"
        user.is_active = True
        user.role = role_name
        approved_count += 1
        db.query(UserModuleAccess).filter(UserModuleAccess.user_id == uid).delete(synchronize_session='fetch')
        if role_obj.modules:
            mods = json.loads(role_obj.modules)
            for mod in mods:
                db.add(UserModuleAccess(user_id=uid, module=mod, can_access=True))
    db.commit()
    log_activity(db, current_user.id, "bulk-approve", "Settings", f"Bulk approved {approved_count} users with per-user roles")
    result = {"message": f"Approved {approved_count} users", "count": approved_count}
    if errors:
        result["errors"] = errors
    return result


@router.post("/settings/users/bulk-reject", response_model=BulkOperationResponse)
@limiter.limit("10/minute")
async def bulk_reject_users(
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role != "superadmin":
        raise HTTPException(status_code=403, detail="Admin access required")
    body = await request.json()
    user_ids = body.get("ids", [])
    if not user_ids:
        raise HTTPException(status_code=400, detail="No user IDs provided")
    if len(user_ids) > 100:
        raise HTTPException(status_code=400, detail="Maximum 100 users per bulk operation")
    reason = body.get("reason", "Not specified")

    users = db.query(User).filter(User.id.in_(user_ids), User.status == "pending_approval").all()
    rejected_count = 0
    errors = []
    try:
        from utils.email_service import load_email_template
        config = get_smtp_config(db)
        for user in users:
            user.status = "rejected"
            user.is_active = False
            rejected_count += 1
            html_body = load_email_template("rejection",
                username=user.username,
                full_name=user.full_name,
                reason=reason)
            text_body = f"Your registration has been rejected. Reason: {reason}"
            background_tasks.add_task(send_email_async, user.email, "Registration Rejected", text_body, html_body, config, db)
    except Exception as e:
        logger.error(f"Failed to queue bulk rejection emails: {e}")
    db.commit()
    log_activity(db, current_user.id, "BULK_REJECT", "settings", f"Bulk rejected {rejected_count} users. Reason: {reason}")
    result = {"message": f"Rejected {rejected_count} users", "count": rejected_count}
    if errors:
        result["errors"] = errors
    return result


# ==================== EMAIL OTP ENDPOINTS ====================

@router.post("/auth/otp/send", response_model=OtpSendResponse)
@limiter.limit("3/minute")
async def send_otp(request: Request, db: Session = Depends(get_db)):
    """Generate and send OTP code to user's registered email.
    Accepts otp_token from login response (not full auth)."""
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        otp_token = auth_header[7:]
    else:
        otp_token = request.cookies.get("otp_token")
    
    if not otp_token:
        raise HTTPException(status_code=401, detail="OTP token required. Login first.")
    
    user = _decode_otp_token(otp_token, db)
    
    if not user.email:
        raise HTTPException(status_code=400, detail="No email registered for this user")
    
    otp_code = create_otp_for_user(user.id, db)
    if otp_code is None:
        raise HTTPException(status_code=429, detail="Please wait before requesting another OTP")
    
    success = await send_otp_email(user, otp_code, db)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to send OTP email. Check SMTP settings.")
    
    log_activity(db, user.id, "OTP_SENT", "authentication", f"OTP sent to {user.email}")
    return {"message": "OTP sent to your email", "expires_in_minutes": 10}


@router.post("/auth/otp/login-verify", response_model=LoginResponse)
@limiter.limit("5/minute")
async def login_verify_otp(data: OtpLoginRequest, request: Request, db: Session = Depends(get_db)):
    """Verify OTP code during login and issue tokens.
    Accepts otp_token from login response."""
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        otp_token = auth_header[7:]
    else:
        otp_token = request.cookies.get("otp_token")
    
    if not otp_token:
        raise HTTPException(status_code=401, detail="OTP token required. Login first.")
    
    token_user = _decode_otp_token(otp_token, db)
    
    # Verify username matches
    if token_user.username != data.username:
        raise HTTPException(status_code=401, detail="Username mismatch")
    
    user = db.query(User).filter(User.username == data.username).first()
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if user.status != "active":
        if user.status == "pending_approval":
            raise HTTPException(status_code=403, detail="Account pending admin approval")
        elif user.status == "rejected":
            raise HTTPException(status_code=403, detail="Account has been rejected")
        else:
            raise HTTPException(status_code=403, detail="Account not active")
    if not verify_otp(user.id, data.code, db):
        raise HTTPException(status_code=401, detail="Invalid or expired OTP code")
    
    max_sessions = int(get_security_settings(db).get("max_concurrent_sessions", "0"))
    if max_sessions > 0:
        active_count = get_active_session_count(db, user.id)
        while active_count >= max_sessions:
            evicted = evict_oldest_session(db, user.id)
            if not evicted:
                break
            active_count -= 1
    session_jti = generate_jti()
    access_minutes, _ = get_token_expiry(db)
    access_token = create_access_token(data={"sub": user.username, "jti": session_jti}, expires_delta=timedelta(minutes=access_minutes))
    refresh_jti = generate_jti()
    refresh_token = create_refresh_token(data={"sub": user.username, "jti": refresh_jti})
    create_session(db, user.id, session_jti,
                   ip_address=request.client.host if request.client else None,
                   user_agent=request.headers.get("user-agent"),
                   refresh_jti=refresh_jti)
    modules = resolve_user_modules(user, db)
    role = db.query(Role).filter(Role.name == user.role).first()
    settings_tabs = json.loads(role.settings_tabs) if role and role.settings_tabs else ["general", "sessions"]
    response = JSONResponse(content={"user": {"id": user.id, "username": user.username, "role": user.role, "full_name": user.full_name, "modules": modules, "settings_tabs": settings_tabs}, "access_token": access_token, "refresh_token": refresh_token})
    _set_auth_cookies(response, access_token, refresh_token)
    return response


# ==================== SESSION MANAGEMENT ENDPOINTS ====================
from api.schemas import SessionResponse, SessionListResponse

@router.post("/auth/logout", response_model=MessageResponse)
async def logout(request: Request, response: JSONResponse, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    token = request.headers.get("Authorization", "").replace("Bearer ", "")
    if not token:
        token = request.cookies.get(COOKIE_ACCESS_KEY) or request.cookies.get("access_token") or ""
    if token:
        try:
            from jose import jwt
            from api.dependencies import SECRET_KEY, ALGORITHM
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            token_jti = payload.get("jti")
            if token_jti:
                invalidate_session(db, token_jti)
        except Exception as e:
            logger.warning("Logout: token decode failed: %s", e)
    log_activity(db, current_user.id, "LOGOUT", "authentication", f"User {current_user.username} logged out")
    _clear_auth_cookies(response)
    return {"message": "Logged out successfully"}


@router.get("/auth/sessions", response_model=SessionListResponse)
async def get_sessions(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    from utils.session_manager import get_user_sessions
    sessions = get_user_sessions(db, current_user.id)
    return {"sessions": sessions}


@router.post("/auth/sessions/{session_id}/revoke", response_model=MessageResponse)
async def revoke_session(session_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    from models import UserSession
    session = db.query(UserSession).filter(UserSession.id == session_id, UserSession.user_id == current_user.id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    session.is_active = False
    db.commit()
    log_activity(db, current_user.id, "SESSION_REVOKE", "authentication", f"Revoked session {session_id}")
    return {"message": "Session revoked"}


@router.post("/auth/sessions/revoke-all", response_model=BulkOperationResponse)
async def revoke_all_sessions(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    from models import UserSession
    from sqlalchemy import and_
    import jwt as pyjwt
    access_token = request.cookies.get(COOKIE_ACCESS_KEY) or request.cookies.get("access_token")
    if not access_token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            access_token = auth_header[7:]
    current_jti = None
    if access_token:
        try:
            from api.dependencies import SECRET_KEY, ALGORITHM
            payload = pyjwt.decode(access_token, SECRET_KEY, algorithms=[ALGORITHM])
            current_jti = payload.get("jti")
        except Exception as e:
            logger.error("revoke_all_sessions: token decode failed: %s", e)
            raise HTTPException(status_code=400, detail="Could not decode current session token")
    filter_cond = and_(UserSession.user_id == current_user.id, UserSession.is_active == True)
    if current_jti:
        filter_cond = and_(filter_cond, UserSession.token_jti != current_jti)
    count = db.query(UserSession).filter(filter_cond).update({"is_active": False})
    db.commit()
    log_activity(db, current_user.id, "SESSION_REVOKE_ALL", "authentication", f"Revoked {count} other sessions")
    return {"message": f"Revoked {count} sessions", "count": count}
