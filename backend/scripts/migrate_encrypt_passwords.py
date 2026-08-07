#!/usr/bin/env python3
"""
Migration Script: Encrypt Plaintext Passwords in Legacy Asset Tables

This script scans the 3 legacy asset tables (asset_ftp_users, asset_samba_users_internal,
asset_samba_users_external) and encrypts any plaintext passwords using Fernet encryption.

Usage:
    cd backend
    python scripts/migrate_encrypt_passwords.py

Backup your database before running!
"""
import sys
import os

# Add parent directory to path so we can import from backend
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import SessionLocal
from utils.password_encrypt import encrypt_password, is_password_encrypted
from models import AssetFTPUser, AssetSambaUserInternal, AssetSambaUserExternal


def migrate_table(table_name: str, model_class):
    """Encrypt plaintext passwords in a given table."""
    db = SessionLocal()
    try:
        records = db.query(model_class).all()
        total = len(records)
        encrypted_count = 0
        already_encrypted_count = 0
        no_password_count = 0

        print(f"\n{'='*60}")
        print(f"📦 Migrating: {table_name} ({total} records)")
        print(f"{'='*60}")

        for record in records:
            if not record.password:
                no_password_count += 1
                continue

            if is_password_encrypted(record.password):
                already_encrypted_count += 1
                continue

            # Encrypt the plaintext password
            record.password = encrypt_password(record.password)
            encrypted_count += 1

        db.commit()

        print(f"  ✅ Encrypted:        {encrypted_count}")
        print(f"  🔒 Already encrypted: {already_encrypted_count}")
        print(f"  ⚪ No password:      {no_password_count}")
        print(f"  📊 Total:            {total}")

        return encrypted_count

    except Exception as e:
        db.rollback()
        print(f"  ❌ Error: {e}")
        return 0
    finally:
        db.close()


def main():
    print("🔐 Password Encryption Migration Script")
    print("⚠️  BACKUP YOUR DATABASE BEFORE RUNNING!")
    print()

    # Confirm with user
    confirm = input("Continue? (yes/no): ").strip().lower()
    if confirm != "yes":
        print("❌ Migration cancelled.")
        sys.exit(0)

    total_encrypted = 0

    # Migrate each table
    tables = [
        ("asset_ftp_users", AssetFTPUser),
        ("asset_samba_users_internal", AssetSambaUserInternal),
        ("asset_samba_users_external", AssetSambaUserExternal),
    ]

    for table_name, model_class in tables:
        count = migrate_table(table_name, model_class)
        total_encrypted += count

    print(f"\n{'='*60}")
    print(f"🎉 Migration complete! Total encrypted: {total_encrypted}")
    print(f"{'='*60}")
    print()
    print("⚠️  IMPORTANT:")
    print("  1. Keep your ASSET_ENCRYPTION_KEY safe in .env")
    print("  2. If lost, all encrypted passwords will be unrecoverable")
    print("  3. Test the decryption endpoint after migration")


if __name__ == "__main__":
    main()
