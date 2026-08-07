#!/usr/bin/env python3
"""Re-encrypt samba_sequis passwords with current encryption key

WARNING: This script outputs status info only. Never print decrypted passwords.
"""
import os
import pathlib
_key_file = pathlib.Path.home() / ".superapps" / "encryption.key"
if _key_file.exists():
    os.environ['ASSET_ENCRYPTION_KEY'] = _key_file.read_text().strip()
if not os.environ.get('ASSET_ENCRYPTION_KEY'):
    raise RuntimeError("ASSET_ENCRYPTION_KEY not found. Set it in ~/.superapps/encryption.key")

import logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

from database import SessionLocal
from models import Asset
from utils.password_encrypt import encrypt_password, decrypt_password
import json

DEFAULT_PASSWORD = None  # must not be a fixed value; generated per-asset

def _new_random_password() -> str:
    """Generate a strong random password for assets whose old secret cannot be decrypted."""
    import secrets
    alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#-$%^&*"
    return "".join(secrets.choice(alphabet) for _ in range(24))

db = SessionLocal()

samba_sequis = db.query(Asset).filter(Asset.sub_category == 'samba_sequis').all()
logger.info("Found %d samba_sequis assets", len(samba_sequis))

for asset in samba_sequis:
    logger.info("Processing %s...", asset.asset_code)
    if asset.attributes:
        attrs = json.loads(asset.attributes)
        old_password = attrs.get('password', '')

        if old_password:
            decrypted = decrypt_password(old_password)
            if decrypted:
                new_password = encrypt_password(decrypted)
                attrs['password'] = new_password
                asset.attributes = json.dumps(attrs)
                db.commit()
                logger.info("  ✓ Password re-encrypted")
            else:
                logger.warning("  Could not decrypt old password - setting new one")
                new_password = encrypt_password(_new_random_password())
                attrs['password'] = new_password
                asset.attributes = json.dumps(attrs)
                db.commit()
                logger.warning("  ✓ New password set (generated, not fixed)")
        else:
            logger.warning("  No password - setting new one")
            new_password = encrypt_password(_new_random_password())
            attrs['password'] = new_password
            asset.attributes = json.dumps(attrs)
            db.commit()
            logger.warning("  ✓ New password set (generated, not fixed)")

db.close()
logger.info("Migration complete!")
