"""Application lifecycle: startup, shutdown, background tasks."""
import os
import threading
from datetime import datetime, timezone

from database import engine, SessionLocal, migrate_schema
from database.migrations import run_migrations
from models import Base
from utils.backup_scheduler import start_scheduler, stop_scheduler
from utils.logger import get_logger

logger = get_logger(__name__)

_ASSET_META_SEED_DONE = False


def _seed_asset_metadata_for_all_roles():
    """Seed baseline asset metadata for all roles that don't have data yet."""
    global _ASSET_META_SEED_DONE
    if _ASSET_META_SEED_DONE:
        return
    _ASSET_META_SEED_DONE = True

    try:
        from utils.asset_metadata_seeder import seed_all_roles
        db = SessionLocal()
        try:
            seeded = seed_all_roles(db)
            if seeded:
                logger.info(f"[SEED] Asset metadata seeded for {seeded} role(s)")
        finally:
            db.close()
    except Exception as e:
        logger.warning(f"[SEED] Asset metadata seed failed: {e}")


def _preload_ai_models():
    """Pre-load embedder in background. LLM models are on dedicated server."""
    from utils.ai_embedder import load_embedder

    logger.info("[AI] Background pre-loading embedder...")
    try:
        load_embedder()
    except Exception as e:
        logger.error("[AI] Failed to pre-load embedder: %s", e, exc_info=True)

    from utils.ai_model_client import health as model_health
    try:
        h = model_health()
        if h.get("status") == "ok":
            logger.info("[AI] Model server is ready")
        else:
            logger.warning("[AI] Model server status: %s", h.get("status"))
    except Exception as e:
        logger.warning("[AI] Model server not reachable: %s", e)

    logger.info("[AI] Background pre-loading complete")


def register_lifecycle_handlers(app):
    """Register startup and shutdown event handlers on the FastAPI app."""

    @app.on_event("startup")
    def startup_event():
        run_migrations()
        Base.metadata.create_all(bind=engine)
        migrate_schema()
        _seed_asset_metadata_for_all_roles()
        start_scheduler(SessionLocal)
        from utils.session_manager import cleanup_expired_sessions
        deleted = cleanup_expired_sessions(SessionLocal())
        if deleted:
            logger.info(f"[SESSION] Cleaned up {deleted} expired sessions")
        from models import UserOTP
        from sqlalchemy import delete
        db_otp = SessionLocal()
        deleted_otp = db_otp.execute(delete(UserOTP).where(UserOTP.expires_at < datetime.now(timezone.utc)))
        if deleted_otp.rowcount:
            logger.info(f"[OTP] Cleaned up {deleted_otp.rowcount} expired OTP codes")
        db_otp.commit()
        db_otp.close()

        # Admin UI (sqlite-web) — managed by a single backend instance to avoid
        # PID/port races between the 5 uvicorn workers.
        db = SessionLocal()
        try:
            if os.environ.get("START_ADMIN_UI") == "1":
                from utils.admin_ui_manager import start_sqlite_web, is_sqlite_web_running
                from utils.password_encrypt import decrypt_password, is_password_encrypted, encrypt_password
                from models import AppSettings

                password_record = db.query(AppSettings).filter(AppSettings.key == "admin_ui_password").first()
                password = ""
                if password_record and password_record.value:
                    stored = password_record.value
                    if is_password_encrypted(stored):
                        password = decrypt_password(stored)
                    else:
                        password = stored
                        encrypted = encrypt_password(stored)
                        password_record.value = encrypted
                        db.commit()
                if not password:
                    import secrets, string
                    password = ''.join(secrets.choice(string.ascii_letters + string.digits) for _ in range(16))
                    encrypted = encrypt_password(password)
                    if password_record:
                        password_record.value = encrypted
                    else:
                        db.add(AppSettings(category="general", key="admin_ui_password", value=encrypted))
                    db.commit()
                    logger.info("[ADMIN-UI] Auto-generated admin password for sqlite-web")

                is_running, _ = is_sqlite_web_running()
                if not is_running:
                    logger.info("[ADMIN-UI] Auto-starting sqlite-web...")
                    success, url = start_sqlite_web(password)
                    if success:
                        logger.info("[ADMIN-UI] sqlite-web started successfully on %s", url)
                    else:
                        logger.warning("[ADMIN-UI] Failed to start sqlite-web")
                else:
                    logger.info("[ADMIN-UI] sqlite-web already running")

                from utils.admin_ui_manager import start_sqlite_web_watchdog
                start_sqlite_web_watchdog(password)
                logger.info("[ADMIN-UI] Watchdog enabled")
        except Exception as e:
            logger.warning(f"[ADMIN-UI] Auto-start failed: {e}")
        finally:
            db.close()

        # Seed default retention policies
        try:
            from utils.retention_service import get_retention_policies
            get_retention_policies(SessionLocal())
            logger.info("[RETENTION] Default policies seeded")
        except Exception as e:
            logger.warning("[RETENTION] Seed skipped: %s", e)

        # Schedule daily retention cleanup — time configurable via PUT /retention/schedule
        try:
            from utils.backup_scheduler import scheduler
            from apscheduler.triggers.cron import CronTrigger
            from utils.retention_service import run_all_cleanups
            from models import AppSettings

            record = db.query(AppSettings).filter(AppSettings.key == "retention_schedule_time").first()
            schedule_time = record.value if record else "02:30"
            hour, minute = map(int, schedule_time.split(":"))

            scheduler.add_job(
                run_all_cleanups,
                CronTrigger(hour=hour, minute=minute),
                args=[SessionLocal],
                id="retention_cleanup_daily",
                replace_existing=True,
                name="Daily retention cleanup",
            )
            logger.info("[RETENTION] Daily cleanup scheduled at %s", schedule_time)
        except Exception as e:
            logger.warning("[RETENTION] Scheduler setup skipped: %s", e)

        # Schedule daily cross-module anomaly scan (AI Insights)
        try:
            from utils.backup_scheduler import scheduler
            from apscheduler.triggers.cron import CronTrigger
            from utils.anomaly_engine import run_daily_anomaly_scan

            scheduler.add_job(
                run_daily_anomaly_scan,
                CronTrigger(hour=6, minute=0),
                args=[SessionLocal],
                id="anomaly_scan_daily",
                replace_existing=True,
                name="Daily cross-module anomaly scan",
            )
            logger.info("[ANOMALY] Daily anomaly scan scheduled at 06:00")
        except Exception as e:
            logger.warning("[ANOMALY] Scheduler setup skipped: %s", e)

        # RAG: index awal (background, tunggu model-server) + reindex harian
        try:
            from utils.backup_scheduler import scheduler
            from apscheduler.triggers.cron import CronTrigger

            def _rag_reindex_job(session_factory):
                from utils.rag_index import reindex
                _db = session_factory()
                try:
                    reindex(_db)
                finally:
                    _db.close()

            scheduler.add_job(
                _rag_reindex_job, CronTrigger(hour=5, minute=30), args=[SessionLocal],
                id="rag_reindex_daily", replace_existing=True, name="Daily RAG reindex",
            )

            def _rag_initial():
                import time as _t
                _t.sleep(25)  # beri waktu model-server siap (embeddings)
                try:
                    _rag_reindex_job(SessionLocal)
                except Exception as e:
                    logger.warning("[RAG] initial index skipped: %s", e)

            threading.Thread(target=_rag_initial, daemon=True).start()
            logger.info("[RAG] daily reindex scheduled (05:30) + initial index started")
        except Exception as e:
            logger.warning("[RAG] setup skipped: %s", e)

        # Pre-load AI models in background thread (non-blocking)
        threading.Thread(target=_preload_ai_models, daemon=True).start()

    @app.on_event("shutdown")
    def shutdown_event():
        stop_scheduler()
        from utils.admin_ui_manager import stop_sqlite_web, stop_sqlite_web_watchdog
        stop_sqlite_web_watchdog()
        stop_sqlite_web()
