"""
ML-enhanced Backup Analytics API endpoints.
Provides predictive analytics, time series forecasting, and anomaly detection.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional, List
from datetime import date, timedelta

from database import get_db
from models import User, BackupHistory
from api.dependencies import get_current_user
from ml.predictor import PredictionEngine
from ml.anomaly import AnomalyDetector
from ml.seasonality import SeasonalityDetector
from ml.cache import model_cache
from ml.metrics import Backtester
from ml.health_score import calculate_health_score
from ml.clustering import cluster_servers, calculate_server_features
from ml.trend_classifier import classify_trend
from ml.failure_risk import predict_failure_risk
from ml.anomaly_forecast import forecast_anomalies
from collections import defaultdict

router = APIRouter(prefix="/backup-analytics/analytics/ml", tags=["Backup Analytics ML"])


def _apply_backup_rbac(query, current_user: User):
    """Apply RBAC filter: superadmin sees all, others see own role group."""
    if current_user.role != "superadmin":
        return query.filter(BackupHistory.owner_role == current_user.role)
    return query


def _batch_fetch_servers(db, cutoff, min_records=0, current_user=None):
    """Fetch all backup records in one query, grouped by server_name."""
    query = _apply_backup_rbac(db.query(BackupHistory), current_user)
    all_records = query.filter(
        BackupHistory.backup_date >= cutoff,
    ).order_by(BackupHistory.server_name, BackupHistory.backup_date).all()

    grouped = defaultdict(list)
    for r in all_records:
        grouped[r.server_name].append(r)

    if min_records > 0:
        grouped = {k: v for k, v in grouped.items() if len(v) >= min_records}

    return grouped


@router.get("/predict/{server_ip}", response_model=dict)
def predict_server(
    server_ip: str,
    horizon_months: int = Query(default=6, ge=1, le=12, description="Prediction horizon in months"),
    model: str = Query(default="auto", description="Model: auto, linear, polynomial, exponential_smoothing, prophet, sarimax"),
    confidence_level: float = Query(default=0.95, ge=0.5, le=0.99, description="Confidence level for intervals"),
    days: int = Query(default=180, description="Days of historical data to use"),
    resample: str = Query(default="W", description="Resampling: None, W (weekly), M (monthly)"),
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """
    Get ML prediction for a specific server.
    Returns predictions with confidence intervals and accuracy metrics.
    """
    cutoff = date.today() - timedelta(days=days)

    records = _apply_backup_rbac(db.query(BackupHistory), current_user).filter(
        BackupHistory.server_name == server_ip,
        BackupHistory.backup_date >= cutoff,
    ).order_by(BackupHistory.backup_date).all()

    if not records:
        raise HTTPException(status_code=404, detail=f"No data found for server {server_ip}")

    dates = [r.backup_date for r in records]
    sizes = [r.total_size_bytes for r in records]

    # Select prediction method
    resample_val = resample if resample and resample.lower() != "none" else None

    if model == "auto":
        result = PredictionEngine.auto_predict(dates, sizes, horizon_months, confidence_level, resample=resample_val)
    elif model == "linear":
        result = PredictionEngine.linear_predict(dates, sizes, horizon_months, confidence_level)
    elif model == "polynomial":
        result = PredictionEngine.polynomial_predict(dates, sizes, horizon_months, confidence_level=confidence_level)
    elif model == "exponential_smoothing":
        result = PredictionEngine.exponential_smoothing_predict(dates, sizes, horizon_months, confidence_level)
    elif model == "prophet":
        result = PredictionEngine.prophet_predict(dates, sizes, horizon_months, confidence_level)
    elif model == "sarimax":
        result = PredictionEngine.sarimax_predict(dates, sizes, horizon_months, confidence_level)
    else:
        raise HTTPException(status_code=400, detail=f"Unknown model: {model}")

    return {
        "server_ip": server_ip,
        "data_points": len(records),
        "date_range": {
            "start": dates[0].isoformat(),
            "end": dates[-1].isoformat(),
        },
        "historical": [
            {"date": r.backup_date.isoformat(), "size_gb": round(r.total_size_bytes / (1024 ** 3), 4)}
            for r in records
        ],
        **result,
    }


@router.get("/predict-all", response_model=dict)
def predict_all_servers(
    horizon_months: int = Query(default=6, ge=1, le=12),
    days: int = Query(default=180),
    resample: str = Query(default="W"),
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """
    Get predictions for all servers.
    Uses auto model selection for each server.
    """
    cutoff = date.today() - timedelta(days=days)
    server_groups = _batch_fetch_servers(db, cutoff, min_records=10, current_user=current_user)

    results = []
    resample_val = resample if resample and resample.lower() != "none" else None

    for server_ip, records in server_groups.items():
        dates = [r.backup_date for r in records]
        sizes = [r.total_size_bytes for r in records]

        result = PredictionEngine.auto_predict(dates, sizes, horizon_months, resample=resample_val)
        results.append({
            "server_ip": server_ip,
            "data_points": len(records),
            "model_used": result.get("model"),
            "current_gb": result.get("current", {}).get("gb", 0),
            "predictions": {
                k: v.get("projected", {}).get("gb", 0)
                for k, v in result.get("predictions", {}).items()
            },
            "accuracy": result.get("accuracy", {}),
        })

    results.sort(key=lambda x: x["predictions"].get("6m", 0), reverse=True)

    return {
        "servers": results,
        "total_servers": len(results),
    }


@router.get("/anomalies/{server_ip}", response_model=dict)
def detect_anomalies(
    server_ip: str,
    method: str = Query(default="ensemble", description="Detection method: zscore, iqr, isolation_forest, ensemble"),
    days: int = Query(default=90, description="Days of historical data to analyze"),
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """
    Detect anomalies in backup data for a server.
    """
    cutoff = date.today() - timedelta(days=days)

    records = _apply_backup_rbac(db.query(BackupHistory), current_user).filter(
        BackupHistory.server_name == server_ip,
        BackupHistory.backup_date >= cutoff,
    ).order_by(BackupHistory.backup_date).all()

    if not records:
        raise HTTPException(status_code=404, detail=f"No data found for server {server_ip}")

    dates = [r.backup_date for r in records]
    sizes = [r.total_size_bytes for r in records]

    result = AnomalyDetector.detect_anomalies(dates, sizes, method=method)

    return {
        "server_ip": server_ip,
        "period_days": days,
        **result,
    }


@router.get("/anomalies-all", response_model=dict)
def detect_anomalies_all(
    days: int = Query(default=90),
    method: str = Query(default="ensemble"),
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """
    Detect anomalies across all servers.
    """
    cutoff = date.today() - timedelta(days=days)
    server_groups = _batch_fetch_servers(db, cutoff, min_records=5, current_user=current_user)

    all_anomalies = []

    for server_ip, records in server_groups.items():
        dates = [r.backup_date for r in records]
        sizes = [r.total_size_bytes for r in records]

        result = AnomalyDetector.detect_anomalies(dates, sizes, method=method)

        if result["anomalies"]:
            all_anomalies.append({
                "server_ip": server_ip,
                "anomaly_count": result["summary"]["anomaly_count"],
                "anomaly_rate_pct": result["summary"]["anomaly_rate_pct"],
                "anomalies": result["anomalies"],
            })

    all_anomalies.sort(key=lambda x: x["anomaly_count"], reverse=True)

    return {
        "servers_with_anomalies": len(all_anomalies),
        "period_days": days,
        "method": method,
        "servers": all_anomalies,
    }


@router.get("/seasonality/{server_ip}", response_model=dict)
def detect_seasonality(
    server_ip: str,
    days: int = Query(default=180),
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """
    Detect seasonal patterns in backup data.
    """
    cutoff = date.today() - timedelta(days=days)

    records = _apply_backup_rbac(db.query(BackupHistory), current_user).filter(
        BackupHistory.server_name == server_ip,
        BackupHistory.backup_date >= cutoff,
    ).order_by(BackupHistory.backup_date).all()

    if not records:
        raise HTTPException(status_code=404, detail=f"No data found for server {server_ip}")

    import pandas as pd
    dates = pd.Series([r.backup_date for r in records])
    sizes = pd.Series([r.total_size_bytes for r in records])

    result = SeasonalityDetector.detect_all_patterns(dates, sizes)

    return {
        "server_ip": server_ip,
        "period_days": days,
        "data_points": len(records),
        **result,
    }


@router.get("/models", response_model=dict)
def list_models():
    """
    List available prediction models and their status.
    """
    return {
        "models": [
            {
                "name": "linear",
                "description": "Linear regression (fallback for small datasets)",
                "min_data_points": 10,
                "speed": "fast",
                "accuracy": "moderate",
            },
            {
                "name": "polynomial",
                "description": "Polynomial regression for non-linear growth",
                "min_data_points": 10,
                "speed": "fast",
                "accuracy": "good",
            },
            {
                "name": "exponential_smoothing",
                "description": "Holt-Winters exponential smoothing with seasonality",
                "min_data_points": 14,
                "speed": "moderate",
                "accuracy": "good",
            },
            {
                "name": "prophet",
                "description": "Facebook Prophet with automatic seasonality detection",
                "min_data_points": 30,
                "speed": "slow",
                "accuracy": "excellent",
            },
            {
                "name": "sarimax",
                "description": "Seasonal ARIMA for autoregressive patterns",
                "min_data_points": 30,
                "speed": "slow",
                "accuracy": "excellent",
            },
        ],
        "auto_selection": {
            "description": "Auto-selects best model based on data size and characteristics",
            "logic": {
                "< 10 points": "Error (insufficient data)",
                "10-29 points": "Linear regression",
                "30-99 points": "Polynomial or Exponential Smoothing (better MAPE)",
                "100+ points": "Prophet or SARIMAX (better MAPE)",
            },
        },
    }


@router.post("/retrain/{server_ip}", response_model=dict)
def retrain_model(
    server_ip: str,
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """
    Force retrain model for a server (invalidate cache).
    """
    model_cache.invalidate(server_ip)

    return {
        "server_ip": server_ip,
        "status": "cache_invalidated",
        "message": "Model will be retrained on next prediction request",
    }


@router.get("/cache/stats", response_model=dict)
def cache_stats(current_user: User = Depends(get_current_user)):
    """
    Get model cache statistics.
    """
    return model_cache.get_stats()


@router.get("/accuracy/{server_ip}", response_model=dict)
def get_accuracy_metrics(
    server_ip: str,
    days: int = Query(default=180),
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """
    Get backtesting accuracy metrics for a server.
    Compares all models and shows which performs best.
    """
    cutoff = date.today() - timedelta(days=days)

    records = _apply_backup_rbac(db.query(BackupHistory), current_user).filter(
        BackupHistory.server_name == server_ip,
        BackupHistory.backup_date >= cutoff,
    ).order_by(BackupHistory.backup_date).all()

    if len(records) < 20:
        raise HTTPException(
            status_code=400,
            detail=f"Need at least 20 data points for accuracy comparison, got {len(records)}"
        )

    dates = [r.backup_date for r in records]
    sizes = [r.total_size_bytes for r in records]

    # Split for backtesting
    train_dates, train_sizes, test_dates, test_sizes = Backtester.backtest_split(
        dates, sizes, test_ratio=0.2
    )

    if len(test_sizes) < 5:
        raise HTTPException(
            status_code=400,
            detail="Insufficient test data for backtesting"
        )

    # Test each model
    models_results = {}

    # Linear
    linear_pred = PredictionEngine.linear_predict(train_dates, train_sizes, horizon_months=1)
    # Extract 1m prediction for comparison
    linear_1m = linear_pred["predictions"].get("1m", {})
    if linear_1m:
        linear_pred_size = linear_1m["projected_bytes"]
        models_results["linear"] = {
            "predicted_1m_gb": round(linear_pred_size / (1024**3), 4),
            "actual_1m_gb": round(test_sizes[-1] / (1024**3), 4),
            "accuracy": linear_pred["accuracy"],
        }

    # Polynomial
    poly_pred = PredictionEngine.polynomial_predict(train_dates, train_sizes, horizon_months=1)
    poly_1m = poly_pred["predictions"].get("1m", {})
    if poly_1m:
        poly_pred_size = poly_1m["projected_bytes"]
        models_results["polynomial"] = {
            "predicted_1m_gb": round(poly_pred_size / (1024**3), 4),
            "actual_1m_gb": round(test_sizes[-1] / (1024**3), 4),
            "accuracy": poly_pred["accuracy"],
        }

    # Exponential Smoothing
    exp_pred = PredictionEngine.exponential_smoothing_predict(train_dates, train_sizes, horizon_months=1)
    exp_1m = exp_pred["predictions"].get("1m", {})
    if exp_1m:
        exp_pred_size = exp_1m["projected_bytes"]
        models_results["exponential_smoothing"] = {
            "predicted_1m_gb": round(exp_pred_size / (1024**3), 4),
            "actual_1m_gb": round(test_sizes[-1] / (1024**3), 4),
            "accuracy": exp_pred["accuracy"],
        }

    # Sort by MAPE
    ranked = sorted(
        models_results.items(),
        key=lambda x: x[1]["accuracy"].get("mape", 999)
    )

    return {
        "server_ip": server_ip,
        "train_points": len(train_dates),
        "test_points": len(test_dates),
        "models": models_results,
        "best_model": ranked[0][0] if ranked else None,
        "ranking": [m[0] for m in ranked],
    }


# ==================== PHASE 10: NEW ML FEATURES ====================


@router.get("/health-score/{server_ip}", response_model=dict)
def get_health_score(
    server_ip: str,
    days: int = Query(default=30, description="Days of historical data to analyze"),
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """
    Get backup health score (0-100) for a server.
    Combines consistency, growth, anomaly, status, and freshness.
    """
    cutoff = date.today() - timedelta(days=days)

    records = _apply_backup_rbac(db.query(BackupHistory), current_user).filter(
        BackupHistory.server_name == server_ip,
        BackupHistory.backup_date >= cutoff,
    ).order_by(BackupHistory.backup_date).all()

    if not records:
        raise HTTPException(status_code=404, detail=f"No data found for server {server_ip}")

    backup_dates = [r.backup_date for r in records]
    sizes = [r.total_size_bytes for r in records]
    statuses = [r.status for r in records]

    # Get anomaly count for this server
    anomaly_result = AnomalyDetector.detect_anomalies(backup_dates, sizes, method="ensemble")
    anomaly_count = anomaly_result.get("summary", {}).get("anomaly_count", 0)

    health = calculate_health_score(
        backup_dates=backup_dates,
        sizes=sizes,
        statuses=statuses,
        anomaly_count=anomaly_count,
        total_days=days,
    )

    return {
        "server_ip": server_ip,
        "period_days": days,
        **health,
    }


@router.get("/health-score-all", response_model=dict)
def get_health_score_all(
    days: int = Query(default=30),
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """
    Get health scores for all servers.
    """
    cutoff = date.today() - timedelta(days=days)
    server_groups = _batch_fetch_servers(db, cutoff, min_records=2, current_user=current_user)

    results = []

    for server_ip, records in server_groups.items():
        backup_dates = [r.backup_date for r in records]
        sizes = [r.total_size_bytes for r in records]
        statuses = [r.status for r in records]

        anomaly_result = AnomalyDetector.detect_anomalies(backup_dates, sizes, method="ensemble")
        anomaly_count = anomaly_result.get("summary", {}).get("anomaly_count", 0)

        health = calculate_health_score(
            backup_dates=backup_dates,
            sizes=sizes,
            statuses=statuses,
            anomaly_count=anomaly_count,
            total_days=days,
        )

        results.append({
            "server_ip": server_ip,
            "data_points": len(records),
            **health,
        })

    results.sort(key=lambda x: x["score"], reverse=True)

    return {
        "servers": results,
        "total_servers": len(results),
        "period_days": days,
    }


@router.get("/trend/{server_ip}", response_model=dict)
def get_trend(
    server_ip: str,
    days: int = Query(default=90),
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """
    Get trend classification for a server.
    """
    cutoff = date.today() - timedelta(days=days)

    records = _apply_backup_rbac(db.query(BackupHistory), current_user).filter(
        BackupHistory.server_name == server_ip,
        BackupHistory.backup_date >= cutoff,
    ).order_by(BackupHistory.backup_date).all()

    if not records:
        raise HTTPException(status_code=404, detail=f"No data found for server {server_ip}")

    backup_dates = [r.backup_date for r in records]
    sizes = [r.total_size_bytes for r in records]

    # Check seasonality
    import pandas as pd
    dates_series = pd.Series(backup_dates)
    sizes_series = pd.Series(sizes)
    seasonality = SeasonalityDetector.detect_all_patterns(dates_series, sizes_series)
    has_seasonality = seasonality.get("has_seasonality", False)

    trend = classify_trend(
        backup_dates=backup_dates,
        sizes=sizes,
        has_seasonality=has_seasonality,
    )

    return {
        "server_ip": server_ip,
        "period_days": days,
        **trend,
    }


@router.get("/failure-risk/{server_ip}", response_model=dict)
def get_failure_risk(
    server_ip: str,
    days: int = Query(default=90),
    prediction_days: int = Query(default=7, description="Days ahead to predict"),
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """
    Get backup failure risk prediction for a server.
    """
    cutoff = date.today() - timedelta(days=days)

    records = _apply_backup_rbac(db.query(BackupHistory), current_user).filter(
        BackupHistory.server_name == server_ip,
        BackupHistory.backup_date >= cutoff,
    ).order_by(BackupHistory.backup_date).all()

    if not records:
        raise HTTPException(status_code=404, detail=f"No data found for server {server_ip}")

    backup_dates = [r.backup_date for r in records]
    sizes = [r.total_size_bytes for r in records]
    jumlah_files = [r.jumlah_files for r in records]
    statuses = [r.status for r in records]

    # Get anomaly count
    anomaly_result = AnomalyDetector.detect_anomalies(backup_dates, sizes, method="ensemble")
    anomaly_count = anomaly_result.get("summary", {}).get("anomaly_count", 0)

    risk = predict_failure_risk(
        backup_dates=backup_dates,
        sizes=sizes,
        jumlah_files=jumlah_files,
        statuses=statuses,
        anomaly_count=anomaly_count,
        prediction_days=prediction_days,
    )

    return {
        "server_ip": server_ip,
        "period_days": days,
        **risk,
    }


@router.get("/failure-risk-all", response_model=dict)
def get_failure_risk_all(
    days: int = Query(default=90),
    prediction_days: int = Query(default=7),
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """
    Get failure risk for all servers.
    """
    cutoff = date.today() - timedelta(days=days)
    server_groups = _batch_fetch_servers(db, cutoff, min_records=3, current_user=current_user)

    results = []

    for server_ip, records in server_groups.items():
        backup_dates = [r.backup_date for r in records]
        sizes = [r.total_size_bytes for r in records]
        jumlah_files = [r.jumlah_files for r in records]
        statuses = [r.status for r in records]

        anomaly_result = AnomalyDetector.detect_anomalies(backup_dates, sizes, method="ensemble")
        anomaly_count = anomaly_result.get("summary", {}).get("anomaly_count", 0)

        risk = predict_failure_risk(
            backup_dates=backup_dates,
            sizes=sizes,
            jumlah_files=jumlah_files,
            statuses=statuses,
            anomaly_count=anomaly_count,
            prediction_days=prediction_days,
        )

        results.append({
            "server_ip": server_ip,
            "data_points": len(records),
            **risk,
        })

    results.sort(key=lambda x: x["risk_score"], reverse=True)

    return {
        "servers": results,
        "total_servers": len(results),
        "period_days": days,
        "prediction_days": prediction_days,
    }


@router.get("/clusters", response_model=dict)
def get_clusters(
    days: int = Query(default=90),
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """
    Get server clusters based on backup behavior patterns.
    """
    cutoff = date.today() - timedelta(days=days)
    server_groups = _batch_fetch_servers(db, cutoff, min_records=3, current_user=current_user)

    server_features = []

    for server_ip, records in server_groups.items():
        backup_dates = [r.backup_date for r in records]
        sizes = [r.total_size_bytes for r in records]

        features = calculate_server_features(backup_dates, sizes)
        features["server_ip"] = server_ip
        server_features.append(features)

    if not server_features:
        return {
            "clusters": {},
            "cluster_details": {},
            "server_assignments": {},
            "total_servers": 0,
        }

    result = cluster_servers(server_features)

    return result


@router.get("/anomaly-forecast/{server_ip}", response_model=dict)
def get_anomaly_forecast(
    server_ip: str,
    horizon_months: int = Query(default=3, ge=1, le=6),
    days: int = Query(default=180),
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """
    Get anomaly forecast (early warning) for a server.
    Predicts when the next anomaly will occur.
    """
    cutoff = date.today() - timedelta(days=days)

    records = _apply_backup_rbac(db.query(BackupHistory), current_user).filter(
        BackupHistory.server_name == server_ip,
        BackupHistory.backup_date >= cutoff,
    ).order_by(BackupHistory.backup_date).all()

    if len(records) < 10:
        raise HTTPException(
            status_code=400,
            detail=f"Need at least 10 data points for anomaly forecasting, got {len(records)}"
        )

    backup_dates = [r.backup_date for r in records]
    sizes = [r.total_size_bytes for r in records]

    # Get ML predictions
    result = PredictionEngine.auto_predict(backup_dates, sizes, horizon_months)
    predictions = result.get("predictions", {})

    # Convert predictions to list format for anomaly forecast
    pred_list = []
    for key, pred in predictions.items():
        pred_list.append({
            "date": pred.get("date", ""),
            "predicted": pred.get("projected_bytes", 0),
            "lower": pred.get("lower_bytes", 0),
            "upper": pred.get("upper_bytes", 0),
        })

    # Get historical anomalies
    anomaly_result = AnomalyDetector.detect_anomalies(backup_dates, sizes, method="ensemble")
    historical_anomalies = anomaly_result.get("anomalies", [])

    forecast = forecast_anomalies(
        backup_dates=backup_dates,
        sizes=sizes,
        predictions=pred_list,
        historical_anomalies=historical_anomalies,
    )

    return {
        "server_ip": server_ip,
        "period_days": days,
        "horizon_months": horizon_months,
        **forecast,
    }


@router.get("/enhanced-predict-all", response_model=dict)
def enhanced_predict_all(
    horizon_months: int = Query(default=6, ge=1, le=12),
    days: int = Query(default=180),
    resample: str = Query(default="W"),
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """
    Enhanced predict-all with health score, trend, and risk prediction.
    Extends the existing /predict-all endpoint with Phase 10 features.
    """
    cutoff = date.today() - timedelta(days=days)
    server_groups = _batch_fetch_servers(db, cutoff, min_records=10, current_user=current_user)

    results = []
    resample_val = resample if resample and resample.lower() != "none" else None

    for server_ip, records in server_groups.items():
        dates = [r.backup_date for r in records]
        sizes = [r.total_size_bytes for r in records]
        statuses = [r.status for r in records]
        jumlah_files = [r.jumlah_files for r in records]

        # ML Prediction
        pred_result = PredictionEngine.auto_predict(dates, sizes, horizon_months, resample=resample_val)

        # Health Score
        anomaly_result = AnomalyDetector.detect_anomalies(dates, sizes, method="ensemble")
        anomaly_count = anomaly_result.get("summary", {}).get("anomaly_count", 0)
        health = calculate_health_score(dates, sizes, statuses, anomaly_count, days)

        # Trend Classification
        import pandas as pd
        dates_series = pd.Series(dates)
        sizes_series = pd.Series(sizes)
        seasonality = SeasonalityDetector.detect_all_patterns(dates_series, sizes_series)
        has_seasonality = seasonality.get("has_seasonality", False)
        trend = classify_trend(dates, sizes, has_seasonality)

        # Failure Risk
        risk = predict_failure_risk(dates, sizes, jumlah_files, statuses, anomaly_count)

        results.append({
            "server_ip": server_ip,
            "data_points": len(records),
            "model_used": pred_result.get("model"),
            "current_kb": pred_result.get("current", {}).get("kb", 0),
            "current_mb": pred_result.get("current", {}).get("mb", 0),
            "current_gb": pred_result.get("current", {}).get("gb", 0),
            "predictions": {
                k: v.get("projected", {}).get("gb", 0)
                for k, v in pred_result.get("predictions", {}).items()
            },
            "accuracy": pred_result.get("accuracy", {}),
            "health_score": health["score"],
            "health_grade": health["grade"],
            "trend": trend["trend"],
            "trend_description": trend["description"],
            "risk_score": risk["risk_score"],
            "risk_level": risk["risk_level"],
        })

    results.sort(key=lambda x: x["health_score"])

    return {
        "servers": results,
        "total_servers": len(results),
    }
