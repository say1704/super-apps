from .base import Base
from sqlalchemy import Column, Integer, String, Text, Date, DateTime, ForeignKey
from datetime import datetime, timezone


class Document(Base):
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)
    category = Column(String, nullable=False)
    title = Column(String, nullable=False)
    version = Column(String, default="1.0")
    author = Column(String)
    file_path = Column(String)
    description = Column(Text)
    tags = Column(String)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    created_by = Column(Integer, ForeignKey("users.id"))


class DocumentLibrary(Base):
    """Store SOP, work instructions, maintenance reports, and other documents"""
    __tablename__ = "document_library"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False, index=True)
    category = Column(String(100), nullable=False, index=True)
    doc_type = Column(String(50), default="text")
    file_path = Column(String(500), nullable=True)
    content_html = Column(Text, nullable=True)
    summary = Column(Text, nullable=True)
    tags = Column(String(500), nullable=True)
    version = Column(Integer, default=1)
    status = Column(String(30), default="draft", index=True)
    download_count = Column(Integer, default=0)
    view_count = Column(Integer, default=0)
    approved_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    approved_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    created_by = Column(Integer, ForeignKey("users.id"))


class DocumentCategory(Base):
    """Categories for organizing documents (user-managed CRUD)"""
    __tablename__ = "document_categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False, unique=True, index=True)
    description = Column(String(500), nullable=True)
    icon = Column(String(20), default="📁")
    color = Column(String(7), default="#6b7280")
    sort_order = Column(Integer, default=0)
    is_active = Column(Integer, default=1)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    created_by = Column(Integer, ForeignKey("users.id"))
    version = Column(Integer, default=0)


class DocumentVersion(Base):
    """Track version history of documents"""
    __tablename__ = "document_versions"

    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(Integer, ForeignKey("document_library.id"), nullable=False, index=True)
    version_number = Column(Integer, nullable=False)
    content_html = Column(Text, nullable=True)
    file_path = Column(String(500), nullable=True)
    summary = Column(Text, nullable=True)
    changed_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    change_note = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
