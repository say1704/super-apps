# Document Library Module

## Overview
- **Path:** `/modules/documentation`
- **Purpose:** SOP, work instruction, maintenance report, and document management with approval workflow
- **Status:** LOCKED (Production Ready)

## Features
- Document CRUD
- Category CRUD with icon/color/sort_order
- 3 Document Types: Text (rich editor), Markdown (live preview), Uploaded File
- Full-text Search (title, summary, tags, content_html)
- Approval Workflow: Draft → Submit → Pending → Approved/Rejected
- Version History (auto-snapshot on every edit)
- Download/View Counters
- Print support
- Duplicate/Fork documents
- Document Templates (SOP, Work Instruction, Maintenance Report)
- Change Note (required for edits)
- Status Badges (color-coded)
- Pagination: 10/20/50/100 rows
- Sortable columns

## Approval Workflow

| Status | Allowed Actions |
|--------|----------------|
| Draft | Edit, Submit, Version History, Duplicate, Delete |
| Pending Approval | Approve, Reject (read-only for author) |
| Approved | View, Download, Print, Duplicate |
| Rejected | Re-edit (resets to Draft), View, Print, Duplicate |

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/documents` | List with pagination, search, filters |
| GET | `/api/documents/{id}` | Single document |
| POST | `/api/documents` | Create |
| PUT | `/api/documents/{id}` | Update (auto-version) |
| DELETE | `/api/documents/{id}` | Delete |
| POST | `/api/documents/{id}/submit` | Submit for approval |
| POST | `/api/documents/{id}/approve` | Approve |
| POST | `/api/documents/{id}/reject` | Reject |
| GET | `/api/documents/{id}/versions` | Version history |
| POST | `/api/documents/{id}/duplicate` | Duplicate |
| POST | `/api/documents/templates/{name}` | Create from template |

## Files

- `backend/models.py` — DocumentLibrary + DocumentVersion + DocumentCategory
- `backend/main.py`
- `frontend/app/modules/documentation/page.tsx`
- `frontend/components/rich-text-editor.tsx`

## Database

- **Tables:** `document_library`, `document_versions`, `document_categories`
