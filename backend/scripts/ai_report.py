"""
AI Report — CLI tool to view AI request statistics from JSONL logs.
Usage: python scripts/ai_report.py [--days 7]
"""
import argparse
import json
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

LOG_DIR = Path(__file__).resolve().parent.parent / "logs"


def load_logs(days: int) -> list:
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


def build_report(records: list) -> dict:
    total = len(records)
    if total == 0:
        return {"total": 0, "message": "No data found."}

    by_module = defaultdict(lambda: {"total": 0, "llm": 0, "correct": 0})
    tiers = defaultdict(int)
    latencies = []
    total_tokens = 0
    total_correct = 0
    total_with_feedback = 0

    for r in records:
        modul = r.get("modul", "UNKNOWN")
        by_module[modul]["total"] += 1
        if r.get("tier") == "llm":
            by_module[modul]["llm"] += 1
        tiers[r.get("tier", "unknown")] += 1
        lat = r.get("latency_ms")
        if lat is not None:
            latencies.append(lat)
        tc = r.get("token_count", 0)
        if tc:
            total_tokens += tc
        correct = r.get("correct")
        if correct is not None:
            total_with_feedback += 1
            if correct:
                total_correct += 1
                by_module[modul]["correct"] += 1

    avg_latency = sum(latencies) / len(latencies) / 1000 if latencies else 0
    llm_total = sum(v["llm"] for v in by_module.values())
    llm_pct = round(llm_total / total * 100, 1) if total else 0
    accuracy = round(total_correct / total_with_feedback, 3) if total_with_feedback else None

    return {
        "total": total,
        "avg_latency_s": round(avg_latency, 2),
        "total_tokens": total_tokens,
        "llm_fallback_pct": llm_pct,
        "accuracy": accuracy,
        "total_with_feedback": total_with_feedback,
        "by_module": dict(by_module),
        "tiers": dict(tiers),
    }


def print_report(report: dict):
    if report.get("total", 0) == 0:
        print(report.get("message", "No data found."))
        return

    print(f"=== AI Usage Report ===")
    print(f"Total requests : {report['total']}")
    print(f"Avg latency   : {report['avg_latency_s']}s")
    print(f"Total tokens  : {report['total_tokens']}")
    print(f"LLM fallback  : {report['llm_fallback_pct']}%")
    if report.get("accuracy") is not None:
        print(f"Accuracy      : {report['accuracy']*100:.1f}% ({report['total_with_feedback']} feedback)")
    print()
    print("Routes by module:")
    for modul, stats in sorted(
        report["by_module"].items(), key=lambda x: x[1]["total"], reverse=True
    ):
        llm_pct = round(stats["llm"] / stats["total"] * 100, 1) if stats["total"] else 0
        acc = ""
        if stats.get("correct", 0) > 0:
            acc = f" acc={stats['correct']}/{stats['total']}"
        print(f"  {modul:30s} {stats['total']:5d} ({llm_pct}% LLM){acc}")
    print()
    print("Tiers:")
    for tier, count in sorted(report["tiers"].items(), key=lambda x: x[1], reverse=True):
        print(f"  {tier:15s} {count:5d}")


def main():
    parser = argparse.ArgumentParser(description="AI Request Report")
    parser.add_argument("--days", type=int, default=7, help="Days of history (default: 7)")
    args = parser.parse_args()

    records = load_logs(args.days)
    report = build_report(records)
    print_report(report)


if __name__ == "__main__":
    main()
