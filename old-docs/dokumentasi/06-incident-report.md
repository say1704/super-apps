# Module 6: Incident Report

## 1. Function
Tracks IT incidents with lifecycle management (Open → In Progress → Resolved → Closed), including server name, incident type, description, actions taken, and file attachments.

## 2. Business Logic
- **Status Flow**: Open → In Progress → Resolved → Closed
- **File Upload**: Optional attachment saved to `uploads/incidents/`
- **Notifications**: Incident creation triggers in-app notification via `notify_incident_created()`
- **SSE Broadcasting**: `incident_created` event broadcast to all connected clients except actor
- **Optimistic Locking**: Version-based conflict detection on updates
- **Activity Logging**: All CRUD operations logged
- **Update Scope**: Only `status` and `action_taken` can be updated (not full record)
- **Filtering**: List supports status and incident_type filters

## 3. API Endpoints

| Method | Endpoint | Response Model | Auth | Description |
|--------|----------|---------------|------|-------------|
| GET | `/incident-report` | `IncidentListPaginatedResponse` | JWT | List with pagination, status/type filters |
| GET | `/incident-report/{item_id}` | `IncidentResponse` | JWT | Get single record |
| POST | `/incident-report` | `IncidentResponse` | JWT | Create with optional file upload |
| PUT | `/incident-report/{item_id}` | `IncidentResponse` | JWT | Update status/action_taken (optimistic lock) |
| DELETE | `/incident-report/{item_id}` | `MessageResponse` | JWT | Delete |

## 4. Database Schema

### `incident_report`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | Integer (PK) | No | - | Auto-increment |
| `incident_date` | Date | No | - | Date of incident |
| `server_name` | String | No | - | Affected server |
| `incident_type` | String | Yes | - | Security, System, Network, etc. |
| `description` | Text | No | - | Incident description |
| `status` | String | Yes | "Open" | Open, In Progress, Resolved, Closed |
| `action_taken` | Text | Yes | - | Actions taken to resolve |
| `file_path` | String | Yes | - | Attachment path |
| `created_at` | DateTime | Yes | utcnow | Creation timestamp |
| `created_by` | Integer (FK→users.id) | Yes | - | Reporter user ID |
| `version` | Integer | Yes | 0 | Optimistic locking |

### PostgreSQL Migration

```sql
CREATE TABLE incident_report (
  id SERIAL PRIMARY KEY,
  incident_date DATE NOT NULL,
  server_name VARCHAR(255) NOT NULL,
  incident_type VARCHAR(100),
  description TEXT NOT NULL,
  status VARCHAR(30) DEFAULT 'Open',
  action_taken TEXT,
  file_path VARCHAR(500),
  created_at TIMESTAMP DEFAULT NOW(),
  created_by INTEGER REFERENCES users(id),
  version INTEGER DEFAULT 0
);

CREATE INDEX idx_incident_status ON incident_report(status);
CREATE INDEX idx_incident_type ON incident_report(incident_type);
CREATE INDEX idx_incident_date ON incident_report(incident_date);
```
