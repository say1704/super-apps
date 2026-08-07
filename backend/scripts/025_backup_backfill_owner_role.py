"""Migration 025: Backfill owner_role for existing backup_history records

All existing records have owner_role = NULL since migration 024 only added the column.
This migration sets owner_role to 'Sysadmin' for all NULL records so that the
Sysadmin user can see existing backup data through RBAC filtering.
"""
import sqlite3


def run_migration(db_path: str):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # Check if there are NULL owner_role records to backfill
    cursor.execute("SELECT COUNT(*) FROM backup_history WHERE owner_role IS NULL")
    null_count = cursor.fetchone()[0]

    if null_count == 0:
        conn.close()
        return False

    # Backfill NULL owner_role to 'Sysadmin'
    cursor.execute("UPDATE backup_history SET owner_role = 'Sysadmin' WHERE owner_role IS NULL")

    conn.commit()
    conn.close()
    return True
