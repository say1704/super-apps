"""Migration script for Activity Logs - Add new columns"""
import sqlite3

conn = sqlite3.connect('superapps.db')
cur = conn.cursor()

print("=== MIGRATING ACTIVITY_LOGS TABLE ===\n")

# Check if columns exist
cur.execute("PRAGMA table_info(activity_logs)")
columns = [col[1] for col in cur.fetchall()]

print(f"Existing columns: {columns}\n")

# Add missing columns
if 'asset_id' not in columns:
    print("Adding column: asset_id")
    cur.execute("ALTER TABLE activity_logs ADD COLUMN asset_id INTEGER")
    
if 'asset_code' not in columns:
    print("Adding column: asset_code")
    cur.execute("ALTER TABLE activity_logs ADD COLUMN asset_code TEXT")
    
if 'details' not in columns:
    print("Adding column: details")
    cur.execute("ALTER TABLE activity_logs ADD COLUMN details TEXT")
    
if 'ip_address' not in columns:
    print("Adding column: ip_address")
    cur.execute("ALTER TABLE activity_logs ADD COLUMN ip_address TEXT")

conn.commit()

# Verify
cur.execute("PRAGMA table_info(activity_logs)")
columns = [col[1] for col in cur.fetchall()]
print(f"\nFinal columns: {columns}")

print("\n=== MIGRATION COMPLETE ===")

conn.close()
