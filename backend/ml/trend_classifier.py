"""
Trend Classification for Backup Servers
=========================================
Auto-classifies each server's backup trend into categories:
- growing_fast: >10% monthly growth
- growing_slow: 2-10% monthly growth
- stable: <2% monthly growth, low variance
- shrinking: Negative growth trend
- volatile: High variance, no clear trend
- seasonal: Detected weekly/monthly pattern
"""

from datetime import date
from typing import Optional
import math


def classify_trend(
    backup_dates: list[date],
    sizes: list[int],
    has_seasonality: bool = False,
) -> dict:
    """
    Classify backup trend for a server.
    
    Args:
        backup_dates: List of backup dates (sorted)
        sizes: List of backup sizes in bytes
        has_seasonality: Whether seasonality was detected
    
    Returns:
        {
            "trend": str (growing_fast/growing_slow/stable/shrinking/volatile/seasonal),
            "monthly_growth_pct": float,
            "daily_growth_pct": float,
            "variance_coefficient": float,
            "confidence": float (0-1),
            "description": str
        }
    """
    if len(sizes) < 3:
        return {
            "trend": "insufficient_data",
            "monthly_growth_pct": 0,
            "daily_growth_pct": 0,
            "variance_coefficient": 0,
            "confidence": 0.1,
            "description": "Insufficient data for trend analysis"
        }
    
    # Calculate growth metrics
    daily_growth_pct = _calculate_daily_growth_pct(sizes)
    monthly_growth_pct = daily_growth_pct * 30  # Approximate
    
    # Calculate variance
    cv = _calculate_coefficient_of_variation(sizes)
    
    # Determine trend
    if has_seasonality and cv < 0.3:
        trend = "seasonal"
        confidence = 0.8
        description = f"Seasonal pattern detected, {monthly_growth_pct:+.1f}% monthly growth"
    
    elif cv > 0.5:
        trend = "volatile"
        confidence = 0.7
        description = f"High variance ({cv:.1%}), unpredictable backup pattern"
    
    elif monthly_growth_pct > 10:
        trend = "growing_fast"
        confidence = 0.9
        description = f"Rapid growth: {monthly_growth_pct:+.1f}% per month"
    
    elif monthly_growth_pct > 2:
        trend = "growing_slow"
        confidence = 0.85
        description = f"Moderate growth: {monthly_growth_pct:+.1f}% per month"
    
    elif monthly_growth_pct > -2:
        trend = "stable"
        confidence = 0.8
        description = f"Stable: {monthly_growth_pct:+.1f}% per month"
    
    else:
        trend = "shrinking"
        confidence = 0.8
        description = f"Declining: {monthly_growth_pct:+.1f}% per month"
    
    return {
        "trend": trend,
        "monthly_growth_pct": round(monthly_growth_pct, 2),
        "daily_growth_pct": round(daily_growth_pct, 4),
        "variance_coefficient": round(cv, 4),
        "confidence": confidence,
        "description": description
    }


def _calculate_daily_growth_pct(sizes: list[int]) -> float:
    """
    Calculate average daily growth percentage using linear regression slope.
    More robust than simple (last-first)/first calculation.
    """
    n = len(sizes)
    if n < 2:
        return 0.0
    
    # Simple linear regression on sizes
    x_mean = (n - 1) / 2
    y_mean = sum(sizes) / n
    
    numerator = 0
    denominator = 0
    for i, size in enumerate(sizes):
        numerator += (i - x_mean) * (size - y_mean)
        denominator += (i - x_mean) ** 2
    
    if denominator == 0:
        return 0.0
    
    slope = numerator / denominator
    
    # Convert slope to daily growth percentage
    if y_mean == 0:
        return 0.0
    
    daily_growth_pct = (slope / y_mean) * 100
    return daily_growth_pct


def _calculate_coefficient_of_variation(sizes: list[int]) -> float:
    """Calculate coefficient of variation (std_dev / mean)."""
    n = len(sizes)
    if n < 2:
        return 0.0
    
    mean = sum(sizes) / n
    if mean == 0:
        return 0.0
    
    variance = sum((x - mean) ** 2 for x in sizes) / n
    std_dev = math.sqrt(variance)
    
    return std_dev / mean
