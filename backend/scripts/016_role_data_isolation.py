"""Migration 016: Role-Based Data Isolation — Add owner_role column + backfill existing data"""
import os
import sys
import shutil
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "superapps.db")

BACKUP_SUFFIX = "pre-016-role-data-isolation"

TABLES_WITH_OWNER_ROLE = [
    "asset_common",
    "vulnerability_report",
    "incident_report",
    "penilaian_risiko",
    "peluang",
    "isu_matrix",
    "quality_objectives",
    "form_uploads",
    "log_maintenance",
    "log_compression",
]

ADD_COLUMN_QUERY = "ALTER TABLE {table} ADD COLUMN owner_role VARCHAR(50)"

ADD_INDEX_QUERY = "CREATE INDEX IF NOT EXISTS ix_{table}_owner_role ON {table}(owner_role)"

BACKFILL_BY_USER_ID = """
UPDATE {table}
SET owner_role = (SELECT role FROM users WHERE users.id = {table}.created_by)
WHERE created_by IS NOT NULL
  AND created_by != ''
  AND owner_role IS NULL
  AND typeof(created_by) = 'integer'
"""

BACKFILL_BY_USERNAME = """
UPDATE {table}
SET owner_role = (SELECT role FROM users WHERE users.username = {table}.created_by)
WHERE created_by IS NOT NULL
  AND created_by != ''
  AND owner_role IS NULL
  AND typeof(created_by) = 'text'
"""

BACKFILL_DEFAULT = """
UPDATE {table}
SET owner_role = 'superadmin'
WHERE owner_role IS NULL
"""


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

    # Step 2: Add owner_role column to 10 tables
    print("\n=== Adding owner_role Column ===")
    for table in TABLES_WITH_OWNER_ROLE:
        try:
            cursor.execute(ADD_COLUMN_QUERY.format(table=table))
            print(f"  [OK] {table}: column added")
        except sqlite3.OperationalError as e:
            if "duplicate column" in str(e).lower():
                print(f"  [SKIP] {table}: column already exists")
            else:
                print(f"  [ERROR] {table}: {e}")

    conn.commit()

    # Step 3: Backfill existing data
    print("\n=== Backfilling owner_role ===")
    total_backfilled = 0
    for table in TABLES_WITH_OWNER_ROLE:
        try:
            # Check if table has created_by column
            cursor.execute(f"PRAGMA table_info({table})")
            columns = [row[1] for row in cursor.fetchall()]
            has_created_by = "created_by" in columns

            if has_created_by:
                # Backfill by user ID (integer FK)
                cursor.execute(BACKFILL_BY_USER_ID.format(table=table))
                by_id = cursor.rowcount

                # Backfill by username (text)
                cursor.execute(BACKFILL_BY_USERNAME.format(table=table))
                by_name = cursor.rowcount

                # Default to superadmin for remaining
                cursor.execute(BACKFILL_DEFAULT.format(table=table))
                by_default = cursor.rowcount

                total = by_id + by_name + by_default
                total_backfilled += total
                if total > 0:
                    print(f"  [OK] {table}: {by_id} by user_id, {by_name} by username, {by_default} default → {total} total")
                else:
                    print(f"  [SKIP] {table}: no records to backfill")
            else:
                # No created_by column, default all to superadmin
                cursor.execute(BACKFILL_DEFAULT.format(table=table))
                by_default = cursor.rowcount
                total_backfilled += by_default
                if by_default > 0:
                    print(f"  [OK] {table}: {by_default} default (no created_by column)")
                else:
                    print(f"  [SKIP] {table}: no records to backfill")
        except sqlite3.OperationalError as e:
            print(f"  [ERROR] {table}: {e}")

    conn.commit()
    print(f"\n  Total backfilled: {total_backfilled} records")

    # Step 4: Add indexes
    print("\n=== Adding Indexes ===")
    indexes_added = 0
    for table in TABLES_WITH_OWNER_ROLE:
        try:
            cursor.execute(ADD_INDEX_QUERY.format(table=table))
            indexes_added += 1
            print(f"  [OK] ix_{table}_owner_role")
        except sqlite3.OperationalError as e:
            if "already exists" in str(e):
                print(f"  [SKIP] ix_{table}_owner_role: already exists")
            else:
                print(f"  [ERROR] ix_{table}_owner_role: {e}")

    conn.commit()
    print(f"\n  Total indexes: {indexes_added}")

    # Step 5: Verify
    print("\n=== Verification ===")
    cursor.execute("PRAGMA integrity_check")
    integrity = cursor.fetchone()[0]
    print(f"  Integrity: {integrity}")

    for table in TABLES_WITH_OWNER_ROLE:
        cursor.execute(f"SELECT COUNT(*) FROM {table}")
        total = cursor.fetchone()[0]
        cursor.execute(f"SELECT COUNT(*) FROM {table} WHERE owner_role IS NOT NULL")
        filled = cursor.fetchone()[0]
        print(f"  {table}: {filled}/{total} records have owner_role")

    conn.close()
    print(f"\n[DONE] Migration 016 complete at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")


if __name__ == "__main__":
    run_migration()
