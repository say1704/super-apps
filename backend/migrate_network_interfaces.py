#!/usr/bin/env python3
"""Migration: Add server info fields and network_interfaces table"""
import sqlite3
import os

db_path = os.path.join(os.path.dirname(__file__), 'data', 'superapps.db')

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Add new columns to capacity_metrics table
columns_to_add = [
    ('server_date', 'VARCHAR(255)'),
    ('local_ip', 'VARCHAR(50)'),
    ('public_ip', 'VARCHAR(50)')
]

for col_name, col_type in columns_to_add:
    try:
        cursor.execute(f'ALTER TABLE capacity_metrics ADD COLUMN {col_name} {col_type}')
        print(f"✅ Added column {col_name} to capacity_metrics")
    except sqlite3.OperationalError as e:
        if 'duplicate column name' in str(e).lower():
            print(f"ℹ️  Column {col_name} already exists")
        else:
            raise

# Create network_interfaces table
cursor.execute('''
CREATE TABLE IF NOT EXISTS network_interfaces (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    capacity_metric_id INTEGER,
    hostname VARCHAR(255) NOT NULL,
    tanggal DATE NOT NULL,
    interface_name VARCHAR(100) NOT NULL,
    speed VARCHAR(50),
    total_rx VARCHAR(50),
    total_tx VARCHAR(50),
    total_rx_error INTEGER DEFAULT 0,
    total_tx_error INTEGER DEFAULT 0,
    total_packet_drop INTEGER DEFAULT 0,
    internet_status VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tanggal, hostname, interface_name)
)
''')

# Create indexes
cursor.execute('CREATE INDEX IF NOT EXISTS idx_net_intf_hostname ON network_interfaces(hostname)')
cursor.execute('CREATE INDEX IF NOT EXISTS idx_net_intf_tanggal ON network_interfaces(tanggal)')
cursor.execute('CREATE INDEX IF NOT EXISTS idx_net_intf_name ON network_interfaces(interface_name)')

conn.commit()
conn.close()

print("✅ Migration complete: server info fields and network_interfaces table created")
