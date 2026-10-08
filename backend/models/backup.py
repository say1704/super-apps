from .base import Base
from sqlalchemy import Column, Integer, String, Float, Date, DateTime, ForeignKey, Boolean, Index, Text
from datetime import datetime, timezone
from utils.timezone import to_iso


class BackupHistory(Base):
    """TimescaleDB-compatible backup history for analytics"""
    __tablename__ = "backup_history"
    __table_args__ = (
        Index("ix_backup_history_server_date", "server_name", "backup_date"),
    )

    id = Column(Integer, primary_key=True, index=True)
    server_name = Column(String, nullable=False, index=True)
    backup_date = Column(Date, nullable=False, index=True)
    jumlah_files = Column(Integer, default=0)
    total_size_bytes = Column(Integer, default=0)
    total_size_kb = Column(Float, default=0)
    total_size_mb = Column(Float, default=0)
    total_size_gb = Column(Float, default=0)
    status = Column(String, default="OK")
    filename = Column(String)
    file_list = Column(Text, nullable=True)  # JSON: {"files":[{"path","section"}],"truncated":bool}; NULL for legacy records
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    owner_role = Column(String, nullable=True, index=True)

    def to_dict(self):
        return {
            "id": self.id,
            "server_name": self.server_name,
            "backup_date": self.backup_date.isoformat() if self.backup_date else None,
            "jumlah_files": self.jumlah_files,
            "total_size_bytes": self.total_size_bytes,
            "total_size_kb": self.total_size_kb,
            "total_size_mb": self.total_size_mb,
            "total_size_gb": self.total_size_gb,
            "total_size_formatted": self.format_size(self.total_size_bytes),
            "status": self.status,
            "filename": self.filename,
            "created_at": to_iso(self.created_at),
        }

    @staticmethod
    def format_size(size_bytes: int) -> str:
        """Format bytes to human readable size"""
        if size_bytes == 0:
            return "0 B"
        units = ['B', 'KB', 'MB', 'GB', 'TB']
        unit_index = 0
        size = float(size_bytes)
        while size >= 1024 and unit_index < len(units) - 1:
            size /= 1024
            unit_index += 1
        if unit_index == 0:
            return f"{int(size)} {units[unit_index]}"
        else:
            return f"{size:.2f} {units[unit_index]}"


class BackupSchedule(Base):
    """Automated database backup schedule configuration"""
    __tablename__ = "backup_schedule"

    id = Column(Integer, primary_key=True, index=True)
    frequency = Column(String, nullable=False, default="daily")
    time = Column(String, default="02:00")
    day_of_week = Column(Integer, nullable=True)
    day_of_month = Column(Integer, nullable=True)
    enabled = Column(Boolean, default=True)
    retention_days = Column(Integer, default=30)
    max_backups = Column(Integer, default=10)
    last_run = Column(DateTime, nullable=True)
    next_run = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
