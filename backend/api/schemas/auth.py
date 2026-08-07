"""Authentication, session, OTP, password reset, and role schemas"""
from typing import List, Optional
from .base import OrmModel


# ==================== AUTH SCHEMAS ====================
class Token(OrmModel):
    access_token: str
    token_type: str
    refresh_token: Optional[str] = None
    user: dict


class UserCreate(OrmModel):
    username: str
    email: str
    password: str
    full_name: str
    role: str


class UserResponse(OrmModel):
    id: int
    username: str
    email: str
    full_name: str
    role: str
    is_active: bool = True


class UserUpdate(OrmModel):
    email: Optional[str] = None
    full_name: Optional[str] = None
    role: Optional[str] = None
    password: Optional[str] = None
    is_active: Optional[bool] = None


class ModuleAccess(OrmModel):
    module: str
    can_access: bool


class UserWithModules(OrmModel):
    id: int
    username: str
    email: str
    full_name: str
    role: str
    is_active: bool
    status: str = "active"
    modules: List[str]
    settings_tabs: List[str] = ["general", "sessions"]


class RefreshTokenRequest(OrmModel):
    refresh_token: str


class RefreshTokenResponse(OrmModel):
    access_token: str
    token_type: str
    refresh_token: str


# ==================== PASSWORD RESET ====================
class PasswordResetRequest(OrmModel):
    username: str


class PasswordResetConfirm(OrmModel):
    reset_token: str
    new_password: str


# ==================== ROLE SCHEMAS ====================
class RoleCreate(OrmModel):
    name: str
    description: str = ""
    modules: List[str] = []
    settings_tabs: List[str] = ["general", "sessions"]


class RoleUpdate(OrmModel):
    name: Optional[str] = None
    description: Optional[str] = None
    modules: Optional[List[str]] = None
    settings_tabs: Optional[List[str]] = None


# ==================== OTP SCHEMAS ====================
class OtpSendResponse(OrmModel):
    message: str
    expires_in_minutes: int


class OtpLoginRequest(OrmModel):
    username: str
    code: str


class LoginResponse(OrmModel):
    requires_otp: Optional[bool] = False
    user: Optional[dict] = None
    access_token: Optional[str] = None
    refresh_token: Optional[str] = None


# ==================== USER REGISTRATION ====================
class UserRegister(OrmModel):
    username: str
    email: str
    password: str
    full_name: str


class UserApprovalRequest(OrmModel):
    role: str
    reason: Optional[str] = None


# ==================== SESSION SCHEMAS ====================
class SessionResponse(OrmModel):
    id: int
    user_id: int
    token_jti: str
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    created_at: Optional[str] = None
    expires_at: Optional[str] = None
    is_active: bool


class SessionListResponse(OrmModel):
    sessions: List[SessionResponse]
