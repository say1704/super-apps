#!/usr/bin/env python3
"""Migrate samba_internal to samba_192 and samba_external to samba_sequis"""
from database import SessionLocal
from models import Asset
import json

db = SessionLocal()

# Update samba_internal -> samba_192
samba_internal = db.query(Asset).filter(Asset.sub_category == 'samba_internal').all()
print(f"Found {len(samba_internal)} samba_internal assets")

for asset in samba_internal:
    print(f"\nUpdating {asset.asset_code} to samba_192...")
    asset.sub_category = 'samba_192'
    # Clean attributes - keep only username and group_name
    if asset.attributes:
        attrs = json.loads(asset.attributes)
        new_attrs = {
            'username': attrs.get('username', ''),
            'group_name': attrs.get('group_name', '')
        }
        asset.attributes = json.dumps(new_attrs)
    db.commit()
    print(f"  ✓ Updated")

# Update samba_external -> samba_sequis
samba_external = db.query(Asset).filter(Asset.sub_category == 'samba_external').all()
print(f"\nFound {len(samba_external)} samba_external assets")

for asset in samba_external:
    print(f"\nUpdating {asset.asset_code} to samba_sequis...")
    asset.sub_category = 'samba_sequis'
    # Map old attributes to new format
    if asset.attributes:
        attrs = json.loads(asset.attributes)
        new_attrs = {
            'username': attrs.get('username', ''),
            'group_name': attrs.get('group_name', ''),
            'password': attrs.get('password', ''),
            'permission_level': 'Read Only',
            'account_status': 'Active',
            'created_date': attrs.get('validity', ''),
            'email': '',
            'comments': ''
        }
        asset.attributes = json.dumps(new_attrs)
    db.commit()
    print(f"  ✓ Updated")

db.close()
print("\n✓ Migration complete!")
