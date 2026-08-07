from .base import Base
from sqlalchemy import Column, Integer, String, Text, Date, DateTime, ForeignKey, Boolean, JSON
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from sqlalchemy import UniqueConstraint


class FormType(Base):
    __tablename__ = "form_types"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False, unique=True, index=True)
    description = Column(String(500), nullable=True)
    color = Column(String(20), default="blue")
    icon = Column(String(20), default="📄")
    sort_order = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)
    owner_role = Column(String(50), nullable=False, index=True)
    created_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    version = Column(Integer, default=0)

    uploads = relationship("FormUpload", back_populates="form_type_rel", foreign_keys="FormUpload.form_type", primaryjoin="FormType.name==foreign(FormUpload.form_type)")


class FormFolder(Base):
    __tablename__ = "form_folders"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    description = Column(String(500), nullable=True)
    parent_id = Column(Integer, ForeignKey("form_folders.id"), nullable=True, index=True)
    owner_role = Column(String(50), nullable=False, index=True)
    created_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    version = Column(Integer, default=0)

    parent = relationship("FormFolder", remote_side=[id], backref="children")
    uploads = relationship("FormUpload", back_populates="folder", cascade="all, delete-orphan")


class FormUpload(Base):
    __tablename__ = "form_uploads"

    id = Column(Integer, primary_key=True, index=True)
    form_type = Column(String, nullable=False)
    file_name = Column(String, nullable=False)
    upload_date = Column(Date, nullable=False)
    pic = Column(String)
    notes = Column(Text)
    file_path = Column(String)
    folder_id = Column(Integer, ForeignKey("form_folders.id"), nullable=True, index=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    created_by = Column(Integer, ForeignKey("users.id"))
    owner_role = Column(String(50), nullable=True, index=True)

    folder = relationship("FormFolder", back_populates="uploads")
    form_type_rel = relationship("FormType", back_populates="uploads", foreign_keys=[form_type], primaryjoin="FormType.name==FormUpload.form_type")


class AuditFileActivity(Base):
    """Audit file activity records parsed from audit-email report files"""
    __tablename__ = "audit_file_activities"

    id = Column(Integer, primary_key=True, index=True)
    hostname = Column(String, nullable=False, index=True)
    ip_address = Column(String, nullable=True)
    scan_date = Column(Date, nullable=False, index=True)
    server_summary = Column(String, nullable=True)
    watched_directory = Column(String, nullable=True)
    no_changes = Column(Boolean, default=False)
    summary_total = Column(Integer, default=0)
    summary_files = Column(Integer, default=0)
    username = Column(String, nullable=True, index=True)
    uid = Column(Integer, nullable=True)
    process_name = Column(String, nullable=True)
    activity_type = Column(String, nullable=True)
    level = Column(String, nullable=True)
    file_paths = Column(JSON, nullable=True)
    total_files = Column(Integer, default=0)
    time_start = Column(String, nullable=True)
    time_end = Column(String, nullable=True)
    result = Column(String, nullable=True)
    raw_block = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    created_by = Column(String, nullable=True)
    owner_role = Column(String, nullable=True, index=True)

    __table_args__ = (
        UniqueConstraint('hostname', 'scan_date', 'username', 'process_name', 'time_start', name='uq_audit_file'),
    )


class SSHLoginLog(Base):
    """SSH login audit logs parsed from SSH report files"""
    __tablename__ = "ssh_login_logs"

    id = Column(Integer, primary_key=True, index=True)
    hostname = Column(String, nullable=False, index=True)
    ip_address = Column(String, nullable=True)
    login_timestamp = Column(DateTime, nullable=False, index=True)
    username = Column(String, nullable=False, index=True)
    source_ip = Column(String, nullable=False, index=True)
    auth_method = Column(String, default='unknown')
    status = Column(String, nullable=False, index=True)
    duration = Column(String, nullable=True)
    severity = Column(String, default='LOW')
    scan_date = Column(Date, nullable=False, index=True)
    raw_line = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    created_by = Column(String, nullable=True)
    owner_role = Column(String, nullable=True, index=True)

    __table_args__ = (
        UniqueConstraint('hostname', 'login_timestamp', 'username', 'source_ip', 'status', name='uq_ssh_login'),
    )


class ErrorLog(Base):
    """Captured errors from backend and frontend."""
    __tablename__ = "error_logs"

    id = Column(Integer, primary_key=True, index=True)
    level = Column(String(20), nullable=False, default="ERROR")
    message = Column(Text, nullable=False)
    traceback = Column(Text, nullable=True)
    source = Column(String(20), default="backend")
    request_method = Column(String(10), nullable=True)
    request_path = Column(String(500), nullable=True)
    request_id = Column(String(100), nullable=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
