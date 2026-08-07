#!/usr/bin/env python3
"""
Migration script untuk fix invalid Fernet encryption key

Usage:
    cd backend
    source venv/bin/activate
    python3 scripts/migrate_encryption_key.py

This script will:
1. Backup the current database
2. Load the old encryption key from ~/.superapps/encryption.key
3. Decrypt all encrypted data with the old key
4. Generate a new valid Fernet key
5. Re-encrypt all data with the new key
6. Update the database
7. Save the new key
8. Verify all data can be decrypted
"""

import os
import sys
import shutil
import base64
from pathlib import Path
from datetime import datetime

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from cryptography.fernet import Fernet, InvalidToken
from database import SessionLocal, engine
from sqlalchemy import text
from models import AssetUsers
import logging

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

ENCRYPTION_KEY_FILE = Path.home() / ".superapps" / "encryption.key"
BACKUP_DIR = Path(__file__).parent.parent / "backups"


def backup_database():
    """Create a backup of the current database"""
    BACKUP_DIR.mkdir(exist_ok=True)
    
    # Get database path
    db_path = Path(__file__).parent.parent / "data" / "superapps.db"
    if not db_path.exists():
        logger.error(f"Database not found at {db_path}")
        sys.exit(1)
    
    # Create backup
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = BACKUP_DIR / f"superapps.db.pre-migration.{timestamp}"
    
    shutil.copy2(db_path, backup_path)
    logger.info(f"Database backed up to: {backup_path}")
    
    return backup_path


def backup_key():
    """Backup the current encryption key"""
    if not ENCRYPTION_KEY_FILE.exists():
        logger.warning("No existing encryption key found")
        return None
    
    BACKUP_DIR.mkdir(exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = BACKUP_DIR / f"encryption.key.pre-migration.{timestamp}"
    
    shutil.copy2(ENCRYPTION_KEY_FILE, backup_path)
    logger.info(f"Encryption key backed up to: {backup_path}")
    
    return backup_path


def try_decrypt_with_key(key_str, encrypted_data):
    """Try to decrypt data with a given key, handling various encoding issues"""
    if not encrypted_data:
        return None
    
    try:
        # Try with the key as-is
        fernet = Fernet(key_str.encode() if isinstance(key_str, str) else key_str)
        
        # Try to decode the encrypted data
        try:
            decoded = base64.urlsafe_b64decode(encrypted_data.encode())
        except:
            # Maybe it's already decoded
            decoded = encrypted_data.encode() if isinstance(encrypted_data, str) else encrypted_data
        
        decrypted = fernet.decrypt(decoded)
        return decrypted.decode('utf-8')
    except InvalidToken:
        return None
    except Exception as e:
        logger.debug(f"Decryption failed: {e}")
        return None


def try_fix_double_encoded_key(key_str):
    """Try to fix a double-encoded Fernet key"""
    try:
        # Try to decode once
        decoded = base64.urlsafe_b64decode(key_str.encode())
        # Check if it's valid Fernet key (32 bytes)
        if len(decoded) == 32:
            return decoded
        # If not, try to decode again (double-encoded)
        decoded2 = base64.urlsafe_b64decode(decoded)
        if len(decoded2) == 32:
            return decoded2
        return None
    except Exception as e:
        logger.debug(f"Failed to fix double-encoded key: {e}")
        return None


def main():
    logger.info("=" * 60)
    logger.info("Starting Encryption Key Migration")
    logger.info("=" * 60)
    
    # Step 1: Backup database and key
    logger.info("\n[Step 1/7] Creating backups...")
    db_backup = backup_database()
    key_backup = backup_key()
    
    # Step 2: Load old key
    logger.info("\n[Step 2/7] Loading old encryption key...")
    if not ENCRYPTION_KEY_FILE.exists():
        logger.error("No encryption key found!")
        logger.error("Please set ASSET_ENCRYPTION_KEY environment variable or create the key file")
        sys.exit(1)
    
    old_key = ENCRYPTION_KEY_FILE.read_text().strip()
    logger.info(f"Old key loaded (length: {len(old_key)} chars)")
    
    # Step 3: Try to decrypt with old key
    logger.info("\n[Step 3/7] Testing decryption with old key...")
    db = SessionLocal()
    
    try:
        # Get all assets with encrypted passwords
        assets = db.query(AssetUsers).filter(AssetUsers.password_encrypted.isnot(None)).all()
        logger.info(f"Found {len(assets)} assets with encrypted passwords")
        
        if len(assets) == 0:
            logger.info("No encrypted data found, proceeding with key generation...")
            decrypted_data = {}
        else:
            # Try to decrypt with old key
            decrypted_data = {}
            success_count = 0
            fail_count = 0
            
            for asset in assets:
                if asset.password_encrypted:
                    decrypted = try_decrypt_with_key(old_key, asset.password_encrypted)
                    if decrypted is not None:
                        decrypted_data[asset.id] = decrypted
                        success_count += 1
                    else:
                        # Try with fixed double-encoded key
                        fixed_key = try_fix_double_encoded_key(old_key)
                        if fixed_key:
                            decrypted = try_decrypt_with_key(fixed_key, asset.password_encrypted)
                            if decrypted is not None:
                                decrypted_data[asset.id] = decrypted
                                success_count += 1
                                logger.info(f"Asset {asset.id}: Decrypted with fixed key")
                                continue
                        
                        fail_count += 1
                        logger.warning(f"Asset {asset.id}: Could not decrypt (will be skipped)")
            
            logger.info(f"Decryption results: {success_count} success, {fail_count} failed")
            
            if fail_count > 0:
                logger.warning(f"\n{fail_count} assets could not be decrypted with the old key")
                logger.warning("These assets will keep their current encrypted values")
                response = input("Continue with migration? (yes/no): ")
                if response.lower() != 'yes':
                    logger.info("Migration cancelled")
                    sys.exit(0)
    
    finally:
        db.close()
    
    # Step 4: Generate new key
    logger.info("\n[Step 4/7] Generating new encryption key...")
    new_key = Fernet.generate_key().decode()
    logger.info(f"New key generated (length: {len(new_key)} chars)")
    
    # Step 5: Re-encrypt data with new key
    logger.info("\n[Step 5/7] Re-encrypting data with new key...")
    new_fernet = Fernet(new_key.encode())
    reencrypted_data = {}
    
    for asset_id, decrypted in decrypted_data.items():
        encrypted = new_fernet.encrypt(decrypted.encode('utf-8'))
        reencrypted_data[asset_id] = base64.urlsafe_b64encode(encrypted).decode('utf-8')
    
    logger.info(f"Re-encrypted {len(reencrypted_data)} assets")
    
    # Step 6: Update database
    logger.info("\n[Step 6/7] Updating database...")
    db = SessionLocal()
    
    try:
        for asset_id, new_encrypted in reencrypted_data.items():
            asset = db.query(AssetUsers).filter(AssetUsers.id == asset_id).first()
            if asset:
                asset.password_encrypted = new_encrypted
                logger.debug(f"Updated asset {asset_id}")
        
        db.commit()
        logger.info(f"Database updated successfully")
    
    except Exception as e:
        db.rollback()
        logger.error(f"Database update failed: {e}")
        sys.exit(1)
    
    finally:
        db.close()
    
    # Step 7: Save new key
    logger.info("\n[Step 7/7] Saving new encryption key...")
    ENCRYPTION_KEY_FILE.parent.mkdir(parents=True, exist_ok=True)
    ENCRYPTION_KEY_FILE.write_text(new_key)
    ENCRYPTION_KEY_FILE.chmod(0o600)
    logger.info(f"New key saved to: {ENCRYPTION_KEY_FILE}")
    
    # Verification
    logger.info("\n[Verification] Testing decryption with new key...")
    db = SessionLocal()
    
    try:
        assets = db.query(AssetUsers).filter(AssetUsers.password_encrypted.isnot(None)).all()
        verify_success = 0
        verify_fail = 0
        
        for asset in assets:
            if asset.password_encrypted:
                decrypted = try_decrypt_with_key(new_key, asset.password_encrypted)
                if decrypted is not None:
                    verify_success += 1
                else:
                    verify_fail += 1
                    logger.warning(f"Asset {asset.id}: Verification failed")
        
        logger.info(f"Verification results: {verify_success} success, {verify_fail} failed")
        
        if verify_fail > 0:
            logger.error("\nMigration completed but verification failed!")
            logger.error("Some data may be corrupted. Please restore from backup:")
            logger.error(f"  Database: {db_backup}")
            logger.error(f"  Key: {key_backup}")
            sys.exit(1)
        else:
            logger.info("\n" + "=" * 60)
            logger.info("Migration completed successfully!")
            logger.info("=" * 60)
            logger.info("\nNext steps:")
            logger.info("1. Restart the application: ./start-all.sh")
            logger.info("2. Verify all features work correctly")
            logger.info("3. Keep the backup files for at least 7 days")
            logger.info(f"   Database backup: {db_backup}")
            logger.info(f"   Key backup: {key_backup}")
    
    finally:
        db.close()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        logger.info("\nMigration cancelled by user")
        sys.exit(0)
    except Exception as e:
        logger.error(f"\nMigration failed: {e}", exc_info=True)
        sys.exit(1)
