"""Migration 023: Add FormType table + seed default types"""
import sqlite3
from datetime import datetime, timezone

def run_migration(db_path: str):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='form_types'")
    if cursor.fetchone():
        conn.close()
        return False

    cursor.execute("""
        CREATE TABLE form_types (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name VARCHAR(100) NOT NULL UNIQUE,
            description VARCHAR(500),
            color VARCHAR(20) DEFAULT 'blue',
            icon VARCHAR(20) DEFAULT '📄',
            sort_order INTEGER DEFAULT 0,
            is_active INTEGER DEFAULT 1,
            owner_role VARCHAR(50) NOT NULL,
            created_by INTEGER,
            created_at DATETIME,
            updated_at DATETIME,
            version INTEGER DEFAULT 0,
            FOREIGN KEY (created_by) REFERENCES users(id)
        )
    """)
    cursor.execute("CREATE INDEX idx_form_types_owner_role ON form_types(owner_role)")
    cursor.execute("CREATE INDEX idx_form_types_name ON form_types(name)")

    now = datetime.now(timezone.utc).isoformat()
    defaults = [
        ("Change", "Change request forms", "blue", "📝", 0),
        ("Destruction", "Document destruction forms", "purple", "🗑️", 1),
    ]
    for name, desc, color, icon, sort in defaults:
        cursor.execute(
            "INSERT INTO form_types (name, description, color, icon, sort_order, owner_role, created_at, updated_at, version) VALUES (?, ?, ?, ?, ?, 'superadmin', ?, ?, 0)",
            (name, desc, color, icon, sort, now, now)
        )

    conn.commit()
    conn.close()
    return True
