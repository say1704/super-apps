#!/usr/bin/env python3
"""Migration: Create worklog_progress table for chat-style progress tracking"""
import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "superapps.db")


def migrate():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='worklog_progress'")
    if cursor.fetchone():
        print("Table worklog_progress already exists, skipping.")
        conn.close()
        return

    cursor.execute("""
        CREATE TABLE worklog_progress (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            worklog_id INTEGER NOT NULL REFERENCES work_logs(id),
            message TEXT NOT NULL,
            photo_urls TEXT DEFAULT '[]',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)

    cursor.execute("CREATE INDEX idx_worklog_progress_worklog_id ON worklog_progress(worklog_id)")
    cursor.execute("CREATE INDEX idx_worklog_progress_created_at ON worklog_progress(created_at)")

    conn.commit()
    conn.close()
    print("Migration complete: Created worklog_progress table")


if __name__ == "__main__":
    migrate()
