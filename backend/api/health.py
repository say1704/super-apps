"""Health Check Endpoints - Liveness, Readiness, and Detailed Health"""
import os
import shutil
import smtplib
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import datetime, timezone

from database import get_db
from models import SMTPSettings
from api.schemas import HealthResponse, HealthDetailResponse, HealthLiveResponse, HealthReadyResponse

router = APIRouter(tags=["Health"])

APP_VERSION = os.environ.get("APP_VERSION", "1.0.0")


def _check_db(db: Session) -> dict:
    try:
        db.execute(text("SELECT 1"))
        return {"status": "connected"}
    except Exception as e:
        return {"status": "error", "detail": str(e)}


def _check_smtp(db: Session) -> dict:
    try:
        config = {}
        records = db.query(SMTPSettings).all()
        for r in records:
            config[r.key] = r.value or ""
        host = config.get("smtp_host", "")
        port = int(config.get("smtp_port", "587"))
        if not host:
            return {"status": "not_configured"}
        server = smtplib.SMTP(host, port, timeout=5)
        server.quit()
        return {"status": "reachable"}
    except Exception as e:
        return {"status": "error", "detail": str(e)}


def _check_disk(path: str = "/") -> dict:
    try:
        usage = shutil.disk_usage(path)
        pct = (usage.used / usage.total) * 100
        return {
            "status": "ok" if pct < 90 else "warning",
            "total_gb": round(usage.total / (1024**3), 1),
            "used_gb": round(usage.used / (1024**3), 1),
            "free_gb": round(usage.free / (1024**3), 1),
            "used_percent": round(pct, 1),
        }
    except Exception as e:
        return {"status": "error", "detail": str(e)}


def _check_memory() -> dict:
    try:
        import psutil
        mem = psutil.virtual_memory()
        return {
            "status": "ok" if mem.percent < 90 else "warning",
            "total_gb": round(mem.total / (1024**3), 1),
            "available_gb": round(mem.available / (1024**3), 1),
            "used_percent": round(mem.percent, 1),
        }
    except Exception as e:
        return {"status": "error", "detail": str(e)}


def _check_cpu() -> dict:
    try:
        import psutil
        pct = psutil.cpu_percent(interval=0.1)
        return {
            "status": "ok" if pct < 90 else "warning",
            "percent": pct,
            "cores": psutil.cpu_count(),
        }
    except Exception as e:
        return {"status": "error", "detail": str(e)}


@router.get("/health", response_model=dict)
async def health_check(db: Session = Depends(get_db)):
    """Comprehensive health check for monitoring dashboards"""
    health = {
        "status": "ok",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "version": APP_VERSION,
        "components": {},
    }

    db_status = _check_db(db)
    health["components"]["database"] = db_status
    if db_status["status"] != "connected":
        health["status"] = "degraded"

    smtp_status = _check_smtp(db)
    health["components"]["smtp"] = smtp_status
    if smtp_status["status"] == "error":
        health["status"] = "degraded"

    disk_status = _check_disk()
    health["components"]["disk"] = disk_status
    if disk_status["status"] == "warning":
        health["status"] = "degraded"

    mem_status = _check_memory()
    health["components"]["memory"] = mem_status
    if mem_status["status"] == "warning":
        health["status"] = "degraded"

    cpu_status = _check_cpu()
    health["components"]["cpu"] = cpu_status

    return health


@router.get("/health/live", response_model=HealthLiveResponse)
async def liveness_probe():
    """Kubernetes liveness probe - is the process alive?"""
    return {"status": "ok", "timestamp": datetime.now(timezone.utc).isoformat()}


@router.get("/health/ready", response_model=dict)
async def readiness_probe(db: Session = Depends(get_db)):
    """Kubernetes readiness probe - is the app ready to serve traffic?"""
    checks = {
        "database": _check_db(db),
        "disk": _check_disk(),
        "memory": _check_memory(),
    }

    all_ready = all(
        c["status"] in ("connected", "ok") for c in checks.values()
    )

    return {
        "status": "ready" if all_ready else "not_ready",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "version": APP_VERSION,
        "checks": checks,
    }
