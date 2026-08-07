"""Database configuration"""
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from models import Base
from utils.config import get_db_path, ensure_data_dirs, migrate_legacy_db

migrate_legacy_db()
ensure_data_dirs()
SQLALCHEMY_DATABASE_URL = f"sqlite:///{get_db_path()}"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
)


@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA synchronous=NORMAL")
    cursor.execute("PRAGMA cache_size=-2000")  # 2MB cache
    cursor.close()


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    Base.metadata.create_all(bind=engine)
