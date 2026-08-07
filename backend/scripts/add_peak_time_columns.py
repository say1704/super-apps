#!/usr/bin/env python3
"""Migration: Add peak time tracking and description columns to capacity_metrics"""
import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "superapps.db")

NEW_COLUMNS = [
    ("cpu_peak_time", "VARCHAR(10)"),
    ("ram_peak_time", "VARCHAR(10)"),
    ("cpu_peak_max", "FLOAT"),
    ("ram_peak_max", "FLOAT"),
    ("peak_description", "TEXT"),
]


def run_migration():
    if not os.path.exists(DB_PATH):
        print(f"[ERROR] Database not found at {DB_PATH}")
        return

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    cursor.execute("PRAGMA table_info(capacity_metrics)")
    existing = {row[1] for row in cursor.fetchall()}

    for col_name, col_type in NEW_COLUMNS:
        if col_name in existing:
            print(f"[SKIP] capacity_metrics.{col_name} already exists")
            continue
        cursor.execute(f"ALTER TABLE capacity_metrics ADD COLUMN {col_name} {col_type}")
        print(f"[OK] Added capacity_metrics.{col_name} ({col_type})")

    conn.commit()
    conn.close()
    print("\n[DONE] Migration complete")


if __name__ == "__main__":
    run_migration()
