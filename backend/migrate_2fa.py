"""Migration script to add 2FA columns to users table"""
import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), 'superapps.db')

def migrate():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    columns_to_add = [
        ('two_factor_enabled', 'BOOLEAN DEFAULT 0'),
        ('two_factor_secret', 'TEXT'),
    ]
    
    for col_name, col_type in columns_to_add:
        try:
            cursor.execute(f"ALTER TABLE users ADD COLUMN {col_name} {col_type}")
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
