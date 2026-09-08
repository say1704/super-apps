"""Application & Software Inventory models.

Diisi oleh proses SAR (proses ke-2) yang mem-parsing log
`YYYYMMDD_application-<hostname>.log`. Per-item agar bisa komparasi antar-tanggal.
"""
from .base import Base
from sqlalchemy import Column, Integer, String, Date, DateTime, Text, ForeignKey, Index, UniqueConstraint
from datetime import datetime, timezone
from utils.timezone import to_iso


class InventorySnapshot(Base):
    """Satu baris ringkasan per (hostname, collection_date)."""
    __tablename__ = "inventory_snapshot"
    __table_args__ = (
        UniqueConstraint("hostname", "collection_date", name="uq_inventory_snapshot"),
    )

    id = Column(Integer, primary_key=True, index=True)
    hostname = Column(String, nullable=False, index=True)
    ip_address = Column(String, nullable=True)
    collection_date = Column(Date, nullable=False, index=True)
    collection_time = Column(String, nullable=True)
    os_package_type = Column(String, nullable=True)
    package_manager = Column(String, nullable=True)
    total_jars_running = Column(Integer, default=0)
    total_software = Column(Integer, default=0)
    log_file = Column(String, nullable=True)
    parsed_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    owner_role = Column(String, nullable=True, index=True)

    def to_dict(self):
        return {
            "id": self.id,
            "hostname": self.hostname,
            "ip_address": self.ip_address,
            "collection_date": self.collection_date.isoformat() if self.collection_date else None,
            "collection_time": self.collection_time,
            "os_package_type": self.os_package_type,
            "package_manager": self.package_manager,
            "total_jars_running": self.total_jars_running,
            "total_software": self.total_software,
            "log_file": self.log_file,
            "parsed_at": to_iso(self.parsed_at),
        }


class InventoryJar(Base):
    """Satu baris per aplikasi Java/JAR yang running pada suatu snapshot."""
    __tablename__ = "inventory_jar"
    __table_args__ = (
        Index("ix_inventory_jar_host_date", "hostname", "collection_date"),
    )

    id = Column(Integer, primary_key=True, index=True)
    hostname = Column(String, nullable=False, index=True)
    collection_date = Column(Date, nullable=False, index=True)
    proc_user = Column(String, nullable=True)
    pid = Column(Integer, nullable=True)
    start_token = Column(String, nullable=True)
    jar_name = Column(String, nullable=True, index=True)
    jar_path = Column(String, nullable=True)
    command_raw = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            "id": self.id,
            "hostname": self.hostname,
            "collection_date": self.collection_date.isoformat() if self.collection_date else None,
            "proc_user": self.proc_user,
            "pid": self.pid,
            "start_token": self.start_token,
            "jar_name": self.jar_name,
            "jar_path": self.jar_path,
            "command_raw": self.command_raw,
        }


class InventorySoftware(Base):
    """Satu baris per paket software terinstall pada suatu snapshot."""
    __tablename__ = "inventory_software"
    __table_args__ = (
        Index("ix_inventory_software_host_date", "hostname", "collection_date"),
    )

    id = Column(Integer, primary_key=True, index=True)
    hostname = Column(String, nullable=False, index=True)
    collection_date = Column(Date, nullable=False, index=True)
    name = Column(String, nullable=False, index=True)
    version = Column(String, nullable=True)
    arch = Column(String, nullable=True)
    executable = Column(String, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            "id": self.id,
            "hostname": self.hostname,
            "collection_date": self.collection_date.isoformat() if self.collection_date else None,
            "name": self.name,
            "version": self.version,
            "arch": self.arch,
            "executable": self.executable,
        }
