"""Centralized database and backup path configuration."""
import os
import shutil
import logging

logger = logging.getLogger(__name__)

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BACKEND_DIR, "data")
DB_FILENAME = os.environ.get("SUPERAPP_DB_NAME", "superapps.db")
DB_PATH = os.path.join(DATA_DIR, DB_FILENAME)
BACKUP_DIR = os.path.join(DATA_DIR, "backups")
UPLOADS_DIR = os.path.join(DATA_DIR, "uploads")

LEGACY_DB_PATH = os.path.join(BACKEND_DIR, "superapps.db")
LEGACY_BACKUP_DIR = os.path.join(BACKEND_DIR, "backups")


def get_db_path():
    return DB_PATH


def get_backup_dir():
    return BACKUP_DIR


def get_uploads_dir():
    return UPLOADS_DIR


def ensure_data_dirs():
    os.makedirs(DATA_DIR, exist_ok=True)
    os.makedirs(BACKUP_DIR, exist_ok=True)


def migrate_legacy_db():
    if os.path.exists(LEGACY_DB_PATH) and not os.path.exists(DB_PATH):
        logger.info("[CONFIG] Migrating legacy database to data/ directory")
        ensure_data_dirs()
        shutil.move(LEGACY_DB_PATH, DB_PATH)
        logger.info("[CONFIG] Database moved: %s -> %s", LEGACY_DB_PATH, DB_PATH)

    if os.path.exists(LEGACY_BACKUP_DIR):
        for f in os.listdir(LEGACY_BACKUP_DIR):
            if f.endswith(".db"):
                src = os.path.join(LEGACY_BACKUP_DIR, f)
                dst = os.path.join(BACKUP_DIR, f)
                if not os.path.exists(dst):
                    shutil.move(src, dst)
                    logger.info("[CONFIG] Backup moved: %s -> %s", src, dst)
        if not os.listdir(LEGACY_BACKUP_DIR):
            try:
                os.rmdir(LEGACY_BACKUP_DIR)
                logger.info("[CONFIG] Removed empty legacy backup directory")
            except OSError:
                pass
