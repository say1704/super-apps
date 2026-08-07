"""Migration 021: Add task_notes table and photo_urls to project_tasks"""
import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "superapps.db")


def run():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()

    # Add photo_urls column to project_tasks if not exists
    c.execute("PRAGMA table_info(project_tasks)")
    columns = [row[1] for row in c.fetchall()]
    if "photo_urls" not in columns:
        c.execute("ALTER TABLE project_tasks ADD COLUMN photo_urls TEXT DEFAULT '[]'")
        print("[MIGRATE] Added photo_urls to project_tasks")
    else:
        print("[MIGRATE] Skipped (already applied): photo_urls to project_tasks")

    # Create task_notes table if not exists
    c.execute("""
        CREATE TABLE IF NOT EXISTS task_notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id INTEGER NOT NULL,
            message TEXT NOT NULL,
            photo_urls TEXT DEFAULT '[]',
            hours TEXT,
            created_at DATETIME DEFAULT (datetime('now')),
            created_by INTEGER,
            FOREIGN KEY (task_id) REFERENCES project_tasks(id) ON DELETE CASCADE,
            FOREIGN KEY (created_by) REFERENCES users(id)
        )
    """)
    c.execute("CREATE INDEX IF NOT EXISTS idx_task_notes_task_id ON task_notes(task_id)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_task_notes_created_at ON task_notes(created_at)")
    print("[MIGRATE] Created task_notes table")

    conn.commit()
    conn.close()


if __name__ == "__main__":
    run()
