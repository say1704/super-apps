# Module 12: Worklog

## 1. Function
Time tracking and work logging system with category-based reporting, task linking, checklist support, bulk operations, and SSE broadcasting.

## 2. Business Logic

### 2.1 Worklog CRUD
- **Ownership Filter**: Non-superadmin users only see their own worklogs via `get_worklog_filter()`
- **Edit/Delete Restriction**: Users can only modify their own worklogs
- **Time Format**: `actual_time` and `estimated_time` stored as human-readable strings (e.g., "2h", "30m")
- **Auto Time**: If no time provided, defaults to current WIB timezone (UTC+7)
- **Task Linking**: Worklogs can be linked to project tasks; creating/updating a worklog recalculates `task.actual_hours` by summing all linked worklog times
- **Task Auto-Status**: When worklog status is "done" and linked task is not "done", task status auto-changes to "doing"
- **Status Toggle**: Dedicated PATCH endpoint for quick status change
- **SSE Broadcasting**: `worklog_created` event broadcast to all connected clients

### 2.2 Checklist
- Each worklog can have multiple checklist items
- Checklist items: name, notes, is_completed, sort_order
- List endpoint includes checklist stats (total/completed count) per worklog

### 2.3 Bulk Operations
- **Bulk Delete**: Superadmin can delete any, others only their own
- **Bulk Status Update**: Superadmin can update any, others only their own

### 2.4 Stats
- Date range filtering (default: last 7 days)
- Counts by status (done, in_progress, cancelled)
- Category breakdown
- Total estimated vs actual hours

## 3. API Endpoints

| Method | Endpoint | Response Model | Auth | Description |
|--------|----------|---------------|------|-------------|
| GET | `/worklog` | `WorklogListPaginatedResponse` | JWT | List with date, status, category, tags filters |
| POST | `/worklog` | `dict` | JWT | Create (form data, auto-calculates task hours) |
| PUT | `/worklog/{item_id}` | `dict` | JWT | Update (form data, optimistic lock, recalculates task hours) |
| PATCH | `/worklog/{item_id}/status` | `dict` | JWT | Quick status toggle |
| DELETE | `/worklog/{item_id}` | `MessageResponse` | JWT | Delete (owner only) |
| POST | `/worklog/bulk-delete` | `MessageResponse` | JWT | Bulk delete |
| POST | `/worklog/bulk-status` | `MessageResponse` | JWT | Bulk status update |
| GET | `/worklog/stats` | `WorklogStatsResponse` | JWT | Stats with date range, categories, hours |

### 3.1 Query Parameters (GET /worklog)

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | int | 1 | Page number |
| `page_size` | int | 20 | Items per page |
| `start_date` | string | - | Filter date >= YYYY-MM-DD |
| `end_date` | string | - | Filter date <= YYYY-MM-DD |
| `status` | string | - | Filter by status |
| `category` | string | - | Filter by category |
| `tags` | string | - | Filter by tags (ILIKE) |
| `sort_by` | string | created_at | Column to sort |
| `sort_order` | string | desc | asc or desc |

## 4. Database Schema

### `work_logs`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | Integer (PK) | No | - | Auto-increment |
| `user_id` | Integer (FK→users.id) | Yes | - | User who logged work |
| `date` | Date | No | - | Work date |
| `time` | String | Yes | - | Time as "HH:MM" |
| `description` | Text | No | - | Work description |
| `status` | String | Yes | "in_progress" | in_progress, done, cancelled |
| `tags` | String | Yes | - | Comma-separated tags |
| `category` | String | Yes | "General" | Meeting, Development, Maintenance, etc. |
| `estimated_time` | String | Yes | - | e.g., "2h", "120m" |
| `actual_time` | String | Yes | - | e.g., "2h", "30m" |
| `notes` | Text | Yes | - | Additional notes |
| `task_id` | Integer (FK→project_tasks.id) | Yes | - | Linked task |
| `created_at` | DateTime | Yes | utcnow | Creation timestamp |
| `version` | Integer | Yes | 0 | Optimistic locking |

### `worklog_checklist`

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

```sql
CREATE TABLE work_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  date DATE NOT NULL,
  time VARCHAR(10),
  description TEXT NOT NULL,
  status VARCHAR(30) DEFAULT 'in_progress',
  tags VARCHAR(500),
  category VARCHAR(100) DEFAULT 'General',
  estimated_time VARCHAR(50),
  actual_time VARCHAR(50),
  notes TEXT,
  task_id INTEGER REFERENCES project_tasks(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  version INTEGER DEFAULT 0
);

CREATE INDEX idx_worklog_date ON work_logs(date);
CREATE INDEX idx_worklog_user ON work_logs(user_id);
CREATE INDEX idx_worklog_task ON work_logs(task_id);
CREATE INDEX idx_worklog_category ON work_logs(category);
CREATE INDEX idx_worklog_status ON work_logs(status);

CREATE TABLE worklog_checklist (
  id SERIAL PRIMARY KEY,
  worklog_id INTEGER NOT NULL REFERENCES work_logs(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  notes TEXT,
  is_completed BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  version INTEGER DEFAULT 0
);

CREATE INDEX idx_checklist_worklog ON worklog_checklist(worklog_id);
```
