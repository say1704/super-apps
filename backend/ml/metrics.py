"""
Backtesting and accuracy metrics for ML models.
"""

import numpy as np
from typing import List, Tuple, Optional


class Backtester:
    """
    Evaluate model accuracy using historical backtesting.
    """

    @staticmethod
    def mape(actual: List[float], predicted: List[float]) -> float:
        """
        Mean Absolute Percentage Error.

        Returns:
            MAPE as percentage (lower is better)
        """
        actual = np.array(actual)
        predicted = np.array(predicted)

        # Avoid division by zero
        mask = actual != 0
        if mask.sum() == 0:
            return 0.0

        return float(np.mean(np.abs((actual[mask] - predicted[mask]) / actual[mask])) * 100)

    @staticmethod
    def rmse(actual: List[float], predicted: List[float]) -> float:
        """
        Root Mean Squared Error.

        Returns:
            RMSE in same units as input
        """
        actual = np.array(actual)
        predicted = np.array(predicted)
        return float(np.sqrt(np.mean((actual - predicted) ** 2)))

    @staticmethod
    def mae(actual: List[float], predicted: List[float]) -> float:
        """
        Mean Absolute Error.

        Returns:
            MAE in same units as input
        """
        actual = np.array(actual)
        predicted = np.array(predicted)
        return float(np.mean(np.abs(actual - predicted)))

    @staticmethod
    def r_squared(actual: List[float], predicted: List[float]) -> float:
        """
        R-squared (coefficient of determination).

        Returns:
            R² value (0-1, higher is better)
        """
        actual = np.array(actual)
        predicted = np.array(predicted)

        ss_res = np.sum((actual - predicted) ** 2)
        ss_tot = np.sum((actual - np.mean(actual)) ** 2)

        if ss_tot == 0:
            return 0.0

        return float(1 - (ss_res / ss_tot))

    @staticmethod
    def backtest_split(
        dates: list,
        sizes: list,
        test_ratio: float = 0.2,
    ) -> Tuple[list, list, list, list]:
        """
        Split data into train/test sets chronologically.

        Returns:
            (train_dates, train_sizes, test_dates, test_sizes)
        """
        n = len(dates)
        split_idx = int(n * (1 - test_ratio))

        return (
            dates[:split_idx],
            sizes[:split_idx],
            dates[split_idx:],
            sizes[split_idx:],
        )

    @staticmethod
    def compute_all_metrics(
        actual: List[float],
        predicted: List[float],
    ) -> dict:
        """
        Compute all accuracy metrics.

        Returns:
            Dict with mape, rmse, mae, r_squared
        """
        return {
            "mape": round(Backtester.mape(actual, predicted), 2),
            "rmse": round(Backtester.rmse(actual, predicted), 2),
            "mae": round(Backtester.mae(actual, predicted), 2),
            "r_squared": round(Backtester.r_squared(actual, predicted), 4),
        }
