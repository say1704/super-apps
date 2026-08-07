"""
Anomaly Forecasting — Early Warning System
============================================
Predicts WHEN the next anomaly will occur by:
1. Using existing ML prediction to forecast future backup sizes
2. Comparing forecast against historical anomaly thresholds
3. Flagging dates where predicted size exceeds normal bounds
4. Providing "early warning" window (e.g., "Anomaly likely in 3-5 days")
"""

from datetime import date, timedelta
from typing import Optional
import math


def forecast_anomalies(
    backup_dates: list[date],
    sizes: list[int],
    predictions: list[dict],
    historical_anomalies: list[dict] = None,
) -> dict:
    """
    Forecast future anomalies based on ML predictions.
    
    Args:
        backup_dates: Historical backup dates
        sizes: Historical backup sizes in bytes
        predictions: ML predictions from predictor.py, format:
            [{"date": "2026-05-06", "predicted": 1234567890, "lower": ..., "upper": ...}]
        historical_anomalies: Previously detected anomalies (optional)
    
    Returns:
        {
            "has_warning": bool,
            "warning_days": int (days until predicted anomaly),
            "warning_date": str (predicted anomaly date),
            "predicted_size_gb": float,
            "threshold_gb": float,
            "severity": str (low/medium/high),
            "confidence": float (0-1),
            "message": str
        }
    """
    if not predictions:
        return {
            "has_warning": False,
            "warning_days": None,
            "warning_date": None,
            "predicted_size_gb": 0,
            "threshold_gb": 0,
            "severity": "none",
            "confidence": 0,
            "message": "No predictions available"
        }
    
    # Calculate historical anomaly threshold
    threshold = _calculate_anomaly_threshold(sizes, historical_anomalies)
    
    # Check each prediction against threshold
    today = date.today()
    earliest_warning = None
    earliest_days = None
    
    for pred in predictions:
        pred_date = pred.get("date")
        predicted_size = pred.get("predicted", 0)
        upper_bound = pred.get("upper", predicted_size * 1.1)
        
        if not pred_date:
            continue
        
        # Parse date
        if isinstance(pred_date, str):
            try:
                pred_date = date.fromisoformat(pred_date)
            except ValueError:
                continue
        
        # Check if prediction exceeds threshold
        if predicted_size > threshold or upper_bound > threshold:
            days_until = (pred_date - today).days
            if days_until > 0 and (earliest_days is None or days_until < earliest_days):
                earliest_days = days_until
                earliest_warning = {
                    "date": pred_date.isoformat(),
                    "predicted_size_gb": predicted_size / (1024 ** 3),
                    "upper_bound_gb": upper_bound / (1024 ** 3),
                    "threshold_gb": threshold / (1024 ** 3),
                    "days_until": days_until
                }
    
    if earliest_warning is None:
        return {
            "has_warning": False,
            "warning_days": None,
            "warning_date": None,
            "predicted_size_gb": 0,
            "threshold_gb": threshold / (1024 ** 3),
            "severity": "none",
            "confidence": 0,
            "message": "No anomalies predicted in forecast window"
        }
    
    # Determine severity based on how far prediction exceeds threshold
    excess_pct = (earliest_warning["predicted_size_gb"] / earliest_warning["threshold_gb"] - 1) * 100
    
    if excess_pct > 50:
        severity = "high"
        confidence = 0.8
    elif excess_pct > 20:
        severity = "medium"
        confidence = 0.7
    else:
        severity = "low"
        confidence = 0.6
    
    # Adjust confidence based on days until (closer = more confident)
    if earliest_days <= 3:
        confidence = min(0.95, confidence + 0.1)
    elif earliest_days > 14:
        confidence = max(0.3, confidence - 0.15)
    
    message = _generate_message(earliest_warning, severity, excess_pct)
    
    return {
        "has_warning": True,
        "warning_days": earliest_days,
        "warning_date": earliest_warning["date"],
        "predicted_size_gb": round(earliest_warning["predicted_size_gb"], 2),
        "threshold_gb": round(earliest_warning["threshold_gb"], 2),
        "severity": severity,
        "confidence": round(confidence, 2),
        "message": message
    }


def _calculate_anomaly_threshold(
    sizes: list[int],
    historical_anomalies: list[dict] = None,
) -> int:
    """
    Calculate the anomaly threshold based on historical data.
    
    Uses mean + 2*std_dev as the threshold.
    If historical anomalies exist, uses the minimum anomalous size.
    """
    if len(sizes) < 3:
        return max(sizes) * 2 if sizes else 0
    
    mean = sum(sizes) / len(sizes)
    variance = sum((x - mean) ** 2 for x in sizes) / len(sizes)
    std_dev = math.sqrt(variance)
    
    # Threshold = mean + 2*std_dev (95% confidence)
    threshold = mean + 2 * std_dev
    
    # If we have historical anomalies, refine threshold
    if historical_anomalies and len(historical_anomalies) > 0:
        anomaly_sizes = [a.get("size", 0) for a in historical_anomalies if a.get("size")]
        if anomaly_sizes:
            min_anomaly = min(anomaly_sizes)
            # Use the lower of statistical threshold or min anomaly
            threshold = min(threshold, min_anomaly * 0.9)
    
    return int(threshold)


def _generate_message(warning: dict, severity: str, excess_pct: float) -> str:
    """Generate human-readable warning message."""
    days = warning["days_until"]
    predicted = warning["predicted_size_gb"]
    threshold = warning["threshold_gb"]
    
    if days <= 3:
        urgency = "IMMEDIATE"
    elif days <= 7:
        urgency = "SOON"
    else:
        urgency = "UPCOMING"
    
    return (
        f"[{urgency}] Anomaly predicted in {days} days: "
        f"backup size may reach {predicted:.1f} GB "
        f"(threshold: {threshold:.1f} GB, +{excess_pct:.0f}%)"
    )
