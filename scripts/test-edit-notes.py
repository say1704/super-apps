#!/usr/bin/env python3
"""Test edit notes functionality"""

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
print("🧪 TESTING EDIT NOTES FUNCTIONALITY")
print("=" * 60)

# Get first compression record
resp = requests.get(f"{BASE_URL}/api/log-compression", headers=headers)
records = resp.json()

if records:
    first_record = records[0]
    record_id = first_record['id']
    old_notes = first_record.get('notes', '')
    
    print(f"\n📝 Record ID: {record_id}")
    print(f"   Archive: {first_record['archive_info']}")
    print(f"   Old Notes: {old_notes}")
    
    # Update notes
    new_notes = "Testing edit functionality - UPDATED"
    print(f"\n✏️  Updating notes to: {new_notes}")
    
    form_data = {
        "server": first_record['server'],
        "archive_info": first_record['archive_info'],
        "execution_date": first_record['execution_date'],
        "notes": new_notes
    }
    
    resp = requests.put(
        f"{BASE_URL}/api/log-compression/{record_id}",
        headers=headers,
        data=form_data
    )
    
    if resp.status_code == 200:
        updated = resp.json()
        print(f"✅ Update successful!")
        print(f"   New Notes: {updated.get('notes', '')}")
        
        # Verify
        resp = requests.get(f"{BASE_URL}/api/log-compression/{record_id}", headers=headers)
        verified = resp.json()
        if verified.get('notes') == new_notes:
            print(f"\n✅ VERIFIED: Notes updated correctly!")
        else:
            print(f"\n❌ VERIFICATION FAILED: Notes mismatch")
    else:
        print(f"❌ Update failed: {resp.status_code}")
        print(f"   Response: {resp.text}")
else:
    print("❌ No compression records found")

print("\n" + "=" * 60)
