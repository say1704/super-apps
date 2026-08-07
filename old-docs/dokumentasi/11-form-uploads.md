# Module 11: Form Uploads

## 1. Function
Simple form upload system for Change Request and Destruction Request forms with file attachment, PIC tracking, and notes.

## 2. Business Logic
- **File Upload**: Required file saved to `uploads/forms/`
- **Form Types**: Change, Destruction (extensible)
- **CRUD**: Create, list, delete only (no update endpoint)
- **Activity Logging**: Create and delete logged

## 3. API Endpoints

| Method | Endpoint | Response Model | Auth | Description |
|--------|----------|---------------|------|-------------|
| GET | `/form-uploads` | `FormListPaginatedResponse` | JWT | List with pagination |
| POST | `/form-uploads` | `FormUploadResponse` | JWT | Create with file upload (required) |
| DELETE | `/form-uploads/{item_id}` | `MessageResponse` | JWT | Delete |

## 4. Database Schema

### `form_uploads`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | Integer (PK) | No | - | Auto-increment |
| `form_type` | String | No | - | Change, Destruction |
| `file_name` | String | No | - | Original filename |
| `upload_date` | Date | No | - | Upload date |
| `pic` | String | Yes | - | Person in charge |
| `notes` | Text | Yes | - | Additional notes |
| `file_path` | String | Yes | - | Stored file path |
| `created_at` | DateTime | Yes | utcnow | Creation timestamp |
| `created_by` | Integer (FK→users.id) | Yes | - | Uploader user ID |

### PostgreSQL Migration

```sql
CREATE TABLE form_uploads (
  id SERIAL PRIMARY KEY,
  form_type VARCHAR(50) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  upload_date DATE NOT NULL,
  pic VARCHAR(255),
  notes TEXT,
  file_path VARCHAR(500),
  created_at TIMESTAMP DEFAULT NOW(),
  created_by INTEGER REFERENCES users(id)
);

CREATE INDEX idx_form_type ON form_uploads(form_type);
CREATE INDEX idx_form_upload_date ON form_uploads(upload_date);
```
