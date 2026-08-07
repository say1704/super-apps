# Log Deletion Module

## Overview

- **Path:** `/modules/log-maintenance`
- **Purpose:** Track and document log deletion activities across servers
- **Status:** LOCKED (Production Ready)

## Features

- Pagination: 10 / 20 / 50 / 100 rows per page
- Sortable columns: Server, Path, Execution Date, Size
- Sort indicators: DESC / ASC
- Search & Filters
- Export CSV
- Report by server
- Add new log deletion record
- Edit existing records
- Delete records with confirmation

## Sortable Columns

| Column         | Field            | Sortable |
|----------------|------------------|----------|
| Server         | `server`         | Yes      |
| Path           | `path`           | Yes      |
| Execution Date | `execution_date` | Yes      |
| Size           | `size`           | Yes      |
| Notes          | `notes`          | No       |

## API Endpoints

| Method   | Endpoint                        | Description                          |
|----------|---------------------------------|--------------------------------------|
| `GET`    | `/api/log-maintenance`          | List with pagination, search, filters|
| `POST`   | `/api/log-maintenance`          | Create new record                    |
| `PUT`    | `/api/log-maintenance/{id}`     | Update record                        |
| `DELETE` | `/api/log-maintenance/{id}`     | Delete record                        |
| `GET`    | `/api/log-maintenance/export`   | Export CSV                           |

## Files

```
frontend/app/modules/log-maintenance/page.tsx
frontend/app/modules/log-maintenance/components/
backend/main.py (log-maintenance endpoints)
```

## Database

- **Table:** `log_maintenance`
- **Key fields:**
  - `server`
  - `path`
  - `execution_date`
  - `size`
  - `notes`
  - `created_at`
