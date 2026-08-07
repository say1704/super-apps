"""
AI Logger — JSONL request logging for AI queries.
Rotates daily by filename (ai_requests_YYYY-MM-DD.jsonl).
"""
import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict

logger = logging.getLogger(__name__)

LOG_DIR = Path(__file__).parent.parent / "logs"


def _ensure_log_dir():
    LOG_DIR.mkdir(parents=True, exist_ok=True)


def log_request(data: Dict):
    _ensure_log_dir()
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    path = LOG_DIR / f"ai_requests_{today}.jsonl"
    try:
        with open(path, "a", encoding="utf-8") as f:
            f.write(json.dumps(data, default=str, ensure_ascii=False) + "\n")
    except OSError as e:
        logger.warning("Failed to log AI request: %s", e)
