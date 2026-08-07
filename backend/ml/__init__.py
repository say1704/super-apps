"""
ML Module for Backup Analytics
Provides predictive analytics, time series forecasting, anomaly detection,
health scoring, clustering, trend classification, failure risk prediction,
and anomaly forecasting.
"""

from ml.predictor import PredictionEngine
from ml.anomaly import AnomalyDetector
from ml.seasonality import SeasonalityDetector
from ml.cache import ModelCache
from ml.metrics import Backtester
from ml.utils import prepare_timeseries_data
from ml.health_score import calculate_health_score
from ml.clustering import cluster_servers, calculate_server_features
from ml.trend_classifier import classify_trend
from ml.failure_risk import predict_failure_risk
from ml.anomaly_forecast import forecast_anomalies

__all__ = [
    "PredictionEngine",
    "AnomalyDetector",
    "SeasonalityDetector",
    "ModelCache",
    "Backtester",
    "prepare_timeseries_data",
    "calculate_health_score",
    "cluster_servers",
    "calculate_server_features",
    "classify_trend",
    "predict_failure_risk",
    "forecast_anomalies",
]
