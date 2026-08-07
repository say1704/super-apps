# Module 14: IRMC Check

## 1. Function
IRMC (Infrastructure Review & Monitoring Check) tracking with folder-based organization, screenshot uploads, and per-server check records.

## 2. Business Logic
- **Folders**: User-created folders with name, description, color for organizing checks
- **Checks**: Per-server check records with date, screenshot, notes, assigned to folder
- **File Upload**: Optional screenshot saved to `uploads/irmc/`
- **CRUD**: Create, list, delete for checks; full CRUD for folders
- **Activity Logging**: Check create/delete logged

## 3. API Endpoints

### 3.1 IRMC Checks

| Method | Endpoint | Response Model | Auth | Description |
|--------|----------|---------------|------|-------------|
| GET | `/irmc-check` | `IRMCListPaginatedResponse` | JWT | List with server name and folder filter |
| POST | `/irmc-check` | `IRMCCheckResponse` | JWT | Create with optional screenshot |
| DELETE | `/irmc-check/{item_id}` | `MessageResponse` | JWT | Delete |

### 3.2 IRMC Folders

| Method | Endpoint | Response Model | Auth | Description |
|--------|----------|---------------|------|-------------|
| GET | `/irmc-folders` | `IrmcFolderListPaginatedResponse` | JWT | List folders with check counts |
| POST | `/irmc-folders` | `IrmcFolderResponse` | JWT | Create folder |
| PUT | `/irmc-folders/{folder_id}` | `IrmcFolderResponse` | JWT | Update folder |
| DELETE | `/irmc-folders/{folder_id}` | `MessageResponse` | JWT | Delete folder |
| GET | `/irmc-folders/{folder_id}` | `IrmcFolderChecksResponse` | JWT | Get folder with its checks |

## 4. Database Schema

### `irmc_folders`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | Integer (PK) | No | - | Auto-increment |
| `name` | String | No | - | Folder name |
| `description` | Text | Yes | - | Folder description |
| `color` | String | Yes | "blue" | UI color |
| `created_by` | Integer (FK→users.id) | Yes | - | Creator user ID |
| `created_at` | DateTime | Yes | utcnow | Creation timestamp |

### `irmc_check`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | Integer (PK) | No | - | Auto-increment |
| `server_name` | String | No | - | Server name |
| `check_date` | Date | No | - | Check date |
| `screenshot_path` | String | Yes | - | Screenshot file path |
| `notes` | Text | Yes | - | Additional notes |
| `folder_id` | Integer (FK→irmc_folders.id) | Yes | - | Parent folder |
| `created_at` | DateTime | Yes | utcnow | Creation timestamp |
| `created_by` | Integer (FK→users.id) | Yes | - | Creator user ID |

### PostgreSQL Migration

```sql
CREATE TABLE irmc_folders (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  color VARCHAR(20) DEFAULT 'blue',
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE irmc_check (
  id SERIAL PRIMARY KEY,
  server_name VARCHAR(255) NOT NULL,
  check_date DATE NOT NULL,
  screenshot_path VARCHAR(500),
  notes TEXT,
  folder_id INTEGER REFERENCES irmc_folders(id),
  created_at TIMESTAMP DEFAULT NOW(),
  created_by INTEGER REFERENCES users(id)
);

CREATE INDEX idx_irmc_folder ON irmc_check(folder_id);
CREATE INDEX idx_irmc_server ON irmc_check(server_name);
CREATE INDEX idx_irmc_date ON irmc_check(check_date);
```
