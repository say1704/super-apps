from .base import Base
from sqlalchemy import Column, Integer, String, Text, Date, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime, timezone


class LogMaintenance(Base):
    __tablename__ = "log_maintenance"

    id = Column(Integer, primary_key=True, index=True)
    server = Column(String, nullable=False)
    path = Column(String)
    script_execution = Column(Text)
    execution_date = Column(Date)
    size = Column(String)
    notes = Column(Text)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    created_by = Column(Integer, ForeignKey("users.id"))
    owner_role = Column(String(50), nullable=True, index=True)
    deleted_at = Column(DateTime, nullable=True, index=True)
    version = Column(Integer, default=0)

class IrmcFolder(Base):
    __tablename__ = "irmc_folders"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    description = Column(Text)
    color = Column(String, default="blue")
    created_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    checks = relationship("IRMCCheck", back_populates="folder")


class IRMCCheck(Base):
    __tablename__ = "irmc_check"

    id = Column(Integer, primary_key=True, index=True)
    server_name = Column(String, nullable=False)
    check_date = Column(Date, nullable=False)
    screenshot_path = Column(String)
    notes = Column(Text)
    status = Column(String(20), default="pending")
    folder_id = Column(Integer, ForeignKey("irmc_folders.id"), nullable=True, index=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    created_by = Column(Integer, ForeignKey("users.id"))

    folder = relationship("IrmcFolder", back_populates="checks")


class MonthlyServerCheck(Base):
    __tablename__ = "monthly_server_check"

    id = Column(Integer, primary_key=True, index=True)
    ip_server = Column(String, nullable=False)
    month = Column(String, nullable=False)
    check_date = Column(Date, nullable=False)
    status = Column(String)
    notes = Column(Text)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    created_by = Column(Integer, ForeignKey("users.id"))
    version = Column(Integer, default=0)


class VulnerabilityReport(Base):
    __tablename__ = "vulnerability_report"

    id = Column(Integer, primary_key=True, index=True)
    server_ip = Column(String, nullable=False)
    scan_date = Column(Date, nullable=False)
    tools = Column(String)
    high_count = Column(Integer, default=0)
    medium_count = Column(Integer, default=0)
    low_count = Column(Integer, default=0)
    file_path = Column(String)
    notes = Column(Text)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    created_by = Column(Integer, ForeignKey("users.id"))
    owner_role = Column(String(50), nullable=True, index=True)


class IncidentReport(Base):
    __tablename__ = "incident_report"

    id = Column(Integer, primary_key=True, index=True)
    incident_date = Column(Date, nullable=False)
    server_name = Column(String, nullable=False)
    incident_type = Column(String)
    description = Column(Text, nullable=False)
    status = Column(String, default="Open")
    action_taken = Column(Text)
    file_path = Column(String)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    created_by = Column(Integer, ForeignKey("users.id"))
    owner_role = Column(String(50), nullable=True, index=True)
    version = Column(Integer, default=0)
