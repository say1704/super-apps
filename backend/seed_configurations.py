"""Seed script for Configuration Catalog - Simple Documentation Data"""
import sqlite3
import json
from datetime import datetime, timedelta

# Connect to database
conn = sqlite3.connect('superapps.db')
conn.row_factory = sqlite3.Row
cur = conn.cursor()

print("=== SEEDING CONFIGURATION CATALOG DATA ===\n")

# Get all hardware assets
cur.execute("""
    SELECT id, asset_code, name, category, sub_category
    FROM assets
    WHERE category = 'hardware'
""")
hardware_assets = cur.fetchall()

print(f"Found {len(hardware_assets)} hardware assets\n")

# Configuration templates per sub-category
# Focus on documentation, not compliance
CONFIG_TEMPLATES = {
    'laptop': [
        {'parameter': 'Disk Encryption', 'value': 'BitLocker Enabled', 'category': 'security', 'notes': 'Full disk encryption for data protection'},
        {'parameter': 'Auto Lock Screen', 'value': '5 minutes', 'category': 'security', 'notes': 'Automatic screen lock after inactivity'},
        {'parameter': 'Antivirus', 'value': 'Windows Defender Active', 'category': 'security', 'notes': 'Real-time protection enabled'},
        {'parameter': 'USB Port Status', 'value': 'Enabled', 'category': 'operational', 'notes': 'USB ports available for use'},
        {'parameter': 'Firewall Status', 'value': 'Enabled', 'category': 'security', 'notes': 'Windows Firewall active'},
    ],
    'server_rack': [
        {'parameter': 'SSH Port', 'value': '22', 'category': 'network', 'notes': 'Default SSH port'},
        {'parameter': 'Root Login', 'value': 'Disabled', 'category': 'security', 'notes': 'Root login disabled for security'},
        {'parameter': 'Firewall Status', 'value': 'UFW Active', 'category': 'security', 'notes': 'Uncomplicated Firewall enabled'},
        {'parameter': 'Auto Update', 'value': 'Enabled', 'category': 'operational', 'notes': 'Automatic security updates'},
        {'parameter': 'NTP Sync', 'value': 'Enabled', 'category': 'operational', 'notes': 'Time synchronization active'},
        {'parameter': 'Password Policy', 'value': 'Min 12 characters', 'category': 'security', 'notes': 'Strong password requirement'},
    ],
    'server_tower': [
        {'parameter': 'SSH Port', 'value': '22', 'category': 'network', 'notes': 'Default SSH port'},
        {'parameter': 'Root Login', 'value': 'Disabled', 'category': 'security', 'notes': 'Root login disabled for security'},
        {'parameter': 'Firewall Status', 'value': 'Enabled', 'category': 'security', 'notes': 'Firewall active'},
        {'parameter': 'Auto Update', 'value': 'Enabled', 'category': 'operational', 'notes': 'Automatic updates enabled'},
        {'parameter': 'NTP Sync', 'value': 'Enabled', 'category': 'operational', 'notes': 'Time synchronization active'},
    ],
    'kvm': [
        {'parameter': 'Default Credential Changed', 'value': 'Yes', 'category': 'security', 'notes': 'Default password changed'},
        {'parameter': 'SNMP Version', 'value': 'v3', 'category': 'network', 'notes': 'SNMP v3 with authentication'},
        {'parameter': 'Telnet Status', 'value': 'Disabled', 'category': 'security', 'notes': 'Telnet disabled, using SSH'},
        {'parameter': 'SSH Enabled', 'value': 'Yes', 'category': 'network', 'notes': 'SSH access enabled'},
    ],
    'disk_sas': [
        {'parameter': 'RAID Status', 'value': 'Healthy', 'category': 'operational', 'notes': 'RAID array healthy'},
        {'parameter': 'SMART Status', 'value': 'Pass', 'category': 'operational', 'notes': 'SMART monitoring passed'},
        {'parameter': 'Temperature', 'value': '35°C', 'category': 'performance', 'notes': 'Operating temperature normal'},
    ],
    'tape_cassette': [
        {'parameter': 'Encryption Enabled', 'value': 'Yes', 'category': 'security', 'notes': 'Tape encryption active'},
        {'parameter': 'Offsite Storage', 'value': 'Yes', 'category': 'operational', 'notes': 'Backup stored offsite'},
        {'parameter': 'Retention Period', 'value': '7 years', 'category': 'operational', 'notes': 'Compliance retention period'},
    ],
    'other': [
        {'parameter': 'Power Status', 'value': 'Normal', 'category': 'operational', 'notes': 'Power supply normal'},
        {'parameter': 'Temperature', 'value': 'Normal', 'category': 'performance', 'notes': 'Operating temperature normal'},
    ]
}

created = 0
updated = 0

for asset in hardware_assets:
    asset_id = asset['id']
    sub_category = asset['sub_category']

    # Get template for this sub-category
    template = CONFIG_TEMPLATES.get(sub_category, CONFIG_TEMPLATES['other'])

    print(f"Processing {asset['asset_code']} ({sub_category})...")

    for config in template:
        # Check if exists
        cur.execute("""
            SELECT id FROM asset_configurations
            WHERE asset_id = ? AND parameter = ?
        """, (asset_id, config['parameter']))

        existing = cur.fetchone()

        if existing:
            # Update
            cur.execute("""
                UPDATE asset_configurations
                SET value = ?, category = ?, notes = ?, updated_at = ?
                WHERE asset_id = ? AND parameter = ?
            """, (config['value'], config['category'], config['notes'], datetime.now(), asset_id, config['parameter']))
            updated += 1
        else:
            # Insert
            last_checked = datetime.now() - timedelta(days=5)
            cur.execute("""
                INSERT INTO asset_configurations
                (asset_id, parameter, value, category, notes, last_checked, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (asset_id, config['parameter'], config['value'], config['category'], 
                  config['notes'], last_checked, datetime.now(), datetime.now()))
            created += 1

    conn.commit()

print(f"\n=== SEEDING COMPLETE ===")
print(f"Created: {created} configurations")
print(f"Updated: {updated} configurations")
print(f"Total: {created + updated} configurations")

conn.close()
