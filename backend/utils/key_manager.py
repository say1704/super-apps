"""SECRET_KEY and ASSET_ENCRYPTION_KEY auto-generation and file persistence"""
import os
import secrets
import logging
from pathlib import Path
from cryptography.fernet import Fernet

logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parent.parent
SECRET_KEY_FILE = BASE_DIR / ".superapps" / "secret.key"
ENCRYPTION_KEY_FILE = BASE_DIR / ".superapps" / "encryption.key"


def _load_or_generate(file_path: Path, env_var: str, generator, warning_msg: str):
    """Load key from file, or generate + persist."""
    if file_path.exists():
        stored = file_path.read_text().strip()
        if stored:
            os.environ[env_var] = stored
            logger.info("[SECURITY] %s loaded from %s", env_var, file_path)
            return

    if not os.environ.get(env_var):
        auto_key = generator()
        os.environ[env_var] = auto_key
        file_path.parent.mkdir(parents=True, exist_ok=True)
        file_path.write_text(auto_key)
        file_path.chmod(0o600)
        logger.warning("[SECURITY] %s %s", warning_msg, file_path)


def ensure_secret_keys():
    """Ensure SECRET_KEY and ASSET_ENCRYPTION_KEY are set (from file or auto-generated).

    Must be called at module load time before any crypto operations.
    """
    _load_or_generate(
        SECRET_KEY_FILE,
        "SECRET_KEY",
        lambda: secrets.token_urlsafe(48),
        "Auto-generated SECRET_KEY — saved to",
    )
    _load_or_generate(
        ENCRYPTION_KEY_FILE,
        "ASSET_ENCRYPTION_KEY",
        lambda: Fernet.generate_key().decode(),
        "Auto-generated ASSET_ENCRYPTION_KEY — saved to",
    )
