"""
AI Feedback — Implicit feedback detection dari pola percakapan user.
Digunakan untuk self-learning: memberi label correct/incorrect pada log request.
"""
import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

LOG_DIR = Path(__file__).parent.parent / "logs"


def _get_today_log() -> Path:
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    return LOG_DIR / f"ai_requests_{today}.jsonl"


def mark_feedback(user_id: int, new_modul: str, new_action: str,
                  new_tier: str, new_confidence: float):
    """Tandai log terakhir user sebagai correct/incorrect berdasarkan perilaku berikutnya.

    Aturan implisit:
    - Jika sebelumnya action = UNKNOWN → feedback negative
    - Jika user berganti modul (dan sebelumnya bukan UNKNOWN) → feedback negative
    - Jika user tetap di modul yang sama → feedback positive
    - Jika confidence >= 0.8 dan tier != llm → auto positive
    """
    today_log = _get_today_log()
    if not today_log.exists():
        return

    lines = today_log.read_text(encoding="utf-8").strip().split("\n")
    if not lines:
        return

    last_entry = None
    last_idx = -1
    for i in range(len(lines) - 1, -1, -1):
        try:
            entry = json.loads(lines[i])
            if entry.get("user_id") == user_id and entry.get("correct") is None:
                last_entry = entry
                last_idx = i
                break
        except (json.JSONDecodeError, KeyError):
            continue

    if last_entry is None:
        return

    last_modul = last_entry.get("modul", "UNKNOWN")
    last_action = last_entry.get("action", "UNKNOWN")
    last_tier = last_entry.get("tier", "unknown")
    last_confidence = last_entry.get("confidence", 0.0)

    if last_action == "UNKNOWN":
        correct = False
    elif last_tier in ("rule", "fuzzy", "embedding") and last_confidence >= 0.8:
        correct = True
    elif new_modul == last_modul:
        correct = True
    else:
        correct = False

    last_entry["correct"] = correct
    last_entry["feedback_updated_at"] = datetime.now(timezone.utc).isoformat()
    lines[last_idx] = json.dumps(last_entry, ensure_ascii=False)

    today_log.write_text("\n".join(lines) + "\n", encoding="utf-8")
    logger.debug("Feedback for user %s: correct=%s (modul %s -> %s)",
                 user_id, correct, last_modul, new_modul)


def get_feedback_stats(days: int = 7) -> dict:
    """Hitung statistik feedback dari log."""
    from collections import defaultdict
    cutoff = datetime.now(timezone.utc).timestamp() - days * 86400
    total = 0
    correct = 0
    by_tier = defaultdict(lambda: {"total": 0, "correct": 0})

    for path in sorted(LOG_DIR.glob("ai_requests_*.jsonl")):
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
            if entry.get("correct") is None:
                continue
            total += 1
            if entry["correct"]:
                correct += 1
            tier = entry.get("tier", "unknown")
            by_tier[tier]["total"] += 1
            if entry["correct"]:
                by_tier[tier]["correct"] += 1

    return {
        "total": total,
        "correct": correct,
        "accuracy": round(correct / total, 3) if total else 0.0,
        "by_tier": {
            tier: {
                "total": s["total"],
                "correct": s["correct"],
                "accuracy": round(s["correct"] / s["total"], 3) if s["total"] else 0.0,
            }
            for tier, s in sorted(by_tier.items())
        },
    }
