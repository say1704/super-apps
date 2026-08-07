# Activity Logs Module

## Overview

- **Path:** `/modules/activity`
- **Purpose:** System-wide activity tracking and audit trail
- **Status:** LOCKED (Production Ready)

## Features

- Pagination: 10/20/50/100 rows per page
- Sortable column: Timestamp
- System-wide activity tracking
- User action logging
- Filters by action type, module, user, date range
- Username display with role badges
- Action icons for visual identification
- Data ownership filtering (users see only their own, admins see all)

## Activity Types

- `CREATE`, `UPDATE`, `DELETE`, `VIEW`, `EXPORT`
- `LOGIN`, `LOGOUT`
- `VIEW_PASSWORD`, `VIEW_PASSWORD_FAILED`
- `ASSIGN`

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/activity-logs` | List with pagination and filters |
| GET | `/api/activity-logs/me` | Current user's activity only |

## Files

- `frontend/app/modules/activity/page.tsx`
- `frontend/app/modules/activity/components/activity-table.tsx`
- `frontend/app/modules/activity/components/activity-filters.tsx`
- `backend/utils/activity_logger.py`
- `backend/main.py`

## Database

- **Table:** `activity_logs`
- **Key fields:** `user_id`, `action`, `module`, `description`, `details` (JSON), `ip_address`, `asset_id`, `asset_code`, `created_at`

## Activity Logger Utility

Centralized logging via `utils/activity_logger.py`.

- Supports both `User` object and `user_id` int
- Helper functions: `log_create`, `log_update`, `log_delete`, `log_view`, `log_export`, `log_login`, `log_logout`
- Used across 54+ CRUD endpoints
