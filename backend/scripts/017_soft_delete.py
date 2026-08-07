"""Migration 017: Soft Delete — Add deleted_at column to high-churn tables"""
import os
import sys
import shutil
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "superapps.db")

BACKUP_SUFFIX = "pre-017-soft-delete"

TABLES = [
    "asset_common",
    "log_maintenance",
    "log_compression",
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

    # Step 2: Add deleted_at column
    print("\n=== Adding deleted_at Column ===")
    for table in TABLES:
        try:
            cursor.execute(f"ALTER TABLE {table} ADD COLUMN deleted_at DATETIME")
            print(f"  [OK] {table}: column added")
        except sqlite3.OperationalError as e:
            if "duplicate column" in str(e).lower():
                print(f"  [SKIP] {table}: column already exists")
            else:
                print(f"  [ERROR] {table}: {e}")

    conn.commit()

    # Step 3: Add indexes
    print("\n=== Adding Indexes ===")
    for table in TABLES:
        try:
            cursor.execute(f"CREATE INDEX IF NOT EXISTS ix_{table}_deleted_at ON {table}(deleted_at)")
            print(f"  [OK] ix_{table}_deleted_at")
        except sqlite3.OperationalError as e:
            if "already exists" in str(e):
                print(f"  [SKIP] ix_{table}_deleted_at: already exists")
            else:
                print(f"  [ERROR] ix_{table}_deleted_at: {e}")

    conn.commit()

    # Step 4: Verify
    print("\n=== Verification ===")
    cursor.execute("PRAGMA integrity_check")
    integrity = cursor.fetchone()[0]
    print(f"  Integrity: {integrity}")

    for table in TABLES:
        cursor.execute(f"SELECT COUNT(*) FROM {table}")
        total = cursor.fetchone()[0]
        cursor.execute(f"SELECT COUNT(*) FROM {table} WHERE deleted_at IS NULL")
        active = cursor.fetchone()[0]
        print(f"  {table}: {active} active / {total} total")

    conn.close()
    print(f"\n[DONE] Migration 017 complete at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")


if __name__ == "__main__":
    run_migration()
