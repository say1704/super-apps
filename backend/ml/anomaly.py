"""
Anomaly detection for backup data using statistical and ML methods.
"""

import numpy as np
import pandas as pd
from typing import List, Dict, Optional, Tuple
from sklearn.ensemble import IsolationForest
from scipy import stats


class AnomalyDetector:
    """
    Detect anomalies in backup size patterns.
    Combines multiple detection methods for robust results.
    """

    @staticmethod
    def zscore_detection(
        dates: List,
        sizes: List,
        threshold: float = 2.0,
    ) -> List[Dict]:
        """
        Detect anomalies using Z-score method.

        Args:
            threshold: Number of standard deviations (2.0 = ~95%, 3.0 = ~99.7%)

        Returns:
            List of anomaly dicts
        """
        sizes_arr = np.array(sizes)
        mean = np.mean(sizes_arr)
        std = np.std(sizes_arr)

        if std == 0:
            return []

        z_scores = np.abs((sizes_arr - mean) / std)
        anomalies = []

        for i, (date, size, z) in enumerate(zip(dates, sizes, z_scores)):
            if z > threshold:
                direction = "spike" if size > mean else "drop"
                anomalies.append({
                    "date": str(date),
                    "size": size,
                    "z_score": round(float(z), 2),
                    "direction": direction,
                    "deviation_pct": round(float((size - mean) / mean * 100), 1),
                    "method": "zscore",
                })

        return anomalies

    @staticmethod
    def iqr_detection(
        dates: List,
        sizes: List,
        multiplier: float = 1.5,
    ) -> List[Dict]:
        """
        Detect anomalies using Interquartile Range (IQR) method.

        Args:
            multiplier: 1.5 = mild outliers, 3.0 = extreme outliers

        Returns:
            List of anomaly dicts
        """
        sizes_arr = np.array(sizes)
        q1 = np.percentile(sizes_arr, 25)
        q3 = np.percentile(sizes_arr, 75)
        iqr = q3 - q1

        if iqr == 0:
            return []

        lower_bound = q1 - multiplier * iqr
        upper_bound = q3 + multiplier * iqr

        anomalies = []
        for i, (date, size) in enumerate(zip(dates, sizes)):
            if size < lower_bound or size > upper_bound:
                direction = "spike" if size > upper_bound else "drop"
                anomalies.append({
                    "date": str(date),
                    "size": size,
                    "lower_bound": round(float(lower_bound), 2),
                    "upper_bound": round(float(upper_bound), 2),
                    "direction": direction,
                    "method": "iqr",
                })

        return anomalies

    @staticmethod
    def isolation_forest_detection(
        dates: List,
        sizes: List,
        contamination: float = 0.05,
    ) -> List[Dict]:
        """
        Detect anomalies using Isolation Forest algorithm.

        Args:
            contamination: Expected proportion of outliers (0.05 = 5%)

        Returns:
            List of anomaly dicts
        """
        if len(sizes) < 10:
            return []

        sizes_arr = np.array(sizes).reshape(-1, 1)

        # Fit Isolation Forest
        clf = IsolationForest(
            contamination=contamination,
            random_state=42,
            n_estimators=100,
        )
        predictions = clf.fit_predict(sizes_arr)
        scores = clf.score_samples(sizes_arr)

        anomalies = []
        mean_size = np.mean(sizes)

        for i, (date, size, pred, score) in enumerate(zip(dates, sizes, predictions, scores)):
            if pred == -1:  # Anomaly
                direction = "spike" if size > mean_size else "drop"
                anomalies.append({
                    "date": str(date),
                    "size": size,
                    "anomaly_score": round(float(score), 3),
                    "direction": direction,
                    "method": "isolation_forest",
                })

        return anomalies

    @staticmethod
    def ensemble_detection(
        dates: List,
        sizes: List,
    ) -> List[Dict]:
        """
        Combine all detection methods for robust anomaly detection.
        An anomaly is confirmed if detected by at least 2 methods.

        Returns:
            List of confirmed anomaly dicts with confidence scores
        """
        # Run all detectors
        zscore_anomalies = AnomalyDetector.zscore_detection(dates, sizes, threshold=2.0)
        iqr_anomalies = AnomalyDetector.iqr_detection(dates, sizes, multiplier=1.5)
        iforest_anomalies = AnomalyDetector.isolation_forest_detection(dates, sizes, contamination=0.05)

        # Group by date
        date_anomalies = {}

        for anomaly in zscore_anomalies + iqr_anomalies + iforest_anomalies:
            date_key = anomaly["date"]
            if date_key not in date_anomalies:
                date_anomalies[date_key] = {
                    "date": date_key,
                    "size": anomaly["size"],
                    "methods": [],
                    "direction": anomaly["direction"],
                }
            date_anomalies[date_key]["methods"].append(anomaly["method"])

        # Filter: keep only if detected by 2+ methods
        confirmed = []
        for date_key, data in date_anomalies.items():
            if len(data["methods"]) >= 2:
                confidence = len(data["methods"]) / 3.0  # 0.33, 0.67, or 1.0
                confirmed.append({
                    "date": data["date"],
                    "size": data["size"],
                    "direction": data["direction"],
                    "methods": data["methods"],
                    "confidence": round(confidence, 2),
                    "severity": "high" if confidence >= 0.67 else "medium",
                })

        # Sort by date
        confirmed.sort(key=lambda x: x["date"])

        return confirmed

    @staticmethod
    def detect_anomalies(
        dates: List,
        sizes: List,
        method: str = "ensemble",
    ) -> Dict:
        """
        Main anomaly detection interface.

        Args:
            method: "zscore", "iqr", "isolation_forest", or "ensemble"

        Returns:
            Dict with anomalies and summary stats
        """
        if method == "zscore":
            anomalies = AnomalyDetector.zscore_detection(dates, sizes)
        elif method == "iqr":
            anomalies = AnomalyDetector.iqr_detection(dates, sizes)
        elif method == "isolation_forest":
            anomalies = AnomalyDetector.isolation_forest_detection(dates, sizes)
        else:
            anomalies = AnomalyDetector.ensemble_detection(dates, sizes)

        # Summary statistics
        total = len(sizes)
        anomaly_count = len(anomalies)
        anomaly_rate = round(anomaly_count / total * 100, 2) if total > 0 else 0

        return {
            "anomalies": anomalies,
            "summary": {
                "total_data_points": total,
                "anomaly_count": anomaly_count,
                "anomaly_rate_pct": anomaly_rate,
                "method": method,
            },
        }
