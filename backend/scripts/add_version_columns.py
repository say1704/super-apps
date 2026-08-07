"""Migration: Add version column to all editable tables for optimistic locking"""
import sqlite3
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "superapps.db")

TABLES = [
    "asset_common",
    "asset_configurations",
    "config_categories",
    "penilaian_risiko",
    "interested_parties",
    "peluang",
    "isu_matrix",
    "project_tasks",
    "sprints",
    "work_logs",
    "worklog_checklist",
    "incident_report",
    "quality_objectives",
    "log_maintenance",
    "log_compression",
    "document_categories",
    "app_settings",
    "smtp_settings",
    "monthly_server_check",
    "users",
    "user_module_access",
    "roles",
]


def run_migration():
    if not os.path.exists(DB_PATH):
        print(f"[ERROR] Database not found at {DB_PATH}")
        return

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    for table in TABLES:
        try:
            cursor.execute(f"PRAGMA table_info({table})")
            columns = [row[1] for row in cursor.fetchall()]

            if "version" in columns:
                print(f"[SKIP] {table}: version column already exists")
                continue

            cursor.execute(f"ALTER TABLE {table} ADD COLUMN version INTEGER DEFAULT 0")
            print(f"[OK] {table}: added version column")
        except sqlite3.OperationalError as e:
            print(f"[ERROR] {table}: {e}")

    conn.commit()
    conn.close()
    print("\n[DONE] Migration complete")


if __name__ == "__main__":
    run_migration()
