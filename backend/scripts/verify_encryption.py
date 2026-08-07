#!/usr/bin/env python3
"""
Verification script untuk cek integrity encrypted data

Usage:
    cd backend
    source venv/bin/activate
    python3 scripts/verify_encryption.py

This script will:
1. Load the encryption key from ~/.superapps/encryption.key
2. Query all encrypted data from the database
3. Try to decrypt all data
4. Report success/failure statistics
"""

import os
import sys
import base64
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from cryptography.fernet import Fernet, InvalidToken
from database import SessionLocal
from models import AssetUsers
import logging

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

ENCRYPTION_KEY_FILE = Path.home() / ".superapps" / "encryption.key"


def try_decrypt(fernet, encrypted_data):
    """Try to decrypt data"""
    if not encrypted_data:
        return None
    
    try:
        # Try to decode the encrypted data
        try:
            decoded = base64.urlsafe_b64decode(encrypted_data.encode())
        except:
            decoded = encrypted_data.encode() if isinstance(encrypted_data, str) else encrypted_data
        
        decrypted = fernet.decrypt(decoded)
        return decrypted.decode('utf-8')
    except InvalidToken:
        return None
    except Exception as e:
        logger.debug(f"Decryption failed: {e}")
        return None


def main():
    logger.info("=" * 60)
    logger.info("Encryption Data Verification")
    logger.info("=" * 60)
    
    # Step 1: Load key
    logger.info("\n[Step 1/3] Loading encryption key...")
    if not ENCRYPTION_KEY_FILE.exists():
        logger.error("No encryption key found!")
        logger.error(f"Expected key file at: {ENCRYPTION_KEY_FILE}")
        sys.exit(1)
    
    key = ENCRYPTION_KEY_FILE.read_text().strip()
    logger.info(f"Key loaded (length: {len(key)} chars)")
    
    # Validate key
    try:
        fernet = Fernet(key.encode())
        logger.info("Key validation: ✓ Valid")
    except Exception as e:
        logger.error(f"Key validation: ✗ Invalid - {e}")
        sys.exit(1)
    
    # Step 2: Query encrypted data
    logger.info("\n[Step 2/3] Querying encrypted data...")
    db = SessionLocal()
    
    try:
        assets = db.query(AssetUsers).filter(AssetUsers.password_encrypted.isnot(None)).all()
        logger.info(f"Found {len(assets)} assets with encrypted passwords")
        
        if len(assets) == 0:
            logger.info("No encrypted data found")
            return
        
        # Step 3: Verify decryption
        logger.info("\n[Step 3/3] Verifying decryption...")
        success_count = 0
        fail_count = 0
        failed_assets = []
        
        for asset in assets:
            if asset.password_encrypted:
                decrypted = try_decrypt(fernet, asset.password_encrypted)
                if decrypted is not None:
                    success_count += 1
                else:
                    fail_count += 1
                    failed_assets.append(asset.id)
        
        # Report results
        logger.info("\n" + "=" * 60)
        logger.info("Verification Results")
        logger.info("=" * 60)
        logger.info(f"Total encrypted assets: {len(assets)}")
        logger.info(f"Successfully decrypted: {success_count}")
        logger.info(f"Failed to decrypt: {fail_count}")
        
        if fail_count > 0:
            logger.error("\n⚠ Verification FAILED!")
            logger.error(f"Failed asset IDs: {', '.join(map(str, failed_assets[:10]))}")
            if len(failed_assets) > 10:
                logger.error(f"... and {len(failed_assets) - 10} more")
            logger.error("\nPossible causes:")
            logger.error("1. Encryption key is invalid or corrupted")
            logger.error("2. Data was encrypted with a different key")
            logger.error("3. Data is corrupted")
            logger.error("\nSolutions:")
            logger.error("1. Run migration script: python3 scripts/migrate_encryption_key.py")
            logger.error("2. Restore from backup if available")
            sys.exit(1)
        else:
            logger.info("\n✓ Verification PASSED!")
            logger.info("All encrypted data can be decrypted successfully")
    
    finally:
        db.close()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        logger.info("\nVerification cancelled by user")
        sys.exit(0)
    except Exception as e:
        logger.error(f"\nVerification failed: {e}", exc_info=True)
        sys.exit(1)
