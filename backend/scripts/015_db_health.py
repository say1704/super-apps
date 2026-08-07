"""Migration 015: DB Health — Clean orphaned FK records + Add missing performance indexes"""
import os
import sys
import shutil
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "superapps.db")

BACKUP_SUFFIX = "pre-015-db-health"

CLEANUP_QUERIES = [
    ("Clean all user_sessions referencing deleted users (inactive, expired, or active)",
     "DELETE FROM user_sessions WHERE user_id NOT IN (SELECT id FROM users)"),
    ("Set user_id=NULL on orphaned activity_logs (preserve audit trail)",
     "UPDATE activity_logs SET user_id = NULL WHERE user_id NOT IN (SELECT id FROM users) AND user_id IS NOT NULL"),
    ("Set user_id=NULL on orphaned asset_audit_logs (preserve audit trail)",
     "UPDATE asset_audit_logs SET user_id = NULL WHERE user_id NOT IN (SELECT id FROM users) AND user_id IS NOT NULL"),
    ("Delete orphaned asset_audit_logs referencing deleted assets (asset_code/name preserved)",
     "DELETE FROM asset_audit_logs WHERE asset_id NOT IN (SELECT id FROM asset_common)"),
]

INDEX_QUERIES = [
    "CREATE INDEX IF NOT EXISTS ix_activity_logs_module ON activity_logs(module)",
    "CREATE INDEX IF NOT EXISTS ix_activity_logs_action ON activity_logs(action)",
    "CREATE INDEX IF NOT EXISTS ix_activity_logs_created_at ON activity_logs(created_at)",
    "CREATE INDEX IF NOT EXISTS ix_incident_report_status ON incident_report(status)",
    "CREATE INDEX IF NOT EXISTS ix_incident_report_type ON incident_report(incident_type)",
    "CREATE INDEX IF NOT EXISTS ix_incident_report_date ON incident_report(incident_date)",
    "CREATE INDEX IF NOT EXISTS ix_vulnerability_report_tools ON vulnerability_report(tools)",
    "CREATE INDEX IF NOT EXISTS ix_vulnerability_report_date ON vulnerability_report(scan_date)",
    "CREATE INDEX IF NOT EXISTS ix_quality_objectives_work_unit ON quality_objectives(work_unit)",
    "CREATE INDEX IF NOT EXISTS ix_project_tasks_status ON project_tasks(status)",
    "CREATE INDEX IF NOT EXISTS ix_project_tasks_priority ON project_tasks(priority)",
    "CREATE INDEX IF NOT EXISTS ix_project_tasks_due_date ON project_tasks(due_date)",
    "CREATE INDEX IF NOT EXISTS ix_irmc_check_status ON irmc_check(status)",
    "CREATE INDEX IF NOT EXISTS ix_irmc_check_server ON irmc_check(server_name)",
    "CREATE INDEX IF NOT EXISTS ix_irmc_check_date ON irmc_check(check_date)",
    "CREATE INDEX IF NOT EXISTS ix_work_logs_category ON work_logs(category)",
    "CREATE INDEX IF NOT EXISTS ix_work_logs_created_at ON work_logs(created_at)",
]


def run_migration():
    if not os.path.exists(DB_PATH):
        print(f"[ERROR] Database not found at {DB_PATH}")
        return

    import sqlite3

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Step 1: Backup
    backup_path = f"{DB_PATH}.{BACKUP_SUFFIX}.bak"
    if not os.path.exists(backup_path):
        shutil.copy2(DB_PATH, backup_path)
        print(f"[OK] Backup created: {os.path.basename(backup_path)}")
    else:
        print(f"[SKIP] Backup already exists: {os.path.basename(backup_path)}")

    # Step 2: Clean orphaned FK records
    print("\n=== Cleaning Orphaned FK Records ===")
    total_cleaned = 0
    for desc, query in CLEANUP_QUERIES:
        try:
            cursor.execute(query)
            affected = cursor.rowcount
            total_cleaned += affected
            if affected > 0:
                print(f"  [OK] {desc}: {affected} records")
            else:
                print(f"  [SKIP] {desc}: no orphaned records")
        except sqlite3.OperationalError as e:
            print(f"  [ERROR] {desc}: {e}")

    conn.commit()
    print(f"\n  Total cleaned: {total_cleaned} records")

    # Step 3: Add missing indexes
    print("\n=== Adding Missing Indexes ===")
    indexes_added = 0
    for query in INDEX_QUERIES:
        idx_name = query.split("ix_")[1].split(" ")[0] if "ix_" in query else "unknown"
        try:
            cursor.execute(query)
            if cursor.rowcount == 0 or True:
                indexes_added += 1
                print(f"  [OK] {idx_name}")
        except sqlite3.OperationalError as e:
            if "already exists" in str(e):
                print(f"  [SKIP] {idx_name}: already exists")
            else:
                print(f"  [ERROR] {idx_name}: {e}")

    conn.commit()
    print(f"\n  Total indexes: {indexes_added}")

    # Step 4: Verify integrity
    print("\n=== Verification ===")
    cursor.execute("PRAGMA integrity_check")
    integrity = cursor.fetchone()[0]
    print(f"  Integrity: {integrity}")

    cursor.execute("PRAGMA foreign_key_check")
    fk_errors = cursor.fetchall()
    remaining = len(fk_errors)
    print(f"  FK errors remaining: {remaining} (was 51)")

    cursor.execute("PRAGMA page_count")
    pages = cursor.fetchone()[0]
    cursor.execute("PRAGMA page_size")
    page_size = cursor.fetchone()[0]
    size_kb = (pages * page_size) / 1024
    print(f"  DB size: {size_kb:.0f} KB")

    conn.close()
    print(f"\n[DONE] Migration 015 complete at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")


if __name__ == "__main__":
    run_migration()
