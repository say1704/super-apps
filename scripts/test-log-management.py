#!/usr/bin/env python3
"""Test script for Log Management refactoring"""

import requests

BASE_URL = "http://localhost:8001"

# Login
resp = requests.post(f"{BASE_URL}/token", data={
    "username": "admin",
    "password": "CHANGE_ME",
    "grant_type": "password"
})
token = resp.json().get("access_token")
headers = {"Authorization": f"Bearer {token}"}

print("=" * 60)
print("🧪 TESTING LOG MANAGEMENT REFACTORING")
print("=" * 60)

# Test 1: Parent Dashboard
print("\n1️⃣  Testing Parent Dashboard...")
try:
    resp = requests.get(f"{BASE_URL}/api/log-maintenance", headers=headers)
    print(f"   ✅ Log Deletion API: {len(resp.json())} records")
except Exception as e:
    print(f"   ❌ Log Deletion API: {e}")

# Test 2: Compression Module
print("\n2️⃣  Testing Compression Module...")
try:
    resp = requests.get(f"{BASE_URL}/api/log-compression", headers=headers)
    print(f"   ✅ Log Compression API: {len(resp.json())} records")
except Exception as e:
    print(f"   ❌ Log Compression API: {e}")

# Test 3: Create Compression Record
print("\n3️⃣  Testing Create Compression...")
try:
    resp = requests.post(f"{BASE_URL}/api/log-compression", headers=headers, data={
        "server": "NAS-001",
        "archive_info": "bck_202402.tbz2",
        "execution_date": "2024-02-24",
        "notes": "Test compression"
    })
    if resp.status_code == 200:
        print(f"   ✅ Created compression record: {resp.json()['id']}")
    else:
        print(f"   ⚠️  Response: {resp.status_code}")
except Exception as e:
    print(f"   ❌ Create Compression: {e}")

# Test 4: Compression Report
print("\n4️⃣  Testing Compression Report...")
try:
    resp = requests.get(f"{BASE_URL}/api/log-compression/reports/summary", headers=headers)
    data = resp.json()
    print(f"   ✅ Report: {data.get('total_servers', 0)} servers, {data.get('total_archives', 0)} archives")
except Exception as e:
    print(f"   ❌ Report: {e}")

# Test 5: Activity Logs
print("\n5️⃣  Testing Activity Logs...")
try:
    resp = requests.get(f"{BASE_URL}/api/activity-logs", headers=headers)
    logs = resp.json()
    log_activities = [l for l in logs if 'Log' in l.get('module', '')]
    print(f"   ✅ Activity Logs: {len(log_activities)} log-related activities")
except Exception as e:
    print(f"   ❌ Activity Logs: {e}")

print("\n" + "=" * 60)
print("✅ TESTING COMPLETED")
print("=" * 60)
