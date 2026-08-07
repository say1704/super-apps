# Module 4: Monthly Server Check

## 1. Function
Tracks monthly server health checks with status (OK/Warning/Critical), recording server IP, check month, and notes.

## 2. Business Logic
- **CRUD**: Full create/read/update/delete with multipart form input
- **Status Values**: OK, Warning, Critical
- **Date Parsing**: Accepts `YYYY-MM-DD`, defaults to today if invalid
- **Optimistic Locking**: Version-based conflict detection on updates
- **Activity Logging**: All CRUD operations logged to `activity_logs`
- **Filtering**: List supports server name filter (ILIKE match)

## 3. API Endpoints

| Method | Endpoint | Response Model | Auth | Description |
|--------|----------|---------------|------|-------------|
| GET | `/monthly-server-check` | `MonthlyCheckListPaginatedResponse` | JWT | List with pagination, server filter |
| GET | `/monthly-server-check/{item_id}` | `MonthlyCheckResponse` | JWT | Get single record |
| POST | `/monthly-server-check` | `MonthlyCheckResponse` | JWT | Create (multipart form) |
| PUT | `/monthly-server-check/{item_id}` | `MonthlyCheckResponse` | JWT | Update (multipart form, optimistic lock) |
| DELETE | `/monthly-server-check/{item_id}` | `MessageResponse` | JWT | Delete |

## 4. Database Schema

### `monthly_server_check`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | Integer (PK) | No | - | Auto-increment |
| `ip_server` | String | No | - | Server IP/name |
| `month` | String | No | - | Month label (e.g., "2025-01") |
| `check_date` | Date | No | - | Date of check |
| `status` | String | Yes | - | OK, Warning, Critical |
| `notes` | Text | Yes | - | Additional notes |
| `created_at` | DateTime | Yes | utcnow | Creation timestamp |
| `created_by` | Integer (FK→users.id) | Yes | - | Creator user ID |
| `version` | Integer | Yes | 0 | Optimistic locking |

### PostgreSQL Migration

```sql
CREATE TABLE monthly_server_check (
  id SERIAL PRIMARY KEY,
  ip_server VARCHAR(255) NOT NULL,
  month VARCHAR(20) NOT NULL,
  check_date DATE NOT NULL,
  status VARCHAR(20),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  created_by INTEGER REFERENCES users(id),
  version INTEGER DEFAULT 0
);

CREATE INDEX idx_monthly_check_ip ON monthly_server_check(ip_server);
CREATE INDEX idx_monthly_check_date ON monthly_server_check(check_date);
```
