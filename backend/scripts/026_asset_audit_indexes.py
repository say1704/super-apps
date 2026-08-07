"""Migration 026: Add missing indexes to asset_audit_logs table
Improves query performance for RBAC filtering, action type filtering, and asset lookups.
"""
import sqlite3
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "superapps.db")


def get_db_path():
    if not os.path.exists(DB_PATH):
        print(f"Database not found at {DB_PATH}")
        return None
    return DB_PATH


def add_indexes():
    db_path = get_db_path()
    if not os.path.exists(db_path):
        print(f"Database not found at {db_path}")
        return

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    existing_indexes = cursor.execute(
        "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='asset_audit_logs'"
    ).fetchall()
    existing_names = {row[0] for row in existing_indexes}

    indexes_to_add = [
        ("idx_audit_logs_user_id", "asset_audit_logs", "user_id"),
        ("idx_audit_logs_action_type", "asset_audit_logs", "action_type"),
        ("idx_audit_logs_asset_id", "asset_audit_logs", "asset_id"),
        ("idx_audit_logs_timestamp_desc", "asset_audit_logs", "timestamp"),
    ]

    added = 0
    for idx_name, table, column in indexes_to_add:
        if idx_name not in existing_names:
            try:
                cursor.execute(f"CREATE INDEX IF NOT EXISTS {idx_name} ON {table}({column})")
                print(f"Added index: {idx_name}")
                added += 1
            except sqlite3.OperationalError as e:
                print(f"Failed to add {idx_name}: {e}")
        else:
            print(f"Index already exists: {idx_name}")

    conn.commit()
    conn.close()
    print(f"Migration complete. Added {added} indexes.")


if __name__ == "__main__":
    add_indexes()
