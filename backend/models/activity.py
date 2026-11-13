from .base import Base
from sqlalchemy import Column, Integer, BigInteger, Float, String, Text, Date, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import relationship, backref
from datetime import datetime, timezone


class ActivityLog(Base):
    __tablename__ = "activity_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    action = Column(String, nullable=False)
    module = Column(String, nullable=False)
    description = Column(Text)
    asset_id = Column(Integer, nullable=True)
    asset_code = Column(String, nullable=True)
    details = Column(Text, nullable=True)
    ip_address = Column(String, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class WorkLog(Base):
    __tablename__ = "work_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    date = Column(Date, nullable=False)
    time = Column(String)
    description = Column(Text, nullable=False)
    status = Column(String, default="in_progress")
    tags = Column(String)
    category = Column(String, default="General")
    estimated_time = Column(String)
    actual_time = Column(String)
    notes = Column(Text)
    task_id = Column(Integer, ForeignKey("project_tasks.id"), nullable=True)
    photo_urls = Column(Text, default="[]")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    completed_at = Column(DateTime, nullable=True)
    cancelled_at = Column(DateTime, nullable=True)
    version = Column(Integer, default=0)

    task = relationship("ProjectTask", back_populates="worklogs")
    checklist_items = relationship("WorklogChecklist", back_populates="worklog", cascade="all, delete-orphan", order_by="WorklogChecklist.sort_order")

class WorklogChecklist(Base):
    __tablename__ = "worklog_checklist"

    id = Column(Integer, primary_key=True, index=True)
    worklog_id = Column(Integer, ForeignKey("work_logs.id"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    notes = Column(Text, nullable=True)
    is_completed = Column(Boolean, default=False)
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    version = Column(Integer, default=0)

    worklog = relationship("WorkLog", back_populates="checklist_items")

class WorklogProgress(Base):
    __tablename__ = "worklog_progress"

    id = Column(Integer, primary_key=True, index=True)
    worklog_id = Column(Integer, ForeignKey("work_logs.id"), nullable=False, index=True)
    message = Column(Text, nullable=False)
    photo_urls = Column(Text, default="[]")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    worklog = relationship("WorkLog", backref=backref("progress_entries", cascade="all, delete-orphan"))


class LogCompression(Base):
    __tablename__ = "log_compression"

    id = Column(Integer, primary_key=True, index=True)
    server = Column(String(255), nullable=False, index=True)
    archive_info = Column(String(500), nullable=False)
    execution_date = Column(Date, nullable=False, index=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    created_by = Column(Integer, ForeignKey("users.id"))
    owner_role = Column(String(50), nullable=True, index=True)
    deleted_at = Column(DateTime, nullable=True, index=True)
    version = Column(Integer, default=0)

    creator = relationship("User", foreign_keys=[created_by])


class LogCompressionRun(Base):
    """Header satu run Log Compressor (hasil SSH auto-scan parser)."""
    __tablename__ = "log_compression_run"

    id = Column(Integer, primary_key=True, index=True)
    run_id = Column(String(120), nullable=False, index=True)  # dedup key (dari '# SELESAI RUN' / fingerprint)
    server = Column(String(255), index=True)
    folder = Column(String(512))
    app_name = Column(String(255), nullable=True, index=True)
    mode = Column(String(40), index=True)  # SAFE | DELETE_AFTER_VERIFY | OTHER
    period_from = Column(String(6), nullable=True)  # YYYYMM
    period_to = Column(String(6), nullable=True)
    status = Column(String(40), nullable=True)
    apps_checked = Column(Integer, default=0)
    archives_created = Column(Integer, default=0)
    archives_verified = Column(Integer, default=0)
    failed = Column(Integer, default=0)
    files_in_archive = Column(Integer, default=0)
    files_deleted = Column(Integer, default=0)
    size_original_bytes = Column(BigInteger, nullable=True)
    size_archive_bytes = Column(BigInteger, nullable=True)
    savings_pct = Column(Float, nullable=True)
    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True, index=True)
    log_filename = Column(String(512), nullable=True)
    owner_role = Column(String(50), nullable=True, index=True)
    created_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    deleted_at = Column(DateTime, nullable=True, index=True)

    archives = relationship("LogCompressionArchive", back_populates="run",
                            cascade="all, delete-orphan")


class LogCompressionArchive(Base):
    """Detail per-arsip (.tbz2) dalam satu run."""
    __tablename__ = "log_compression_archive"

    id = Column(Integer, primary_key=True, index=True)
    run_fk = Column(Integer, ForeignKey("log_compression_run.id"), nullable=False, index=True)
    archive_path = Column(String(600))
    year_month = Column(String(6), nullable=True, index=True)  # YYYYMM
    file_count = Column(Integer, default=0)
    size_original_bytes = Column(BigInteger, nullable=True)
    size_archive_bytes = Column(BigInteger, nullable=True)
    keterangan = Column(String(255), nullable=True)

    run = relationship("LogCompressionRun", back_populates="archives")
