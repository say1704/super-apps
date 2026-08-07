"""Migration 014: Add otp_enabled column to users table"""
from sqlalchemy import Column, Boolean
from sqlalchemy.orm import Session

def upgrade(db: Session):
    """Add otp_enabled column"""
    try:
        db.execute("""
            ALTER TABLE users ADD COLUMN otp_enabled BOOLEAN DEFAULT 0
        """)
        db.commit()
        print("Migration 014 applied: Added otp_enabled column to users")
    except Exception as e:
        db.rollback()
        if "duplicate column" in str(e).lower() or "already exists" in str(e).lower():
            print("Migration 014 skipped: otp_enabled column already exists")
        else:
            raise

def downgrade(db: Session):
    """Remove otp_enabled column"""
    try:
        db.execute("ALTER TABLE users DROP COLUMN otp_enabled")
        db.commit()
        print("Migration 014 reverted: Removed otp_enabled column")
    except Exception as e:
        db.rollback()
        print(f"Migration 014 downgrade failed: {e}")
