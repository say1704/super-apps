# Module 10: Quality Objectives

## 1. Function
Tracks quality objectives per work unit with SLA definitions, monthly data tracking (JSON), evidence attachments, and quality evidence management.

## 2. Business Logic
- **Monthly Data**: Stored as JSON string array containing `{metric_name, target, tools, months: {2025-01: ..., 2025-02: ...}, summary}`
- **File Attachment**: Optional file per objective, saved to `uploads/quality-objectives/`
- **Version Tracking**: Optimistic locking on updates
- **Evidence**: Separate `QualityEvidence` table linked to objectives, with file uploads and custom tables (JSON)
- **Activity Logging**: All CRUD operations logged

## 3. API Endpoints

| Method | Endpoint | Response Model | Auth | Description |
|--------|----------|---------------|------|-------------|
| GET | `/quality-objectives` | `QualityObjectiveListPaginatedResponse` | JWT | List with pagination |
| POST | `/quality-objectives` | `QualityObjectiveResponse` | JWT | Create with optional file |
| PUT | `/quality-objectives/{qo_id}` | `QualityObjectiveResponse` | JWT | Update (multipart form, optimistic lock) |
| DELETE | `/quality-objectives/{qo_id}` | `MessageResponse` | JWT | Delete |
| GET | `/quality-objectives/{qo_id}/attachment` | FileResponse | JWT | Download attachment |
| GET | `/quality-objectives/{qo_id}/monthly-data` | `dict` | JWT | Get monthly data |
| POST | `/quality-objectives/{qo_id}/monthly-data` | `MessageResponse` | JWT | Save monthly data (JSON body) |
| GET | `/quality-evidence` | `dict` | JWT | List evidence |
| POST | `/quality-evidence` | `dict` | JWT | Create evidence with file |

## 4. Database Schema

### `quality_objectives`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | Integer (PK) | No | - | Auto-increment |
| `work_unit` | String | No | - | Work unit name |
| `objective` | Text | No | - | Objective description |
| `sla` | Text | Yes | - | SLA definition |
| `what` | Text | Yes | - | What to do |
| `resources` | Text | Yes | - | Resources needed |
| `who` | String | Yes | - | Responsible person |
| `when` | String | Yes | - | Timeline |
| `how_evaluated` | Text | Yes | - | Evaluation method |
| `attachment` | String | Yes | - | File path |
| `monthly_data` | Text | Yes | - | JSON array of monthly metrics |
| `created_at` | DateTime | Yes | utcnow | Creation timestamp |
| `created_by` | Integer (FK→users.id) | Yes | - | Creator user ID |
| `version` | Integer | Yes | 0 | Optimistic locking |

### `quality_evidence`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | Integer (PK) | No | - | Auto-increment |
| `objective_id` | Integer (FK→quality_objectives.id) | Yes | - | Parent objective |
| `file_path` | String | Yes | - | Evidence file path |
| `description` | Text | Yes | - | Evidence description |
| `custom_table` | Text | Yes | - | JSON custom table data |
| `created_at` | DateTime | Yes | utcnow | Creation timestamp |
| `created_by` | Integer (FK→users.id) | Yes | - | Creator user ID |

### PostgreSQL Migration

```sql
CREATE TABLE quality_objectives (
  id SERIAL PRIMARY KEY,
  work_unit VARCHAR(255) NOT NULL,
  objective TEXT NOT NULL,
  sla TEXT,
  what TEXT,
  resources TEXT,
  who VARCHAR(255),
  when VARCHAR(255),
  how_evaluated TEXT,
  attachment VARCHAR(500),
  monthly_data TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  created_by INTEGER REFERENCES users(id),
  version INTEGER DEFAULT 0
);

CREATE TABLE quality_evidence (
  id SERIAL PRIMARY KEY,
  objective_id INTEGER REFERENCES quality_objectives(id),
  file_path VARCHAR(500),
  description TEXT,
  custom_table TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  created_by INTEGER REFERENCES users(id)
);
```
