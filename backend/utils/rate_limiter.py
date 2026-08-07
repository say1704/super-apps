"""Shared rate limiter configuration"""
from fastapi import Request
from slowapi import Limiter


def _get_client_ip(request: Request) -> str:
    """Extract client IP from the connection/proxy chain.

    Trusted proxy headers (X-Forwarded-For) are only honored after
    ProxyHeadersMiddleware has validated them against the trusted proxy
    (127.0.0.1). Raw header parsing is intentionally avoided to prevent spoofing.
    """
    client = request.client
    if client:
        return client.host
    return "127.0.0.1"


limiter = Limiter(
    key_func=_get_client_ip,
    default_limits=["120/minute"],
)
