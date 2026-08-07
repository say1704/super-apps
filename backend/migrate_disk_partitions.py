#!/usr/bin/env python3
"""Migration: Add disk_partitions table for dynamic partition tracking"""
import sqlite3
import os

db_path = os.path.join(os.path.dirname(__file__), 'superapps.db')

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Create disk_partitions table
cursor.execute('''
CREATE TABLE IF NOT EXISTS disk_partitions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hostname VARCHAR(255) NOT NULL,
    tanggal DATE NOT NULL,
    mount_point VARCHAR(255) NOT NULL,
    filesystem VARCHAR(255),
    size VARCHAR(50),
    used VARCHAR(50),
    avail VARCHAR(50),
    use_pct INTEGER,
    source VARCHAR(50) DEFAULT 'sar_ssh',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tanggal, hostname, mount_point)
)
''')

# Create indexes
cursor.execute('CREATE INDEX IF NOT EXISTS idx_part_hostname ON disk_partitions(hostname)')
cursor.execute('CREATE INDEX IF NOT EXISTS idx_part_tanggal ON disk_partitions(tanggal)')
cursor.execute('CREATE INDEX IF NOT EXISTS idx_part_mount ON disk_partitions(mount_point)')

conn.commit()
conn.close()

print("✅ Migration complete: disk_partitions table created")
