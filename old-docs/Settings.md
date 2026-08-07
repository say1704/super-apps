# Settings Module

## Overview

- **Path:** `/modules/settings`
- **Purpose:** System configuration and administration
- **Status:** COMPLETE & LOCKED

## 9 Tabs

| Tab | Features |
|-----|----------|
| Users | CRUD, role assignment, active/inactive toggle |
| Roles | CRUD, module access mapping, user count |
| Module Access | Per-user module enable/disable matrix |
| SMTP | Email config, test email endpoint |
| General | App name, timezone, date format, language, session timeout |
| Security | Password policy, login attempts, lockout, 2FA toggle |
| Notification | Email alerts per event type, recipient list |
| API | API keys, webhook config |
| Backup | Create/restore/delete database backups |
| Admin UI | sqlite-web password management, restart, status |

## Admin UI Tab (New)

- Manage sqlite-web (port 8002) password
- **Save & Restart** button changes password and restarts sqlite-web
- **Restart Only** button restarts without changing password
- Status indicator (running/stopped)
- Password stored in `AppSettings` table

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/settings/users` | List all users |
| POST | `/api/settings/users` | Create user |
| PUT | `/api/settings/users/{id}` | Update user |
| DELETE | `/api/settings/users/{id}` | Delete user |
| GET | `/api/settings/roles` | List all roles |
| POST | `/api/settings/roles` | Create role |
| PUT | `/api/settings/roles/{id}` | Update role |
| DELETE | `/api/settings/roles/{id}` | Delete role |
| GET | `/api/settings/smtp` | Get SMTP configuration |
| PUT | `/api/settings/smtp` | Update SMTP configuration |
| POST | `/api/settings/smtp/test` | Send test email |
| GET | `/api/settings/{category}` | Get settings (general, security, notification, api) |
| PUT | `/api/settings/{category}` | Update settings (general, security, notification, api) |
| GET | `/api/settings/admin-ui` | Get admin UI status |
| POST | `/api/settings/admin-ui` | Update admin UI password |
| POST | `/api/settings/admin-ui/restart` | Restart sqlite-web service |
| POST | `/api/settings/backup/create` | Create database backup |
| GET | `/api/settings/backup/list` | List available backups |
| DELETE | `/api/settings/backup/{id}` | Delete backup |

## Files

- `frontend/app/modules/settings/page.tsx`
- `backend/main.py` (settings endpoints)

## Database Tables

- `users`
- `roles`
- `user_module_access`
- `app_settings`
- `smtp_settings`
- `backup_schedule`
