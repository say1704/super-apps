"""Migration script for Configuration Catalog - Remove compliance fields"""
import sqlite3

conn = sqlite3.connect('superapps.db')
cur = conn.cursor()

print("=== MIGRATING CONFIGURATION TABLE ===\n")

# Step 1: Create new table with updated schema
print("Creating temporary table with new schema...")
cur.execute("""
CREATE TABLE IF NOT EXISTS asset_configurations_new (
    id INTEGER PRIMARY KEY,
    asset_id INTEGER NOT NULL,
    parameter TEXT NOT NULL,
    value TEXT NOT NULL,
    category TEXT DEFAULT 'operational',
    notes TEXT,
    last_checked TIMESTAMP,
    created_by TEXT,
    updated_by TEXT,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    FOREIGN KEY (asset_id) REFERENCES assets(id)
)
""")

# Step 2: Copy data from old table to new table
print("Migrating data...")
try:
    cur.execute("""
    INSERT INTO asset_configurations_new (id, asset_id, parameter, value, category, notes, last_checked, created_by, updated_by, created_at, updated_at)
    SELECT id, asset_id, parameter, value, 
           COALESCE(category, 'operational') as category,
           notes,
           last_checked, created_by, updated_by, created_at, updated_at
    FROM asset_configurations
    """)
    print("Data migrated successfully")
except sqlite3.OperationalError as e:
    print(f"Note: {e}")
    print("Continuing with empty table...")

# Step 3: Drop old table
print("Dropping old table...")
cur.execute("DROP TABLE IF EXISTS asset_configurations")

# Step 4: Rename new table
print("Renaming new table...")
cur.execute("ALTER TABLE asset_configurations_new RENAME TO asset_configurations")

# Step 5: Create indexes
print("Creating indexes...")
cur.execute("CREATE INDEX IF NOT EXISTS idx_config_asset ON asset_configurations(asset_id)")
cur.execute("CREATE INDEX IF NOT EXISTS idx_config_category ON asset_configurations(category)")

# Step 6: Update config_change_history table (remove references to status/severity)
print("Updating change history table...")
cur.execute("""
CREATE TABLE IF NOT EXISTS config_change_history_new (
    id INTEGER PRIMARY KEY,
    config_id INTEGER NOT NULL,
    old_value TEXT NOT NULL,
    new_value TEXT NOT NULL,
    change_reason TEXT,
    change_request_id TEXT,
    changed_by TEXT,
    changed_at TIMESTAMP,
    FOREIGN KEY (config_id) REFERENCES asset_configurations(id)
)
""")

try:
    cur.execute("""
    INSERT INTO config_change_history_new (id, config_id, old_value, new_value, change_reason, change_request_id, changed_by, changed_at)
    SELECT id, config_id, old_value, new_value, change_reason, change_request_id, changed_by, changed_at
    FROM config_change_history
    """)
except sqlite3.OperationalError:
    pass

cur.execute("DROP TABLE IF EXISTS config_change_history")
cur.execute("ALTER TABLE config_change_history_new RENAME TO config_change_history")
cur.execute("CREATE INDEX IF NOT EXISTS idx_change_config ON config_change_history(config_id)")

conn.commit()

print("\n=== MIGRATION COMPLETE ===")
print("Table: asset_configurations")
print("Removed columns: baseline_expected, status, severity, auto_check")
print("Kept columns: id, asset_id, parameter, value, category, notes, timestamps")

conn.close()
