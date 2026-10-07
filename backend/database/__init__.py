"""Database configuration"""
import os
import logging
from sqlalchemy import create_engine, event, inspect, text
from sqlalchemy.orm import sessionmaker
from models import Base
from utils.config import get_db_path, ensure_data_dirs, migrate_legacy_db

logger = logging.getLogger(__name__)

migrate_legacy_db()
ensure_data_dirs()
SQLALCHEMY_DATABASE_URL = f"sqlite:///{get_db_path()}"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False, "timeout": 30},
    # Pool per-proses diperbesar agar batch/scan paralel (SSH/Capacity sampai 50 worker, masing-masing
    # menahan 1 koneksi) tak menghabiskan pool & tetap sisa koneksi utk auth/poll/UI (cegah
    # "QueuePool limit reached" → 500). SQLite menangani banyak koneksi (file-based); tulis diserialisasi WAL,
    # connect_args timeout=30 sudah jadi busy_timeout 30s.
    pool_size=20,
    max_overflow=40,
    pool_timeout=30,
    pool_pre_ping=True,
)


@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA synchronous=NORMAL")
    cursor.execute("PRAGMA cache_size=-64000")
    cursor.close()


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def migrate_schema():
    """Add missing columns to existing tables to match current models.
    Only ADD COLUMN — preserves existing data.
    Idempotent — safe on every startup.
    """
    try:
        inspector = inspect(engine)
        metadata = Base.metadata
        for table_name, table in metadata.tables.items():
            if not inspector.has_table(table_name):
                continue
            existing = {c['name'] for c in inspector.get_columns(table_name)}
            for column in table.columns:
                if column.name in existing or column.primary_key:
                    continue
                col_type = column.type.compile(engine.dialect)
                stmt = text(f"ALTER TABLE {table_name} ADD COLUMN {column.name} {col_type}")
                try:
                    with engine.begin() as conn:
                        conn.execute(stmt)
                    logger.info("Schema migrated: added %s.%s (%s)", table_name, column.name, col_type)
                except Exception as exc:
                    logger.warning("Skipped %s.%s: %s", table_name, column.name, exc)
    except Exception as exc:
        logger.warning("Schema migration failed: %s", exc)


def init_db():
    Base.metadata.create_all(bind=engine)
    migrate_schema()


def restart_engine():
    """Dispose engine + clean WAL/SHM after DB file replacement (restore).

    Call after overwriting the database file so new connections
    read the updated database instead of stale pooled connections.
    """
    db_path = get_db_path()
    for ext in ("-wal", "-shm"):
        stale = db_path + ext
        if os.path.exists(stale):
            os.remove(stale)
    engine.dispose()
