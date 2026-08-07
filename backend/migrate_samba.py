#!/usr/bin/env python3
"""Migrate samba_internal to samba_192 and samba_external to samba_sequis"""
import requests

# Get all assets
response = requests.get('http://localhost:8001/api/assets?page_size=100')
assets = response.json().get('data', [])

# Find samba_internal and samba_external
samba_internal = [a for a in assets if a.get('sub_category') == 'samba_internal']
samba_external = [a for a in assets if a.get('sub_category') == 'samba_external']

print(f"Found {len(samba_internal)} samba_internal assets")
print(f"Found {len(samba_external)} samba_external assets")

# Update samba_internal -> samba_192
for asset in samba_internal:
    print(f"\nUpdating {asset['asset_code']} to samba_192...")
    # Clean up attributes - keep only username and group_name
    attrs = asset.get('attributes', {})
    new_attrs = {
        'username': attrs.get('username', ''),
        'group_name': attrs.get('group_name', '')
    }
    
    update_data = {
        'name': asset['name'],
        'category': 'users',
        'sub_category': 'samba_192',
        'classification': asset['classification'],
        'status': asset['status'],
        'owner_name': asset['owner_name'],
        'assigned_to': asset['assigned_to'],
        'location': asset['location'],
        'attributes': new_attrs
    }
    
    response = requests.put(f"http://localhost:8001/api/assets/{asset['id']}", data=update_data)
    if response.ok:
        print(f"  ✓ Updated to samba_192")
    else:
        print(f"  ✗ Failed: {response.text}")

# Update samba_external -> samba_sequis
for asset in samba_external:
    print(f"\nUpdating {asset['asset_code']} to samba_sequis...")
    attrs = asset.get('attributes', {})
    new_attrs = {
        'username': attrs.get('username', ''),
        'group_name': attrs.get('group_name', ''),
        'password': attrs.get('password', ''),
        'permission_level': attrs.get('permission', 'Read Only'),
        'account_status': 'Active',
        'created_date': attrs.get('validity', ''),
        'email': '',
        'comments': ''
    }
    
    update_data = {
        'name': asset['name'],
        'category': 'users',
        'sub_category': 'samba_sequis',
        'classification': asset['classification'],
        'status': asset['status'],
        'owner_name': asset['owner_name'],
        'assigned_to': asset['assigned_to'],
        'location': asset['location'],
        'attributes': new_attrs
    }
    
    response = requests.put(f"http://localhost:8001/api/assets/{asset['id']}", data=update_data)
    if response.ok:
        print(f"  ✓ Updated to samba_sequis")
    else:
        print(f"  ✗ Failed: {response.text}")

print("\n✓ Migration complete!")
