# Module 16: Activity Logs

## 1. Function
Unified audit trail combining `activity_logs` (general module actions) and `asset_audit_logs` (asset-specific events like password views) into a single paginated, filterable, and exportable log viewer.

## 2. Business Logic
- **Combined View**: Merges `ActivityLog` and `AssetAuditLog` tables into unified timeline
- **Ownership Filter**: Non-superadmin users only see their own logs
- **Sorting**: In-memory sort by timestamp, module, action, or user
- **User Resolution**: Batch-loads user data for activity logs to resolve usernames/roles
- **Export**: CSV or JSON format with date range and module/action filters
- **My Logs**: Dedicated `/activity-logs/me` endpoint for current user's activity only

## 3. API Endpoints

| Method | Endpoint | Response Model | Auth | Description |
|--------|----------|---------------|------|-------------|
| GET | `/activity-logs` | `ActivityLogListPaginatedResponse` | JWT | Combined logs with pagination, module/action filters |
| GET | `/activity-logs/me` | `dict` | JWT | Current user's activity logs only |
| GET | `/activity-logs/export` | CSV/JSON | JWT | Export logs (superadmin: all, others: own) |

### 3.1 Query Parameters (GET /activity-logs)

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | int | 1 | Page number |
| `page_size` | int | 50 | Items per page |
| `module` | string | - | Filter by module (ILIKE) |
| `action` | string | - | Filter by action (exact match) |
| `sort_by` | string | created_at | timestamp, module, action, user |
| `sort_order` | string | desc | asc or desc |

### 3.2 Export Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `format` | string | csv | csv or json |
| `module` | string | - | Filter by module |
| `action` | string | - | Filter by action |
| `from_date` | string | - | Filter created_at >= |
| `to_date` | string | - | Filter created_at <= |

## 4. Database Schema

### `activity_logs`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | Integer (PK) | No | - | Auto-increment |
| `user_id` | Integer (FK→users.id) | Yes | - | User who performed action |
| `action` | String | No | - | CREATE, UPDATE, DELETE, VIEW, EXPORT, etc. |
| `module` | String | No | - | Module name (assets, worklog, etc.) |
| `description` | Text | Yes | - | Action description |
| `asset_id` | Integer | Yes | - | Related asset ID |
| `asset_code` | String | Yes | - | Related asset code |
| `details` | Text | Yes | - | JSON details |
| `ip_address` | String | Yes | - | User IP address |
| `created_at` | DateTime | Yes | utcnow | Action timestamp |

### `asset_audit_logs`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | Integer (PK) | No | - | Auto-increment |
| `asset_id` | Integer (FK→asset_common.id) | No | - | Asset ID |
| `asset_code` | String | No | - | Asset code |
| `asset_name` | String | No | - | Asset name |
| `sub_category` | String | No | - | Asset sub-category |
| `action_type` | String | No | - | view_password, view_password_failed, edit, delete, create, export |
| `user_id` | Integer (FK→users.id) | Yes | - | User ID |
| `username` | String | Yes | - | Username |
| `ip_address` | String | Yes | - | IP address |
| `details` | JSON | Yes | {} | Additional details |
| `timestamp` | DateTime | Yes | utcnow | Event timestamp |

### PostgreSQL Migration

```sql
CREATE TABLE activity_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  action VARCHAR(50) NOT NULL,
  module VARCHAR(100) NOT NULL,
  description TEXT,
  asset_id INTEGER,
  asset_code VARCHAR(50),
  details TEXT,
  ip_address VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_activity_user ON activity_logs(user_id);
CREATE INDEX idx_activity_module ON activity_logs(module);
CREATE INDEX idx_activity_action ON activity_logs(action);
CREATE INDEX idx_activity_created_at ON activity_logs(created_at);

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
CREATE INDEX idx_asset_audit_user ON asset_audit_logs(user_id);
CREATE INDEX idx_asset_audit_action ON asset_audit_logs(action_type);
CREATE INDEX idx_asset_audit_timestamp ON asset_audit_logs(timestamp);
```
