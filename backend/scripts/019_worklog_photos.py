#!/usr/bin/env python3
"""Migration: Add photo_urls column to work_logs table"""
import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "superapps.db")


def migrate():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Check if column already exists
    cursor.execute("PRAGMA table_info(work_logs)")
    columns = [row[1] for row in cursor.fetchall()]

    if "photo_urls" in columns:
        print("Column photo_urls already exists, skipping.")
        conn.close()
        return

    cursor.execute("ALTER TABLE work_logs ADD COLUMN photo_urls TEXT DEFAULT '[]'")
    conn.commit()
    conn.close()
    print("Migration complete: Added photo_urls column to work_logs")


if __name__ == "__main__":
    migrate()
