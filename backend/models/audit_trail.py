from .base import Base
from sqlalchemy import Column, Integer, String, Text, Date, DateTime, ForeignKey
from datetime import datetime, timezone


class AuditFinding(Base):
    __tablename__ = "audit_findings"

    id = Column(Integer, primary_key=True, index=True)
    finding_number = Column(String(20), unique=True, index=True)
    source = Column(String(20), index=True)  # internal, external, surveillance
    iso_standard = Column(String(50))  # ISO 27001:2022, ISO 9001:2015
    clause = Column(String(50))  # e.g., "9.2.2", "A.8.15"
    title = Column(String(255))
    description = Column(Text)
    evidence = Column(Text, nullable=True)
    severity = Column(String(20), index=True)  # minor, major, critical
    status = Column(String(20), index=True, default="open")  # open, in_progress, closed
    auditor_name = Column(String(255))
    audit_date = Column(Date)
    risk_id = Column(Integer, ForeignKey('penilaian_risiko.id'), nullable=True)
    responsible_user_id = Column(Integer, ForeignKey('users.id'), nullable=True)
    due_date = Column(Date, nullable=True)
    owner_role = Column(String(50), nullable=True, index=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    created_by = Column(Integer, ForeignKey('users.id'))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    deleted_at = Column(DateTime, nullable=True)
    version = Column(Integer, default=0)
    
    # Intertek format fields
    client_name = Column(String(255), nullable=True)
    site_location = Column(String(255), nullable=True)
    audit_type = Column(String(50), nullable=True)  # initial, surveillance, recertification
    scope = Column(Text, nullable=True)
    criteria = Column(Text, nullable=True)
    finding_category = Column(String(50), nullable=True)  # conformity, non_conformity, observation, ofi
    root_cause = Column(Text, nullable=True)
    follow_up_date = Column(Date, nullable=True)
    verification_effectiveness = Column(Text, nullable=True)


class CorrectiveAction(Base):
    __tablename__ = "corrective_actions"

    id = Column(Integer, primary_key=True, index=True)
    finding_id = Column(Integer, ForeignKey('audit_findings.id'), nullable=False)
    action_description = Column(Text, nullable=False)
    responsible_user_id = Column(Integer, ForeignKey('users.id'), nullable=True)
    due_date = Column(Date, nullable=False)
    status = Column(String(20), index=True, default="pending")  # pending, in_progress, verified, closed
    completion_date = Column(Date, nullable=True)
    verification_notes = Column(Text, nullable=True)
    verified_by = Column(Integer, ForeignKey('users.id'), nullable=True)
    verified_at = Column(DateTime, nullable=True)
    attachments = Column(Text, nullable=True)  # JSON array of file paths
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    created_by = Column(Integer, ForeignKey('users.id'))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    deleted_at = Column(DateTime, nullable=True)
    version = Column(Integer, default=0)
    
    # Intertek format fields
    action_plan = Column(Text, nullable=True)
    timeline = Column(Text, nullable=True)
    resources_required = Column(Text, nullable=True)
    effectiveness_criteria = Column(Text, nullable=True)
    follow_up_actions = Column(Text, nullable=True)
