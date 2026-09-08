"""Main FastAPI Application - Super Apps IT Management System (Modular)"""
import os
from datetime import datetime, timezone
from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
# Load .env BEFORE SECRET_KEY check
env_path = Path(__file__).parent / ".env"
load_dotenv(dotenv_path=env_path)


from utils.logger import get_logger

logger = get_logger(__name__)

# Server start time for metrics uptime calculation
START_TIME = datetime.now(timezone.utc)

from utils.key_manager import ensure_secret_keys
ensure_secret_keys()


# ==================== APP SETUP ====================
IS_PRODUCTION = os.environ.get("NODE_ENV") == "production"

app = FastAPI(
    title="Super Apps - IT Management System",
    version="1.0.0",
    docs_url=None if IS_PRODUCTION else "/docs",
    redoc_url=None if IS_PRODUCTION else "/redoc",
    openapi_url=None if IS_PRODUCTION else "/openapi.json",
)

from utils.rate_limiter import limiter
app.state.limiter = limiter

from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware
app.add_middleware(ProxyHeadersMiddleware, trusted_hosts=["127.0.0.1", "::1"])

from utils.request_id_middleware import RequestIDMiddleware
app.add_middleware(RequestIDMiddleware)


from utils.middleware import setup_middleware
setup_middleware(app)

from utils.app_lifecycle import register_lifecycle_handlers
register_lifecycle_handlers(app)

from utils.security_config import setup_security
setup_security(app)

# Static files (authenticated)
UPLOAD_ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'uploads')
os.makedirs(UPLOAD_ROOT, exist_ok=True)
os.makedirs(os.path.join(UPLOAD_ROOT, 'documents'), exist_ok=True)

app.mount("/uploads", StaticFiles(directory=UPLOAD_ROOT), name="uploads")

# ==================== ROUTERS ====================
# Existing routers
from api.backup_check_simple import router as backup_check_router
from api.backup_analytics import router as backup_analytics_router
from api.backup_analytics_ml import router as backup_analytics_ml_router
from api.assets_unified import router as assets_unified_router
from api.asset_audit_logs import router as audit_logs_router
from api.asset_dashboard import router as asset_dashboard_router
from api.asset_metadata import router as asset_metadata_router
from api.capacity_planning import router as capacity_planning_router
from api.capacity_daily_report import router as capacity_daily_report_router
from api.application_inventory import router as application_inventory_router
from api.configurations import router as configurations_router

# New modular routers
from api.health import router as health_router
from api.dashboard import router as dashboard_router
from api.notifications import router as notifications_router
from api.activity_logs import router as activity_logs_router
from api.log_maintenance import router as log_maintenance_router
from api.log_compression import router as log_compression_router
from api.irmc import router as irmc_router
from api.irmc_folders import router as irmc_folders_router
from api.irmc_reports import router as irmc_reports_router
from api.reports import router as reports_router
from api.monthly_server import router as monthly_server_router
from api.vulnerability import router as vulnerability_router
from api.incident import router as incident_router
from api.forms import router as forms_router
from api.worklog import router as worklog_router
from api.worklog_checklist import router as worklog_checklist_router
from api.worklog_progress import router as worklog_progress_router
from api.quality import router as quality_router
from api.auth import router as auth_router
from api.settings import router as settings_router
from api.documents import router as documents_router
from api.risk import router as risk_router
from api.tasks import router as tasks_router
from api.ssh_report import router as ssh_report_router
from api.audit import router as audit_router
from api.audit_trail import router as audit_trail_router
from api.ai import router as ai_router
from api.retention import router as retention_router
from api.preview import router as preview_router

from sqlalchemy import text

API_V1_PREFIX = "/api/v1"

app.include_router(health_router)
app.include_router(dashboard_router, prefix=API_V1_PREFIX)
app.include_router(auth_router, prefix=API_V1_PREFIX)
app.include_router(settings_router, prefix=API_V1_PREFIX)
app.include_router(documents_router, prefix=API_V1_PREFIX)
app.include_router(assets_unified_router, prefix=API_V1_PREFIX)
app.include_router(audit_logs_router, prefix=API_V1_PREFIX)
app.include_router(asset_dashboard_router, prefix=API_V1_PREFIX)
app.include_router(asset_metadata_router, prefix=API_V1_PREFIX)
app.include_router(risk_router, prefix=API_V1_PREFIX)
app.include_router(quality_router, prefix=API_V1_PREFIX)
app.include_router(configurations_router, prefix=API_V1_PREFIX)
app.include_router(forms_router, prefix=API_V1_PREFIX)
app.include_router(log_maintenance_router, prefix=API_V1_PREFIX)
app.include_router(log_compression_router, prefix=API_V1_PREFIX)
app.include_router(irmc_router, prefix=API_V1_PREFIX)
app.include_router(irmc_folders_router, prefix=API_V1_PREFIX)
app.include_router(monthly_server_router, prefix=API_V1_PREFIX)
app.include_router(vulnerability_router, prefix=API_V1_PREFIX)
app.include_router(incident_router, prefix=API_V1_PREFIX)
app.include_router(worklog_router, prefix=API_V1_PREFIX)
app.include_router(worklog_checklist_router, prefix=API_V1_PREFIX)
app.include_router(worklog_progress_router, prefix=API_V1_PREFIX)
app.include_router(tasks_router, prefix=API_V1_PREFIX)
app.include_router(activity_logs_router, prefix=API_V1_PREFIX)
app.include_router(notifications_router, prefix=API_V1_PREFIX)
app.include_router(backup_check_router, prefix=API_V1_PREFIX)
app.include_router(backup_analytics_router, prefix=API_V1_PREFIX)
app.include_router(backup_analytics_ml_router, prefix=API_V1_PREFIX)
app.include_router(capacity_planning_router, prefix=API_V1_PREFIX)
app.include_router(capacity_daily_report_router, prefix=API_V1_PREFIX)
app.include_router(application_inventory_router, prefix=API_V1_PREFIX)  # Application & Software Inventory (read; diisi via proses SAR)
app.include_router(irmc_reports_router, prefix=API_V1_PREFIX)
app.include_router(reports_router, prefix=API_V1_PREFIX)  # ISO 27001 compliance reports (daily/weekly/monthly/host-risk)
app.include_router(ssh_report_router, prefix=API_V1_PREFIX)
app.include_router(audit_router, prefix=API_V1_PREFIX)
app.include_router(audit_trail_router, prefix=API_V1_PREFIX)
app.include_router(ai_router, prefix=API_V1_PREFIX)
app.include_router(retention_router, prefix=API_V1_PREFIX)
app.include_router(preview_router, prefix=API_V1_PREFIX)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
