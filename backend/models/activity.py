from .base import Base
from sqlalchemy import Column, Integer, String, Text, Date, DateTime, ForeignKey, Boolean
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
