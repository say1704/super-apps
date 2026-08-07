"""Session Management - CRUD, validation, cleanup, concurrent login enforcement"""
import uuid
import hashlib
from datetime import datetime, timedelta
from typing import Optional, List
from sqlalchemy.orm import Session
from sqlalchemy import and_

from utils.timezone import utcnow, to_iso


def _hash_jti(jti: str) -> str:
    """Hash a JTI for secure storage (SHA-256, deterministic)."""
    return hashlib.sha256(jti.encode('utf-8')).hexdigest()


def create_session(db: Session, user_id: int, token_jti: str, ip_address: Optional[str] = None,
                   user_agent: Optional[str] = None, expires_at: Optional[datetime] = None,
                   refresh_jti: Optional[str] = None) -> dict:
    """Create a new user session record."""
    from models import UserSession
    session = UserSession(
        user_id=user_id,
        token_jti=_hash_jti(token_jti),
        refresh_jti=_hash_jti(refresh_jti) if refresh_jti else None,
        ip_address=ip_address,
        user_agent=user_agent,
        created_at=utcnow(),
        expires_at=expires_at or (utcnow() + timedelta(days=7)),
        is_active=True,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return {
        "id": session.id,
        "user_id": session.user_id,
        "ip_address": session.ip_address,
        "user_agent": session.user_agent,
        "created_at": to_iso(session.created_at),
        "expires_at": to_iso(session.expires_at),
        "is_active": session.is_active,
    }


def validate_session(db: Session, token_jti: str) -> bool:
    """Check if a session with the given JTI exists and is active."""
    from models import UserSession
    session = db.query(UserSession).filter(
        and_(UserSession.token_jti == _hash_jti(token_jti), UserSession.is_active == True)
    ).first()
    return session is not None


def validate_refresh_jti(db: Session, refresh_jti: str) -> bool:
    """Check if a session with the given refresh JTI exists and is active."""
    from models import UserSession
    session = db.query(UserSession).filter(
        and_(UserSession.refresh_jti == _hash_jti(refresh_jti), UserSession.is_active == True)
    ).first()
    return session is not None


def invalidate_by_refresh_jti(db: Session, refresh_jti: str) -> bool:
    """Mark a session inactive by its refresh JTI."""
    from models import UserSession
    session = db.query(UserSession).filter(
        UserSession.refresh_jti == _hash_jti(refresh_jti)
    ).first()
    if session:
        session.is_active = False
        db.commit()
        return True
    return False


def invalidate_user_sessions(db: Session, user_id: int) -> int:
    """Mark all sessions for a user as inactive. Returns count of invalidated sessions."""
    from models import UserSession
    count = db.query(UserSession).filter(
        and_(UserSession.user_id == user_id, UserSession.is_active == True)
    ).update({"is_active": False})
    db.commit()
    return count


def invalidate_session(db: Session, token_jti: str) -> bool:
    """Mark a specific session as inactive."""
    from models import UserSession
    session = db.query(UserSession).filter(UserSession.token_jti == _hash_jti(token_jti)).first()
    if session:
        session.is_active = False
        db.commit()
        return True
    return False


def get_user_sessions(db: Session, user_id: int) -> List[dict]:
    """Get all active sessions for a user."""
    from models import UserSession
    sessions = db.query(UserSession).filter(
        and_(UserSession.user_id == user_id, UserSession.is_active == True)
    ).order_by(UserSession.created_at.desc()).all()
    return [
        {
            "id": s.id,
            "user_id": s.user_id,
            "token_jti": s.token_jti,
            "ip_address": s.ip_address,
            "user_agent": s.user_agent,
            "created_at": to_iso(s.created_at),
            "expires_at": to_iso(s.expires_at),
            "is_active": s.is_active,
        }
        for s in sessions
    ]


def get_active_session_count(db: Session, user_id: int) -> int:
    """Count active sessions for a user."""
    from models import UserSession
    return db.query(UserSession).filter(
        and_(UserSession.user_id == user_id, UserSession.is_active == True)
    ).count()


def evict_oldest_session(db: Session, user_id: int) -> Optional[dict]:
    """Evict the oldest active session for a user. Returns the evicted session info."""
    from models import UserSession
    oldest = db.query(UserSession).filter(
        and_(UserSession.user_id == user_id, UserSession.is_active == True)
    ).order_by(UserSession.created_at.asc()).first()
    if oldest:
        oldest.is_active = False
        db.commit()
        return {
            "id": oldest.id,
            "ip_address": oldest.ip_address,
            "user_agent": oldest.user_agent,
            "created_at": to_iso(oldest.created_at),
        }
    return None


def cleanup_expired_sessions(db: Session) -> int:
    """Delete expired sessions. Returns count of deleted sessions."""
    from models import UserSession
    count = db.query(UserSession).filter(
        UserSession.expires_at < utcnow()
    ).delete(synchronize_session=False)
    db.commit()
    return count


def generate_jti() -> str:
    """Generate a unique JWT ID."""
    return str(uuid.uuid4())
