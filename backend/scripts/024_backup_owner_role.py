"""Migration 024: Add owner_role column to backup_history for RBAC filtering"""
import sqlite3

def run_migration(db_path: str):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    cursor.execute("PRAGMA table_info(backup_history)")
    columns = [row[1] for row in cursor.fetchall()]

    if "owner_role" in columns:
        conn.close()
        return False

    cursor.execute("ALTER TABLE backup_history ADD COLUMN owner_role VARCHAR(50)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_backup_history_owner_role ON backup_history(owner_role)")

    conn.commit()
    conn.close()
    return True
