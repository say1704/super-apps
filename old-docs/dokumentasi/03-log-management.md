# Module 3: Log Management (Maintenance & Compression)

## 1. Function

### 1.1 Log Maintenance
Tracks server log maintenance activities including script execution, file paths, and cleaned sizes. Provides CRUD operations and analytical reports grouped by server and date.

### 1.2 Log Compression
Records log compression/archive activities per server, tracking archive info and execution dates. Provides CRUD and summary reports per server.

## 2. Business Logic

### 2.1 Log Maintenance
- **CRUD**: Full create/read/update/delete with multipart form input
- **Execution Date Parsing**: Accepts `YYYY-MM-DD` string, defaults to today if invalid
- **Optimistic Locking**: Version-based conflict detection on updates
- **Activity Logging**: All CRUD operations logged to `activity_logs` table
- **Summary Report**: Groups logs by server, calculates total logs per server, aggregates sizes (KB/MB/GB → GB), tracks last execution date
- **By-Date Report**: Groups logs by execution date, useful for calendar/timeline view
- **Available Filters**: Returns distinct servers, years, and months from existing data for UI filter dropdowns
- **Size Aggregation**: Parses human-readable sizes (e.g., "500MB", "2.5GB") and converts to GB total

### 2.2 Log Compression
- **CRUD**: Full create/read/update/delete with multipart form input
- **Required Fields**: `server`, `archive_info`, `execution_date` are mandatory
- **Optimistic Locking**: Version-based conflict detection on updates
- **Summary Report**: Groups by server, counts archives per server, tracks last compression date
- **Available Filters**: Returns distinct servers and years for UI dropdowns

## 3. API Endpoints

### 3.1 Log Maintenance (`backend/api/log_maintenance.py`)

| Method | Endpoint | Response Model | Auth | Description |
|--------|----------|---------------|------|-------------|
| GET | `/log-maintenance` | `LogMaintenanceListPaginatedResponse` | JWT | List records with pagination, server filter, sorting |
| GET | `/log-maintenance/{item_id}` | `LogMaintenanceResponse` | JWT | Get single record |
| POST | `/log-maintenance` | `LogMaintenanceResponse` | JWT | Create record (multipart form) |
| PUT | `/log-maintenance/{item_id}` | `LogMaintenanceResponse` | JWT | Update record (multipart form, optimistic lock) |
| DELETE | `/log-maintenance/{item_id}` | `MessageResponse` | JWT | Delete record |
| GET | `/log-maintenance/reports/summary` | `dict` | JWT | Summary grouped by server with size aggregation |
| GET | `/log-maintenance/reports/by-date` | `dict` | JWT | Records grouped by execution date |
| GET | `/log-maintenance/reports/available-filters` | `dict` | JWT | Distinct servers, years, months for filters |

### 3.2 Log Compression (`backend/api/log_compression.py`)

| Method | Endpoint | Response Model | Auth | Description |
|--------|----------|---------------|------|-------------|
| GET | `/log-compression` | `LogCompressionListPaginatedResponse` | JWT | List records with pagination, server/year filter |
| GET | `/log-compression/{item_id}` | `LogCompressionResponse` | JWT | Get single record |
| POST | `/log-compression` | `LogCompressionResponse` | JWT | Create record (multipart form) |
| PUT | `/log-compression/{item_id}` | `LogCompressionResponse` | JWT | Update record (multipart form, optimistic lock) |
| DELETE | `/log-compression/{item_id}` | `MessageResponse` | JWT | Delete record |
| GET | `/log-compression/reports/summary` | `dict` | JWT | Summary grouped by server |
| GET | `/log-compression/reports/available-filters` | `dict` | JWT | Distinct servers and years for filters |

### 3.3 Query Parameters

**GET /log-maintenance**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | int | 1 | Page number |
| `page_size` | int | 20 | Items per page |
| `server` | string | - | Filter by server name (ILIKE match) |
| `sort_by` | string | created_at | Column to sort by |
| `sort_order` | string | desc | asc or desc |

**GET /log-maintenance/reports/summary**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `server` | string | - | Filter by server |
| `year` | int | - | Filter by year |
| `month` | int | - | Filter by month |

**GET /log-compression**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | int | 1 | Page number |
| `page_size` | int | 20 | Items per page |
| `server` | string | - | Filter by server name (ILIKE match) |
| `year` | int | - | Filter by year |
| `sort_by` | string | execution_date | Column to sort by |
| `sort_order` | string | desc | asc or desc |

## 4. Database Schema

### 4.1 `log_maintenance`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | Integer (PK) | No | - | Auto-increment primary key |
| `server` | String | No | - | Server name/IP |
| `path` | String | Yes | - | Log file path |
| `script_execution` | Text | Yes | - | Script execution details/output |
| `execution_date` | Date | Yes | - | Date of maintenance |
| `size` | String | Yes | - | Size cleaned (e.g., "500MB", "2.5GB") |
| `notes` | Text | Yes | - | Additional notes |
| `created_at` | DateTime | Yes | utcnow | Creation timestamp |
| `created_by` | Integer (FK→users.id) | Yes | - | Creator user ID |
| `version` | Integer | Yes | 0 | Optimistic locking version |

**Indexes**: `id` (primary, indexed), `created_by` (FK)

### 4.2 `log_compression`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | Integer (PK) | No | - | Auto-increment primary key |
| `server` | String(255) | No | - | Server name/IP |
| `archive_info` | String(500) | No | - | Archive file info/name |
| `execution_date` | Date | No | - | Date of compression |
| `notes` | Text | Yes | - | Additional notes |
| `created_at` | DateTime | Yes | utcnow | Creation timestamp |
| `created_by` | Integer (FK→users.id) | Yes | - | Creator user ID |
| `version` | Integer | Yes | 0 | Optimistic locking version |

**Indexes**: `id` (primary, indexed), `server` (indexed), `execution_date` (indexed), `created_by` (FK)

### 4.3 PostgreSQL Migration (NestJS Target)

```sql
CREATE TABLE log_maintenance (
  id SERIAL PRIMARY KEY,
  server VARCHAR(255) NOT NULL,
  path VARCHAR(500),
  script_execution TEXT,
  execution_date DATE,
  size VARCHAR(50),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  created_by INTEGER REFERENCES users(id),
  version INTEGER DEFAULT 0
);

CREATE INDEX idx_log_maintenance_server ON log_maintenance(server);
CREATE INDEX idx_log_maintenance_execution_date ON log_maintenance(execution_date);
CREATE INDEX idx_log_maintenance_created_by ON log_maintenance(created_by);

CREATE TABLE log_compression (
  id SERIAL PRIMARY KEY,
  server VARCHAR(255) NOT NULL,
  archive_info VARCHAR(500) NOT NULL,
  execution_date DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  created_by INTEGER REFERENCES users(id),
  version INTEGER DEFAULT 0
);

CREATE INDEX idx_log_compression_server ON log_compression(server);
CREATE INDEX idx_log_compression_execution_date ON log_compression(execution_date);
CREATE INDEX idx_log_compression_created_by ON log_compression(created_by);
```

## 5. Frontend Components

### 5.1 Log Maintenance (`frontend/app/modules/log-maintenance/page.tsx`)
- List view with pagination and server filter
- Create/Edit modal with form fields (server, path, script execution, execution date, size, notes)
- Summary report: server-wise breakdown with total logs, total size in GB, last execution date
- By-date report: timeline/calendar view grouped by execution date
- Filter dropdowns populated from `/reports/available-filters`

### 5.2 Log Compression (`frontend/app/modules/log-management/compression/page.tsx`)
- List view with pagination, server and year filters
- Create/Edit modal with required fields (server, archive info, execution date) and optional notes
- Summary report: server-wise archive count and last compression date
- Filter dropdowns from `/reports/available-filters`

### 5.3 Log Deletion (`frontend/app/modules/log-management/deletion/page.tsx`)
- Sub-module under log management, likely shares patterns with maintenance/compression
