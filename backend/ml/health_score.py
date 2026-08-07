"""
Backup Health Score Calculator
===============================
Computes a single health score (0-100) per server based on:
- Consistency (30%): How regular are backups? (low variance = good)
- Growth Rate (20%): Is growth manageable? (slow/stable = good)
- Anomaly Rate (25%): How often anomalies occur? (few = good)
- Status History (15%): OK/Warning/Critical ratio over last 30 days
- Data Freshness (10%): Last backup within 24hrs?
"""

from datetime import datetime, date, timedelta
from typing import Optional
import math


def calculate_health_score(
    backup_dates: list[date],
    sizes: list[int],
    statuses: list[str],
    anomaly_count: int = 0,
    total_days: int = 30,
) -> dict:
    """
    Calculate backup health score (0-100) for a server.
    
    Args:
        backup_dates: List of backup dates (sorted)
        sizes: List of backup sizes in bytes (same order as dates)
        statuses: List of status strings (OK/Warning/Critical)
        anomaly_count: Number of anomalies detected
        total_days: Window for evaluation (default 30 days)
    
    Returns:
        {
            "score": int (0-100),
            "grade": str (A/B/C/D/F),
            "consistency_score": float (0-100),
            "growth_score": float (0-100),
            "anomaly_score": float (0-100),
            "status_score": float (0-100),
            "freshness_score": float (0-100),
            "factors": list[str] (explanation of deductions)
        }
    """
    if not backup_dates or not sizes:
        return {
            "score": 0,
            "grade": "F",
            "consistency_score": 0,
            "growth_score": 0,
            "anomaly_score": 0,
            "status_score": 0,
            "freshness_score": 0,
            "factors": ["No backup data available"]
        }
    
    factors = []
    
    # 1. CONSISTENCY (30%) - How regular are backups?
    consistency_score = _calculate_consistency(backup_dates, total_days)
    if consistency_score < 50:
        factors.append(f"Low backup consistency ({consistency_score:.0f}%)")
    
    # 2. GROWTH RATE (20%) - Is growth manageable?
    growth_score = _calculate_growth_score(sizes)
    if growth_score < 50:
        factors.append(f"High growth rate ({growth_score:.0f}%)")
    
    # 3. ANOMALY RATE (25%) - How often anomalies occur?
    anomaly_score = _calculate_anomaly_score(anomaly_count, len(backup_dates))
    if anomaly_score < 50:
        factors.append(f"High anomaly rate ({anomaly_score:.0f}%)")
    
    # 4. STATUS HISTORY (15%) - OK/Warning/Critical ratio
    status_score = _calculate_status_score(statuses)
    if status_score < 50:
        factors.append(f"Poor status history ({status_score:.0f}%)")
    
    # 5. DATA FRESHNESS (10%) - Last backup within 24hrs?
    freshness_score = _calculate_freshness(backup_dates)
    if freshness_score < 50:
        factors.append(f"Stale backup data ({freshness_score:.0f}%)")
    
    # Weighted total
    total = (
        consistency_score * 0.30 +
        growth_score * 0.20 +
        anomaly_score * 0.25 +
        status_score * 0.15 +
        freshness_score * 0.10
    )
    
    score = max(0, min(100, int(round(total))))
    grade = _score_to_grade(score)
    
    if not factors:
        factors.append("All metrics healthy")
    
    return {
        "score": score,
        "grade": grade,
        "consistency_score": round(consistency_score, 1),
        "growth_score": round(growth_score, 1),
        "anomaly_score": round(anomaly_score, 1),
        "status_score": round(status_score, 1),
        "freshness_score": round(freshness_score, 1),
        "factors": factors
    }


def _calculate_consistency(backup_dates: list[date], total_days: int) -> float:
    """
    Consistency = (actual_backup_days / expected_backup_days) * 100
    
    Expected: 1 backup per day. If server backs up weekly, expected = total_days / 7.
    We use the actual backup frequency to determine expected count.
    """
    if len(backup_dates) < 2:
        return 30.0  # Not enough data
    
    # Calculate actual backup frequency
    date_set = set(backup_dates)
    backup_count = len(date_set)
    
    # Calculate average interval between backups
    sorted_dates = sorted(backup_dates)
    intervals = []
    for i in range(1, len(sorted_dates)):
        gap = (sorted_dates[i] - sorted_dates[i-1]).days
        if gap > 0:
            intervals.append(gap)
    
    if not intervals:
        return 50.0
    
    avg_interval = sum(intervals) / len(intervals)
    
    # Expected backup count based on actual frequency
    if avg_interval <= 1:
        expected = total_days  # Daily backups
    elif avg_interval <= 2:
        expected = total_days / 2  # Every other day
    elif avg_interval <= 7:
        expected = total_days / avg_interval  # Weekly-ish
    else:
        expected = total_days / avg_interval  # Less frequent
    
    # Consistency = actual / expected (capped at 100%)
    ratio = min(1.0, backup_count / max(1, expected))
    
    # Penalize for high variance in intervals
    if len(intervals) > 1:
        mean = sum(intervals) / len(intervals)
        variance = sum((x - mean) ** 2 for x in intervals) / len(intervals)
        std_dev = math.sqrt(variance)
        cv = std_dev / mean if mean > 0 else 0  # Coefficient of variation
        
        # High CV = inconsistent timing
        consistency_penalty = max(0, 1 - cv * 0.5)
        ratio *= consistency_penalty
    
    return ratio * 100


def _calculate_growth_score(sizes: list[int]) -> float:
    """
    Growth score: Low/slow growth = good, explosive growth = bad.
    
    Score based on daily growth percentage:
    - < 1% per day: 100
    - 1-3% per day: 80
    - 3-5% per day: 60
    - 5-10% per day: 40
    - > 10% per day: 20
    """
    if len(sizes) < 2:
        return 70.0  # Not enough data to determine
    
    # Calculate daily growth rate
    first = sizes[0]
    last = sizes[-1]
    
    if first == 0:
        return 50.0
    
    total_growth_pct = ((last - first) / first) * 100
    days = max(1, len(sizes) - 1)
    daily_growth_pct = total_growth_pct / days
    
    # Negative growth (shrinking) is generally good for storage
    if daily_growth_pct <= 0:
        return 100.0
    
    if daily_growth_pct < 1:
        return 95.0
    elif daily_growth_pct < 3:
        return 80.0
    elif daily_growth_pct < 5:
        return 60.0
    elif daily_growth_pct < 10:
        return 40.0
    else:
        return 20.0


def _calculate_anomaly_score(anomaly_count: int, total_backups: int) -> float:
    """
    Anomaly score: Few anomalies = good, many = bad.
    
    Score based on anomaly rate:
    - 0 anomalies: 100
    - < 5%: 80
    - 5-10%: 60
    - 10-20%: 40
    - > 20%: 20
    """
    if total_backups == 0:
        return 70.0
    
    anomaly_rate = (anomaly_count / total_backups) * 100
    
    if anomaly_count == 0:
        return 100.0
    elif anomaly_rate < 5:
        return 80.0
    elif anomaly_rate < 10:
        return 60.0
    elif anomaly_rate < 20:
        return 40.0
    else:
        return 20.0


def _calculate_status_score(statuses: list[str]) -> float:
    """
    Status score: Based on OK/Warning/Critical ratio.
    
    OK = 100 points, Warning = 50 points, Critical = 0 points
    """
    if not statuses:
        return 70.0
    
    total = len(statuses)
    score = 0
    
    for status in statuses:
        s = status.lower()
        if s == "ok":
            score += 100
        elif s == "warning":
            score += 50
        elif s == "critical":
            score += 0
        else:
            score += 70  # Unknown status
    
    return (score / total) if total > 0 else 70.0


def _calculate_freshness(backup_dates: list[date]) -> float:
    """
    Freshness score: How recent is the last backup?
    
    - Within 24 hours: 100
    - Within 2 days: 80
    - Within 7 days: 50
    - Within 14 days: 30
    - > 14 days: 10
    """
    if not backup_dates:
        return 0.0
    
    last_backup = max(backup_dates)
    today = date.today()
    days_ago = (today - last_backup).days
    
    if days_ago <= 1:
        return 100.0
    elif days_ago <= 2:
        return 80.0
    elif days_ago <= 7:
        return 50.0
    elif days_ago <= 14:
        return 30.0
    else:
        return 10.0


def _score_to_grade(score: int) -> str:
    """Convert numeric score to letter grade."""
    if score >= 90:
        return "A"
    elif score >= 80:
        return "B"
    elif score >= 70:
        return "C"
    elif score >= 60:
        return "D"
    else:
        return "F"
