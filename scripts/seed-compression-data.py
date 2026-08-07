#!/usr/bin/env python3
"""Seed dummy data for Log Compression module"""

import requests
from datetime import datetime, timedelta

BASE_URL = "http://localhost:8001"

# Login
resp = requests.post(f"{BASE_URL}/token", data={
    "username": "admin",
    "password": "CHANGE_ME",
    "grant_type": "password"
})
token = resp.json().get("access_token")
headers = {"Authorization": f"Bearer {token}"}

# Dummy data
DUMMY_DATA = [
    {
        "server": "NAS-001",
        "archive_info": "bck_202402.tbz2",
        "execution_date": "2024-02-01",
        "notes": "Monthly archive February 2024"
    },
    {
        "server": "NAS-001",
        "archive_info": "bck_202401.tbz2",
        "execution_date": "2024-01-02",
        "notes": "Monthly archive January 2024"
    },
    {
        "server": "NAS-001",
        "archive_info": "bck_202312.tbz2",
        "execution_date": "2023-12-01",
        "notes": "Monthly archive December 2023"
    },
    {
        "server": "NAS-001",
        "archive_info": "bck_202311.tbz2",
        "execution_date": "2023-11-01",
        "notes": "Monthly archive November 2023"
    },
    {
        "server": "NAS-002",
        "archive_info": "bck_202402.tbz2",
        "execution_date": "2024-02-01",
        "notes": "Backup NAS-002 February 2024"
    },
    {
        "server": "NAS-002",
        "archive_info": "bck_202401.tbz2",
        "execution_date": "2024-01-02",
        "notes": "Backup NAS-002 January 2024"
    },
    {
        "server": "10.0.0.100",
        "archive_info": "apps_log_202402.tgz",
        "execution_date": "2024-02-15",
        "notes": "Apps log compression Q1 2024"
    },
    {
        "server": "10.0.0.100",
        "archive_info": "system_log_202401.txz",
        "execution_date": "2024-01-20",
        "notes": "System log compression January 2024"
    },
]

print("=" * 60)
print("📦 SEEDING LOG COMPRESSION DUMMY DATA")
print("=" * 60)

# Add dummy data (skip check)
created = 0
for item in DUMMY_DATA:
    resp = requests.post(f"{BASE_URL}/api/log-compression", headers=headers, data=item)
    if resp.status_code == 200:
        created += 1
        print(f"✅ Created: {item['archive_info']} on {item['server']}")
    else:
        print(f"❌ Failed: {item['archive_info']} - {resp.status_code}")

print()
print(f"✅ Successfully created {created}/{len(DUMMY_DATA)} dummy records!")
print("=" * 60)
