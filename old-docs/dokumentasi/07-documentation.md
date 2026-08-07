# Module 7: Documentation & Knowledge Base

## 1. Function
Full-featured document management system with categories, version history, approval workflow (draft → pending_approval → approved/rejected → archived), templates, and file uploads.

## 2. Business Logic

### 2.1 Document Lifecycle
- **Status Flow**: draft → pending_approval → approved/rejected → archived
- **Submit**: Draft or rejected documents can be submitted for approval
- **Approve**: Only `pending_approval` documents can be approved (sets `approved_by`, `approved_at`)
- **Reject**: Only `pending_approval` documents can be rejected (with reason)
- **Version Auto-Rollback**: When approved document is edited, status reverts to `draft`, `approved_at` and `approved_by` cleared

### 2.2 Version History
- Every document starts at version 1
- On content change, previous content saved to `document_versions` table with change note
- Version number increments on each update
- Versions can be retrieved via `/documents/{id}/versions`

### 2.3 Ownership Filter
- Non-superadmin users only see documents from their role group via `get_document_filter()`
- Edit/delete restricted to same-role users via `can_modify_document()`
- Bulk delete: superadmin can delete any, others only same-role

### 2.4 Categories
- User-managed CRUD for document categories
- Delete with documents: soft-deactivates (sets `is_active=0`) instead of hard delete
- Duplicate name check on create/update

### 2.5 Templates
- 3 built-in templates: SOP, Work Instruction, Maintenance Report
- Each template provides pre-filled HTML content with appropriate category

### 2.6 File Handling
- Allowed extensions: `.pdf`, `.docx`, `.txt`, `.md`, `.html`
- Filename sanitization (removes special chars, blocks `..` traversal)
- Download increments `download_count`, view increments `view_count`

### 2.7 Duplicate
- Creates copy of document with "(Copy)" suffix, starts as draft

## 3. API Endpoints

### 3.1 Documents

| Method | Endpoint | Response Model | Auth | Description |
|--------|----------|---------------|------|-------------|
| GET | `/documents` | `DocumentListPaginatedResponse` | JWT | List with search, category, type, status, date filters |
| GET | `/documents/stats` | `DocumentStatsResponse` | JWT | Stats by category, type |
| GET | `/documents/{doc_id}` | `DocumentResponse` | JWT | Get single document (includes content_html, file_path) |
| POST | `/documents` | `DocumentResponse` | JWT | Create (multipart form, optional file) |
| PUT | `/documents/{doc_id}` | `DocumentResponse` | JWT | Update (multipart form, version history, optimistic lock) |
| DELETE | `/documents/{doc_id}` | `DocumentActionResponse` | JWT | Delete (role-restricted) |
| POST | `/documents/bulk-delete` | `DocumentBulkDeleteResponse` | JWT | Bulk delete by comma-separated IDs |
| GET | `/documents/{doc_id}/download` | FileResponse | JWT | Download file, increments download_count |
| GET | `/documents/{doc_id}/view` | `DocumentActionResponse` | JWT | Record view, increments view_count |
| POST | `/documents/{doc_id}/approve` | `DocumentResponse` | JWT | Approve (must be pending_approval) |
| POST | `/documents/{doc_id}/reject` | `DocumentResponse` | JWT | Reject with reason query param |
| POST | `/documents/{doc_id}/submit` | `DocumentResponse` | JWT | Submit for approval (draft/rejected only) |
| GET | `/documents/{doc_id}/versions` | `List[DocumentVersionResponse]` | JWT | Get version history |
| POST | `/documents/{doc_id}/duplicate` | `DocumentResponse` | JWT | Duplicate document |
| POST | `/documents/templates/{template_name}` | `DocumentResponse` | JWT | Create from template (SOP/work_instruction/maintenance_report) |

### 3.2 Categories

| Method | Endpoint | Response Model | Auth | Description |
|--------|----------|---------------|------|-------------|
| GET | `/documents/categories` | `List[CategoryResponse]` | JWT | List categories (sorted by sort_order, name) |
| POST | `/documents/categories` | `CategoryResponse` | JWT | Create category |
| PUT | `/documents/categories/{cat_id}` | `CategoryResponse` | JWT | Update category (optimistic lock) |
| DELETE | `/documents/categories/{cat_id}` | `DocumentActionResponse` | JWT | Delete or deactivate if has documents |

### 3.3 Query Parameters (GET /documents)

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | int | 1 | Page number |
| `page_size` | int | 10 | Items per page |
| `search` | string | - | Search title, summary, tags, content_html |
| `category` | string | - | Filter by category |
| `doc_type` | string | - | Filter by doc_type (text/markdown/uploaded) |
| `status` | string | - | Filter by status |
| `start_date` | string | - | Filter created_at >= |
| `end_date` | string | - | Filter created_at <= |
| `sort_by` | string | updated_at | Column to sort |
| `sort_order` | string | desc | asc or desc |

## 4. Database Schema

### `document_library`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | Integer (PK) | No | - | Auto-increment |
| `title` | String(255) | No | - | Document title |
| `category` | String(100) | No | - | Category label |
| `doc_type` | String(50) | Yes | "text" | text, markdown, uploaded |
| `file_path` | String(500) | Yes | - | Uploaded file path |
| `content_html` | Text | Yes | - | Rich text content |
| `summary` | Text | Yes | - | Brief description |
| `tags` | String(500) | Yes | - | Comma-separated tags |
| `version` | Integer | Yes | 1 | Version number |
| `status` | String(30) | Yes | "draft" | draft, pending_approval, approved, rejected, archived |
| `download_count` | Integer | Yes | 0 | Download counter |
| `view_count` | Integer | Yes | 0 | View counter |
| `approved_by` | Integer (FK→users.id) | Yes | - | Approver user ID |
| `approved_at` | DateTime | Yes | - | Approval timestamp |
| `created_at` | DateTime | Yes | utcnow | Creation timestamp |
| `updated_at` | DateTime | Yes | utcnow | Last update timestamp |
| `created_by` | Integer (FK→users.id) | Yes | - | Creator user ID |

### `document_categories`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | Integer (PK) | No | - | Auto-increment |
| `name` | String(100) | No | - | Unique category name |
| `description` | String(500) | Yes | - | Category description |
| `icon` | String(20) | Yes | "📁" | Emoji icon |
| `color` | String(7) | Yes | "#6b7280" | Hex color |
| `sort_order` | Integer | Yes | 0 | Display order |
| `is_active` | Integer | Yes | 1 | 1=active, 0=hidden |
| `created_at` | DateTime | Yes | utcnow | Creation timestamp |
| `updated_at` | DateTime | Yes | utcnow | Last update timestamp |
| `created_by` | Integer (FK→users.id) | Yes | - | Creator user ID |
| `version` | Integer | Yes | 0 | Optimistic locking |

### `document_versions`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | Integer (PK) | No | - | Auto-increment |
| `document_id` | Integer (FK→document_library.id) | No | - | Parent document |
| `version_number` | Integer | No | - | Version number |
| `content_html` | Text | Yes | - | Snapshot of content |
| `file_path` | String(500) | Yes | - | Snapshot of file path |
| `summary` | Text | Yes | - | Snapshot of summary |
| `changed_by` | Integer (FK→users.id) | Yes | - | Who made the change |
| `change_note` | Text | Yes | - | Reason for change |
| `created_at` | DateTime | Yes | utcnow | Version creation timestamp |

### PostgreSQL Migration

```sql
CREATE TABLE document_library (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  category VARCHAR(100) NOT NULL,
  doc_type VARCHAR(50) DEFAULT 'text',
  file_path VARCHAR(500),
  content_html TEXT,
  summary TEXT,
  tags VARCHAR(500),
  version INTEGER DEFAULT 1,
  status VARCHAR(30) DEFAULT 'draft',
  download_count INTEGER DEFAULT 0,
  view_count INTEGER DEFAULT 0,
  approved_by INTEGER REFERENCES users(id),
  approved_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by INTEGER REFERENCES users(id)
);

CREATE INDEX idx_doc_title ON document_library(title);
CREATE INDEX idx_doc_category ON document_library(category);
CREATE INDEX idx_doc_status ON document_library(status);
CREATE INDEX idx_doc_created_at ON document_library(created_at);

CREATE TABLE document_categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL,
  description VARCHAR(500),
  icon VARCHAR(20) DEFAULT '📁',
  color VARCHAR(7) DEFAULT '#6b7280',
  sort_order INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by INTEGER REFERENCES users(id),
  version INTEGER DEFAULT 0
);

CREATE TABLE document_versions (
  id SERIAL PRIMARY KEY,
  document_id INTEGER NOT NULL REFERENCES document_library(id),
  version_number INTEGER NOT NULL,
  content_html TEXT,
  file_path VARCHAR(500),
  summary TEXT,
  changed_by INTEGER REFERENCES users(id),
  change_note TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_doc_ver_document ON document_versions(document_id);
```
