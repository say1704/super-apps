from utils.timezone import utcnow
"""
Capacity Projection Calculator
Uses linear regression to predict when metrics will reach critical thresholds
Supports: Disk (100%), CPU (90%), RAM (90%) with multi-tier predictions
"""
from datetime import datetime, timedelta
from typing import List, Dict, Optional


def linear_regression(x: List[float], y: List[float]) -> tuple:
    """
    Simple linear regression: y = mx + b
    Returns: (slope, intercept, r_squared)
    """
    n = len(x)
    if n < 2:
        return 0, 0, 0

    sum_x = sum(x)
    sum_y = sum(y)
    sum_xy = sum(xi * yi for xi, yi in zip(x, y))
    sum_x2 = sum(xi ** 2 for xi in x)

    denominator = (n * sum_x2 - sum_x ** 2)
    if denominator == 0:
        return 0, sum_y / n if n > 0 else 0, 0

    m = (n * sum_xy - sum_x * sum_y) / denominator
    b = (sum_y - m * sum_x) / n

    # R-squared
    y_mean = sum_y / n
    ss_tot = sum((yi - y_mean) ** 2 for yi in y)
    ss_res = sum((yi - (m * xi + b)) ** 2 for xi, yi in zip(x, y))
    r_squared = 1 - (ss_res / ss_tot) if ss_tot > 0 else 0

    return m, b, r_squared


def _metric_label(metric_type: str) -> str:
    """Human-readable label for recommendations"""
    labels = {
        "disk": "Penggunaan disk",
        "cpu": "CPU peak usage",
        "ram": "RAM peak usage",
    }
    return labels.get(metric_type, metric_type)


def _generate_actions(metric_type: str, urgency: str, status: str, current_use_pct: float, days_left: Optional[int] = None) -> List[str]:
    """Generate actionable suggestions based on metric type, urgency, and status"""
    actions = []

    # ── DISK ─────────────────────────────────────────────────────────
    if metric_type == "disk":
        if urgency == "critical" or status == "at_or_above_threshold":
            actions.append("🗑️ Bersihkan file log/artefak lama (rm -rf /var/log/*.gz, truncate logs)")
            actions.append("📦 Archive data lama ke NFS/external storage")
            actions.append("🔍 Identifikasi file terbesar: du -sh /* | sort -rh | head -20")
            actions.append("💾 Pertimbangkan expand disk capacity atau LVM resize")
        elif urgency == "warning":
            actions.append("📊 Monitor pertumbuhan disk: watch df -h")
            actions.append("🗑️ Jadwalkan cleanup rutin untuk log/cache")
            actions.append("📦 Mulai archive data yang jarang diakses")
            actions.append("⏳ Plan expand disk sebelum mencapai 100%")
        else:
            actions.append("📈 Monitoring rutin pertumbuhan disk")
            actions.append("✅ Tidak ada tindakan diperlukan saat ini")

    # ── CPU ──────────────────────────────────────────────────────────
    elif metric_type == "cpu":
        if urgency == "critical" or status == "at_or_above_threshold":
            actions.append("🔍 Identifikasi proses boros CPU: ps -eo %cpu,pid,cmd --sort=-%cpu | head -20")
            actions.append("⚡ Scale up: upgrade ke CPU core lebih banyak / instance lebih besar")
            actions.append("🔄 Scale out: tambah node + load balancer")
            actions.append("📊 Cek process tree untuk runaway process: htop / top")
        elif urgency == "warning":
            actions.append("📈 Review workload pattern — optimasi yang bisa dilakukan?")
            actions.append("🔧 Pertimbangkan resource limit: cgoup/cpu_quota per-process")
            actions.append("⏳ Plan scale up sebelum traffic peak berikutnya")
        else:
            actions.append("📈 Monitoring rutin CPU usage")
            actions.append("✅ Tidak ada tindakan diperlukan saat ini")

    # ── RAM ──────────────────────────────────────────────────────────
    elif metric_type == "ram":
        if urgency == "critical" or status == "at_or_above_threshold":
            actions.append("🔍 Identifikasi proses boros RAM: ps aux --sort=-%mem | head -20")
            actions.append("🧠 Upgrade memory (scale up ke instance RAM lebih besar)")
            actions.append("🐎 Cek memory leak: aplikasi yang RAM terus naik tanpa release")
            actions.append("⚡ Aktifkan swap jika belum ada (emergency saja, akan lambat)")
        elif urgency == "warning":
            actions.append("📊 Review memory allocation per-service")
            actions.append("🔄 Restart service yang memory footprint-nya tidak efisien")
            actions.append("⏳ Plan upgrade RAM sebelum mencapai threshold")
        else:
            actions.append("📈 Monitoring rutin memory usage")
            actions.append("✅ Tidak ada tindakan diperlukan saat ini")

    # ── INSUFFICIENT DATA ────────────────────────────────────────────
    if status == "insufficient_data":
        actions.append("📡 Lakukan scan harian minimal 2 hari untuk akumulasi data")
        actions.append("🔮 Proyeksi akan muncul setelah data cukup")

    return actions


def _calculate_confidence(r_squared: float, n: int) -> str:
    """
    Confidence based on R-squared and number of data points
    high:   R² >= 0.7 AND n >= 30
    medium: R² >= 0.5 OR  n >= 14
    low:    otherwise
    """
    if r_squared >= 0.7 and n >= 30:
        return "high"
    if r_squared >= 0.5 or n >= 14:
        return "medium"
    return "low"


def calculate_projection(
    historical_data: List[Dict],
    current_use_pct: float,
    partition_name: str,
    threshold: float = 100.0,
    metric_type: str = "disk",
) -> Dict:
    """
    Calculate capacity projection with linear regression.

    Args:
        historical_data: List of {"date": "YYYY-MM-DD", "use_pct": float}
        current_use_pct: Current usage percentage (latest value)
        partition_name:  Name of the partition/metric (e.g. "/", "CPU_Peak")
        threshold:       Critical threshold percentage (100 for disk, 90 for CPU/RAM)
        metric_type:     "disk", "cpu", or "ram" — controls recommendation wording

    Returns:
        Dict with full projection details
    """
    label = _metric_label(metric_type)

    # --- Minimum data check ---
    if len(historical_data) < 2:
        return {
            "partition": partition_name,
            "current_use_pct": current_use_pct,
            "threshold": threshold,
            "type": metric_type,
            "status": "insufficient_data",
            "slope_per_day": 0,
            "r_squared": 0,
            "days_to_threshold": None,
            "threshold_date": None,
            "prediction_1m": current_use_pct,
            "prediction_3m": current_use_pct,
            "prediction_6m": current_use_pct,
            "prediction_12m": current_use_pct,
            "urgency": "safe",
            "recommendation": "Data tidak cukup untuk proyeksi (minimal 2 titik data)",
            "actions": _generate_actions(metric_type, "safe", "insufficient_data", current_use_pct),
            "trend": "unknown",
            "confidence": "low",
            "data_points": len(historical_data),
            "data_quality_warning": True,
        }

    # --- Prepare X (days from start) and Y (usage %) ---
    sorted_data = sorted(historical_data, key=lambda d: d["date"])
    start_date = datetime.strptime(sorted_data[0]["date"], "%Y-%m-%d")
    x_values = [
        (datetime.strptime(d["date"], "%Y-%m-%d") - start_date).days
        for d in sorted_data
    ]
    y_values = [d["use_pct"] for d in sorted_data]

    slope, intercept, r_squared = linear_regression(x_values, y_values)
    n = len(x_values)
    current_day = x_values[-1]

    # --- Confidence & quality ---
    confidence = _calculate_confidence(r_squared, n)
    data_quality_warning = n < 14

    # --- Multi-tier predictions ---
    prediction_1m = intercept + slope * (current_day + 30)
    prediction_3m = intercept + slope * (current_day + 90)
    prediction_6m = intercept + slope * (current_day + 180)
    prediction_12m = intercept + slope * (current_day + 365)

    # Clamp to [0, 100] for display sanity
    def clamp(v):
        return min(100.0, max(0.0, v))

    # --- Trend ---
    if slope > 0.001:
        trend = "increasing"
    elif slope < -0.001:
        trend = "decreasing"
    else:
        trend = "stable"

    # --- Edge-case: already at or above threshold ---
    if current_use_pct >= threshold:
        if current_use_pct > threshold:
            rec = (
                f"🚨 KRITIS! {label} sudah MELEBIHI threshold "
                f"(saat ini {current_use_pct:.0f}% >= {threshold:.0f}%). "
                f"Segera lakukan tindakan!"
            )
        else:
            rec = (
                f"🚨 KRITIS! {label} sudah MENCAPAI threshold "
                f"({current_use_pct:.0f}% >= {threshold:.0f}%). "
                f"Segera lakukan tindakan!"
            )
        return {
            "partition": partition_name,
            "current_use_pct": current_use_pct,
            "threshold": threshold,
            "type": metric_type,
            "status": "at_or_above_threshold",
            "slope_per_day": round(slope, 6),
            "r_squared": round(r_squared, 4),
            "days_to_threshold": 0,
            "threshold_date": utcnow().strftime("%Y-%m-%d"),
            "prediction_1m": clamp(prediction_1m),
            "prediction_3m": clamp(prediction_3m),
            "prediction_6m": clamp(prediction_6m),
            "prediction_12m": clamp(prediction_12m),
            "urgency": "critical",
            "recommendation": rec,
            "actions": _generate_actions(metric_type, "critical", "at_or_above_threshold", current_use_pct),
            "trend": trend,
            "confidence": confidence,
            "data_points": n,
            "data_quality_warning": data_quality_warning,
        }

    # --- Edge-case: slope <= 0 (stable or decreasing) ---
    if slope <= 0:
        if trend == "decreasing":
            rec = (
                f"✅ AMAN. {label} menurun. "
                f"Tidak diprediksi akan mencapai {threshold:.0f}%."
            )
        else:
            rec = (
                f"✅ AMAN. {label} stabil. "
                f"Tidak diprediksi akan mencapai {threshold:.0f}%."
            )
        return {
            "partition": partition_name,
            "current_use_pct": current_use_pct,
            "threshold": threshold,
            "type": metric_type,
            "status": "stable_or_decreasing",
            "slope_per_day": round(slope, 6),
            "r_squared": round(r_squared, 4),
            "days_to_threshold": None,
            "threshold_date": None,
            "prediction_1m": clamp(prediction_1m),
            "prediction_3m": clamp(prediction_3m),
            "prediction_6m": clamp(prediction_6m),
            "prediction_12m": clamp(prediction_12m),
            "urgency": "safe",
            "recommendation": rec,
            "actions": _generate_actions(metric_type, "safe", "stable_or_decreasing", current_use_pct),
            "trend": trend,
            "confidence": confidence,
            "data_points": n,
            "data_quality_warning": data_quality_warning,
        }

    # --- Main case: slope > 0, compute days to threshold ---
    _MAX_SAFE_DAYS = 2_900_000  # ~year 9999 in timedelta

    days_to_full_unbounded = (threshold - intercept) / slope
    days_to_threshold_raw = days_to_full_unbounded - current_day

    # Clamp to avoid datetime OverflowError
    if days_to_full_unbounded > _MAX_SAFE_DAYS:
        days_to_full_unbounded = _MAX_SAFE_DAYS
        days_to_threshold_raw = _MAX_SAFE_DAYS - current_day

    try:
        threshold_date = start_date + timedelta(days=days_to_full_unbounded)
        threshold_date_str = threshold_date.strftime("%Y-%m-%d")
    except (OverflowError, OSError):
        threshold_date_str = None
        days_to_threshold_raw = _MAX_SAFE_DAYS

    days_left = max(0, int(round(days_to_threshold_raw)))

    # --- Urgency & recommendation ---
    if days_left < 30:
        urgency = "critical"
        rec = (
            f"🚨 KRITIS! {label} diprediksi mencapai {threshold:.0f}% "
            f"dalam {days_left} hari "
            f"({threshold_date_str or 'tidak dapat dihitung'})"
        )
    elif days_left < 90:
        urgency = "warning"
        rec = (
            f"⚠️ WASPADA! {label} akan mencapai {threshold:.0f}% "
            f"dalam {days_left} hari "
            f"({threshold_date_str or 'tidak dapat dihitung'})"
        )
    else:
        urgency = "safe"
        rec = (
            f"✅ AMAN. Estimasi {label} mencapai {threshold:.0f}% "
            f"dalam {days_left} hari "
            f"({threshold_date_str or 'tidak dapat dihitung'})"
        )

    return {
        "partition": partition_name,
        "current_use_pct": current_use_pct,
        "threshold": threshold,
        "type": metric_type,
        "status": "projected",
        "slope_per_day": round(slope, 6),
        "r_squared": round(r_squared, 4),
        "days_to_threshold": days_left,
        "threshold_date": threshold_date_str,
        "prediction_1m": clamp(prediction_1m),
        "prediction_3m": clamp(prediction_3m),
        "prediction_6m": clamp(prediction_6m),
        "prediction_12m": clamp(prediction_12m),
        "urgency": urgency,
        "recommendation": rec,
        "actions": _generate_actions(metric_type, urgency, "projected", current_use_pct, days_left),
        "trend": trend,
        "confidence": confidence,
        "data_points": n,
        "data_quality_warning": data_quality_warning,
    }
