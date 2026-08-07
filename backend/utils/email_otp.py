"""
Email OTP Utility - Generate, store, verify, and send OTP codes via email
"""
import secrets
import string
from datetime import datetime, timedelta, timezone
from typing import Optional
from sqlalchemy.orm import Session
from models import User, UserOTP
from utils.email_service import send_email_async, get_smtp_config
from utils.logger import get_logger

logger = get_logger(__name__)

OTP_LENGTH = 6
OTP_EXPIRY_MINUTES = 10
OTP_COOLDOWN_SECONDS = 60
OTP_MAX_ATTEMPTS = 5
OTP_LOCK_SECONDS = 300


def generate_otp() -> str:
    return "".join(secrets.choice(string.digits) for _ in range(OTP_LENGTH))


def create_otp_for_user(user_id: int, db: Session) -> Optional[str]:
    now = datetime.now(timezone.utc)

    # Check cooldown
    recent = db.query(UserOTP).filter(
        UserOTP.user_id == user_id,
        UserOTP.is_used == False,
        UserOTP.created_at > now - timedelta(seconds=OTP_COOLDOWN_SECONDS),
    ).first()
    if recent:
        logger.warning(f"OTP cooldown active for user {user_id}")
        return None

    # Invalidate any existing unused OTPs for this user
    db.query(UserOTP).filter(
        UserOTP.user_id == user_id,
        UserOTP.is_used == False,
    ).update({"is_used": True})
    db.flush()

    code = generate_otp()
    expires_at = now + timedelta(minutes=OTP_EXPIRY_MINUTES)

    otp = UserOTP(user_id=user_id, code=code, expires_at=expires_at)
    db.add(otp)
    db.commit()

    logger.info(f"OTP created for user {user_id} (expires in {OTP_EXPIRY_MINUTES} min)")
    return code


async def send_otp_email(user: User, otp_code: str, db: Session) -> bool:
    config = get_smtp_config(db)

    subject = "Super Apps - Email OTP Verification"
    body_text = f"Your OTP code is: {otp_code}\n\nThis code expires in {OTP_EXPIRY_MINUTES} minutes.\n\nIf you did not request this code, please ignore this email."
    body_html = f"""
    <div style="font-family: Arial, sans-serif; max-width: 400px; margin: 0 auto;">
        <h2 style="color: #2563eb;">Super Apps - Email OTP</h2>
        <p>Your verification code is:</p>
        <div style="background: #f3f4f6; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
            <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #1f2937;">{otp_code}</span>
        </div>
        <p style="color: #6b7280; font-size: 14px;">This code expires in {OTP_EXPIRY_MINUTES} minutes.</p>
        <p style="color: #6b7280; font-size: 12px;">If you did not request this code, please ignore this email.</p>
    </div>
    """

    success = await send_email_async(
        to=user.email,
        subject=subject,
        body_text=body_text,
        body_html=body_html,
        config=config,
        db=db,
    )

    if success:
        logger.info(f"OTP email sent to {user.email}")
    else:
        logger.error(f"Failed to send OTP email to {user.email}")

    return success


def verify_otp(user_id: int, code: str, db: Session) -> bool:
    now = datetime.now(timezone.utc)

    otp = db.query(UserOTP).filter(
        UserOTP.user_id == user_id,
        UserOTP.is_used == False,
        UserOTP.expires_at > now,
    ).order_by(UserOTP.created_at.desc()).first()

    if not otp:
        logger.warning(f"No valid OTP found for user {user_id}")
        return False

    if otp.locked_until and otp.locked_until > now:
        remaining = int((otp.locked_until - now).total_seconds())
        logger.warning(f"OTP locked for user {user_id} ({remaining}s remaining)")
        return False

    if otp.code != code:
        otp.attempt_count = (otp.attempt_count or 0) + 1
        if otp.attempt_count >= OTP_MAX_ATTEMPTS:
            otp.is_used = True
            otp.locked_until = now + timedelta(seconds=OTP_LOCK_SECONDS)
            logger.warning(f"OTP locked after {otp.attempt_count} failed attempts for user {user_id}")
        db.commit()
        logger.warning(f"Invalid OTP code for user {user_id} (attempt {otp.attempt_count})")
        return False

    otp.is_used = True
    db.commit()
    logger.info(f"OTP verified successfully for user {user_id}")
    return True


def clear_otp(user_id: int, db: Session):
    db.query(UserOTP).filter(
        UserOTP.user_id == user_id,
        UserOTP.is_used == False,
    ).update({"is_used": True})
    db.commit()
