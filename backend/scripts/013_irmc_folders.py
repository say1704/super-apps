"""Migration: Add irmc_folders table and folder_id to irmc_check"""
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
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS irmc_folders (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                color TEXT DEFAULT 'blue',
                created_by INTEGER,
                created_at DATETIME DEFAULT (datetime('now')),
                FOREIGN KEY (created_by) REFERENCES users(id)
            )
        """)
        print("[OK] Created irmc_folders table")
    except sqlite3.OperationalError as e:
        print(f"[ERROR] irmc_folders: {e}")

    try:
        cursor.execute("PRAGMA table_info(irmc_check)")
        columns = [row[1] for row in cursor.fetchall()]
        if "folder_id" not in columns:
            cursor.execute("ALTER TABLE irmc_check ADD COLUMN folder_id INTEGER DEFAULT NULL")
            print("[OK] Added folder_id to irmc_check")
        else:
            print("[SKIP] folder_id already exists in irmc_check")
    except sqlite3.OperationalError as e:
        print(f"[ERROR] irmc_check folder_id: {e}")

    conn.commit()
    conn.close()
    print("\n[DONE] Migration 013 complete")


if __name__ == "__main__":
    run_migration()
