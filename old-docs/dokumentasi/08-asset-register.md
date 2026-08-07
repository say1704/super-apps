# Module 8: Asset Register

## 1. Function
ISO 27001:2022 compliant asset management using a shared `asset_common` table plus 5 category-specific extension tables (users, hardware, software, virtual-infrastructure, information). Supports auto-generated asset codes, password encryption, classification auto-assignment, bulk operations, CSV export, and full audit logging.

## 2. Business Logic

### 2.1 Architecture: Shared + Extension Pattern
- **`asset_common`**: Shared fields for all assets (asset_code, name, category, classification, status, etc.)
- **Extension tables**: Category-specific fields stored in separate tables with 1:1 relationship
  - `asset_users`: FTP users, Samba users, team members, SIG members
  - `asset_hardware`: Servers, laptops, KVM, disks, tapes, printers
  - `asset_software`: OS licenses, applications, utilities, freeware
  - `asset_virtual_infrastructure`: VMs, containers, cloud instances
  - `asset_information`: Databases, documents, records, archives

### 2.2 Asset Code Generation
- Auto-generated via `get_next_asset_code()` utility (format: `AST-YYYY-NNN`)
- Sequential numbering reset per year

### 2.3 Auto-Classification
- Classification auto-assigned based on category + sub_category:
  - `users/ftp_user`, `users/samba_*` → `confidential`
  - `users/team_member`, `users/sig_member` → `internal`
  - `information/database`, `information/record` → `confidential`
  - All others → `internal`

### 2.4 Password Encryption
- Passwords in `asset_users` stored encrypted via `encrypt_password()` (AES with `SECRET_KEY`)
- Decryption requires user's own login password as verification
- Failed decryption attempts logged to `asset_audit_logs`
- Successful views logged with username viewed and IP address

### 2.5 Sub-Category Validation
- Predefined sub-categories per category (e.g., hardware: server_rack, server_tower, kvm, laptop, disk_sas, tape_cassette)
- Hardware allows custom sub-categories matching pattern `^[a-z][a-z0-9_]{2,49}$`
- Normalized to lowercase, underscores

### 2.6 Bulk Operations
- **Bulk Delete**: Superadmin can delete any, others only their own (rate limited 10/min)
- **Bulk Status Update**: Superadmin can update any, others only their own (rate limited 20/min)
- **Bulk Classification Update**: Same ownership rules (rate limited 20/min)

### 2.7 CSV Export
- Exports filtered assets to CSV with timestamp filename
- Logs export activity with filter details

### 2.8 Audit Logging
- All CRUD operations logged to `activity_logs`
- Password view attempts logged to `asset_audit_logs` (success and failure)

### 2.9 Optimistic Locking
- Version-based conflict detection on updates

## 3. API Endpoints

| Method | Endpoint | Response Model | Auth | Description |
|--------|----------|---------------|------|-------------|
| GET | `/assets` | `AssetListPaginatedResponse` | JWT | List with filters, pagination, sorting |
| GET | `/assets/stats` | `AssetStatsFullResponse` | JWT | Stats by category, classification, status |
| GET | `/assets/next-code` | `AssetNextCodeResponse` | JWT | Get next auto-generated asset code |
| GET | `/assets/categories` | `AssetCategoriesResponse` | - | Get all categories, sub-categories, classification levels, status options |
| GET | `/assets/{asset_id}` | `AssetListResponse` | JWT | Get single asset with extension data |
| POST | `/assets` | `AssetCreateResponse` | JWT | Create asset with extension attributes (JSON) |
| PUT | `/assets/{asset_id}` | `AssetUpdateResponse` | JWT | Update asset (multipart form, optimistic lock) |
| DELETE | `/assets/{asset_id}` | `AssetDeleteResponse` | JWT | Delete asset |
| GET | `/assets/export/csv` | CSV file | JWT | Export filtered assets to CSV |
| POST | `/assets/{asset_id}/decrypt-password` | `AssetPasswordDecryptResponse` | JWT | Decrypt password (requires user password verification) |
| POST | `/assets/bulk-delete` | `AssetBulkResponse` | JWT | Bulk delete (rate limited) |
| POST | `/assets/bulk-status` | `AssetBulkResponse` | JWT | Bulk status update (rate limited) |
| POST | `/assets/bulk-classification` | `AssetBulkResponse` | JWT | Bulk classification update (rate limited) |

### 3.1 Query Parameters (GET /assets)

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | int | 1 | Page number |
| `page_size` | int | 20 | Items per page (max 100) |
| `category` | string | - | Filter by category |
| `sub_category` | string | - | Filter by sub_category |
| `classification` | string | - | Filter by classification |
| `status` | string | - | Filter by status |
| `location` | string | - | Filter by location (ILIKE) |
| `search` | string | - | Search name, asset_code, owner_name, assigned_to |
| `sort_by` | string | created_at | Column to sort |
| `sort_order` | string | desc | asc or desc |
| `decrypt_password` | bool | false | Decrypt passwords in response |

## 4. Database Schema

### `asset_common`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | Integer (PK) | No | - | Auto-increment |
| `asset_code` | String | No | - | Unique code (AST-YYYY-NNN) |
| `name` | String | No | - | Asset name |
| `category` | String | No | - | users/hardware/software/virtual-infrastructure/information |
| `sub_category` | String | Yes | - | Specific sub-type |
| `classification` | String | Yes | "internal" | public/internal/confidential |
| `owner_name` | String | Yes | - | Owner |
| `assigned_to` | String | Yes | - | Assigned user |
| `location` | String | Yes | - | Physical location |
| `status` | String | Yes | "active" | active/in-maintenance/retired/lost |
| `purchase_date` | Date | Yes | - | Purchase date |
| `warranty_until` | Date | Yes | - | Warranty expiry |
| `disposal_date` | Date | Yes | - | Disposal date |
| `price` | Float | Yes | - | Purchase price |
| `acceptable_use_policy` | Text | Yes | - | AUP text |
| `created_by` | String | Yes | - | Creator username |
| `updated_by` | String | Yes | - | Last updater username |
| `created_at` | DateTime | Yes | utcnow | Creation timestamp |
| `updated_at` | DateTime | Yes | utcnow | Last update timestamp |
| `version` | Integer | Yes | 0 | Optimistic locking |

### `asset_users`

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | Integer (PK) | No | Auto-increment |
| `asset_id` | Integer (FK, unique) | No | Parent asset |
| `username` | String | Yes | FTP/Samba username |
| `password_encrypted` | Text | Yes | Encrypted password |
| `server_ip` | String | Yes | Server IP |
| `port` | String | Yes | Port number |
| `protocol` | String | Yes | Protocol type |
| `home_directory` | String | Yes | Home directory path |
| `category` | String | Yes | FTP user category |
| `requester` | String | Yes | Requester name |
| `group_name` | String | Yes | Samba group |
| `permission_level` | String | Yes | Permission level |
| `account_status` | String | Yes | Account status |
| `email` | String | Yes | Email address |
| `comments` | Text | Yes | Comments |
| `employee_id` | String | Yes | Employee ID |
| `department` | String | Yes | Department |
| `position` | String | Yes | Position |
| `phone` | String | Yes | Phone number |
| `interest_type` | Text | Yes | SIG interest type |
| `responsible_party` | String | Yes | Responsible party |
| `communication_mechanism` | String | Yes | Communication method |
| `shared_data` | Text | Yes | Shared data description |
| `contact_detail` | String | Yes | Contact details |
| `created_date` | Date | Yes | Creation date |
| `notes` | Text | Yes | Notes |

### `asset_hardware`

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | Integer (PK) | No | Auto-increment |
| `asset_id` | Integer (FK, unique) | No | Parent asset |
| `serial_number` | String | Yes | Serial number |
| `model` | String | Yes | Model |
| `manufacturer` | String | Yes | Manufacturer |
| `ip_address` | String | Yes | IP address |
| `cpu` | String | Yes | CPU spec |
| `ram` | String | Yes | RAM spec |
| `storage` | String | Yes | Storage spec |
| `virtualization` | String | Yes | Virtualization type |
| `hypervisor` | String | Yes | Hypervisor |
| `rack_units` | String | Yes | Rack units |
| `rack_position` | String | Yes | Rack position |
| `device_type` | String | Yes | Network device type |
| `firmware_version` | String | Yes | Firmware version |
| `port_count` | String | Yes | Port count |
| `printer_type` | String | Yes | Printer type |
| `color_support` | String | Yes | Color support |
| `kvm_type` | String | Yes | KVM type |
| `capacity` | String | Yes | Disk/tape capacity |
| `rpm` | String | Yes | Disk RPM |
| `interface` | String | Yes | Interface type |
| `storage_location` | String | Yes | Storage location |
| `tape_type` | String | Yes | Tape type |
| `tape_label` | String | Yes | Tape label |
| `generation` | String | Yes | Tape generation |
| `first_used_date` | Date | Yes | First used date |
| `retention_period` | String | Yes | Retention period |
| `keterangan` | Text | Yes | Notes (Indonesian) |

### `asset_software`

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | Integer (PK) | No | Auto-increment |
| `asset_id` | Integer (FK, unique) | No | Parent asset |
| `version` | String | Yes | Software version |
| `license` | String | Yes | License type |
| `main_function` | Text | Yes | Main function |
| `department` | String | Yes | Department |
| `vendor` | String | Yes | Vendor |
| `license_key` | String | Yes | License key |
| `license_count` | Integer | Yes | License count |
| `os_name` | String | Yes | OS name |
| `utility_type` | String | Yes | Utility type |
| `download_url` | String | Yes | Download URL |
| `notes` | Text | Yes | Notes |

### `asset_virtual_infrastructure`

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | Integer (PK) | No | Auto-increment |
| `asset_id` | Integer (FK, unique) | No | Parent asset |
| `cpu` | String | Yes | CPU spec |
| `ram` | String | Yes | RAM spec |
| `storage` | String | Yes | Storage spec |
| `host_server` | String | Yes | Host server |
| `hypervisor` | String | Yes | Hypervisor |
| `os` | String | Yes | Operating system |
| `ip_address` | String | Yes | IP address |
| `platform` | String | Yes | Container platform |
| `image_name` | String | Yes | Container image |
| `host` | String | Yes | Container host |
| `namespace` | String | Yes | Kubernetes namespace |
| `cloud_provider` | String | Yes | Cloud provider |
| `instance_type` | String | Yes | Instance type |
| `region` | String | Yes | Cloud region |
| `instance_id` | String | Yes | Instance ID |
| `keterangan` | Text | Yes | Notes |

### `asset_information`

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | Integer (PK) | No | Auto-increment |
| `asset_id` | Integer (FK, unique) | No | Parent asset |
| `db_type` | String | Yes | Database type |
| `dbms` | String | Yes | DBMS name |
| `version` | String | Yes | Version |
| `size` | String | Yes | Database size |
| `host_server` | String | Yes | Host server |
| `port` | String | Yes | Port |
| `description` | Text | Yes | Description |
| `doc_type` | String | Yes | Document type |
| `format` | String | Yes | File format |
| `doc_number` | String | Yes | Document number |
| `revision` | String | Yes | Revision |
| `effective_date` | Date | Yes | Effective date |
| `review_date` | Date | Yes | Review date |
| `storage_location` | String | Yes | Storage location |
| `record_type` | String | Yes | Record type |
| `retention_period` | String | Yes | Retention period |
| `created_date` | Date | Yes | Created date |
| `disposal_date` | Date | Yes | Disposal date |
| `archive_type` | String | Yes | Archive type |
| `archive_date` | Date | Yes | Archive date |
| `keterangan` | Text | Yes | Notes |

### `asset_audit_logs`

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | Integer (PK) | No | Auto-increment |
| `asset_id` | Integer (FK) | No | Asset ID |
| `asset_code` | String | No | Asset code |
| `asset_name` | String | No | Asset name |
| `sub_category` | String | No | Sub-category |
| `action_type` | String | No | view_password, view_password_failed, edit, delete, create, export |
| `user_id` | Integer (FK) | Yes | User ID |
| `username` | String | Yes | Username |
| `ip_address` | String | Yes | IP address |
| `details` | JSON | Yes | Additional details |
| `timestamp` | DateTime | Yes | Event timestamp |

### PostgreSQL Migration

```sql
CREATE TABLE asset_common (
  id SERIAL PRIMARY KEY,
  asset_code VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(50) NOT NULL,
  sub_category VARCHAR(100),
  classification VARCHAR(20) DEFAULT 'internal',
  owner_name VARCHAR(255),
  assigned_to VARCHAR(255),
  location VARCHAR(255),
  status VARCHAR(30) DEFAULT 'active',
  purchase_date DATE,
  warranty_until DATE,
  disposal_date DATE,
  price FLOAT,
  acceptable_use_policy TEXT,
  created_by VARCHAR(100),
  updated_by VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  version INTEGER DEFAULT 0
);

CREATE INDEX idx_asset_category ON asset_common(category);
CREATE INDEX idx_asset_classification ON asset_common(classification);
CREATE INDEX idx_asset_status ON asset_common(status);
CREATE INDEX idx_asset_sub_category ON asset_common(sub_category);

CREATE TABLE asset_users (
  id SERIAL PRIMARY KEY,
  asset_id INTEGER UNIQUE NOT NULL REFERENCES asset_common(id) ON DELETE CASCADE,
  username VARCHAR(100), password_encrypted TEXT, server_ip VARCHAR(50),
  port VARCHAR(10), protocol VARCHAR(20), home_directory VARCHAR(255),
  category VARCHAR(50), requester VARCHAR(100), group_name VARCHAR(100),
  permission_level VARCHAR(50), account_status VARCHAR(30), email VARCHAR(255),
  comments TEXT, employee_id VARCHAR(50), department VARCHAR(100),
  position VARCHAR(100), phone VARCHAR(30), interest_type TEXT,
  responsible_party VARCHAR(100), communication_mechanism VARCHAR(100),
  shared_data TEXT, contact_detail VARCHAR(255), created_date DATE, notes TEXT
);

CREATE TABLE asset_hardware (
  id SERIAL PRIMARY KEY,
  asset_id INTEGER UNIQUE NOT NULL REFERENCES asset_common(id) ON DELETE CASCADE,
  serial_number VARCHAR(100), model VARCHAR(100), manufacturer VARCHAR(100),
  ip_address VARCHAR(50), cpu VARCHAR(100), ram VARCHAR(50), storage VARCHAR(100),
  virtualization VARCHAR(50), hypervisor VARCHAR(100), rack_units VARCHAR(20),
  rack_position VARCHAR(20), device_type VARCHAR(50), firmware_version VARCHAR(50),
  port_count VARCHAR(20), printer_type VARCHAR(50), color_support VARCHAR(30),
  kvm_type VARCHAR(50), capacity VARCHAR(50), rpm VARCHAR(20), interface VARCHAR(30),
  storage_location VARCHAR(255), tape_type VARCHAR(50), tape_label VARCHAR(100),
  generation VARCHAR(20), first_used_date DATE, retention_period VARCHAR(50),
  keterangan TEXT
);

CREATE TABLE asset_software (
  id SERIAL PRIMARY KEY,
  asset_id INTEGER UNIQUE NOT NULL REFERENCES asset_common(id) ON DELETE CASCADE,
  version VARCHAR(50), license VARCHAR(100), main_function TEXT, department VARCHAR(100),
  vendor VARCHAR(100), license_key VARCHAR(255), license_count INTEGER,
  os_name VARCHAR(100), utility_type VARCHAR(50), download_url VARCHAR(500), notes TEXT
);

CREATE TABLE asset_virtual_infrastructure (
  id SERIAL PRIMARY KEY,
  asset_id INTEGER UNIQUE NOT NULL REFERENCES asset_common(id) ON DELETE CASCADE,
  cpu VARCHAR(100), ram VARCHAR(50), storage VARCHAR(100), host_server VARCHAR(100),
  hypervisor VARCHAR(100), os VARCHAR(100), ip_address VARCHAR(50),
  platform VARCHAR(50), image_name VARCHAR(100), host VARCHAR(100),
  namespace VARCHAR(100), cloud_provider VARCHAR(50), instance_type VARCHAR(50),
  region VARCHAR(50), instance_id VARCHAR(100), keterangan TEXT
);

CREATE TABLE asset_information (
  id SERIAL PRIMARY KEY,
  asset_id INTEGER UNIQUE NOT NULL REFERENCES asset_common(id) ON DELETE CASCADE,
  db_type VARCHAR(50), dbms VARCHAR(100), version VARCHAR(50), size VARCHAR(50),
  host_server VARCHAR(100), port VARCHAR(10), description TEXT,
  doc_type VARCHAR(50), format VARCHAR(30), doc_number VARCHAR(50),
  revision VARCHAR(20), effective_date DATE, review_date DATE,
  storage_location VARCHAR(255), record_type VARCHAR(50), retention_period VARCHAR(50),
  created_date DATE, disposal_date DATE, archive_type VARCHAR(50),
  archive_date DATE, keterangan TEXT
);

CREATE TABLE asset_audit_logs (
  id SERIAL PRIMARY KEY,
  asset_id INTEGER NOT NULL REFERENCES asset_common(id),
  asset_code VARCHAR(50) NOT NULL,
  asset_name VARCHAR(255) NOT NULL,
  sub_category VARCHAR(100) NOT NULL,
  action_type VARCHAR(50) NOT NULL,
  user_id INTEGER REFERENCES users(id),
  username VARCHAR(100),
  ip_address VARCHAR(50),
  details JSONB DEFAULT '{}',
  timestamp TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_asset_audit_asset ON asset_audit_logs(asset_id);
CREATE INDEX idx_asset_audit_action ON asset_audit_logs(action_type);
CREATE INDEX idx_asset_audit_timestamp ON asset_audit_logs(timestamp);
```
