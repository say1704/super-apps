"""AI/ML anomaly detection findings (cross-module).

Diisi oleh utils/anomaly_engine (on-demand via /anomaly/scan atau job harian). Satu baris
per (module, entity, signal_type, period_to) via `fingerprint` (upsert/dedupe).
"""
from .base import Base
from sqlalchemy import Column, Integer, String, Float, Date, DateTime, Text, ForeignKey, Index, UniqueConstraint
from datetime import datetime, timezone
from utils.timezone import to_iso


class AnomalyFinding(Base):
    __tablename__ = "anomaly_finding"
    __table_args__ = (
        UniqueConstraint("fingerprint", name="uq_anomaly_fingerprint"),
        Index("ix_anomaly_module_status", "module", "status"),
    )

    id = Column(Integer, primary_key=True, index=True)
    module = Column(String, nullable=False, index=True)      # ssh-report, capacity, vulnerability, ...
    entity = Column(String, nullable=True, index=True)       # host / server_ip / source_ip
    signal_type = Column(String, nullable=False)             # ssh_bruteforce_spike, new_source_ip, ...
    severity = Column(String, nullable=False, default="low", index=True)  # low|medium|high|critical
    score = Column(Float, default=0.0)                       # skor/keyakinan relatif
    status = Column(String, nullable=False, default="open", index=True)   # open|ack|resolved

    title = Column(String, nullable=True)
    message = Column(Text, nullable=True)
    narrative = Column(Text, nullable=True)                  # penjelasan + rekomendasi (LLM)

    metric_current = Column(Float, nullable=True)
    metric_baseline = Column(Float, nullable=True)

    period_from = Column(Date, nullable=True)
    period_to = Column(Date, nullable=True, index=True)
    detected_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    fingerprint = Column(String, nullable=False, index=True)
    owner_role = Column(String, nullable=True, index=True)
    acked_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    acked_at = Column(DateTime, nullable=True)

    def to_dict(self):
        return {
            "id": self.id,
            "module": self.module,
            "entity": self.entity,
            "signal_type": self.signal_type,
            "severity": self.severity,
            "score": self.score,
            "status": self.status,
            "title": self.title,
            "message": self.message,
            "narrative": self.narrative,
            "metric_current": self.metric_current,
            "metric_baseline": self.metric_baseline,
            "period_from": self.period_from.isoformat() if self.period_from else None,
            "period_to": self.period_to.isoformat() if self.period_to else None,
            "detected_at": to_iso(self.detected_at),
            "acked_by": self.acked_by,
            "acked_at": to_iso(self.acked_at) if self.acked_at else None,
        }
