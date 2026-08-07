# Asset Register Module

## Overview

| Attribute     | Value                                                              |
| ------------- | ------------------------------------------------------------------ |
| **Path**      | `/modules/assets`                                                  |
| **Purpose**   | Inventory and classification of information and associated assets  |
| **Standard**  | ISO 27001:2022 Annex A.5.9 (Inventory of Information and Assets)   |
| **Status**    | LOCKED (Production Ready)                                          |
| **Backend**   | FastAPI (`/api/assets`)                                            |
| **Frontend**  | Next.js App Router (`/app/modules/assets`)                         |

The Asset Register module provides a unified interface for managing all organizational assets across five categories. It enforces ISO 27001:2022 A.5.9 controls for inventory management, classification, and lifecycle tracking.

---

## Categories and Sub-Categories

The module organizes assets into **5 categories** with **22 sub-categories**:

### Users

| Sub-Category   | Description                          | Auto-Classification |
| -------------- | ------------------------------------ | ------------------- |
| `team_member`  | Internal team members                | Internal            |
| `ftp_user`     | FTP server user accounts             | Confidential        |
| `samba_192`    | Samba file share users (192 network) | Confidential        |
| `samba_sequis` | Samba file share users (Sequis)      | Confidential        |
| `sig_member`   | SIG (Special Interest Group) members | Internal            |

### Hardware

| Sub-Category    | Description                | Auto-Classification |
| --------------- | -------------------------- | ------------------- |
| `server_rack`   | Rack-mounted servers       | Internal            |
| `server_tower`  | Tower servers              | Internal            |
| `kvm`           | KVM switches               | Internal            |
| `laptop`        | Laptop computers           | Internal            |
| `disk_sas`      | Disk / SAS storage devices | Internal            |
| `tape_cassette` | Tape backup cassettes      | Internal            |

> Hardware also supports custom sub-categories (alphanumeric + underscore, 3-50 chars).

### Software

| Sub-Category   | Description         | Auto-Classification |
| -------------- | ------------------- | ------------------- |
| `os_license`   | Operating system licenses | Internal       |
| `application`  | Business applications     | Internal       |
| `utility`      | Utility software          | Internal       |
| `freeware`     | Free/open-source software | Internal       |

### Virtual Infrastructure

| Sub-Category     | Description              | Auto-Classification |
| ---------------- | ------------------------ | ------------------- |
| `virtual_machine`| Virtual machines         | Internal            |
| `container`      | Container instances      | Internal            |
| `cloud_instance` | Cloud service instances  | Internal            |

### Information

| Sub-Category | Description           | Auto-Classification |
| ------------ | --------------------- | ------------------- |
| `database`   | Databases             | Confidential        |
| `document`   | Documents             | Internal            |
| `record`     | Records               | Confidential        |
| `archive`    | Archived data         | Internal            |

---

## Features

### Unified Table
- Single table view for all asset categories
- Pagination with configurable page sizes: **10, 20, 50, 100** records per page
- 7 sortable columns: `asset_code`, `name`, `category`, `classification`, `status`, `owner_name`, `created_at`
- Default sort: `created_at` descending

### Advanced Filters
- **Category** filter (5 options)
- **Sub-category** filter (dynamic based on selected category)
- **Classification** filter (Public / Internal / Confidential)
- **Status** filter (Active / In-Maintenance / Retired / Lost)
- **Location** filter (partial match)
- **Search** across: name, asset code, owner name, assigned to (debounced at 500ms)

### Export
- CSV export with timestamped filename (`assets-export-YYYYMMDD-HHMM.csv`)
- Respects active category, classification, and status filters
- Activity logged on every export operation

### Asset Code Generation
- Auto-generated format: `AST-YYYY-NNN`
- Examples: `AST-2026-001`, `AST-2026-042`, `AST-2027-001`
- Resets sequence per calendar year
- Validated via regex: `^AST-\d{4}-\d{3}$`

### Dynamic Category-Specific Forms
- Form fields adapt based on selected category and sub-category
- Category-specific field components:
  - `category-specific/users-fields.tsx`
  - `category-specific/hardware-fields.tsx`
  - `category-specific/software-fields.tsx`
  - `category-specific/virtual-infra-fields.tsx`
  - `category-specific/information-fields.tsx`
- Default values auto-populated for user sub-categories (owner, assigned_to, location)

### Password Encryption (Fernet)
- Passwords for `ftp_user`, `samba_192`, and `samba_sequis` sub-categories are encrypted at rest
- Uses `cryptography.fernet.Fernet` with AES-128-CBC
- Encryption key sourced from `ASSET_ENCRYPTION_KEY` environment variable (Base64-encoded 32-byte key)
- Passwords displayed as `********` in list/detail views by default

### Step-Up Authentication
- Revealing a stored password requires the user to re-enter their own login password
- Endpoint: `POST /api/assets/{id}/decrypt-password`
- Failed attempts are logged with username and IP address
- Successful reveals are logged with username, IP, and asset details

### Classification Levels
- **Public** - No restrictions
- **Internal** - Internal use only
- **Confidential** - Restricted access

Auto-classification is applied based on category/sub-category when classification is not explicitly provided. Override is always permitted.

### Summary Dashboard
- Total asset count
- Breakdown by category
- Breakdown by classification
- Breakdown by status

---

## Security Features

### Fernet Encryption
- Symmetric encryption for sensitive credential fields
- Double Base64 encoding (Fernet token + URL-safe Base64 wrapper)
- Key management via environment variable (`ASSET_ENCRYPTION_KEY`)
- Graceful fallback on decryption failure (returns empty string, logs error)

### Step-Up Authentication Flow
1. User clicks "reveal password" on an asset record
2. Modal prompts for the user's own login password
3. Password verified against stored user hash via `current_user.verify_password()`
4. On success: password decrypted and returned, audit log created
5. On failure: 403 response, failed audit log created with reason

### Audit Trail
All password-related actions are recorded in two tables:

**`asset_audit_logs`** table:
| Field          | Description                          |
| -------------- | ------------------------------------ |
| `asset_id`     | Target asset ID                      |
| `asset_code`   | Target asset code                    |
| `asset_name`   | Target asset name                    |
| `sub_category` | Asset sub-category                   |
| `action_type`  | `view_password` or `view_password_failed` |
| `username`     | Acting user's username               |
| `ip_address`   | Client IP address                    |
| `details`      | JSON (username viewed, group name, reason) |

**`activity_logs`** table:
- `VIEW_PASSWORD` - Successful password reveal
- `VIEW_PASSWORD_FAILED` - Failed verification attempt

### Activity Logging
All CRUD operations are logged via `utils/activity_logger.py`:
- `log_create` - Asset creation with category, sub-category, classification
- `log_update` - Asset update with list of changed fields
- `log_delete` - Asset deletion with asset code
- `log_export` - CSV export with count, filters, filename
- `log_view` - Asset view operations
- `log_activity` - Generic activity logging (used for password events)

---

## API Endpoints

### GET `/api/assets`
List assets with pagination, filtering, and sorting.

**Query Parameters:**
| Parameter        | Type     | Default   | Description                        |
| ---------------- | -------- | --------- | ---------------------------------- |
| `page`           | int      | 1         | Page number (min: 1)               |
| `page_size`      | int      | 20        | Records per page (1-100)           |
| `category`       | string   | -         | Filter by category                 |
| `sub_category`   | string   | -         | Filter by sub-category             |
| `classification` | string   | -         | Filter by classification           |
| `status`         | string   | -         | Filter by status                   |
| `location`       | string   | -         | Filter by location (partial match) |
| `search`         | string   | -         | Full-text search                   |
| `sort_by`        | string   | `created_at` | Column to sort by                |
| `sort_order`     | string   | `desc`    | Sort direction (`asc`/`desc`)      |
| `decrypt_password` | bool   | `false`   | Decrypt passwords in response      |

**Response:**
```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "page_size": 20,
    "total_records": 150,
    "total_pages": 8,
    "has_next": true,
    "has_prev": false
  }
}
```

### GET `/api/assets/{id}`
Get a single asset by ID.

**Query Parameters:**
| Parameter          | Type   | Default | Description                   |
| ------------------ | ------ | ------- | ----------------------------- |
| `decrypt_password` | bool   | `false` | Decrypt passwords in response |

### POST `/api/assets`
Create a new asset. Asset code is auto-generated.

**Body:** `multipart/form-data`
| Field                     | Type   | Required | Description                    |
| ------------------------- | ------ | -------- | ------------------------------ |
| `name`                    | string | Yes      | Asset name                     |
| `category`                | string | Yes      | One of 5 categories            |
| `sub_category`            | string | Yes      | Valid sub-category             |
| `classification`          | string | No       | Auto-set if omitted            |
| `owner_name`              | string | No       | Asset owner                    |
| `assigned_to`             | string | No       | Assigned user/entity           |
| `location`                | string | No       | Physical or logical location   |
| `status`                  | string | No       | Default: `active`              |
| `purchase_date`           | string | No       | Format: `YYYY-MM-DD`           |
| `warranty_until`          | string | No       | Format: `YYYY-MM-DD`           |
| `price`                   | float  | No       | Purchase price                 |
| `acceptable_use_policy`   | string | No       | AUP reference                  |
| `attributes`              | string | No       | JSON string (category-specific)|

### PUT `/api/assets/{id}`
Update an existing asset.

**Body:** `multipart/form-data` (same fields as POST, all optional)

Additional field: `disposal_date` (format: `YYYY-MM-DD`)

### DELETE `/api/assets/{id}`
Delete an asset. Irreversible.

### GET `/api/assets/stats`
Get summary statistics for the dashboard.

**Response:**
```json
{
  "total": 150,
  "by_category": { "users": 30, "hardware": 45, ... },
  "by_classification": { "public": 10, "internal": 100, "confidential": 40 },
  "by_status": { "active": 120, "in-maintenance": 15, "retired": 10, "lost": 5 }
}
```

### GET `/api/assets/export/csv`
Export assets to CSV.

**Query Parameters:** `category`, `classification`, `status` (optional filters)

**Response:** `text/csv` download with filename `assets-export-YYYYMMDD-HHMM.csv`

### POST `/api/assets/{id}/decrypt-password`
Step-up authentication to reveal a stored password.

**Body:**
```json
{
  "verification_password": "user's own login password"
}
```

**Response (success):**
```json
{
  "asset_id": 42,
  "sub_category": "ftp_user",
  "password": "actual-plaintext-password"
}
```

**Response (failure):** `403` - "Incorrect password. Please enter your own login password."

### GET `/api/assets/next-code`
Get the next available asset code (preview).

### GET `/api/assets/categories`
Get available categories, sub-categories, classification levels, and status options.

---

## File Structure

### Backend
```
backend/
  api/
    assets_unified.py          # Unified REST API (all endpoints)
  utils/
    password_encrypt.py        # Fernet encryption/decryption utilities
    asset_code_generator.py    # AST-YYYY-NNN code generation
    pagination.py              # Pagination calculation helpers
    activity_logger.py         # CRUD activity logging
  models.py                    # Asset, User, AssetAuditLog, ActivityLog models
```

### Frontend
```
frontend/app/modules/assets/
  page.tsx                     # Main module page (orchestrator)
  components/
    asset-table.tsx            # Unified asset table with sorting
    asset-filters.tsx          # Filter bar (category, sub-category, etc.)
    asset-stats.tsx            # Summary dashboard cards
    asset-form.tsx             # Create/Edit form modal
    asset-detail-modal.tsx     # Asset detail view modal
    password-field.tsx         # Password field with step-up reveal
    category-specific/
      users-fields.tsx         # User sub-category form fields
      hardware-fields.tsx      # Hardware sub-category form fields
      software-fields.tsx      # Software sub-category form fields
      virtual-infra-fields.tsx # Virtual infrastructure form fields
      information-fields.tsx   # Information asset form fields
    config/
      config-list.tsx          # Configuration list view
      config-form.tsx          # Configuration form
      config-history.tsx       # Configuration change history
      delete-confirm.tsx       # Delete confirmation dialog
```

---

## Database Schema

### Table: `assets` (unified)

| Column                  | Type        | Nullable | Description                        |
| ----------------------- | ----------- | -------- | ---------------------------------- |
| `id`                    | Integer     | No       | Primary key, auto-increment        |
| `asset_code`            | String      | No       | Unique code (AST-YYYY-NNN)         |
| `name`                  | String      | No       | Asset name                         |
| `category`              | String      | No       | One of 5 categories                |
| `sub_category`          | String      | No       | Category-specific sub-category     |
| `classification`        | String      | No       | Public / Internal / Confidential   |
| `status`                | String      | No       | Active / In-Maintenance / Retired / Lost |
| `owner_name`            | String      | Yes      | Asset owner                        |
| `assigned_to`           | String      | Yes      | Assigned user or entity            |
| `location`              | String      | Yes      | Physical or logical location       |
| `attributes`            | JSON/Text   | Yes      | Category-specific attributes       |
| `purchase_date`         | Date        | Yes      | Date of purchase                   |
| `warranty_until`        | Date        | Yes      | Warranty expiration                |
| `disposal_date`         | Date        | Yes      | Date of disposal                   |
| `price`                 | Float       | Yes      | Purchase price                     |
| `acceptable_use_policy` | String      | Yes      | AUP reference                      |
| `created_by`            | String      | Yes      | Username of creator                |
| `updated_by`            | String      | Yes      | Username of last updater           |
| `created_at`            | DateTime    | No       | Creation timestamp                 |
| `updated_at`            | DateTime    | No       | Last update timestamp              |

### Table: `asset_audit_logs`

| Column         | Type      | Description                         |
| -------------- | --------- | ----------------------------------- |
| `id`           | Integer   | Primary key                         |
| `asset_id`     | Integer   | Foreign key to assets               |
| `asset_code`   | String    | Asset code (denormalized)           |
| `asset_name`   | String    | Asset name (denormalized)           |
| `sub_category` | String    | Asset sub-category                  |
| `action_type`  | String    | `view_password` / `view_password_failed` |
| `username`     | String    | Acting user                         |
| `ip_address`   | String    | Client IP                           |
| `details`      | JSON      | Additional context                  |
| `created_at`   | DateTime  | Timestamp                           |

---

## Constants Reference

### Categories
```
users, hardware, software, virtual-infrastructure, information
```

### Classification Levels
```
public, internal, confidential
```

### Status Options
```
active, in-maintenance, retired, lost
```

### Auto-Classification Rules

| Category / Sub-Category      | Classification |
| ---------------------------- | -------------- |
| users / team_member          | internal       |
| users / ftp_user             | confidential   |
| users / samba_192            | confidential   |
| users / samba_sequis         | confidential   |
| users / sig_member           | internal       |
| hardware (all)               | internal       |
| software (all)               | internal       |
| virtual-infrastructure (all) | internal       |
| information / database       | confidential   |
| information / record         | confidential   |
| information / document       | internal       |
| information / archive        | internal       |

---

## Environment Variables

| Variable              | Description                                      | Required |
| --------------------- | ------------------------------------------------ | -------- |
| `ASSET_ENCRYPTION_KEY`| Base64-encoded 32-byte Fernet encryption key     | Yes (prod) |
| `SECRET_KEY`          | JWT signing key (must match main.py)             | Yes      |

To generate an encryption key:
```python
from cryptography.fernet import Fernet
import base64
key = base64.urlsafe_b64encode(Fernet.generate_key()).decode()
print(key)
```
