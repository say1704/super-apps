"""
AI Learn — Online learning dari contoh positif routing.
Mengakumulasi query yang berhasil di-route untuk retrain centroid nantinya.
"""
import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

LEARN_DIR = Path(__file__).parent.parent / "data" / "ai" / "learn"


def _ensure_dir():
    LEARN_DIR.mkdir(parents=True, exist_ok=True)


def record_positive_example(modul: str, query: str, action: str, tier: str,
                            confidence: float):
    """Simpan query yang berhasil di-route dengan benar ke file harian."""
    if not query or len(query.strip()) < 3:
        return
    _ensure_dir()
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    path = LEARN_DIR / f"examples_{today}.jsonl"
    entry = {
        "modul": modul,
        "query": query.strip().lower(),
        "action": action,
        "tier": tier,
        "confidence": round(confidence, 3),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    try:
        with open(path, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")
        logger.debug("Learned example: %s -> %s", query[:50], modul)
    except OSError as e:
        logger.warning("Failed to save learning example: %s", e)


def accumulate_examples(days: int = 30, min_confidence: float = 0.0) -> dict:
    """Baca semua contoh dari N hari terakhir.
    Return dict[modul] = [query, query, ...]
    """
    cutoff = datetime.now(timezone.utc).timestamp() - days * 86400
    examples: dict[str, list[str]] = {}

    for path in sorted(LEARN_DIR.glob("examples_*.jsonl")):
        for line in path.read_text(encoding="utf-8").strip().split("\n"):
            if not line:
                continue
            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                continue
            ts = entry.get("timestamp", "")
            try:
                dt = datetime.fromisoformat(ts)
                if dt.timestamp() < cutoff:
                    continue
            except (ValueError, TypeError):
                continue
            if entry.get("confidence", 0) < min_confidence:
                continue
            modul = entry.get("modul", "")
            query = entry.get("query", "")
            if modul and query:
                examples.setdefault(modul, []).append(query)

    return examples


def get_example_count(days: int = 7) -> dict:
    """Hitung jumlah contoh per modul untuk report."""
    examples = accumulate_examples(days=days)
    return {modul: len(queries) for modul, queries in sorted(examples.items())}
