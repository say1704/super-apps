"""
AI Retrain CLI — Recomputed centroid dari accumulated examples.
Panggil kapan saja untuk merge data belajar tanpa restart backend.

Usage:
    python scripts/ai_retrain.py               # merge + report
    python scripts/ai_retrain.py --days 14      # baca 14 hari terakhir
"""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


def main():
    parser = argparse.ArgumentParser(description="AI Retrain — merge data belajar ke centroid")
    parser.add_argument("--days", type=int, default=30, help="Jumlah hari ke belakang (default: 30)")
    args = parser.parse_args()

    from utils.ai_embedder import load_embedder, _load_accumulated_examples, _example_embeddings, _example_counts
    from utils.ai_learn import get_example_count

    print("=== AI Retrain ===")
    print(f"Membaca contoh dari {args.days} hari terakhir...")

    load_embedder(force=True)
    count = _load_accumulated_examples(days=args.days, min_confidence=0.65)

    print(f"Total modul: {len(_example_embeddings)}")
    print(f"Contoh baru di-merge: {count}")
    print()

    by_module = get_example_count(days=args.days)
    if by_module:
        print("Contoh per modul (7 hari terakhir):")
        for modul, c in sorted(by_module.items(), key=lambda x: x[1], reverse=True):
            total = _example_counts.get(modul, 0)
            print(f"  {modul:25s} {c:3d} baru  (total centroid: {total})")
    else:
        print("Belum ada contoh belajar. Mulai dengan bertanya ke AI.")

    print()
    print("Selesai. Centroid sudah diperbarui.")


if __name__ == "__main__":
    main()
