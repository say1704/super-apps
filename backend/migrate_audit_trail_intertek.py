"""Migration script for Audit Trail - Add Intertek format columns"""
import sqlite3

conn = sqlite3.connect('data/superapps.db')
cur = conn.cursor()

print("=== MIGRATING AUDIT_TRAIL TABLES (INTERTEK FORMAT) ===\n")

# Migrate audit_findings table
print("--- audit_findings table ---")
cur.execute("PRAGMA table_info(audit_findings)")
columns = [col[1] for col in cur.fetchall()]
print(f"Existing columns: {columns}\n")

# Add missing columns for audit_findings
new_columns = [
    ('client_name', 'TEXT'),
    ('site_location', 'TEXT'),
    ('audit_type', 'TEXT'),
    ('scope', 'TEXT'),
    ('criteria', 'TEXT'),
    ('finding_category', 'TEXT'),
    ('root_cause', 'TEXT'),
    ('follow_up_date', 'DATE'),
    ('verification_effectiveness', 'TEXT'),
]

for col_name, col_type in new_columns:
    if col_name not in columns:
        print(f"Adding column: {col_name} ({col_type})")
        cur.execute(f"ALTER TABLE audit_findings ADD COLUMN {col_name} {col_type}")

# Migrate corrective_actions table
print("\n--- corrective_actions table ---")
cur.execute("PRAGMA table_info(corrective_actions)")
columns = [col[1] for col in cur.fetchall()]
print(f"Existing columns: {columns}\n")

# Add missing columns for corrective_actions
new_columns = [
    ('action_plan', 'TEXT'),
    ('timeline', 'TEXT'),
    ('resources_required', 'TEXT'),
    ('effectiveness_criteria', 'TEXT'),
    ('follow_up_actions', 'TEXT'),
]

for col_name, col_type in new_columns:
    if col_name not in columns:
        print(f"Adding column: {col_name} ({col_type})")
        cur.execute(f"ALTER TABLE corrective_actions ADD COLUMN {col_name} {col_type}")

conn.commit()

# Verify
print("\n--- Verification ---")
cur.execute("PRAGMA table_info(audit_findings)")
columns = [col[1] for col in cur.fetchall()]
print(f"audit_findings final columns ({len(columns)}): {columns}")

cur.execute("PRAGMA table_info(corrective_actions)")
columns = [col[1] for col in cur.fetchall()]
print(f"corrective_actions final columns ({len(columns)}): {columns}")

print("\n=== MIGRATION COMPLETE ===")

conn.close()
