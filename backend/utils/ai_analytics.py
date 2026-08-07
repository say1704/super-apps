"""
AI Analytics — Anomaly detection and predictive trend analysis.
Uses LLM to analyze historical data patterns and detect outliers/predict trends.
"""
import json
import logging
from datetime import datetime, timezone, date, timedelta
from typing import Any, Dict, List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func

logger = logging.getLogger(__name__)


async def detect_anomalies(
    db: Session,
    module: str,
    user_id: int,
    role: str,
    accessible_modules: list[str],
) -> Dict[str, Any]:
    """Detect anomalies in the specified module's recent data."""
    import importlib
    from sqlalchemy import text
    models_module = importlib.import_module("models")

    anomalies = []
    stats = {}

    # ── INCIDENT ANOMALIES ────────────────────────────────
    if module in ("incident_report", "all") and (role == "superadmin" or "incident" in accessible_modules):
        ir = getattr(models_module, "IncidentReport", None)
        if ir:
            today = date.today()
            thirty_days_ago = today - timedelta(days=30)
            # Count incidents in last 30 days
            recent = db.query(func.count(ir.id)).filter(
                ir.incident_date >= thirty_days_ago,
            ).scalar() or 0
            # Compare with previous 30 days
            prev = db.query(func.count(ir.id)).filter(
                ir.incident_date >= thirty_days_ago - timedelta(days=30),
                ir.incident_date < thirty_days_ago,
            ).scalar() or 0
            stats["incidents_30d"] = recent
            stats["incidents_prev_30d"] = prev
            if prev > 0 and recent > prev * 1.5:
                anomalies.append({
                    "module": "incident_report",
                    "type": "spike",
                    "severity": "high",
                    "message": f"Lonjakan insiden: {recent} dalam 30 hari terakhir (naik {((recent-prev)/prev*100):.0f}% dari periode sebelumnya {prev})",
                    "current": recent,
                    "baseline": prev,
                    "suggested_action": "Tinjau penyebab lonjakan insiden",
                })

    # ── TASK ANOMALIES ────────────────────────────────────
    if module in ("project_tasks", "all") and (role == "superadmin" or "tasks" in accessible_modules):
        pt = getattr(models_module, "ProjectTask", None)
        if pt and hasattr(pt, "due_date") and hasattr(pt, "status") and hasattr(pt, "deleted_at"):
            overdue = db.query(func.count(pt.id)).filter(
                pt.deleted_at.is_(None),
                pt.due_date < today,
                pt.status.notin_(["done", "completed", "cancelled"]),
            ).scalar() or 0
            total_active = db.query(func.count(pt.id)).filter(
                pt.deleted_at.is_(None),
                pt.status.notin_(["done", "completed", "cancelled"]),
            ).scalar() or 0
            stats["overdue_tasks"] = overdue
            stats["active_tasks"] = total_active
            if total_active > 0 and overdue > total_active * 0.3:
                anomalies.append({
                    "module": "project_tasks",
                    "type": "overdue_rate",
                    "severity": "medium",
                    "message": f"Tingkat keterlambatan task tinggi: {overdue}/{total_active} task overdue ({overdue*100//total_active}%)",
                    "current": overdue,
                    "baseline": total_active,
                    "suggested_action": "Prioritaskan task yang mendekati deadline",
                })

    # ── BACKUP ANOMALIES ─────────────────────────────────
    if module in ("backup_history", "all") and (role == "superadmin" or "backup" in accessible_modules):
        bh = getattr(models_module, "BackupHistory", None)
        if bh:
            recent_backups = db.query(func.count(bh.id)).filter(
                bh.backup_date >= today - timedelta(days=7),
            ).scalar() or 0
            stats["backups_7d"] = recent_backups
            # Count servers
            servers = db.query(bh.server_name).distinct().count()
            stats["backup_servers"] = servers
            if servers > 0 and recent_backups < servers * 3:  # Less than 3 backups per server in 7 days
                anomalies.append({
                    "module": "backup_history",
                    "type": "low_backup_frequency",
                    "severity": "high",
                    "message": f"Frekuensi backup rendah: {recent_backups} backup dalam 7 hari untuk {servers} server",
                    "current": recent_backups,
                    "baseline": servers * 7,
                    "suggested_action": "Periksa jadwal backup server",
                })

    # ── CAPACITY ANOMALIES ────────────────────────────────
    if module in ("capacity_metrics", "all") and (role == "superadmin" or "capacity" in accessible_modules):
        cm = getattr(models_module, "CapacityMetrics", None)
        if cm and hasattr(cm, "status"):
            warnings = db.query(func.count(cm.id)).filter(
                cm.status.in_(["warning", "critical"]),
            ).scalar() or 0
            stats["capacity_warnings"] = warnings
            if warnings > 0:
                anomalies.append({
                    "module": "capacity_metrics",
                    "type": "capacity_warning",
                    "severity": "medium",
                    "message": f"{warnings} server dalam status warning/critical kapasitas",
                    "current": warnings,
                    "suggested_action": "Cek kapasitas server yang bermasalah",
                })

    # ── LLM ENHANCED ANALYSIS ─────────────────────────────
    narrative = ""
    if len(anomalies) > 0:
        narrative = await _generate_anomaly_narrative(anomalies, stats)

    return {
        "module": module,
        "anomalies": anomalies,
        "stats": stats,
        "narrative": narrative,
        "total_anomalies": len(anomalies),
    }


async def predict_trend(
    db: Session,
    module: str,
    metric: str,
    horizon_days: int = 30,
) -> Dict[str, Any]:
    """Predict trends based on historical data."""
    import importlib
    models_module = importlib.import_module("models")
    today = date.today()

    predictions = {"module": module, "metric": metric, "horizon_days": horizon_days, "forecast": {}}

    if module == "incident_report" and metric == "count":
        ir = getattr(models_module, "IncidentReport", None)
        if ir:
            # Daily incident counts for last 90 days
            daily_counts = []
            for i in range(90, 0, -1):
                day = today - timedelta(days=i)
                count = db.query(func.count(ir.id)).filter(
                    ir.incident_date == day,
                ).scalar() or 0
                daily_counts.append({"date": day.isoformat(), "count": count})

            # Simple linear projection
            recent_avg = sum(d["count"] for d in daily_counts[-30:]) / 30 if daily_counts else 0
            prev_avg = sum(d["count"] for d in daily_counts[:30]) / 30 if daily_counts else 0
            trend = recent_avg - prev_avg

            forecast = []
            for day_offset in range(1, horizon_days + 1):
                forecast_date = today + timedelta(days=day_offset)
                predicted = max(0, round(recent_avg + trend * (day_offset / 30), 1))
                forecast.append({"date": forecast_date.isoformat(), "predicted": predicted})

            predictions["forecast"] = {
                "daily": daily_counts[-30:],
                "forecast": forecast,
                "trend": "increasing" if trend > 0 else "decreasing" if trend < 0 else "stable",
                "daily_average": round(recent_avg, 1),
                "trend_magnitude": round(trend, 2),
            }
            predictions["narrative"] = (
                f"Rata-rata insiden harian: {recent_avg:.1f}. "
                f"{'Meningkat' if trend > 0 else 'Menurun' if trend < 0 else 'Stabil'} "
                f"dengan tren {abs(trend):.2f} per hari."
            )

    elif module == "capacity_metrics" and metric == "usage":
        cm = getattr(models_module, "CapacityMetrics", None)
        if cm:
            recent = db.query(cm).order_by(cm.tanggal.desc()).limit(30).all()
            if recent:
                avg_usage = sum(
                    getattr(r, "cpu_usage", 0) or 0
                    for r in recent
                ) / len(recent)
                predictions["forecast"] = {
                    "current_avg": round(avg_usage, 1),
                    "sample_size": len(recent),
                }
                predictions["narrative"] = (
                    f"Rata-rata penggunaan CPU: {avg_usage:.1f}%. "
                    f"Data dari {len(recent)} sampel terakhir."
                )

    return predictions


async def _generate_anomaly_narrative(anomalies: list, stats: dict) -> str:
    """Use LLM to generate an anomaly analysis narrative."""
    from utils.ai_engine import query_llm

    summary = "\n".join(f"- [{a['severity']}] {a['message']}" for a in anomalies)
    prompt = (
        "Analisis anomali berikut dalam Bahasa Indonesia:\n"
        f"{summary}\n\n"
        "Beri rekomendasi tindakan yang spesifik."
    )
    try:
        return await query_llm(
            [{"role": "system", "content": "Kamu asisten analis IT."},
             {"role": "user", "content": prompt}],
            max_tokens=400, temperature=0.3,
        )
    except Exception as e:
        logger.debug("LLM anomaly narrative failed: %s", e)
        return ""
