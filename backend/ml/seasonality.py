"""
Seasonality detection and decomposition for time series data.
"""

import numpy as np
import pandas as pd
from typing import Optional, Dict
from scipy import stats


class SeasonalityDetector:
    """
    Detect seasonal patterns in backup data.
    """

    @staticmethod
    def detect_weekly_pattern(
        dates: pd.Series,
        sizes: pd.Series,
    ) -> Optional[Dict]:
        """
        Detect day-of-week patterns.

        Returns:
            Dict with day effects or None if insufficient data
        """
        df = pd.DataFrame({"ds": dates, "y": sizes})
        df["day_of_week"] = df["ds"].dt.dayofweek

        if df["day_of_week"].nunique() < 5:
            return None

        # Calculate mean size per day of week
        daily_means = df.groupby("day_of_week")["y"].mean()
        overall_mean = df["y"].mean()

        if overall_mean == 0:
            return None

        # Calculate day effects (ratio to overall mean)
        day_effects = {}
        day_names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

        for day_idx in range(7):
            if day_idx in daily_means.index:
                effect = daily_means[day_idx] / overall_mean
                day_effects[day_names[day_idx]] = round(effect, 3)

        # Check if pattern is significant
        if len(daily_means) >= 5:
            f_stat, p_value = stats.f_oneway(
                *[df[df["day_of_week"] == d]["y"].values for d in daily_means.index]
            )
            significant = p_value < 0.05
        else:
            significant = False

        return {
            "type": "weekly",
            "day_effects": day_effects,
            "significant": significant,
            "p_value": round(float(p_value), 4) if len(daily_means) >= 5 else None,
        }

    @staticmethod
    def detect_monthly_pattern(
        dates: pd.Series,
        sizes: pd.Series,
    ) -> Optional[Dict]:
        """
        Detect month-of-year and end-of-month patterns.

        Returns:
            Dict with monthly effects or None
        """
        df = pd.DataFrame({"ds": dates, "y": sizes})
        df["month"] = df["ds"].dt.month
        df["is_month_end"] = df["ds"].dt.is_month_end

        overall_mean = df["y"].mean()
        if overall_mean == 0:
            return None

        month_names = [
            "Jan", "Feb", "Mar", "Apr", "May", "Jun",
            "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
        ]

        # Monthly effects
        monthly_means = df.groupby("month")["y"].mean()
        month_effects = {}
        for month_idx in range(1, 13):
            if month_idx in monthly_means.index:
                effect = monthly_means[month_idx] / overall_mean
                month_effects[month_names[month_idx - 1]] = round(effect, 3)

        # End-of-month spike detection
        eom_data = df[df["is_month_end"]]["y"]
        non_eom_data = df[~df["is_month_end"]]["y"]

        eom_spike = None
        if len(eom_data) > 0 and len(non_eom_data) > 0:
            eom_mean = eom_data.mean()
            non_eom_mean = non_eom_data.mean()
            if non_eom_mean > 0:
                eom_spike = round((eom_mean - non_eom_mean) / non_eom_mean, 3)

        return {
            "type": "monthly",
            "month_effects": month_effects,
            "end_of_month_spike": eom_spike,
        }

    @staticmethod
    def detect_quarterly_pattern(
        dates: pd.Series,
        sizes: pd.Series,
    ) -> Optional[Dict]:
        """
        Detect quarter-of-year patterns.

        Returns:
            Dict with quarterly effects or None
        """
        df = pd.DataFrame({"ds": dates, "y": sizes})
        df["quarter"] = df["ds"].dt.quarter

        overall_mean = df["y"].mean()
        if overall_mean == 0:
            return None

        quarterly_means = df.groupby("quarter")["y"].mean()
        quarter_effects = {}

        for q in range(1, 5):
            if q in quarterly_means.index:
                effect = quarterly_means[q] / overall_mean
                quarter_effects[f"Q{q}"] = round(effect, 3)

        return {
            "type": "quarterly",
            "quarter_effects": quarter_effects,
        }

    @staticmethod
    def detect_all_patterns(
        dates: pd.Series,
        sizes: pd.Series,
    ) -> Dict:
        """
        Run all seasonality detectors.

        Returns:
            Dict with all detected patterns
        """
        # Ensure dates are datetime
        if not pd.api.types.is_datetime64_any_dtype(dates):
            dates = pd.to_datetime(dates)

        weekly = SeasonalityDetector.detect_weekly_pattern(dates, sizes)
        monthly = SeasonalityDetector.detect_monthly_pattern(dates, sizes)
        quarterly = SeasonalityDetector.detect_quarterly_pattern(dates, sizes)

        detected = []
        if weekly and weekly.get("significant"):
            detected.append("weekly")
        if monthly:
            detected.append("monthly")
        if quarterly:
            detected.append("quarterly")

        return {
            "detected": len(detected) > 0,
            "patterns": detected,
            "weekly": weekly,
            "monthly": monthly,
            "quarterly": quarterly,
        }
