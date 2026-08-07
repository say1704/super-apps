"""Migration: Add status column to irmc_check table"""
import sqlite3
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "superapps.db")


def run_migration():
    if not os.path.exists(DB_PATH):
        print(f"[ERROR] Database not found at {DB_PATH}")
        return

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    try:
        cursor.execute("PRAGMA table_info(irmc_check)")
        columns = [row[1] for row in cursor.fetchall()]
        if "status" not in columns:
            cursor.execute("ALTER TABLE irmc_check ADD COLUMN status TEXT DEFAULT 'pending'")
            print("[OK] Added status column to irmc_check (default: 'pending')")
        else:
            print("[SKIP] status column already exists in irmc_check")
    except sqlite3.OperationalError as e:
        print(f"[ERROR] irmc_check status: {e}")

    conn.commit()
    conn.close()
    print("\n[DONE] Migration 014 complete")


if __name__ == "__main__":
    run_migration()
