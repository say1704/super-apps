# Module 2: Dashboard & Task Management

## 1. Function

### 1.1 Dashboard
Central aggregation hub that provides a unified overview of the entire IT management system. Displays real-time stats, task focus, activity feeds, and infrastructure status from all connected modules.

### 1.2 Project Tasks (Scrum)
Task management system supporting Scrum methodology with status tracking (Todo/Doing/Done), priority levels, assignee management, due dates, and bulk operations.

### 1.3 Sprint Management
Sprint planning and tracking with date ranges, goals, and task associations via comma-separated task IDs.

### 1.4 Worklog
Time tracking and work logging system linked to project tasks, with category-based reporting and time parsing (hours/minutes).

## 2. Business Logic

### 2.1 Dashboard Aggregation
- **Stats Endpoint**: Queries COUNT across 15+ tables in a single request, cached for 60 seconds via `utils.cache`
- **Enhanced Dashboard**: Computes today/week metrics, task completion rate, overdue count, and recent activity timeline (7-day window)
- **Today's Focus**: Retrieves top priorities (high-priority incomplete tasks), due-today tasks, and in-progress tasks
- **Recent Activity**: Aggregates last 20 activities from 5 modules (worklog, incident, vulnerability, tasks, L&M), sorted by timestamp descending, cached 30 seconds
- **Infrastructure Status**: Computes latest backup per server, calculates days since last backup, counts OK/Warning/Critical statuses
- **Priority Matrix**: Categorizes incomplete tasks into urgent/normal/low plus last 10 completed as backlog
- **Caching Strategy**: Global cache for `dashboard_stats` and `infrastructure_status`; per-user cache for `enhanced_dashboard_{user_id}` and `recent_activity_{user_id}`

### 2.2 Task Management
- **Ownership Filter**: Non-superadmin users only see tasks they created via `get_task_filter()`
- **Status Flow**: todo → doing → done; `completed_at` auto-set when status changes to "done", cleared when changed away
- **Priority Levels**: low, medium, high
- **Optimistic Locking**: Version-based conflict detection on updates via `check_version_conflict()`
- **Bulk Operations**: Bulk delete and bulk status update with ownership enforcement (superadmin bypass)
- **Notifications**: Task assignment triggers in-app notification via `notify_task_assigned()`
- **SSE Broadcasting**: `task_created` and `task_updated` events broadcast to all connected clients except the actor
- **Time Parsing**: `actual_time` stored as string (e.g., "2h", "30m", "1.5"); parsed to float hours for dashboard aggregation

### 2.3 Sprint Management
- **Task Association**: `task_ids` stored as comma-separated string, parsed to `List[int]` on read
- **Status Flow**: planned → active → completed
- **No Ownership Filter**: All users can view all sprints

### 2.4 Worklog
- **Task Linking**: Worklogs can be linked/unlinked to project tasks via `/worklog/{id}/link-task`
- **Category Tracking**: Worklogs categorized (Meeting, Development, Maintenance, etc.) for weekly breakdown
- **Time Format**: `actual_time` and `estimated_time` stored as human-readable strings

## 3. API Endpoints

### 3.1 Dashboard (`backend/api/dashboard.py`)

| Method | Endpoint | Response Model | Auth | Description |
|--------|----------|---------------|------|-------------|
| GET | `/dashboard/stats` | `DashboardStatsResponse` | JWT | Aggregate counts from all modules |
| GET | `/dashboard/enhanced` | `EnhancedDashboardResponse` | JWT | Today/week overview, task breakdown, overdue |
| GET | `/tasks/today-focus` | `TodayFocusResponse` | JWT | Top priorities, due today, in progress |
| GET | `/tasks/priority-matrix` | `PriorityMatrixResponse` | JWT | Urgent/normal/low/backlog categorization |
| GET | `/dashboard/recent-activity` | `List[ActivityItemResponse]` | JWT | Last 20 activities across modules |
| GET | `/dashboard/infrastructure-status` | `InfrastructureStatusResponse` | JWT | Backup status and server health |

### 3.2 Tasks (`backend/api/tasks.py`)

| Method | Endpoint | Response Model | Auth | Description |
|--------|----------|---------------|------|-------------|
| GET | `/project-tasks` | `TaskListPaginatedResponse` | JWT | List tasks with pagination, filters, sorting |
| GET | `/project-tasks/stats` | `TaskStatsResponse` | JWT | Task statistics by status, assignee, priority |
| GET | `/project-tasks/{task_id}/worklogs` | `dict` | JWT | Get worklogs linked to a task |
| POST | `/project-tasks` | `TaskItemResponse` | JWT | Create new task (multipart form) |
| PUT | `/project-tasks/{item_id}` | `TaskItemResponse` | JWT | Update task (multipart form, optimistic lock) |
| DELETE | `/project-tasks/{item_id}` | `TaskDeleteResponse` | JWT | Delete task (owner only) |
| POST | `/project-tasks/bulk-delete` | `TaskBulkResponse` | JWT | Bulk delete by IDs |
| POST | `/project-tasks/bulk-status` | `TaskBulkResponse` | JWT | Bulk status update by IDs |

### 3.3 Sprints (`backend/api/tasks.py`)

| Method | Endpoint | Response Model | Auth | Description |
|--------|----------|---------------|------|-------------|
| GET | `/sprints` | `SprintListPaginatedResponse` | JWT | List sprints with pagination |
| POST | `/sprints` | `SprintResponse` | JWT | Create sprint (multipart form) |
| PUT | `/sprints/{sprint_id}` | `SprintResponse` | JWT | Update sprint (multipart form, optimistic lock) |
| DELETE | `/sprints/{sprint_id}` | `SprintDeleteResponse` | JWT | Delete sprint |

### 3.4 Worklog (`backend/api/tasks.py`)

| Method | Endpoint | Response Model | Auth | Description |
|--------|----------|---------------|------|-------------|
| POST | `/worklog/{worklog_id}/link-task` | `dict` | JWT | Link/unlink worklog to task |

### 3.5 Query Parameters (GET /project-tasks)

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | int | 1 | Page number |
| `page_size` | int | 20 | Items per page |
| `status_filter` | string | - | Filter by status (todo/doing/done) |
| `priority` | string | - | Filter by priority (low/medium/high) |
| `assignee` | string | - | Filter by assignee (ILIKE match) |
| `tags` | string | - | Filter by tags (comma-separated, ILIKE match) |
| `search` | string | - | Full-text search on title/description |
| `from_date` | string | - | Filter created_at >= ISO date |
| `to_date` | string | - | Filter created_at <= ISO date |
| `sort_by` | string | created_at | Column to sort by |
| `sort_order` | string | desc | asc or desc |

## 4. Database Schema

### 4.1 `project_tasks`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | Integer (PK) | No | - | Auto-increment primary key |
| `title` | String | No | - | Task title |
| `description` | Text | Yes | - | Task description |
| `status` | String | Yes | "todo" | todo, doing, done |
| `assignee` | String | Yes | - | Assigned person name |
| `priority` | String | Yes | "medium" | low, medium, high |
| `due_date` | Date | Yes | - | Deadline |
| `tags` | String | Yes | "" | Comma-separated tags |
| `estimated_hours` | String | Yes | - | Estimated hours |
| `actual_hours` | String | Yes | - | Sum of worklog actual time |
| `created_at` | DateTime | Yes | utcnow | Creation timestamp |
| `updated_at` | DateTime | Yes | utcnow | Last update timestamp |
| `created_by` | Integer (FK→users.id) | Yes | - | Creator user ID |
| `completed_at` | DateTime | Yes | - | Completion timestamp |
| `version` | Integer | Yes | 0 | Optimistic locking version |

**Relationships**: `worklogs` → `WorkLog` (one-to-many, cascade delete)

**Indexes**: `id` (primary, indexed), `created_by` (FK)

### 4.2 `sprints`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | Integer (PK) | No | - | Auto-increment primary key |
| `name` | String | No | - | Sprint name |
| `start_date` | Date | Yes | - | Sprint start |
| `end_date` | Date | Yes | - | Sprint end |
| `status` | String | Yes | "planned" | planned, active, completed |
| `goal` | Text | Yes | - | Sprint goal |
| `task_ids` | String | Yes | "" | Comma-separated task IDs |
| `created_at` | DateTime | Yes | utcnow | Creation timestamp |
| `created_by` | Integer (FK→users.id) | Yes | - | Creator user ID |
| `version` | Integer | Yes | 0 | Optimistic locking version |

**Indexes**: `id` (primary, indexed), `created_by` (FK)

### 4.3 `work_logs`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | Integer (PK) | No | - | Auto-increment primary key |
| `user_id` | Integer (FK→users.id) | Yes | - | User who logged work |
| `date` | Date | No | - | Work date |
| `time` | String | Yes | - | Time as "HH:MM" |
| `description` | Text | No | - | Work description |
| `status` | String | Yes | "in_progress" | in_progress, done |
| `tags` | String | Yes | - | Comma-separated tags |
| `category` | String | Yes | "General" | Meeting, Development, etc. |
| `estimated_time` | String | Yes | - | e.g., "2h", "120m" |
| `actual_time` | String | Yes | - | e.g., "2h", "30m" |
| `notes` | Text | Yes | - | Additional notes |
| `task_id` | Integer (FK→project_tasks.id) | Yes | - | Linked task |
| `created_at` | DateTime | Yes | utcnow | Creation timestamp |
| `version` | Integer | Yes | 0 | Optimistic locking version |

**Relationships**: `task` → `ProjectTask` (many-to-one), `checklist_items` → `WorklogChecklist` (one-to-many, cascade delete)

**Indexes**: `id` (primary, indexed), `user_id` (FK), `task_id` (FK), `date` (implicit)

### 4.4 PostgreSQL Migration (NestJS Target)

```sql
CREATE TABLE project_tasks (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(20) DEFAULT 'todo' CHECK (status IN ('todo', 'doing', 'done')),
  assignee VARCHAR(255),
  priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  due_date DATE,
  tags VARCHAR(500) DEFAULT '',
  estimated_hours VARCHAR(50),
  actual_hours VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by INTEGER REFERENCES users(id),
  completed_at TIMESTAMP,
  version INTEGER DEFAULT 0
);

CREATE INDEX idx_project_tasks_status ON project_tasks(status);
CREATE INDEX idx_project_tasks_priority ON project_tasks(priority);
CREATE INDEX idx_project_tasks_due_date ON project_tasks(due_date);
CREATE INDEX idx_project_tasks_created_by ON project_tasks(created_by);
CREATE INDEX idx_project_tasks_assignee ON project_tasks(assignee);

CREATE TABLE sprints (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  start_date DATE,
  end_date DATE,
  status VARCHAR(20) DEFAULT 'planned' CHECK (status IN ('planned', 'active', 'completed')),
  goal TEXT,
  task_ids TEXT DEFAULT '',
  created_at TIMESTAMP DEFAULT NOW(),
  created_by INTEGER REFERENCES users(id),
  version INTEGER DEFAULT 0
);

CREATE TABLE work_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  date DATE NOT NULL,
  time VARCHAR(10),
  description TEXT NOT NULL,
  status VARCHAR(20) DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'done')),
  tags VARCHAR(500),
  category VARCHAR(100) DEFAULT 'General',
  estimated_time VARCHAR(50),
  actual_time VARCHAR(50),
  notes TEXT,
  task_id INTEGER REFERENCES project_tasks(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  version INTEGER DEFAULT 0
);

CREATE INDEX idx_work_logs_date ON work_logs(date);
CREATE INDEX idx_work_logs_user_id ON work_logs(user_id);
CREATE INDEX idx_work_logs_task_id ON work_logs(task_id);
CREATE INDEX idx_work_logs_category ON work_logs(category);
```

## 5. Frontend Components

### 5.1 Dashboard (`frontend/app/page.tsx`)
- **Stats Cards**: 9 stat cards with color coding, flash animation on value change, clickable links to modules
- **Quick Actions**: 6 action buttons for common create operations
- **Asset Inventory**: 5-column breakdown (Total, Hardware, Software, Virtual, Config Items)
- **Today's Overview**: 7 metrics (Today's Tasks, Worklogs, Hours, Week Hours, Completion Rate, Overdue, Urgent)
- **Today's Focus**: 3-column layout (Top Priorities, Due Today, In Progress)
- **Task Breakdown**: Status counts (To Do/Doing/Done) + Weekly category chart
- **Recent Activity Feed**: Last 10 activities with module icons, user names, timestamps
- **Overdue Tasks**: Red-highlighted section with up to 5 overdue tasks
- **Infrastructure Status**: Backup status indicator + Server health (OK/Warning/Critical)
- **Module Grid**: 15 module cards filtered by user permissions, with count badges
- **Real-time**: SSE connection for live updates, 60-second polling fallback, online user count

### 5.2 Tasks (`frontend/app/modules/tasks/page.tsx`)
- List view with pagination, filtering, sorting
- Create/Edit modal with form fields
- Bulk select for delete and status update
- Stats panel with completion rate, assignee breakdown, priority distribution

### 5.3 Worklog (`frontend/app/modules/worklog/page.tsx`)
- Calendar/list view of work entries
- Link to project tasks
- Category-based time aggregation
- Checklist support per worklog entry
