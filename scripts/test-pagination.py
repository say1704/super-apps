#!/usr/bin/env python3
"""Test pagination implementation"""

import requests
import json

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
print("🧪 TESTING PAGINATION")
print("=" * 60)

# Test 1: Get page 1 with page_size=5
print("\n1️⃣  Testing Page 1 (page_size=5)...")
resp = requests.get(f"{BASE_URL}/api/log-compression?page=1&page_size=5", headers=headers)

if resp.status_code == 200:
    data = resp.json()
    print(f"   ✅ Status: 200 OK")
    print(f"   📊 Data records: {len(data.get('data', []))}")
    print(f"   📄 Pagination:")
    pagination = data.get('pagination', {})
    print(f"      - Page: {pagination.get('page')}")
    print(f"      - Page Size: {pagination.get('page_size')}")
    print(f"      - Total Records: {pagination.get('total_records')}")
    print(f"      - Total Pages: {pagination.get('total_pages')}")
    print(f"      - Has Next: {pagination.get('has_next')}")
    print(f"      - Has Prev: {pagination.get('has_prev')}")
else:
    print(f"   ❌ Status: {resp.status_code}")

# Test 2: Get page 2
print("\n2️⃣  Testing Page 2...")
resp = requests.get(f"{BASE_URL}/api/log-compression?page=2&page_size=5", headers=headers)

if resp.status_code == 200:
    data = resp.json()
    print(f"   ✅ Status: 200 OK")
    print(f"   📊 Data records: {len(data.get('data', []))}")
    pagination = data.get('pagination', {})
    print(f"   📄 Page {pagination.get('page')} of {pagination.get('total_pages')}")
else:
    print(f"   ❌ Status: {resp.status_code}")

# Test 3: Log Deletion pagination
print("\n3️⃣  Testing Log Deletion Pagination...")
resp = requests.get(f"{BASE_URL}/api/log-maintenance?page=1&page_size=5", headers=headers)

if resp.status_code == 200:
    data = resp.json()
    print(f"   ✅ Status: 200 OK")
    print(f"   📊 Data records: {len(data.get('data', []))}")
    pagination = data.get('pagination', {})
    print(f"   📄 Page {pagination.get('page')} of {pagination.get('total_pages')}")
    print(f"   📊 Total Records: {pagination.get('total_records')}")
else:
    print(f"   ❌ Status: {resp.status_code}")

print("\n" + "=" * 60)
print("✅ PAGINATION TEST COMPLETED")
print("=" * 60)
