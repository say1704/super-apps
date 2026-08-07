"""Password Encryption Utility for Asset Register
Secure encryption/decryption for user credentials (ISO 27001:2022)
"""
from cryptography.fernet import Fernet
import os
import base64
import logging
from pathlib import Path
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

# Load .env file from backend directory
env_path = Path(__file__).parent.parent / ".env"
load_dotenv(dotenv_path=env_path)


# Get encryption key from environment or generate new one
def get_encryption_key() -> bytes:
    """
    Get encryption key from environment variable or generate new one.

    In production, set ASSET_ENCRYPTION_KEY environment variable.
    Format: Base64-encoded 32-byte key (Fernet format)

    Returns:
        Encryption key bytes (base64-encoded for Fernet)
    """
    key = os.environ.get("ASSET_ENCRYPTION_KEY")

    if key:
        return key.encode() if isinstance(key, str) else key
    else:
        logger.warning("ASSET_ENCRYPTION_KEY not set — generating ephemeral key. "
                       "Encrypted data will be unrecoverable after restart!")
        return Fernet.generate_key()


def get_encryption_key_base64() -> str:
    """
    Get current encryption key in Base64 format.
    Use this to set ASSET_ENCRYPTION_KEY environment variable.
    
    Returns:
        Base64-encoded key string
    """
    key = get_encryption_key()
    return base64.urlsafe_b64encode(key).decode()


# Initialize Fernet instance
ENCRYPTION_KEY = get_encryption_key()
fernet = Fernet(ENCRYPTION_KEY)


def encrypt_password(password: str) -> str:
    """
    Encrypt password for secure storage.
    
    Args:
        password: Plain text password
        
    Returns:
        Encrypted password (Base64-encoded)
    """
    if not password:
        return ""
    
    encrypted = fernet.encrypt(password.encode('utf-8'))
    return base64.urlsafe_b64encode(encrypted).decode('utf-8')


def decrypt_password(encrypted_password: str) -> str:
    """
    Decrypt password for display or use.
    
    Args:
        encrypted_password: Encrypted password (Base64-encoded)
        
    Returns:
        Decrypted plain text password
    """
    if not encrypted_password:
        return ""
    
    try:
        decoded = base64.urlsafe_b64decode(encrypted_password.encode('utf-8'))
        decrypted = fernet.decrypt(decoded)
        return decrypted.decode('utf-8')
    except Exception as e:
        logger.error("Password decryption failed", exc_info=True)
        return ""  # Return empty on failure


def is_password_encrypted(password: str) -> bool:
    """
    Check if password is encrypted (not plain text).
    
    Args:
        password: Password string to check
        
    Returns:
        True if appears to be encrypted
    """
    if not password:
        return False
    
    # Encrypted passwords are Base64-encoded and longer
    # Plain text passwords are typically shorter and not Base64
    try:
        # Try to decode as Base64
        decoded = base64.urlsafe_b64decode(password.encode('utf-8'))
        # If successful and length is reasonable, likely encrypted
        return len(decoded) > 16 and len(password) > 32
    except:
        return False


def hash_password_for_verification(password: str) -> str:
    """
    Hash password for verification (one-way).
    Use this for comparing passwords without storing plain text.
    
    Args:
        password: Plain text password
        
    Returns:
        Hashed password (SHA-256, Base64-encoded)
    """
    import hashlib
    hash_object = hashlib.sha256(password.encode('utf-8'))
    return base64.urlsafe_b64encode(hash_object.digest()).decode('utf-8')


def verify_password(password: str, hashed: str) -> bool:
    """
    Verify password against hash.
    
    Args:
        password: Plain text password to verify
        hashed: Stored hash to compare against
        
    Returns:
        True if password matches
    """
    return hash_password_for_verification(password) == hashed
