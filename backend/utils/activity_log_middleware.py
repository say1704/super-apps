"""
Auto-activity-logging middleware.

Records every authenticated, successful mutating request (POST/PUT/PATCH/DELETE)
into the existing `activity_logs` table — but ONLY when the request handler did
not already record an activity manually (fill-gaps / no duplicates).

Dedup relies on a per-request marker object set here and flipped inside
`utils.activity_logger.log_activity`. Writes use a raw sqlite3 connection
(mirroring `_log_error_to_db` in utils/middleware.py) and are fully wrapped in
try/except so a logging failure can never disrupt the user's request.
"""
import os
import json
import sqlite3
from datetime import datetime, timezone

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response
from jose import jwt

from utils.logger import get_logger
from utils.config import get_db_path
from utils.activity_logger import MODULE_NAMES, _AutoLogFlag, _auto_log_flag
from api.dependencies import SECRET_KEY, ALGORITHM, COOKIE_ACCESS_KEY

logger = get_logger(__name__)

# Kill-switch: set ACTIVITY_AUTO_LOG=false to disable auto-logging without redeploy.
AUTO_LOG_ENABLED = os.environ.get("ACTIVITY_AUTO_LOG", "true").lower() == "true"

API_PREFIX = "/api/v1/"
_MUTATING_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
_METHOD_ACTION = {"POST": "CREATE", "PUT": "UPDATE", "PATCH": "UPDATE", "DELETE": "DELETE"}

# Paths that are mutations but should NOT create an auto entry:
# - token refresh is a transparent background call (~hourly)
# - AI chat stream is a long-lived text/event-stream response
_SKIP_PATHS = {
    "/api/v1/token/refresh",
    "/api/v1/ai/chat/stream",
}


def _extract_token(request: Request) -> str:
    """Mirror get_current_user extraction: Authorization header, then cookie."""
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        return auth_header[7:]
    return request.cookies.get(COOKIE_ACCESS_KEY) or request.cookies.get("access_token") or ""


def _resolve_username(request: Request):
    """Decode the JWT to get the username (no full validation — attribution only)."""
    token = _extract_token(request)
    if not token:
        return None
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload.get("sub") or None
    except Exception:
        return None


def _module_from_path(path: str) -> str:
    """First path segment after /api/v1/ → human label via MODULE_NAMES."""
    segment = path[len(API_PREFIX):].split("/", 1)[0]
    key = segment.replace("-", "_")
    return MODULE_NAMES.get(key, segment or "api")


def _write_auto_log(request: Request, username: str, status_code: int):
    """Insert one auto activity row via raw sqlite3 (never raises)."""
    try:
        conn = sqlite3.connect(get_db_path())
        try:
            conn.execute("PRAGMA busy_timeout=3000")
            cursor = conn.cursor()
            row = cursor.execute(
                "SELECT id FROM users WHERE username = ?", (username,)
            ).fetchone()
            if not row:
                return
            user_id = row[0]
            path = request.url.path
            action = _METHOD_ACTION.get(request.method, request.method)
            module = _module_from_path(path)
            details = json.dumps({
                "auto": True,
                "method": request.method,
                "path": path,
                "status": status_code,
            })
            ip_address = request.client.host if request.client else None
            cursor.execute(
                """
                INSERT INTO activity_logs
                    (user_id, action, module, description, details, ip_address, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    user_id,
                    action,
                    module,
                    f"{request.method} {path}",
                    details,
                    ip_address,
                    datetime.now(timezone.utc),
                ),
            )
            conn.commit()
        finally:
            conn.close()
    except Exception as db_err:
        logger.warning("[AUTO-LOG] Failed to persist activity: %s", db_err)


class ActivityLogMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        if not AUTO_LOG_ENABLED:
            return await call_next(request)

        flag = _AutoLogFlag()
        token = _auto_log_flag.set(flag)
        try:
            response = await call_next(request)
            already_logged = flag.logged
        finally:
            _auto_log_flag.reset(token)

        try:
            path = request.url.path
            if (
                not already_logged
                and request.method in _MUTATING_METHODS
                and 200 <= response.status_code < 400
                and path.startswith(API_PREFIX)
                and path not in _SKIP_PATHS
            ):
                username = _resolve_username(request)
                if username:
                    _write_auto_log(request, username, response.status_code)
        except Exception as exc:  # defensive: never affect the response
            logger.warning("[AUTO-LOG] dispatch post-processing error: %s", exc)

        return response
