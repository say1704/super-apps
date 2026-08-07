"""
Backup Failure Risk Prediction
================================
Predicts the probability that a server will miss a backup in the next 7 days.

Features used:
- Historical miss rate (days with 0 files or 0 bytes)
- Recent trend (is size declining?)
- Anomaly frequency
- Time since last successful backup
- Day of week patterns
- Server monitoring age
"""

from datetime import date, timedelta
from typing import Optional
import math


def predict_failure_risk(
    backup_dates: list[date],
    sizes: list[int],
    jumlah_files: list[int],
    statuses: list[str],
    anomaly_count: int = 0,
    prediction_days: int = 7,
) -> dict:
    """
    Predict backup failure risk for the next N days.
    
    Args:
        backup_dates: List of backup dates
        sizes: List of backup sizes in bytes
        jumlah_files: List of file counts
        statuses: List of status strings (OK/Warning/Critical)
        anomaly_count: Number of anomalies detected
        prediction_days: Days ahead to predict (default 7)
    
    Returns:
        {
            "risk_score": float (0-100),
            "risk_level": str (low/medium/high/critical),
            "probability": float (0-1),
            "risk_factors": list[str],
            "recommendations": list[str]
        }
    """
    if not backup_dates or not sizes:
        return {
            "risk_score": 80,
            "risk_level": "critical",
            "probability": 0.8,
            "risk_factors": ["No backup data available"],
            "recommendations": ["Immediately investigate backup configuration"]
        }
    
    risk_factors = []
    recommendations = []
    risk_score = 0
    
    # Factor 1: Miss rate (weight: 30)
    miss_rate = _calculate_miss_rate(backup_dates)
    miss_score = miss_rate * 100  # 0-100
    risk_score += miss_score * 0.30
    
    if miss_rate > 0.3:
        risk_factors.append(f"High miss rate: {miss_rate:.0%} of days have no backup")
        recommendations.append("Investigate why backups are being skipped")
    elif miss_rate > 0.1:
        risk_factors.append(f"Moderate miss rate: {miss_rate:.0%} of days have no backup")
        recommendations.append("Review backup schedule and logs")
    
    # Factor 2: Declining trend (weight: 20)
    declining = _is_declining(sizes)
    if declining:
        risk_score += 80 * 0.20
        risk_factors.append("Backup size is declining (possible data loss)")
        recommendations.append("Check if backup source data is being deleted")
    else:
        risk_score += 20 * 0.20
    
    # Factor 3: Anomaly frequency (weight: 20)
    total_backups = len(sizes)
    anomaly_rate = anomaly_count / max(1, total_backups)
    anomaly_score = min(100, anomaly_rate * 500)  # Scale up
    risk_score += anomaly_score * 0.20
    
    if anomaly_rate > 0.2:
        risk_factors.append(f"High anomaly rate: {anomaly_rate:.0%} of backups are anomalous")
        recommendations.append("Investigate root cause of backup anomalies")
    
    # Factor 4: Freshness (weight: 15)
    freshness_days = _get_freshness_days(backup_dates)
    if freshness_days > 7:
        risk_score += 100 * 0.15
        risk_factors.append(f"Last backup was {freshness_days} days ago")
        recommendations.append("Run backup immediately")
    elif freshness_days > 3:
        risk_score += 60 * 0.15
        risk_factors.append(f"Last backup was {freshness_days} days ago")
    elif freshness_days > 1:
        risk_score += 30 * 0.15
    else:
        risk_score += 10 * 0.15
    
    # Factor 5: Status history (weight: 15)
    critical_rate = _calculate_critical_rate(statuses)
    status_score = critical_rate * 100
    risk_score += status_score * 0.15
    
    if critical_rate > 0.3:
        risk_factors.append(f"High critical status rate: {critical_rate:.0%}")
        recommendations.append("Review backup infrastructure health")
    elif critical_rate > 0.1:
        risk_factors.append(f"Moderate critical status rate: {critical_rate:.0%}")
    
    # Factor 6: File count consistency (weight: 10)
    file_consistency = _calculate_file_consistency(jumlah_files)
    file_score = (1 - file_consistency) * 100
    risk_score += file_score * 0.10
    
    if file_consistency < 0.5:
        risk_factors.append("Inconsistent file counts (possible partial backups)")
        recommendations.append("Verify backup completeness")
    
    # Clamp score
    risk_score = max(0, min(100, int(round(risk_score))))
    
    # Determine risk level
    if risk_score >= 80:
        risk_level = "critical"
        probability = risk_score / 100
        if not recommendations:
            recommendations.append("Immediate action required")
    elif risk_score >= 60:
        risk_level = "high"
        probability = risk_score / 100
        if not recommendations:
            recommendations.append("Monitor closely and investigate risk factors")
    elif risk_score >= 30:
        risk_level = "medium"
        probability = risk_score / 100
        if not recommendations:
            recommendations.append("Continue monitoring")
    else:
        risk_level = "low"
        probability = risk_score / 100
        if not recommendations:
            recommendations.append("Backup health is good")
    
    return {
        "risk_score": risk_score,
        "risk_level": risk_level,
        "probability": round(probability, 2),
        "risk_factors": risk_factors,
        "recommendations": recommendations,
        "prediction_days": prediction_days
    }


def _calculate_miss_rate(backup_dates: list[date]) -> float:
    """
    Calculate the rate of missed backups.
    
    Miss rate = 1 - (unique_backup_days / total_span_days)
    """
    if len(backup_dates) < 2:
        return 0.5  # Not enough data, assume moderate risk
    
    sorted_dates = sorted(backup_dates)
    total_span = (sorted_dates[-1] - sorted_dates[0]).days
    
    if total_span == 0:
        return 0.0
    
    unique_days = len(set(backup_dates))
    miss_rate = 1 - (unique_days / total_span)
    
    return max(0, min(1, miss_rate))


def _is_declining(sizes: list[int]) -> bool:
    """
    Check if backup sizes are declining over time.
    
    Uses linear regression slope: negative slope = declining.
    """
    if len(sizes) < 3:
        return False
    
    n = len(sizes)
    x_mean = (n - 1) / 2
    y_mean = sum(sizes) / n
    
    numerator = 0
    denominator = 0
    for i, size in enumerate(sizes):
        numerator += (i - x_mean) * (size - y_mean)
        denominator += (i - x_mean) ** 2
    
    if denominator == 0:
        return False
    
    slope = numerator / denominator
    
    # Declining if slope is negative and significant (>5% of mean)
    return slope < 0 and abs(slope) > (y_mean * 0.05)


def _get_freshness_days(backup_dates: list[date]) -> int:
    """Get days since last backup."""
    if not backup_dates:
        return 999
    
    last_backup = max(backup_dates)
    return (date.today() - last_backup).days


def _calculate_critical_rate(statuses: list[str]) -> float:
    """Calculate the rate of Critical status."""
    if not statuses:
        return 0.0
    
    critical_count = sum(1 for s in statuses if s.lower() == "critical")
    return critical_count / len(statuses)


def _calculate_file_consistency(jumlah_files: list[int]) -> float:
    """
    Calculate file count consistency.
    
    Returns 1.0 if all file counts are similar, 0.0 if highly variable.
    """
    if len(jumlah_files) < 2:
        return 0.7
    
    mean = sum(jumlah_files) / len(jumlah_files)
    if mean == 0:
        return 0.0
    
    variance = sum((x - mean) ** 2 for x in jumlah_files) / len(jumlah_files)
    std_dev = math.sqrt(variance)
    cv = std_dev / mean
    
    # Convert CV to consistency (low CV = high consistency)
    consistency = max(0, 1 - cv)
    
    return consistency
