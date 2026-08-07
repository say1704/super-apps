"""Migration 022: Add FormFolder table + folder_id to FormUpload + auto-migrate existing files"""
import os
import sqlite3
from datetime import datetime, timezone

def run_migration(db_path: str):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # Check if already applied
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='form_folders'")
    if cursor.fetchone():
        # Check if folder_id column exists
        cursor.execute("PRAGMA table_info(form_uploads)")
        columns = [row[1] for row in cursor.fetchall()]
        if "folder_id" in columns:
            conn.close()
            return False  # Already applied
    else:
        # Create form_folders table
        cursor.execute("""
            CREATE TABLE form_folders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name VARCHAR(100) NOT NULL,
                description VARCHAR(500),
                parent_id INTEGER,
                owner_role VARCHAR(50) NOT NULL,
                created_by INTEGER,
                created_at DATETIME,
                updated_at DATETIME,
                version INTEGER DEFAULT 0,
                FOREIGN KEY (parent_id) REFERENCES form_folders(id),
                FOREIGN KEY (created_by) REFERENCES users(id)
            )
        """)
        cursor.execute("CREATE INDEX idx_form_folders_owner_role ON form_folders(owner_role)")
        cursor.execute("CREATE INDEX idx_form_folders_parent_id ON form_folders(parent_id)")

    # Add folder_id column to form_uploads if not exists
    cursor.execute("PRAGMA table_info(form_uploads)")
    columns = [row[1] for row in cursor.fetchall()]
    if "folder_id" not in columns:
        cursor.execute("ALTER TABLE form_uploads ADD COLUMN folder_id INTEGER REFERENCES form_folders(id)")
        cursor.execute("CREATE INDEX idx_form_uploads_folder_id ON form_uploads(folder_id)")

    # Auto-migrate: create default folders based on form_type and move files
    cursor.execute("SELECT DISTINCT form_type FROM form_uploads WHERE form_type IS NOT NULL")
    form_types = [row[0] for row in cursor.fetchall()]

    type_to_folder = {}
    for ft in form_types:
        folder_name = f"{ft} Forms" if ft else "Uncategorized"
        cursor.execute("SELECT id FROM form_folders WHERE name = ? AND owner_role = 'superadmin'", (folder_name,))
        existing = cursor.fetchone()
        if existing:
            folder_id = existing[0]
        else:
            now = datetime.now(timezone.utc).isoformat()
            cursor.execute(
                "INSERT INTO form_folders (name, description, owner_role, created_at, updated_at, version) VALUES (?, ?, 'superadmin', ?, ?, 0)",
                (folder_name, f"Auto-created folder for {ft} forms", now, now)
            )
            folder_id = cursor.lastrowid
        type_to_folder[ft] = folder_id

    # Move existing files to their folders
    for form_type, folder_id in type_to_folder.items():
        if form_type:
            cursor.execute("UPDATE form_uploads SET folder_id = ? WHERE form_type = ? AND folder_id IS NULL", (folder_id, form_type))

    conn.commit()
    conn.close()
    return True
