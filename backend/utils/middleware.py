"""Middleware and error handlers"""
import os
import time
import sqlite3
import traceback as tb
from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response
from starlette.exceptions import HTTPException as StarletteHTTPException
from fastapi.exceptions import RequestValidationError
from slowapi.errors import RateLimitExceeded
from utils.logger import get_logger
from utils.config import get_db_path

logger = get_logger(__name__)
IS_PRODUCTION = os.environ.get("NODE_ENV") == "production"


class TimingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        start = time.time()
        response = await call_next(request)
        duration_ms = round((time.time() - start) * 1000, 2)
        if not IS_PRODUCTION:
            response.headers["X-Response-Time"] = f"{duration_ms}ms"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "SAMEORIGIN"
        response.headers["X-XSS-Protection"] = "0"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        response.headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-src 'self' blob:; frame-ancestors 'self'; form-action 'self'"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()"
        if request.url.path not in ("/health", "/health/live", "/health/ready", "/health/detailed", "/docs", "/openapi.json", "/uploads"):
            log_extra = {
                "method": request.method,
                "path": request.url.path,
                "status_code": response.status_code,
                "duration_ms": duration_ms,
            }
            if hasattr(request.state, "request_id"):
                log_extra["request_id"] = request.state.request_id
            if response.status_code >= 500:
                logger.error("Request completed", extra=log_extra)
            elif response.status_code >= 400:
                logger.warning("Request completed", extra=log_extra)
            else:
                logger.info("Request completed", extra=log_extra)
        return response


async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    from fastapi import HTTPException
    raise HTTPException(status_code=429, detail="Too many requests. Please try again later.")


def _log_error_to_db(level: str, message: str, traceback_str: str, request: Request = None):
    """Insert error record directly via raw sqlite3 (safe when ORM session is stale)."""
    try:
        uid = None
        rid = None
        if request and hasattr(request, "state"):
            uid = getattr(getattr(request.state, "user", None), "id", None)
            rid = getattr(request.state, "request_id", None)
        conn = sqlite3.connect(get_db_path())
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO error_logs (level, message, traceback, source, request_method, request_path, request_id, user_id)
            VALUES (?, ?, ?, 'backend', ?, ?, ?, ?)
        """, (
            level,
            message[:2000],
            traceback_str[:10000] if traceback_str else None,
            request.method if request else None,
            str(request.url.path) if request else None,
            rid,
            uid,
        ))
        conn.commit()
        conn.close()
    except Exception as db_err:
        logger.warning("[ERROR-LOG] Failed to persist error to DB: %s", db_err)


async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    detail = exc.detail
    if not isinstance(detail, str):
        logger.warning("Masked non-string HTTPException detail on %s", request.url.path)
        detail = "Request failed"
    if exc.status_code >= 500:
        _log_error_to_db(
            level="ERROR",
            message=f"HTTPException {exc.status_code}: {detail}",
            traceback_str="".join(tb.format_exception(type(exc), exc, exc.__traceback__)),
            request=request,
        )
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": detail},
        headers=getattr(exc, "headers", None),
    )


async def validation_exception_handler(request: Request, exc: RequestValidationError):
    logger.warning("Request validation failed on %s: %s", request.url.path, str(exc)[:500])
    return JSONResponse(
        status_code=422,
        content={"detail": "Validation error"},
    )


async def catch_all_exception_handler(request: Request, exc: Exception):
    from fastapi import HTTPException
    status_code = getattr(exc, "status_code", 500) if isinstance(exc, HTTPException) else 500
    detail = getattr(exc, "detail", str(exc)) if isinstance(exc, HTTPException) else "Internal Server Error"

    tb_str = "".join(tb.format_exception(type(exc), exc, exc.__traceback__))
    _log_error_to_db(
        level="ERROR" if status_code >= 500 else "WARNING",
        message=str(exc)[:500],
        traceback_str=tb_str if status_code >= 500 else None,
        request=request,
    )

    logger.error("Unhandled exception: %s", detail, extra={
        "path": str(request.url.path),
        "method": request.method,
        "status_code": status_code,
    })

    return JSONResponse(
        status_code=status_code,
        content={"detail": detail},
    )


def setup_middleware(app):
    """Register all middleware and exception handlers."""
    app.add_middleware(TimingMiddleware)
    app.add_exception_handler(RateLimitExceeded, rate_limit_handler)
    app.add_exception_handler(StarletteHTTPException, http_exception_handler)
    app.add_exception_handler(RequestValidationError, validation_exception_handler)
    app.add_exception_handler(Exception, catch_all_exception_handler)
