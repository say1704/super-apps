# Module 17: Configuration Management

## 1. Function
Asset-level configuration tracking with parameter-value pairs, categorized configurations, full change history audit trail, and configuration category management.

## 2. Business Logic

### 2.1 Configurations
- **Per-Asset**: Each configuration belongs to an asset via `asset_id`
- **Parameters**: Key-value pairs (e.g., "SSH Port" → "22", "Firewall Status" → "Enabled")
- **Categories**: Text label + optional FK to `config_categories`
- **Change History**: Every value change recorded in `config_change_history` with old/new values, reason, and changer
- **Deletion History**: When config deleted, history entry created with `new_value='[DELETED]'` and `config_id` preserved
- **Optimistic Locking**: Version-based conflict detection on updates
- **Auto Timestamp**: `last_checked` auto-updated on every modification

### 2.2 Configuration Categories
- **Default Categories**: Security (red), Performance (yellow), Operational (blue), Network (green)
- **Auto-Seed**: Creates defaults if table is empty
- **Delete Cascade**: When category deleted, linked configs have `category_id` set to NULL and `category` set to lowercase category name
- **Optimistic Locking**: Version-based conflict detection

### 2.3 Change History
- **Per-Config**: `/configurations/{id}/history` shows all changes for one config
- **Per-Asset**: `/configurations/assets/{asset_id}/history` shows all changes for all configs of an asset (including deleted configs)
- **Fields Tracked**: old_value, new_value, change_reason, change_request_id, changed_by, changed_at

## 3. API Endpoints

| Method | Endpoint | Response Model | Auth | Description |
|--------|----------|---------------|------|-------------|
| GET | `/configurations/assets/{asset_id}` | `dict` | JWT | Get all configs for an asset |
| POST | `/configurations` | `ConfigurationItemResponse` | JWT | Create configuration |
| PUT | `/configurations/{config_id}` | `ConfigurationItemResponse` | JWT | Update (optimistic lock, records change history) |
| DELETE | `/configurations/{config_id}` | `MessageResponse` | JWT | Delete (records deletion in history) |
| GET | `/configurations/{config_id}/history` | `ConfigurationHistoryListResponse` | JWT | Change history for one config |
| GET | `/configurations/assets/{asset_id}/history` | `dict` | JWT | Change history for all configs of an asset |
| GET | `/config-categories` | `dict` | JWT | List categories (auto-seeds defaults) |
| POST | `/config-categories` | `dict` | JWT | Create category |
| PUT | `/config-categories/{cat_id}` | `dict` | JWT | Update category (optimistic lock) |
| DELETE | `/config-categories/{cat_id}` | `MessageResponse` | JWT | Delete category (nullifies linked configs) |

## 4. Database Schema

### `asset_configurations`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | Integer (PK) | No | - | Auto-increment |
| `asset_id` | Integer (FK→asset_common.id) | No | - | Parent asset |
| `parameter` | String | No | - | Configuration parameter name |
| `value` | Text | No | - | Current value |
| `category` | String | Yes | "operational" | Category text label |
| `category_id` | Integer (FK→config_categories.id) | Yes | - | Category FK reference |
| `notes` | Text | Yes | - | Additional notes |
| `last_checked` | DateTime | Yes | utcnow | Last verification timestamp |
| `created_by` | String | Yes | - | Creator username |
| `updated_by` | String | Yes | - | Last updater username |
| `created_at` | DateTime | Yes | utcnow | Creation timestamp |
| `updated_at` | DateTime | Yes | utcnow | Last update timestamp |
| `version` | Integer | Yes | 0 | Optimistic locking |

### `config_categories`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | Integer (PK) | No | - | Auto-increment |
| `name` | String | No | - | Unique category name |
| `color` | String | Yes | "blue" | UI color |
| `sort_order` | Integer | Yes | 0 | Display order |
| `description` | Text | Yes | - | Category description |
| `created_at` | DateTime | Yes | utcnow | Creation timestamp |

### `config_change_history`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | Integer (PK) | No | - | Auto-increment |
| `config_id` | Integer (FK→asset_configurations.id) | Yes | - | Configuration ID (NULL if deleted) |
| `asset_id` | Integer (FK→asset_common.id) | Yes | - | Asset ID (preserved after delete) |
| `parameter` | String(200) | Yes | - | Parameter name |
| `old_value` | Text | No | - | Previous value |
| `new_value` | Text | No | - | New value |
| `change_reason` | Text | Yes | - | Reason for change |
| `change_request_id` | String | Yes | - | Link to change request |
| `changed_by` | String | Yes | - | Username who made change |
| `changed_at` | DateTime | Yes | utcnow | Change timestamp |

### PostgreSQL Migration

```sql
CREATE TABLE config_categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL,
  color VARCHAR(20) DEFAULT 'blue',
  sort_order INTEGER DEFAULT 0,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE asset_configurations (
  id SERIAL PRIMARY KEY,
  asset_id INTEGER NOT NULL REFERENCES asset_common(id) ON DELETE CASCADE,
  parameter VARCHAR(255) NOT NULL,
  value TEXT NOT NULL,
  category VARCHAR(100) DEFAULT 'operational',
  category_id INTEGER REFERENCES config_categories(id),
  notes TEXT,
  last_checked TIMESTAMP DEFAULT NOW(),
  created_by VARCHAR(100),
  updated_by VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  version INTEGER DEFAULT 0
);

CREATE INDEX idx_config_asset ON asset_configurations(asset_id);
CREATE INDEX idx_config_category ON asset_configurations(category_id);
CREATE INDEX idx_config_parameter ON asset_configurations(parameter);

CREATE TABLE config_change_history (
  id SERIAL PRIMARY KEY,
  config_id INTEGER REFERENCES asset_configurations(id),
  asset_id INTEGER REFERENCES asset_common(id),
  parameter VARCHAR(200),
  old_value TEXT NOT NULL,
  new_value TEXT NOT NULL,
  change_reason TEXT,
  change_request_id VARCHAR(100),
  changed_by VARCHAR(100),
  changed_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_change_config ON config_change_history(config_id);
CREATE INDEX idx_change_asset ON config_change_history(asset_id);
CREATE INDEX idx_change_changed_at ON config_change_history(changed_at);
```
