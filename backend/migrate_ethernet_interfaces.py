#!/usr/bin/env python3
"""Migration: Add ethernet_interfaces JSON column to capacity_metrics"""
import sqlite3
from pathlib import Path

db_path = Path(__file__).parent / "data" / "superapps.db"
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

try:
    cursor.execute("ALTER TABLE capacity_metrics ADD COLUMN ethernet_interfaces TEXT")
    conn.commit()
    print("✅ Added ethernet_interfaces column to capacity_metrics")
except sqlite3.OperationalError as e:
    if "duplicate column name" in str(e).lower():
        print("ℹ️  Column ethernet_interfaces already exists")
    else:
        raise

conn.close()
