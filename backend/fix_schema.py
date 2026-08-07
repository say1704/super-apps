import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "superapps.db")
TABLES = ["penilaian_risiko", "interested_parties", "peluang", "isu_matrix"]

def fix_schema():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    for table in TABLES:
        try:
            cursor.execute(f"PRAGMA table_info({table})")
            columns = [row[1] for row in cursor.fetchall()]
            if "deleted_at" not in columns:
                cursor.execute(f"ALTER TABLE {table} ADD COLUMN deleted_at DATETIME;")
                conn.commit()
                print(f"Fixed: {table}")
            else:
                print(f"Skipped: {table}")
        except Exception as e:
            print(f"Error on {table}: {e}")
    conn.close()
    print("Schema fix complete.")

if __name__ == "__main__":
    fix_schema()
