"""
Migration Script: Unified Assets → Shared + Extension Tables
=============================================================
Migrates data from the old `assets` table (JSON attributes) to the new
schema with `asset_common` + 5 category-specific extension tables.

Usage:
    cd /home/soni_buruzi/Workspace/01_Projects/IT_Projects/2026/super-apps/backend
    python scripts/migrate_assets_to_relational.py

This script is idempotent - safe to run multiple times.
"""

import sys
import json
import sqlite3
from datetime import datetime
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "superapps.db"

def get_db_connection():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn

def migrate():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    print("=" * 60)
    print("ASSET MIGRATION: Unified → Shared + Extension Tables")
    print("=" * 60)
    
    # Check if old assets table exists
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='assets'")
    if not cursor.fetchone():
        print("\n⚠️  Old 'assets' table not found. Migration not needed.")
        conn.close()
        return
    
    # Check if new asset_common table exists
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='asset_common'")
    if not cursor.fetchone():
        print("\n❌ New 'asset_common' table not found!")
        print("   Make sure the app has been started at least once after updating models.py")
        print("   (tables are created on startup via Base.metadata.create_all)")
        conn.close()
        sys.exit(1)
    
    # Get all assets from old table
    cursor.execute("SELECT * FROM assets ORDER BY id")
    old_assets = cursor.fetchall()
    print(f"\n📦 Found {len(old_assets)} records in old 'assets' table")
    
    if len(old_assets) == 0:
        print("   No records to migrate.")
        conn.close()
        return
    
    # Check if already migrated
    cursor.execute("SELECT COUNT(*) as cnt FROM asset_common")
    existing = cursor.fetchone()["cnt"]
    if existing > 0:
        print(f"\n⚠️  asset_common already has {existing} records.")
        print("   Skipping migration to avoid duplicates.")
        print("   If you need to re-run, first run: DELETE FROM asset_common; DELETE FROM asset_users; ...")
        conn.close()
        return
    
    migrated = {
        "users": 0,
        "hardware": 0,
        "software": 0,
        "virtual-infrastructure": 0,
        "information": 0,
    }
    errors = []
    
    for old_asset in old_assets:
        try:
            attrs = json.loads(old_asset["attributes"]) if old_asset["attributes"] else {}
            category = old_asset["category"]
            
            # Insert into asset_common
            cursor.execute("""
                INSERT INTO asset_common (
                    asset_code, name, category, sub_category, classification,
                    owner_name, assigned_to, location, status,
                    purchase_date, warranty_until, disposal_date, price,
                    acceptable_use_policy, created_by, updated_by, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                old_asset["asset_code"],
                old_asset["name"],
                category,
                old_asset["sub_category"],
                old_asset["classification"],
                old_asset["owner_name"],
                old_asset["assigned_to"],
                old_asset["location"],
                old_asset["status"],
                str(old_asset["purchase_date"]) if old_asset["purchase_date"] else None,
                str(old_asset["warranty_until"]) if old_asset["warranty_until"] else None,
                str(old_asset["disposal_date"]) if old_asset["disposal_date"] else None,
                old_asset["price"],
                old_asset["acceptable_use_policy"],
                old_asset["created_by"],
                old_asset["updated_by"],
                old_asset["created_at"],
                old_asset["updated_at"],
            ))
            common_id = cursor.lastrowid
            
            # Insert into extension table based on category
            if category == "users":
                cursor.execute("""
                    INSERT INTO asset_users (
                        asset_id, username, password_encrypted, server_ip, port, protocol,
                        home_directory, category, requester, group_name, permission_level,
                        account_status, email, comments, employee_id, department, position,
                        phone, interest_type, responsible_party, communication_mechanism,
                        shared_data, contact_detail, created_date, notes
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    common_id,
                    attrs.get("username"),
                    attrs.get("password"),
                    attrs.get("server_ip"),
                    attrs.get("port"),
                    attrs.get("protocol"),
                    attrs.get("home_directory"),
                    attrs.get("category"),
                    attrs.get("requester"),
                    attrs.get("group_name"),
                    attrs.get("permission_level"),
                    attrs.get("account_status"),
                    attrs.get("email"),
                    attrs.get("comments"),
                    attrs.get("employee_id"),
                    attrs.get("department"),
                    attrs.get("position"),
                    attrs.get("phone"),
                    attrs.get("interest_type"),
                    attrs.get("responsible_party"),
                    attrs.get("communication_mechanism"),
                    attrs.get("shared_data"),
                    attrs.get("contact_detail"),
                    attrs.get("created_date"),
                    attrs.get("notes"),
                ))
                migrated["users"] += 1
                
            elif category == "hardware":
                cursor.execute("""
                    INSERT INTO asset_hardware (
                        asset_id, serial_number, model, manufacturer, ip_address,
                        cpu, ram, storage, virtualization, hypervisor, rack_units,
                        rack_position, device_type, firmware_version, port_count,
                        printer_type, color_support, kvm_type, capacity, rpm,
                        interface, storage_location, tape_type, tape_label,
                        generation, first_used_date, retention_period, keterangan
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    common_id,
                    attrs.get("serial_number"),
                    attrs.get("model"),
                    attrs.get("manufacturer"),
                    attrs.get("ip_address"),
                    attrs.get("cpu"),
                    attrs.get("ram"),
                    attrs.get("storage"),
                    attrs.get("virtualization"),
                    attrs.get("hypervisor"),
                    attrs.get("rack_units"),
                    attrs.get("rack_position"),
                    attrs.get("device_type"),
                    attrs.get("firmware_version"),
                    attrs.get("port_count"),
                    attrs.get("printer_type"),
                    attrs.get("color_support"),
                    attrs.get("kvm_type"),
                    attrs.get("capacity"),
                    attrs.get("rpm"),
                    attrs.get("interface"),
                    attrs.get("storage_location"),
                    attrs.get("tape_type"),
                    attrs.get("tape_label"),
                    attrs.get("generation"),
                    attrs.get("first_used_date"),
                    attrs.get("retention_period"),
                    attrs.get("keterangan"),
                ))
                migrated["hardware"] += 1
                
            elif category == "software":
                cursor.execute("""
                    INSERT INTO asset_software (
                        asset_id, version, license, main_function, department,
                        vendor, license_key, license_count, os_name, utility_type,
                        download_url, notes
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    common_id,
                    attrs.get("version"),
                    attrs.get("license"),
                    attrs.get("main_function"),
                    attrs.get("department"),
                    attrs.get("vendor"),
                    attrs.get("license_key"),
                    attrs.get("license_count"),
                    attrs.get("os_name"),
                    attrs.get("utility_type"),
                    attrs.get("download_url"),
                    attrs.get("notes"),
                ))
                migrated["software"] += 1
                
            elif category == "virtual-infrastructure":
                cursor.execute("""
                    INSERT INTO asset_virtual_infrastructure (
                        asset_id, cpu, ram, storage, host_server, hypervisor,
                        os, ip_address, platform, image_name, host, namespace,
                        cloud_provider, instance_type, region, instance_id, keterangan
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    common_id,
                    attrs.get("cpu"),
                    attrs.get("ram"),
                    attrs.get("storage"),
                    attrs.get("host_server"),
                    attrs.get("hypervisor"),
                    attrs.get("os"),
                    attrs.get("ip_address"),
                    attrs.get("platform"),
                    attrs.get("image_name"),
                    attrs.get("host"),
                    attrs.get("namespace"),
                    attrs.get("cloud_provider"),
                    attrs.get("instance_type"),
                    attrs.get("region"),
                    attrs.get("instance_id"),
                    attrs.get("keterangan"),
                ))
                migrated["virtual-infrastructure"] += 1
                
            elif category == "information":
                cursor.execute("""
                    INSERT INTO asset_information (
                        asset_id, db_type, dbms, version, size, host_server, port,
                        description, doc_type, format, doc_number, revision,
                        effective_date, review_date, storage_location, record_type,
                        retention_period, created_date, disposal_date, archive_type,
                        archive_date, keterangan
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    common_id,
                    attrs.get("db_type"),
                    attrs.get("dbms"),
                    attrs.get("version"),
                    attrs.get("size"),
                    attrs.get("host_server"),
                    attrs.get("port"),
                    attrs.get("description"),
                    attrs.get("doc_type"),
                    attrs.get("format"),
                    attrs.get("doc_number"),
                    attrs.get("revision"),
                    attrs.get("effective_date"),
                    attrs.get("review_date"),
                    attrs.get("storage_location"),
                    attrs.get("record_type"),
                    attrs.get("retention_period"),
                    attrs.get("created_date"),
                    attrs.get("disposal_date"),
                    attrs.get("archive_type"),
                    attrs.get("archive_date"),
                    attrs.get("keterangan"),
                ))
                migrated["information"] += 1
            else:
                errors.append(f"Unknown category '{category}' for asset {old_asset['asset_code']}")
                
        except Exception as e:
            errors.append(f"Error migrating asset {old_asset['asset_code']}: {str(e)}")
    
    conn.commit()
    
    # Print results
    print("\n" + "=" * 60)
    print("MIGRATION RESULTS")
    print("=" * 60)
    print(f"  Users:                    {migrated['users']}")
    print(f"  Hardware:                 {migrated['hardware']}")
    print(f"  Software:                 {migrated['software']}")
    print(f"  Virtual Infrastructure:   {migrated['virtual-infrastructure']}")
    print(f"  Information:              {migrated['information']}")
    print(f"  ─────────────────────────────────")
    total = sum(migrated.values())
    print(f"  TOTAL MIGRATED:           {total}")
    
    if errors:
        print(f"\n❌ ERRORS ({len(errors)}):")
        for err in errors:
            print(f"   - {err}")
    
    # Verify
    print("\n" + "=" * 60)
    print("VERIFICATION")
    print("=" * 60)
    
    cursor.execute("SELECT COUNT(*) as cnt FROM asset_common")
    common_count = cursor.fetchone()["cnt"]
    print(f"  asset_common records: {common_count}")
    
    for table in ["asset_users", "asset_hardware", "asset_software", "asset_virtual_infrastructure", "asset_information"]:
        cursor.execute(f"SELECT COUNT(*) as cnt FROM {table}")
        count = cursor.fetchone()["cnt"]
        print(f"  {table}: {count}")
    
    if common_count == len(old_assets) and len(errors) == 0:
        print("\n✅ Migration successful! All records migrated.")
        print("\n📋 Next steps:")
        print("   1. Restart the backend to verify everything works")
        print("   2. Test Asset Register CRUD operations")
        print("   3. If everything works, run: python scripts/cleanup_old_asset_tables.py")
    else:
        print(f"\n⚠️  Migration completed with issues. Check errors above.")
        print("   Old 'assets' table is preserved for rollback.")
    
    conn.close()

if __name__ == "__main__":
    migrate()
