"""Backup analytics ML schemas"""
from typing import List, Optional, Any
from .base import OrmModel
from .backup_analytics import AnomalyResponse


class MLPredictionResponse(OrmModel):
    server_name: str
    predicted_size_mb: float
    confidence: float


class MLPredictionAllResponse(OrmModel):
    predictions: List[MLPredictionResponse]


class MLAnomalyAllResponse(OrmModel):
    anomalies: List[AnomalyResponse]


class MLSeasonalityResponse(OrmModel):
    server_name: str
    seasonal_pattern: List[Any]


class MLModelInfoResponse(OrmModel):
    model_name: str
    trained_at: Optional[str] = None
    accuracy: float


class MLHealthScoreResponse(OrmModel):
    server_name: str
    health_score: float
    status: str


class MLHealthScoreAllResponse(OrmModel):
    scores: List[MLHealthScoreResponse]


class MLTrendResponse(OrmModel):
    server_name: str
    trend: List[Any]


class MLFailureRiskResponse(OrmModel):
    server_name: str
    risk_score: float
    risk_level: str


class MLFailureRiskAllResponse(OrmModel):
    risks: List[MLFailureRiskResponse]


class MLClusterResponse(OrmModel):
    clusters: List[Any]


class MLForecastResponse(OrmModel):
    server_name: str
    forecast: List[Any]


class MLEnhancedPredictAllResponse(OrmModel):
    predictions: List[Any]
