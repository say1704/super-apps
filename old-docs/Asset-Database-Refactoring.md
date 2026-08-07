# 🗄️ Asset Database Refactoring — Shared + Extension Tables

**Date:** May 5, 2026
**Status:** ✅ COMPLETE
**Migration:** 37 records migrated from unified `assets` table → 6 relational tables

---

## 📋 Overview

Asset Register telah di-refactor dari **single-table dengan JSON attributes** menjadi **shared common + category-specific extension tables** pattern.

### Before (Unified JSON)
```
assets (1 table, 37 records)
├── Common fields: asset_code, name, category, classification, ...
└── attributes: JSON {username, password, serial_number, cpu, ram, ...}
```

### After (Relational)
```
asset_common (37 records)          ← Shared fields for ALL assets
├── asset_users (14 records)       ← FTP, Samba, Team Member, SIG
├── asset_hardware (10 records)    ← Laptop, Server, Network, etc.
├── asset_software (4 records)     ← OS, Application, Utility, Freeware
├── asset_virtual_infrastructure (4 records) ← VM, Container, Cloud
└── asset_information (5 records)  ← Database, Document, Record, Archive
```

---

## 🏗️ New Schema

### `asset_common` — Shared Fields (All Assets)

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK | Auto-increment |
| `asset_code` | VARCHAR(20) UNIQUE | AST-2026-001 |
| `name` | VARCHAR(255) | Asset name |
| `category` | VARCHAR(50) | users/hardware/software/virtual-infrastructure/information |
| `sub_category` | VARCHAR(50) | ftp_user, server_rack, os_license, etc. |
| `classification` | VARCHAR(20) | public/internal/confidential |
| `owner_name` | VARCHAR(255) | Asset owner |
| `assigned_to` | VARCHAR(255) | Current user |
| `location` | VARCHAR(255) | Physical/logical location |
| `status` | VARCHAR(50) | active/in-maintenance/retired/lost |
| `purchase_date` | DATE | Purchase date |
| `warranty_until` | DATE | Warranty expiration |
| `disposal_date` | DATE | Disposal date |
| `price` | DECIMAL(15,2) | Purchase price |
| `acceptable_use_policy` | TEXT | AUP reference |
| `created_by` | VARCHAR(100) | Creator |
| `updated_by` | VARCHAR(100) | Last updater |
| `created_at` | TIMESTAMP | Creation timestamp |
| `updated_at` | TIMESTAMP | Update timestamp |

### `asset_users` — User Category (FK → asset_common.id)

| Column | Type | Description |
|--------|------|-------------|
| `asset_id` | INTEGER FK | → asset_common.id |
| `username` | VARCHAR | Login username |
| `password_encrypted` | TEXT | Encrypted password |
| `server_ip` | VARCHAR | Server IP |
| `port` | VARCHAR | Port number |
| `protocol` | VARCHAR | FTP/SFTP/etc. |
| `home_directory` | VARCHAR | Home directory path |
| `category` | VARCHAR | FTP user category |
| `requester` | VARCHAR | Who requested |
| `group_name` | VARCHAR | Samba/SIG group |
| `permission_level` | VARCHAR | Read Only/Read-Write/Admin |
| `account_status` | VARCHAR | Active/Disabled |
| `email` | VARCHAR | Email address |
| `comments` | TEXT | Comments |
| `employee_id` | VARCHAR | Employee ID |
| `department` | VARCHAR | Department |
| `position` | VARCHAR | Job position |
| `phone` | VARCHAR | Phone number |
| `interest_type` | TEXT | SIG interest type |
| `responsible_party` | VARCHAR | PIC |
| `communication_mechanism` | VARCHAR | Email/Meeting/WhatsApp |
| `shared_data` | TEXT | Data shared |
| `contact_detail` | VARCHAR | Contact info |
| `created_date` | DATE | Creation date |
| `notes` | TEXT | Notes |

### `asset_hardware` — Hardware Category (FK → asset_common.id)

| Column | Type | Description |
|--------|------|-------------|
| `asset_id` | INTEGER FK | → asset_common.id |
| `serial_number` | VARCHAR | Serial number |
| `model` | VARCHAR | Model name |
| `manufacturer` | VARCHAR | Manufacturer |
| `ip_address` | VARCHAR | IP address |
| `cpu` | VARCHAR | CPU spec |
| `ram` | VARCHAR | RAM spec |
| `storage` | VARCHAR | Storage spec |
| `virtualization` | VARCHAR | Yes/No |
| `hypervisor` | VARCHAR | VMware/Proxmox/etc. |
| `rack_units` | VARCHAR | RU count |
| `rack_position` | VARCHAR | Rack position |
| `device_type` | VARCHAR | Switch/Router/Firewall |
| `firmware_version` | VARCHAR | Firmware version |
| `port_count` | VARCHAR | Port count |
| `printer_type` | VARCHAR | Laser/Inkjet/MFP |
| `color_support` | VARCHAR | Monochrome/Color |
| `kvm_type` | VARCHAR | Analog/IP/Matrix |
| `capacity` | VARCHAR | Storage capacity |
| `rpm` | VARCHAR | Disk RPM |
| `interface` | VARCHAR | SAS/SATA/NVMe |
| `storage_location` | VARCHAR | Storage location |
| `tape_type` | VARCHAR | LTO/DLT/AIT |
| `tape_label` | VARCHAR | Tape label/ID |
| `generation` | VARCHAR | LTO-9, LTO-8 |
| `first_used_date` | DATE | First used |
| `retention_period` | VARCHAR | Retention period |
| `keterangan` | TEXT | Notes |

### `asset_software` — Software Category (FK → asset_common.id)

| Column | Type | Description |
|--------|------|-------------|
| `asset_id` | INTEGER FK | → asset_common.id |
| `version` | VARCHAR | Software version |
| `license` | VARCHAR | Perpetual/Subscription/etc. |
| `main_function` | TEXT | Main function |
| `department` | VARCHAR | Department |
| `vendor` | VARCHAR | Vendor/Publisher |
| `license_key` | VARCHAR | License key |
| `license_count` | INTEGER | Number of licenses |
| `os_name` | VARCHAR | OS name |
| `utility_type` | VARCHAR | Antivirus/Backup/etc. |
| `download_url` | VARCHAR | Download URL |
| `notes` | TEXT | Notes |

### `asset_virtual_infrastructure` — Virtual Infrastructure (FK → asset_common.id)

| Column | Type | Description |
|--------|------|-------------|
| `asset_id` | INTEGER FK | → asset_common.id |
| `cpu` | VARCHAR | vCPU count |
| `ram` | VARCHAR | RAM |
| `storage` | VARCHAR | Storage |
| `host_server` | VARCHAR | Host server |
| `hypervisor` | VARCHAR | VMware/Proxmox/etc. |
| `os` | VARCHAR | Operating system |
| `ip_address` | VARCHAR | IP address |
| `platform` | VARCHAR | Docker/Kubernetes/etc. |
| `image_name` | VARCHAR | Container image |
| `host` | VARCHAR | Host/node |
| `namespace` | VARCHAR | K8s namespace |
| `cloud_provider` | VARCHAR | AWS/Azure/GCP |
| `instance_type` | VARCHAR | t3.medium, etc. |
| `region` | VARCHAR | Cloud region |
| `instance_id` | VARCHAR | Cloud instance ID |
| `keterangan` | TEXT | Notes |

### `asset_information` — Information Category (FK → asset_common.id)

| Column | Type | Description |
|--------|------|-------------|
| `asset_id` | INTEGER FK | → asset_common.id |
| `db_type` | VARCHAR | Relational/NoSQL/etc. |
| `dbms` | VARCHAR | PostgreSQL/MySQL/etc. |
| `version` | VARCHAR | DB version |
| `size` | VARCHAR | Database size |
| `host_server` | VARCHAR | Host server |
| `port` | VARCHAR | Port number |
| `description` | TEXT | Description |
| `doc_type` | VARCHAR | Policy/Procedure/etc. |
| `format` | VARCHAR | Digital/Physical |
| `doc_number` | VARCHAR | Document number |
| `revision` | VARCHAR | Revision |
| `effective_date` | DATE | Effective date |
| `review_date` | DATE | Review date |
| `storage_location` | VARCHAR | Storage location |
| `record_type` | VARCHAR | Audit/Transaction/etc. |
| `retention_period` | VARCHAR | Retention period |
| `created_date` | DATE | Created date |
| `disposal_date` | DATE | Disposal date |
| `archive_type` | VARCHAR | Backup/Historical/etc. |
| `archive_date` | DATE | Archive date |
| `keterangan` | TEXT | Notes |

---

## ✅ Benefits

| Aspect | Before (JSON) | After (Relational) |
|--------|--------------|-------------------|
| **List Query** | 1 table scan | 1 table scan (asset_common) |
| **Detail Query** | JSON parse | JOIN 2 tables (indexed) |
| **Filter by username** | JSON scan (slow) | Indexed column (fast) |
| **Type Safety** | ❌ JSON string | ✅ Full column types |
| **DB Constraints** | ❌ None | ✅ FK, NOT NULL, UNIQUE |
| **Web List View** | ⚡ Fast | ⚡ Fast |
| **Web Detail View** | 🐌 JSON parse | ⚡ Fast JOIN |
| **Maintainability** | ⚡ 1 table | ⚡ 6 tables (clean) |

---

## 📊 Migration Results

| Category | Records Migrated |
|----------|-----------------|
| Users | 14 |
| Hardware | 10 |
| Software | 4 |
| Virtual Infrastructure | 4 |
| Information | 5 |
| **Total** | **37** |

---

## 🔧 Files Changed

### Backend
| File | Change |
|------|--------|
| `models.py` | Replaced `Asset` + 10 legacy tables → `AssetCommon` + 5 extension tables |
| `api/assets_unified.py` | Rewritten to use relational schema (same API contract) |
| `api/dashboard.py` | Updated to use `AssetCommon` for counts |
| `api/configurations.py` | Updated FK references to `AssetCommon` |
| `api/asset_dashboard.py` | Updated all queries to `AssetCommon` |
| `api/asset_audit_logs.py` | Updated FK references to `AssetCommon` |
| `utils/asset_code_generator.py` | Updated to query `AssetCommon` |
| `main.py` | Removed legacy `assets.py` router |

### Scripts
| File | Purpose |
|------|---------|
| `scripts/migrate_assets_to_relational.py` | Migration script (37 records) |
| `scripts/cleanup_old_asset_tables.py` | Cleanup script (drop old tables) |

### Frontend
| File | Change |
|------|--------|
| **No changes needed** | API response format unchanged |

---

## 🔄 Rollback

If something goes wrong:

```bash
cd backend
cp superapps.db.pre-relational-migration.bak superapps.db
```

---

## 📝 Next Steps

1. ✅ Migration complete
2. ⏳ Run cleanup script to drop old tables: `python scripts/cleanup_old_asset_tables.py`
3. ⏳ Remove legacy `api/assets.py` file
4. ⏳ Remove unused model classes from `models.py` (Document, ConfigurationItem)
5. ⏳ Test all Asset Register CRUD operations
6. ⏳ Verify frontend works without changes
