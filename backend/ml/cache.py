"""
Model cache with TTL for ML models.
Avoids retraining on every API request.
"""

import time
import hashlib
import pickle
from typing import Any, Optional, Dict
from pathlib import Path


class ModelCache:
    """
    Cache for trained ML models with TTL expiration.

    Models are cached in memory and optionally persisted to disk.
    """

    def __init__(
        self,
        ttl_seconds: int = 86400,  # 24 hours
        cache_dir: Optional[str] = None,
    ):
        self.ttl_seconds = ttl_seconds
        self.cache_dir = Path(cache_dir) if cache_dir else None
        self._memory_cache: Dict[str, dict] = {}

        if self.cache_dir:
            self.cache_dir.mkdir(parents=True, exist_ok=True)

    def _make_key(self, server_ip: str, model_type: str, data_hash: str) -> str:
        """Create cache key from server, model type, and data hash."""
        raw = f"{server_ip}:{model_type}:{data_hash}"
        return hashlib.md5(raw.encode()).hexdigest()

    def _hash_data(self, data_points: int, last_date: str) -> str:
        """Create hash from data metadata to detect changes."""
        raw = f"{data_points}:{last_date}"
        return hashlib.md5(raw.encode()).hexdigest()

    def get(self, server_ip: str, model_type: str, data_hash: str) -> Optional[Any]:
        """
        Get cached model if not expired.

        Returns:
            Cached model or None if expired/missing
        """
        key = self._make_key(server_ip, model_type, data_hash)

        # Check memory cache first
        if key in self._memory_cache:
            entry = self._memory_cache[key]
            if time.time() - entry["timestamp"] < self.ttl_seconds:
                return entry["model"]
            else:
                del self._memory_cache[key]

        # Check disk cache
        if self.cache_dir:
            cache_file = self.cache_dir / f"{key}.pkl"
            if cache_file.exists():
                try:
                    with open(cache_file, "rb") as f:
                        entry = pickle.load(f)
                    if time.time() - entry["timestamp"] < self.ttl_seconds:
                        # Also load into memory
                        self._memory_cache[key] = entry
                        return entry["model"]
                    else:
                        cache_file.unlink()
                except Exception:
                    pass

        return None

    def set(self, server_ip: str, model_type: str, data_hash: str, model: Any) -> None:
        """Cache a trained model."""
        key = self._make_key(server_ip, model_type, data_hash)
        entry = {
            "model": model,
            "timestamp": time.time(),
            "server_ip": server_ip,
            "model_type": model_type,
        }

        # Store in memory
        self._memory_cache[key] = entry

        # Persist to disk
        if self.cache_dir:
            cache_file = self.cache_dir / f"{key}.pkl"
            try:
                with open(cache_file, "wb") as f:
                    pickle.dump(entry, f)
            except Exception:
                pass

    def invalidate(self, server_ip: str, model_type: Optional[str] = None) -> None:
        """Invalidate cache for a server (or specific model type)."""
        keys_to_delete = []
        for key, entry in self._memory_cache.items():
            if entry["server_ip"] == server_ip:
                if model_type is None or entry["model_type"] == model_type:
                    keys_to_delete.append(key)

        for key in keys_to_delete:
            del self._memory_cache[key]

        # Also delete from disk
        if self.cache_dir:
            for cache_file in self.cache_dir.glob("*.pkl"):
                try:
                    with open(cache_file, "rb") as f:
                        entry = pickle.load(f)
                    if entry["server_ip"] == server_ip:
                        if model_type is None or entry["model_type"] == model_type:
                            cache_file.unlink()
                except Exception:
                    pass

    def clear_all(self) -> None:
        """Clear entire cache."""
        self._memory_cache.clear()
        if self.cache_dir:
            for cache_file in self.cache_dir.glob("*.pkl"):
                cache_file.unlink()

    def get_stats(self) -> dict:
        """Get cache statistics."""
        now = time.time()
        active = sum(
            1 for entry in self._memory_cache.values()
            if now - entry["timestamp"] < self.ttl_seconds
        )
        expired = len(self._memory_cache) - active

        disk_count = 0
        if self.cache_dir:
            disk_count = len(list(self.cache_dir.glob("*.pkl")))

        return {
            "memory_active": active,
            "memory_expired": expired,
            "disk_cached": disk_count,
            "ttl_hours": self.ttl_seconds // 3600,
        }


# Global cache instance
model_cache = ModelCache(ttl_seconds=86400)
