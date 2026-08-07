"""
Data preparation and feature engineering utilities for ML models.
"""

import pandas as pd
import numpy as np
from typing import Tuple, Optional


def prepare_timeseries_data(
    dates: list,
    sizes: list,
    files: Optional[list] = None,
) -> pd.DataFrame:
    """
    Convert raw backup data into ML-ready DataFrame with features.

    Args:
        dates: List of backup dates (datetime or string)
        sizes: List of backup sizes in bytes
        files: Optional list of file counts

    Returns:
        DataFrame with columns: ds, y, and engineered features
    """
    df = pd.DataFrame({
        "ds": pd.to_datetime(dates),
        "y": sizes,
    })

    if files is not None:
        df["files"] = files

    df = df.sort_values("ds").reset_index(drop=True)

    # Time-based features
    df["day_of_week"] = df["ds"].dt.dayofweek
    df["day_of_month"] = df["ds"].dt.day
    df["month"] = df["ds"].dt.month
    df["quarter"] = df["ds"].dt.quarter
    df["is_month_end"] = df["ds"].dt.is_month_end.astype(int)
    df["is_quarter_end"] = df["ds"].dt.is_quarter_end.astype(int)

    # Lag features
    df["lag_1"] = df["y"].shift(1)
    df["lag_7"] = df["y"].shift(7)
    df["lag_30"] = df["y"].shift(30)

    # Rolling statistics
    df["rolling_mean_7"] = df["y"].rolling(window=7, min_periods=1).mean()
    df["rolling_std_7"] = df["y"].rolling(window=7, min_periods=1).std()
    df["rolling_mean_30"] = df["y"].rolling(window=30, min_periods=1).mean()

    # Growth rate
    df["daily_growth"] = df["y"].diff()
    df["growth_pct"] = df["y"].pct_change()

    # Fill NaN from lag/rolling
    df = df.fillna(method="bfill").fillna(0)

    return df


def extract_features_for_prediction(
    df: pd.DataFrame,
    future_dates: pd.DatetimeIndex,
) -> pd.DataFrame:
    """
    Create feature matrix for future prediction dates.

    Args:
        df: Historical DataFrame with features
        future_dates: Dates to predict

    Returns:
        DataFrame with features for future dates
    """
    future_df = pd.DataFrame({"ds": future_dates})

    # Time-based features
    future_df["day_of_week"] = future_df["ds"].dt.dayofweek
    future_df["day_of_month"] = future_df["ds"].dt.day
    future_df["month"] = future_df["ds"].dt.month
    future_df["quarter"] = future_df["ds"].dt.quarter
    future_df["is_month_end"] = future_df["ds"].dt.is_month_end.astype(int)
    future_df["is_quarter_end"] = future_df["ds"].dt.is_quarter_end.astype(int)

    # Use latest known values for lag/rolling features
    latest = df.iloc[-1]
    future_df["lag_1"] = latest["y"]
    future_df["lag_7"] = latest.get("lag_7", latest["y"])
    future_df["lag_30"] = latest.get("lag_30", latest["y"])
    future_df["rolling_mean_7"] = latest.get("rolling_mean_7", latest["y"])
    future_df["rolling_std_7"] = latest.get("rolling_std_7", 0)
    future_df["rolling_mean_30"] = latest.get("rolling_mean_30", latest["y"])
    future_df["daily_growth"] = latest.get("daily_growth", 0)
    future_df["growth_pct"] = latest.get("growth_pct", 0)

    return future_df


def validate_data_quality(
    dates: list,
    sizes: list,
    min_points: int = 10,
) -> dict:
    """
    Check data quality for ML modeling.

    Returns:
        Dict with quality metrics and recommendations
    """
    n_points = len(dates)
    date_range = (pd.to_datetime(dates[-1]) - pd.to_datetime(dates[0])).days if n_points > 1 else 0

    issues = []
    confidence = "high"

    if n_points < min_points:
        issues.append(f"Insufficient data points: {n_points} < {min_points}")
        confidence = "low"
    elif n_points < 30:
        issues.append(f"Limited data points: {n_points} < 30")
        confidence = "medium"

    if date_range < 7:
        issues.append(f"Short date range: {date_range} days < 7")
        confidence = "low"

    # Check for zero sizes
    zero_count = sum(1 for s in sizes if s == 0)
    if zero_count > n_points * 0.3:
        issues.append(f"High zero-value ratio: {zero_count}/{n_points}")

    # Check for negative growth (data issues)
    sizes_sorted = sorted(sizes)
    negative_growth = sum(1 for i in range(1, len(sizes_sorted)) if sizes_sorted[i] < sizes_sorted[i-1])

    return {
        "data_points": n_points,
        "date_range_days": date_range,
        "zero_count": zero_count,
        "confidence": confidence,
        "issues": issues,
        "ready_for_ml": confidence in ["medium", "high"],
    }


def bytes_to_human_readable(size_bytes: float) -> dict:
    """Convert bytes to KB/MB/GB dict."""
    return {
        "bytes": size_bytes,
        "kb": round(size_bytes / 1024, 2),
        "mb": round(size_bytes / (1024**2), 2),
        "gb": round(size_bytes / (1024**3), 4),
    }
