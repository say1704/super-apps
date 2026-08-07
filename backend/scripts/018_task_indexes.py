"""Phase 56: Add performance indexes for task RBAC filter."""
import os
import sys
import shutil

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from database import get_db

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "superapps.db")

INDEXES = [
    ("ix_project_tasks_created_by", "project_tasks", "created_by"),
    ("ix_project_tasks_assignee", "project_tasks", "assignee"),
]


def run():
    if not os.path.exists(DB_PATH):
        print(f"Database not found: {DB_PATH}")
        return

    backup_path = DB_PATH + ".pre-018-task-indexes.bak"
    if not os.path.exists(backup_path):
        shutil.copy2(DB_PATH, backup_path)
        print(f"Backup created: {backup_path}")

    db = next(get_db())
    try:
        for idx_name, table, column in INDEXES:
            try:
                db.execute(text(f"CREATE INDEX IF NOT EXISTS {idx_name} ON {table}({column})"))
                db.commit()
                print(f"Index created: {idx_name} on {table}({column})")
            except Exception as e:
                print(f"Index skipped: {idx_name} — {e}")

        result = db.execute(text("PRAGMA integrity_check")).fetchone()
        print(f"DB integrity: {result[0]}")
    finally:
        db.close()


if __name__ == "__main__":
    run()
