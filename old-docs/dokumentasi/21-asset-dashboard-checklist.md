# Module 21: Asset Dashboard & Worklog Checklist

## 1. Function
Supporting modules: Asset Dashboard provides asset-specific analytics and views, while Worklog Checklist enables task-level checklists within worklog entries.

## 2. Asset Dashboard

### 2.1 Function
Asset-focused dashboard providing filtered views, statistics, and quick access to asset-related modules.

### 2.2 Business Logic
- Aggregates asset statistics from `asset_common` and extension tables
- Provides category-based filtering and classification views
- Integrates with asset audit logs for recent activity

### 2.3 API Endpoints
Mostly served through the unified `/assets` API (Module 8). The `asset_dashboard.py` file provides supplementary views that aggregate data already covered in the Asset Register module.

## 3. Worklog Checklist

### 3.1 Function
Checklist items attached to worklog entries for structured task completion tracking.

### 3.2 Business Logic
- Each worklog can have multiple checklist items
- Items have: name, notes, completion status, sort order
- Checklist stats (total/completed) included in worklog list response
- Cascade delete: when worklog deleted, all checklist items deleted

### 3.3 API Endpoints
Checklist operations are integrated into the Worklog module (Module 12) endpoints. No separate checklist CRUD endpoints exist; checklists are managed through the worklog create/update flow.

## 4. Database Schema

### `worklog_checklist` (already documented in Module 12)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | Integer (PK) | No | - | Auto-increment |
| `worklog_id` | Integer (FK→work_logs.id) | No | - | Parent worklog |
| `name` | String(255) | No | - | Checklist item name |
| `notes` | Text | Yes | - | Item notes |
| `is_completed` | Boolean | Yes | false | Completion status |
| `sort_order` | Integer | Yes | 0 | Display order |
| `created_at` | DateTime | Yes | utcnow | Creation timestamp |
| `version` | Integer | Yes | 0 | Optimistic locking |

### PostgreSQL Migration
No additional tables needed. Asset Dashboard uses existing `asset_common` and extension tables. Worklog Checklist uses `worklog_checklist` table (documented in Module 12).
