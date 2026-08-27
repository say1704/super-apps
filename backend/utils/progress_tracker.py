"""Progress tracking for long-running operations"""
import time
import threading
import logging
from datetime import datetime
from typing import Dict, Any, Optional
from contextlib import contextmanager

logger = logging.getLogger(__name__)

# In-memory progress store with thread-safe access and auto-cleanup
_progress_lock = threading.Lock()
progress_store: Dict[str, Dict[str, Any]] = {}
MAX_STORE_SIZE = 100
CLEANUP_AGE_SECONDS = 3600  # Remove entries older than 1 hour


def _as_epoch(value: Any) -> Optional[float]:
    """Coerce a stored timestamp to an epoch float, tolerating mixed formats.

    Trackers may store timestamps either as epoch floats (time.time()) or as ISO
    strings (utcnow().isoformat(), used by the batch/bulk scanners). Mixing the two
    once broke cleanup with 'unsupported operand type(s) for -: float and str',
    poisoning the whole store. Return None when the value is missing or unparseable
    so the caller can skip aging that entry instead of raising.
    """
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value).timestamp()
        except ValueError:
            return None
    return None


def _cleanup_old_entries():
    """Remove completed/error entries older than CLEANUP_AGE_SECONDS"""
    now = time.time()
    to_remove = []
    for op_id, store in progress_store.items():
        ts = _as_epoch(store.get("completed_at")) or _as_epoch(store.get("started_at"))
        if ts is None:
            # Unknown/unparseable timestamp — keep the entry rather than crash.
            continue
        if now - ts > CLEANUP_AGE_SECONDS:
            to_remove.append(op_id)
    for op_id in to_remove:
        del progress_store[op_id]
    if to_remove:
        logger.debug("Cleaned up %d old progress entries", len(to_remove))


def create_progress_tracker(operation_id: str):
    """Create a new progress tracker"""
    with _progress_lock:
        # Cleanup old entries if store is getting large
        if len(progress_store) > MAX_STORE_SIZE:
            _cleanup_old_entries()
        progress_store[operation_id] = {
            "total": 0,
            "processed": 0,
            "current": "",
            "status": "pending",
            "started_at": None,
            "completed_at": None
        }
    return ProgressTracker(operation_id)


class ProgressTracker:
    def __init__(self, operation_id: str):
        self.operation_id = operation_id
    
    def update(self, processed: int, total: int, current: str = ""):
        """Update progress"""
        with _progress_lock:
            if self.operation_id not in progress_store:
                return
            store = progress_store[self.operation_id]
            store["processed"] = processed
            store["total"] = total
            store["current"] = current
            store["status"] = "running"
            if not store["started_at"]:
                store["started_at"] = time.time()
        
        if processed % 50 == 0 or processed == total:
            logger.info("[PROGRESS] %d/%d files processed", processed, total)
    
    def complete(self):
        """Mark as complete"""
        with _progress_lock:
            if self.operation_id in progress_store:
                progress_store[self.operation_id]["status"] = "completed"
                progress_store[self.operation_id]["completed_at"] = time.time()
    
    def error(self, message: str):
        """Mark as error"""
        with _progress_lock:
            if self.operation_id in progress_store:
                progress_store[self.operation_id]["status"] = "error"
                progress_store[self.operation_id]["error"] = message
                progress_store[self.operation_id]["completed_at"] = time.time()


def get_progress(operation_id: str) -> Dict[str, Any]:
    """Get current progress"""
    with _progress_lock:
        return progress_store.get(operation_id, {"status": "not_found"})


def cleanup_progress(operation_id: str):
    """Remove progress tracker"""
    with _progress_lock:
        if operation_id in progress_store:
            del progress_store[operation_id]
