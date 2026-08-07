"""
Prediction engine for backup analytics.
Implements multiple forecasting models with auto-selection.
"""

import time
import numpy as np
import pandas as pd
from typing import List, Dict, Optional, Tuple
from datetime import datetime, timedelta

from sklearn.linear_model import LinearRegression
from sklearn.preprocessing import PolynomialFeatures
from sklearn.pipeline import make_pipeline
from sklearn.metrics import mean_absolute_percentage_error

from ml.utils import prepare_timeseries_data, bytes_to_human_readable
from ml.seasonality import SeasonalityDetector
from ml.metrics import Backtester
from ml.cache import model_cache


class PredictionEngine:
    """
    Main prediction engine that supports multiple models:
    - Linear Regression (fallback)
    - Polynomial Regression
    - Exponential Smoothing (Holt-Winters)
    - Prophet (Facebook's time series forecaster)
    - SARIMAX (Seasonal ARIMA)

    Auto-selects best model based on data characteristics.
    """

    MIN_DATA_POINTS = 10
    PROPHET_MIN_POINTS = 30

    @staticmethod
    def linear_predict(
        dates: List,
        sizes: List,
        horizon_months: int = 6,
        confidence_level: float = 0.95,
    ) -> Dict:
        """
        Linear regression prediction with confidence intervals.
        """
        df = pd.DataFrame({"ds": pd.to_datetime(dates), "y": sizes})
        df = df.sort_values("ds").reset_index(drop=True)

        # Create numeric time feature (days from start)
        start_date = df["ds"].min()
        df["t"] = (df["ds"] - start_date).dt.days

        # Fit linear regression
        X = df[["t"]].values
        y = df["y"].values

        model = LinearRegression()
        model.fit(X, y)

        # Predictions
        last_date = df["ds"].max()
        last_t = df["t"].max()

        predictions = {}
        for months in [1, 3, 6, 12]:
            if months > horizon_months and months > 6:
                continue

            future_days = months * 30
            future_t = last_t + future_days
            predicted_size = max(0, model.predict([[future_t]])[0])

            # Confidence interval (simplified)
            residuals = y - model.predict(X)
            std_err = np.std(residuals)
            z_score = 1.96 if confidence_level == 0.95 else 2.58
            margin = z_score * std_err * np.sqrt(1 + future_t / max(last_t, 1))

            predictions[f"{months}m"] = {
                "projected_bytes": round(float(predicted_size), 2),
                "lower": round(float(max(0, predicted_size - margin)), 2),
                "upper": round(float(predicted_size + margin), 2),
            }

        # Backtesting accuracy
        if len(df) >= 10:
            train_dates, train_sizes, test_dates, test_sizes = Backtester.backtest_split(
                dates, sizes, test_ratio=0.2
            )
            if len(test_dates) > 0:
                test_df = pd.DataFrame({"ds": pd.to_datetime(test_dates), "y": test_sizes})
                test_df["t"] = (test_df["ds"] - start_date).dt.days
                test_pred = model.predict(test_df[["t"]].values)
                accuracy = Backtester.compute_all_metrics(test_sizes, test_pred.tolist())
            else:
                accuracy = {"mape": 0, "rmse": 0, "mae": 0, "r_squared": 0}
        else:
            accuracy = {"mape": 0, "rmse": 0, "mae": 0, "r_squared": 0}

        return {
            "model": "linear",
            "current_bytes": float(df["y"].iloc[-1]),
            "predictions": predictions,
            "accuracy": accuracy,
            "coefficients": {
                "slope": round(float(model.coef_[0]), 2),
                "intercept": round(float(model.intercept_), 2),
            },
        }

    @staticmethod
    def polynomial_predict(
        dates: List,
        sizes: List,
        horizon_months: int = 6,
        degree: int = 2,
        confidence_level: float = 0.95,
    ) -> Dict:
        """
        Polynomial regression prediction.
        """
        df = pd.DataFrame({"ds": pd.to_datetime(dates), "y": sizes})
        df = df.sort_values("ds").reset_index(drop=True)

        start_date = df["ds"].min()
        df["t"] = (df["ds"] - start_date).dt.days

        X = df[["t"]].values
        y = df["y"].values

        # Fit polynomial regression
        model = make_pipeline(PolynomialFeatures(degree), LinearRegression())
        model.fit(X, y)

        last_date = df["ds"].max()
        last_t = df["t"].max()

        predictions = {}
        for months in [1, 3, 6, 12]:
            if months > horizon_months and months > 6:
                continue

            future_days = months * 30
            future_t = last_t + future_days
            predicted_size = max(0, model.predict([[future_t]])[0])

            # Confidence interval
            residuals = y - model.predict(X)
            std_err = np.std(residuals)
            z_score = 1.96 if confidence_level == 0.95 else 2.58
            margin = z_score * std_err * np.sqrt(1 + future_t / max(last_t, 1))

            predictions[f"{months}m"] = {
                "projected_bytes": round(float(predicted_size), 2),
                "lower": round(float(max(0, predicted_size - margin)), 2),
                "upper": round(float(predicted_size + margin), 2),
            }

        # Backtesting
        if len(df) >= 10:
            train_dates, train_sizes, test_dates, test_sizes = Backtester.backtest_split(
                dates, sizes, test_ratio=0.2
            )
            if len(test_dates) > 0:
                test_df = pd.DataFrame({"ds": pd.to_datetime(test_dates), "y": test_sizes})
                test_df["t"] = (test_df["ds"] - start_date).dt.days
                test_pred = model.predict(test_df[["t"]].values)
                accuracy = Backtester.compute_all_metrics(test_sizes, test_pred.tolist())
            else:
                accuracy = {"mape": 0, "rmse": 0, "mae": 0, "r_squared": 0}
        else:
            accuracy = {"mape": 0, "rmse": 0, "mae": 0, "r_squared": 0}

        return {
            "model": f"polynomial_d{degree}",
            "current_bytes": float(df["y"].iloc[-1]),
            "predictions": predictions,
            "accuracy": accuracy,
        }

    @staticmethod
    def exponential_smoothing_predict(
        dates: List,
        sizes: List,
        horizon_months: int = 6,
        confidence_level: float = 0.95,
    ) -> Dict:
        """
        Exponential Smoothing (Holt-Winters) prediction.
        """
        from statsmodels.tsa.holtwinters import ExponentialSmoothing

        df = pd.DataFrame({"ds": pd.to_datetime(dates), "y": sizes})
        df = df.sort_values("ds").reset_index(drop=True)

        # Create daily time series
        y = df["y"].values

        # Determine seasonal period (weekly = 7)
        seasonal_periods = 7 if len(y) >= 14 else None

        try:
            if seasonal_periods and len(y) >= 2 * seasonal_periods:
                model = ExponentialSmoothing(
                    y,
                    trend="add",
                    seasonal="add",
                    seasonal_periods=seasonal_periods,
                )
            else:
                model = ExponentialSmoothing(
                    y,
                    trend="add",
                    seasonal=None,
                )

            fitted = model.fit(optimized=True)

            # Predictions
            predictions = {}
            last_date = df["ds"].max()

            for months in [1, 3, 6, 12]:
                if months > horizon_months and months > 6:
                    continue

                steps = months * 30
                forecast = fitted.forecast(steps)
                predicted_size = max(0, forecast.iloc[-1])

                # Confidence interval from forecast standard error
                std_err = np.std(fitted.resid)
                z_score = 1.96 if confidence_level == 0.95 else 2.58
                margin = z_score * std_err * np.sqrt(steps)

                predictions[f"{months}m"] = {
                    "projected_bytes": round(float(predicted_size), 2),
                    "lower": round(float(max(0, predicted_size - margin)), 2),
                    "upper": round(float(predicted_size + margin), 2),
                }

            # Backtesting
            if len(df) >= 10:
                train_dates, train_sizes, test_dates, test_sizes = Backtester.backtest_split(
                    dates, sizes, test_ratio=0.2
                )
                if len(test_sizes) > 0:
                    train_model = ExponentialSmoothing(
                        train_sizes,
                        trend="add",
                        seasonal="add" if seasonal_periods and len(train_sizes) >= 2 * seasonal_periods else None,
                        seasonal_periods=seasonal_periods if seasonal_periods and len(train_sizes) >= 2 * seasonal_periods else None,
                    )
                    train_fitted = train_model.fit(optimized=True)
                    steps = len(test_sizes)
                    test_pred = train_fitted.forecast(steps).tolist()
                    accuracy = Backtester.compute_all_metrics(test_sizes, test_pred)
                else:
                    accuracy = {"mape": 0, "rmse": 0, "mae": 0, "r_squared": 0}
            else:
                accuracy = {"mape": 0, "rmse": 0, "mae": 0, "r_squared": 0}

            return {
                "model": "exponential_smoothing",
                "current_bytes": float(df["y"].iloc[-1]),
                "predictions": predictions,
                "accuracy": accuracy,
            }

        except Exception as e:
            # Fallback to linear
            return PredictionEngine.linear_predict(dates, sizes, horizon_months, confidence_level)

    @staticmethod
    def prophet_predict(
        dates: List,
        sizes: List,
        horizon_months: int = 6,
        confidence_level: float = 0.95,
    ) -> Dict:
        """
        Prophet prediction with seasonality detection.
        """
        from prophet import Prophet

        df = pd.DataFrame({"ds": pd.to_datetime(dates), "y": sizes})
        df = df.sort_values("ds").reset_index(drop=True)

        # Prepare for Prophet
        prophet_df = df[["ds", "y"]].copy()

        # Create Prophet model
        m = Prophet(
            yearly_seasonality="auto",
            weekly_seasonality="auto",
            daily_seasonality=False,
            interval_width=confidence_level,
        )

        m.fit(prophet_df)

        # Future dataframe
        future_days = horizon_months * 30
        future = m.make_future_dataframe(periods=future_days, freq="D")

        # Predict
        forecast = m.predict(future)

        # Extract predictions at month boundaries
        last_date = df["ds"].max()
        predictions = {}

        for months in [1, 3, 6, 12]:
            if months > horizon_months and months > 6:
                continue

            target_date = last_date + timedelta(days=months * 30)
            future_rows = forecast[forecast["ds"] >= target_date]

            if len(future_rows) > 0:
                row = future_rows.iloc[0]
                yhat = max(0, row["yhat"])
                yhat_lower = max(0, row["yhat_lower"])
                yhat_upper = max(yhat, row["yhat_upper"])

                predictions[f"{months}m"] = {
                    "projected_bytes": round(float(yhat), 2),
                    "lower": round(float(yhat_lower), 2),
                    "upper": round(float(yhat_upper), 2),
                }

        # Seasonality analysis
        seasonality = SeasonalityDetector.detect_all_patterns(df["ds"], df["y"])

        # Backtesting (cross-validation simulation)
        if len(df) >= 20:
            train_dates, train_sizes, test_dates, test_sizes = Backtester.backtest_split(
                dates, sizes, test_ratio=0.2
            )
            if len(test_dates) > 0:
                train_df = pd.DataFrame({"ds": pd.to_datetime(train_dates), "y": train_sizes})
                train_prophet = Prophet(
                    yearly_seasonality="auto",
                    weekly_seasonality="auto",
                    daily_seasonality=False,
                )
                train_prophet.fit(train_df)
                future_test = train_prophet.make_future_dataframe(
                    periods=len(test_sizes), freq="D"
                )
                test_forecast = train_prophet.predict(future_test)
                test_pred = test_forecast["yhat"].tail(len(test_sizes)).tolist()
                accuracy = Backtester.compute_all_metrics(test_sizes, test_pred)
            else:
                accuracy = {"mape": 0, "rmse": 0, "mae": 0, "r_squared": 0}
        else:
            accuracy = {"mape": 0, "rmse": 0, "mae": 0, "r_squared": 0}

        return {
            "model": "prophet",
            "current_bytes": float(df["y"].iloc[-1]),
            "predictions": predictions,
            "accuracy": accuracy,
            "seasonality": seasonality,
        }

    @staticmethod
    def sarimax_predict(
        dates: List,
        sizes: List,
        horizon_months: int = 6,
        confidence_level: float = 0.95,
    ) -> Dict:
        """
        SARIMAX prediction for autoregressive patterns.
        """
        from statsmodels.tsa.statespace.sarimax import SARIMAX

        df = pd.DataFrame({"ds": pd.to_datetime(dates), "y": sizes})
        df = df.sort_values("ds").reset_index(drop=True)

        y = df["y"].values

        # Determine seasonal order
        seasonal_period = 7 if len(y) >= 14 else None

        try:
            if seasonal_period and len(y) >= 2 * seasonal_period:
                model = SARIMAX(
                    y,
                    order=(1, 1, 1),
                    seasonal_order=(1, 1, 1, seasonal_period),
                    enforce_stationarity=False,
                    enforce_invertibility=False,
                )
            else:
                model = SARIMAX(
                    y,
                    order=(1, 1, 1),
                    seasonal_order=(0, 0, 0, 0),
                    enforce_stationarity=False,
                    enforce_invertibility=False,
                )

            results = model.fit(disp=False)

            # Predictions
            predictions = {}
            last_date = df["ds"].max()

            for months in [1, 3, 6, 12]:
                if months > horizon_months and months > 6:
                    continue

                steps = months * 30
                forecast = results.get_forecast(steps=steps)
                predicted_size = max(0, forecast.predicted_mean.iloc[-1])
                conf_int = forecast.conf_int(alpha=1 - confidence_level)

                predictions[f"{months}m"] = {
                    "projected_bytes": round(float(predicted_size), 2),
                    "lower": round(float(max(0, conf_int.iloc[-1, 0])), 2),
                    "upper": round(float(conf_int.iloc[-1, 1]), 2),
                }

            # Backtesting
            if len(df) >= 10:
                train_dates, train_sizes, test_dates, test_sizes = Backtester.backtest_split(
                    dates, sizes, test_ratio=0.2
                )
                if len(test_sizes) > 0:
                    train_model = SARIMAX(
                        train_sizes,
                        order=(1, 1, 1),
                        seasonal_order=(1, 1, 1, seasonal_period) if seasonal_period and len(train_sizes) >= 2 * seasonal_period else (0, 0, 0, 0),
                        enforce_stationarity=False,
                        enforce_invertibility=False,
                    )
                    train_results = train_model.fit(disp=False)
                    steps = len(test_sizes)
                    test_forecast = train_results.get_forecast(steps=steps)
                    test_pred = test_forecast.predicted_mean.tolist()
                    accuracy = Backtester.compute_all_metrics(test_sizes, test_pred)
                else:
                    accuracy = {"mape": 0, "rmse": 0, "mae": 0, "r_squared": 0}
            else:
                accuracy = {"mape": 0, "rmse": 0, "mae": 0, "r_squared": 0}

            # Seasonality detection
            seasonality = SeasonalityDetector.detect_all_patterns(df["ds"], df["y"])

            return {
                "model": "sarimax",
                "current_bytes": float(df["y"].iloc[-1]),
                "predictions": predictions,
                "accuracy": accuracy,
                "seasonality": seasonality,
            }

        except Exception as e:
            # Fallback to exponential smoothing
            return PredictionEngine.exponential_smoothing_predict(
                dates, sizes, horizon_months, confidence_level
            )

    @staticmethod
    def auto_predict(
        dates: List,
        sizes: List,
        horizon_months: int = 6,
        confidence_level: float = 0.95,
        resample: Optional[str] = None,
    ) -> Dict:
        """
        Auto-select best model based on data characteristics.

        Args:
            resample: Optional resampling frequency ('W' for weekly, 'M' for monthly)
                     Helps smooth out daily noise.

        Selection logic:
        - < 10 points: Return error (insufficient data)
        - 10-29 points: Linear regression
        - 30-99 points: Polynomial or Exponential Smoothing
        - 100+ points: Prophet or SARIMAX (whichever has better accuracy)
        """
        # Optional resampling for smoothing
        if resample and len(dates) > 20:
            df = pd.DataFrame({"ds": pd.to_datetime(dates), "y": sizes})
            df = df.set_index("ds")
            resampled = df.resample(resample).mean().dropna()
            dates = resampled.index.tolist()
            sizes = resampled["y"].tolist()

        n_points = len(dates)

        if n_points < PredictionEngine.MIN_DATA_POINTS:
            return {
                "model": "none",
                "error": f"Insufficient data points: {n_points} < {PredictionEngine.MIN_DATA_POINTS}",
                "current_bytes": float(sizes[-1]) if sizes else 0,
                "predictions": {},
                "accuracy": {},
            }

        start_time = time.time()

        # Model selection based on data size
        if n_points < 30:
            result = PredictionEngine.linear_predict(dates, sizes, horizon_months, confidence_level)
        elif n_points < 100:
            # Try polynomial and exponential smoothing, pick better one
            poly_result = PredictionEngine.polynomial_predict(dates, sizes, horizon_months, confidence_level=confidence_level)
            exp_result = PredictionEngine.exponential_smoothing_predict(dates, sizes, horizon_months, confidence_level=confidence_level)

            # Compare MAPE (lower is better)
            poly_mape = poly_result.get("accuracy", {}).get("mape", 999)
            exp_mape = exp_result.get("accuracy", {}).get("mape", 999)

            result = poly_result if poly_mape <= exp_mape else exp_result
        else:
            # Try Prophet and SARIMAX, pick better one
            # But first check if data is suitable for complex models
            sizes_arr = np.array(sizes)
            cv = np.std(sizes_arr) / np.mean(sizes_arr) if np.mean(sizes_arr) > 0 else 999

            # If coefficient of variation > 2, data is too volatile for Prophet
            if cv > 2:
                result = PredictionEngine.exponential_smoothing_predict(
                    dates, sizes, horizon_months, confidence_level=confidence_level
                )
            else:
                prophet_result = PredictionEngine.prophet_predict(dates, sizes, horizon_months, confidence_level=confidence_level)
                sarimax_result = PredictionEngine.sarimax_predict(dates, sizes, horizon_months, confidence_level=confidence_level)

                prophet_mape = prophet_result.get("accuracy", {}).get("mape", 999)
                sarimax_mape = sarimax_result.get("accuracy", {}).get("mape", 999)

                result = prophet_result if prophet_mape <= sarimax_mape else sarimax_result

        # Add timing info
        result["training_time_ms"] = round((time.time() - start_time) * 1000, 2)

        # If MAPE > 100%, fallback to linear (model is not reliable)
        mape = result.get("accuracy", {}).get("mape", 0)
        if mape > 100 and result.get("model") != "linear":
            result = PredictionEngine.linear_predict(dates, sizes, horizon_months, confidence_level)
            result["training_time_ms"] = round((time.time() - start_time) * 1000, 2)
            result["fallback_reason"] = f"High MAPE ({mape:.1f}%) with {result.get('model')}, using linear instead"

        # Add human-readable sizes
        result["current"] = bytes_to_human_readable(result["current_bytes"])

        for key, pred in result.get("predictions", {}).items():
            result["predictions"][key] = {
                **pred,
                "projected": bytes_to_human_readable(pred["projected_bytes"]),
                "lower_human": bytes_to_human_readable(pred["lower"]),
                "upper_human": bytes_to_human_readable(pred["upper"]),
            }

        return result
