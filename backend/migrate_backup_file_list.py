"""Migration script to add file_list column to backup_history table"""
import sqlite3
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
try:
    from utils.config import get_db_path
    DB_PATH = get_db_path()
except Exception:
    # Fallback to legacy location
    DB_PATH = os.path.join(os.path.dirname(__file__), 'superapps.db')


def migrate():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    columns_to_add = [
        ('file_list', 'TEXT'),
    ]

    for col_name, col_type in columns_to_add:
        try:
            cursor.execute(f"ALTER TABLE backup_history ADD COLUMN {col_name} {col_type}")
            print(f"Added column: {col_name}")
        except sqlite3.OperationalError as e:
            if 'duplicate column name' in str(e).lower():
                print(f"Column {col_name} already exists, skipping")
            else:
                raise

    conn.commit()
    conn.close()
    print("Migration completed successfully")


if __name__ == '__main__':
    migrate()
