#!/usr/bin/env python3
"""Seed dummy data for Monthly Server Check module"""

import requests
from datetime import datetime, timedelta
import random

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
SERVERS = [
    "10.0.0.1", "10.0.0.2", "10.0.0.3", "10.0.0.4", "10.0.0.5",
    "192.168.1.10", "192.168.1.11", "192.168.1.12",
    "NAS-001", "NAS-002", "NAS-003",
    "WEB-SRV-01", "WEB-SRV-02",
    "DB-SRV-01", "DB-SRV-02",
    "APP-SRV-01", "APP-SRV-02", "APP-SRV-03",
    "MAIL-SRV-01", "BACKUP-SRV-01",
]

MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
]

STATUSES = ["OK", "OK", "OK", "Warning", "Critical"]  # More OKs than issues

NOTES_TEMPLATES = [
    "Backup successful, all systems normal",
    "Backup completed with warnings",
    "Critical issue found and resolved",
    "Monthly backup and health check completed",
    "All backup jobs completed successfully",
    "Disk space warning, cleaned up",
    "Network connectivity issue, resolved",
    "Backup verification passed",
    "System updates applied successfully",
    "No issues found during monthly check",
    "Backup size larger than usual, investigated",
    "All services running normally",
]

print("=" * 70)
print("🖥️  SEEDING MONTHLY SERVER CHECK DUMMY DATA")
print("=" * 70)

# Generate 60 records (5 servers x 12 months)
created = 0
current_year = datetime.now().year

# Create records for past 12 months for 5 different servers
for month_idx in range(11, -1, -1):  # From 11 months ago to current
    month_name = MONTHS[month_idx]
    
    # Pick 5 random servers for this month
    servers_for_month = random.sample(SERVERS, 5)
    
    for server in servers_for_month:
        # Generate check date (somewhere in the month)
        check_date = datetime(current_year, month_idx + 1, random.randint(1, 28))
        
        status = random.choice(STATUSES)
        
        data = {
            "ip_server": server,
            "month": month_name,
            "check_date": check_date.strftime("%Y-%m-%d"),
            "status": status,
            "notes": random.choice(NOTES_TEMPLATES),
        }
        
        resp = requests.post(f"{BASE_URL}/api/monthly-server-check", headers=headers, data=data)
        if resp.status_code == 200:
            created += 1
            status_icon = "✅" if status == "OK" else "⚠️" if status == "Warning" else "❌"
            print(f"✅ [{created:3d}] {server:15s} | {month_name:10s} | {status_icon} {status}")
        else:
            print(f"❌ Failed: {server} - {resp.status_code}")

print()
print(f"✅ Successfully created {created} monthly server check records!")
print("=" * 70)
print()
print("Next steps:")
print("1. Open http://localhost:3001/modules/monthly-server-check")
print("2. Verify pagination (20 records/page = 3 pages)")
print("3. Test sorting by clicking column headers")
print("4. Test filters (Month, Status)")
print("=" * 70)
