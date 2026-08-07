from .base import Base
from sqlalchemy import Column, Integer, String, Text, Date, DateTime, ForeignKey, Float, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime, timezone


class QualityObjective(Base):
    __tablename__ = "quality_objectives_v2"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    category = Column(String, nullable=False, index=True)
    description = Column(Text)
    tracking_type = Column(String, nullable=False)
    period = Column(String, default="monthly")
    target_value = Column(Float, nullable=True)
    target_unit = Column(String, nullable=True)
    evidence_types = Column(String, default="text")
    checklist_items = Column(Text)
    is_active = Column(Boolean, default=True)
    owner_role = Column(String(50), nullable=True, index=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    created_by = Column(Integer, ForeignKey("users.id"))
    version = Column(Integer, default=0)
    attachment = Column(String, nullable=True)


class QualityEntry(Base):
    __tablename__ = "quality_entries"

    id = Column(Integer, primary_key=True, index=True)
    objective_id = Column(Integer, ForeignKey("quality_objectives_v2.id"), nullable=False, index=True)
    entry_date = Column(Date, nullable=False, index=True)
    entry_period = Column(String, nullable=False, index=True)
    value = Column(Float, nullable=True)
    status = Column(String, nullable=True)
    checklist_result = Column(Text)
    description = Column(Text)
    evidence_text = Column(Text)
    evidence_file = Column(String)
    evidence_url = Column(String)
    checked_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    version = Column(Integer, default=0)

    objective = relationship("QualityObjective", foreign_keys=[objective_id])


class QualityEvidence(Base):
    __tablename__ = "quality_evidence"

    id = Column(Integer, primary_key=True, index=True)
    objective_id = Column(Integer, ForeignKey("quality_objectives.id"))
    file_path = Column(String)
    description = Column(Text)
    custom_table = Column(Text)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    created_by = Column(Integer, ForeignKey("users.id"))
