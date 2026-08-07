"""CORS, CSRF, IP whitelist, and static file authentication middleware"""
import os
import re as _re
import ipaddress
from fastapi import Request
from starlette.middleware.trustedhost import TrustedHostMiddleware
from fastapi.middleware.cors import CORSMiddleware
from starlette.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from utils.logger import get_logger

logger = get_logger(__name__)

IS_PRODUCTION = os.environ.get("NODE_ENV") == "production"

# ── CORS Origins ──────────────────────────────────────────────────────────────
CORS_ORIGINS_ENV = os.environ.get("CORS_ORIGINS", "")
if CORS_ORIGINS_ENV:
    CORS_ORIGINS_LIST = [o.strip() for o in CORS_ORIGINS_ENV.split(",") if o.strip()]
elif IS_PRODUCTION:
    raise RuntimeError(
        "CORS_ORIGINS environment variable is required in production. "
        "Set to comma-separated HTTPS origins (e.g., https://example.com,https://www.example.com)"
    )
else:
    CORS_ORIGINS_LIST = [
        "https://localhost:443", "https://127.0.0.1:443",
        "https://localhost:3443", "https://127.0.0.1:3443",
        "http://localhost:3001", "http://127.0.0.1:3001",
    ]

CORS_SUBNET = os.environ.get("CORS_SUBNET", "")
ALLOWED_SCHEMES = {"https"} if IS_PRODUCTION else {"http", "https"}


def _is_origin_allowed(origin: str) -> bool:
    if origin in CORS_ORIGINS_LIST:
        return True
    try:
        parsed = origin.split("://")
        scheme = parsed[0]
        if scheme not in ALLOWED_SCHEMES:
            return False
        host = parsed[1].split(":")[0] if len(parsed) > 1 else origin.split(":")[0]
        if IS_PRODUCTION:
            if host in ("localhost", "127.0.0.1"):
                return True
            if CORS_SUBNET:
                try:
                    return ipaddress.ip_address(host) in ipaddress.ip_network(CORS_SUBNET, strict=False)
                except ValueError:
                    pass
            return False
        try:
            ipaddress.ip_address(host)
            return True
        except ValueError:
            pass
        if CORS_SUBNET:
            return ipaddress.ip_address(host) in ipaddress.ip_network(CORS_SUBNET, strict=False)
        return False
    except (ValueError, IndexError):
        return False


# ── CSRF Middleware ───────────────────────────────────────────────────────────
async def csrf_protection(request: Request, call_next):
    if request.method in ("POST", "PUT", "DELETE", "PATCH"):
        origin = request.headers.get("origin")
        referer = request.headers.get("referer", "")
        if origin and not _is_origin_allowed(origin):
            return JSONResponse(status_code=403, content={"detail": "CSRF validation failed: invalid origin"})
        elif not origin and referer:
            referer_host = referer.split("/")[2] if "://" in referer else ""
            if referer_host:
                try:
                    referer_scheme = referer.split("://")[0] if "://" in referer else "http"
                    referer_origin = f"{referer_scheme}://{referer_host}"
                    if not _is_origin_allowed(referer_origin):
                        return JSONResponse(status_code=403, content={"detail": "CSRF validation failed: invalid referer"})
                except (ValueError, IndexError):
                    return JSONResponse(status_code=403, content={"detail": "CSRF validation failed: invalid referer"})
        elif not origin and not referer:
            return JSONResponse(status_code=403, content={"detail": "CSRF validation failed: missing origin and referer"})
    return await call_next(request)


# ── IP Whitelist Middleware ──────────────────────────────────────────────────
async def ip_whitelist_middleware(request: Request, call_next):
    from api.dependencies import ALLOWED_IPS
    if ALLOWED_IPS:
        client_ip = request.client.host if request.client else ""
        if client_ip not in ALLOWED_IPS and client_ip != "127.0.0.1":
            return JSONResponse(status_code=403, content={"detail": "IP address not allowed"})
    return await call_next(request)


# ── Static Files Auth Middleware ──────────────────────────────────────────────
async def uploads_auth_middleware(request: Request, call_next):
    if request.url.path.startswith("/uploads/"):
        token = None
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
        if not token:
            token = request.cookies.get("access_token") or request.cookies.get("__Secure-access_token")
        if token:
            try:
                from api.dependencies import SECRET_KEY, ALGORITHM
                from jose import jwt
                payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
                if payload.get("sub"):
                    return await call_next(request)
            except Exception:
                pass
        return JSONResponse(status_code=403, content={"detail": "Authentication required"})
    return await call_next(request)


# ── Setup Function ───────────────────────────────────────────────────────────
def setup_security(app):
    """Configure CORS, TrustedHost, and register security middleware."""
    if IS_PRODUCTION and not os.environ.get("ALLOWED_HOSTS"):
        raise RuntimeError("ALLOWED_HOSTS env var required in production. "
                           "Set to comma-separated hosts (e.g., example.com,www.example.com)")

    ALLOWED_HOSTS = os.environ.get("ALLOWED_HOSTS", "").split(",") if os.environ.get("ALLOWED_HOSTS") else ["*"]
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=ALLOWED_HOSTS)

    _regex_parts = [r"https://(localhost|127\.0\.0\.1)(:\d+)?"]
    if IS_PRODUCTION:
        for o in CORS_ORIGINS_LIST:
            escaped = _re.escape(o)
            if escaped not in _regex_parts:
                _regex_parts.append(escaped)
        if CORS_SUBNET:
            _regex_parts.append(r"https://\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?")
    else:
        _regex_parts.append(r"https?://\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?")
    CORS_REGEX = "|".join(_regex_parts)

    app.add_middleware(CORSMiddleware,
        allow_origin_regex=CORS_REGEX,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Requested-With"],
        expose_headers=["X-Total-Count"],
    )

    app.middleware("http")(csrf_protection)
    app.middleware("http")(ip_whitelist_middleware)
    app.middleware("http")(uploads_auth_middleware)
