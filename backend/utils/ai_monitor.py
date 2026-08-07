"""
AI Monitor — Per-intent accuracy tracking and drift detection.
Reads from JSONL logs written by ai_logger.py.
"""
import json
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, List, Optional

LOG_DIR = Path(__file__).parent.parent / "logs"


def load_recent(days: int = 7) -> List[Dict]:
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    records = []
    for path in sorted(LOG_DIR.glob("ai_requests_*.jsonl")):
        date_str = path.stem.replace("ai_requests_", "")
        try:
            file_date = datetime.strptime(date_str, "%Y-%m-%d")
        except ValueError:
            continue
        if file_date < cutoff:
            continue
        with open(path) as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        records.append(json.loads(line))
                    except json.JSONDecodeError:
                        pass
    return records


def per_module_stats(records: List[Dict]) -> Dict:
    stats: Dict = defaultdict(lambda: {"total": 0, "llm": 0, "guardrail": 0})
    for r in records:
        modul = r.get("modul", "UNKNOWN")
        stats[modul]["total"] += 1
        tier = r.get("tier", "unknown")
        if tier == "llm":
            stats[modul]["llm"] += 1
        elif tier == "guardrail":
            stats[modul]["guardrail"] += 1

    result = {}
    for modul, s in sorted(stats.items(), key=lambda x: x[1]["total"], reverse=True):
        llm_pct = round(s["llm"] / s["total"] * 100, 1) if s["total"] else 0
        gr_pct = round(s["guardrail"] / s["total"] * 100, 1) if s["total"] else 0
        result[modul] = {
            "total": s["total"],
            "llm_pct": llm_pct,
            "guardrail_pct": gr_pct,
        }
    return result


def drift_check(
    recent_records: List[Dict],
    baseline_days: int = 30,
    threshold_pct: float = 20.0,
) -> List[Dict]:
    """Compare recent LLM fallback rate to baseline. Returns alerts."""
    baseline = load_recent(days=baseline_days)
    if not baseline:
        return []

    baseline_stats = per_module_stats(baseline)
    recent_stats = per_module_stats(recent_records)

    alerts = []
    for modul, recent_s in recent_stats.items():
        base_s = baseline_stats.get(modul, {"llm_pct": 0})
        diff = recent_s["llm_pct"] - base_s["llm_pct"]
        if diff > threshold_pct:
            alerts.append({
                "modul": modul,
                "recent_llm_pct": recent_s["llm_pct"],
                "baseline_llm_pct": base_s["llm_pct"],
                "diff": round(diff, 1),
            })
    return alerts
