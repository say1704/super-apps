"""In-Memory TTL Cache Utility"""
import time
from typing import Any, Optional


class TTLCache:
    """Thread-safe in-memory cache with TTL (Time-To-Live) support"""

    def __init__(self, default_ttl: int = 60):
        self._cache: dict = {}
        self._default_ttl = default_ttl

    def get(self, key: str) -> Optional[Any]:
        item = self._cache.get(key)
        if item is None:
            return None
        if time.time() > item["expires_at"]:
            del self._cache[key]
            return None
        return item["value"]

    def set(self, key: str, value: Any, ttl: Optional[int] = None):
        self._cache[key] = {
            "value": value,
            "expires_at": time.time() + (ttl or self._default_ttl),
        }

    def invalidate(self, key: str):
        self._cache.pop(key, None)

    def invalidate_prefix(self, prefix: str):
        keys_to_delete = [k for k in self._cache if k.startswith(prefix)]
        for k in keys_to_delete:
            del self._cache[k]

    def clear(self):
        self._cache.clear()


# Global cache instance
cache = TTLCache(default_ttl=60)
