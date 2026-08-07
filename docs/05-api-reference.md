# API Reference

## API Overview

- Base URL (via proxy): `https://localhost:3443/api/`
- Direct backend: `http://127.0.0.1:800X/`
- Format: JSON
- Auth: Cookie `access_token` atau `Authorization: Bearer <token>`

---

## Health Check

| Method | Path | Rate Limit | Auth |
|--------|------|------------|------|
| GET | `/api/health` | - | No |

Returns: `{"status": "ok", "timestamp": "..."}`

---

## Auth Endpoints

| Method | Path | Rate Limit | Auth |
|--------|------|------------|------|
| POST | `/api/auth/login` | 10/min | No |
| POST | `/api/auth/logout` | - | Yes |
| GET | `/api/auth/me` | - | Yes |
| POST | `/api/auth/change-password` | - | Yes |
| POST | `/api/auth/forgot-password` | 3/min | No |
| POST | `/api/auth/reset-password` | 3/min | No |
| POST | `/api/auth/otp/send` | 3/min | Yes |
| POST | `/api/auth/otp/verify` | 5/min | Yes |

---

## Users & Settings

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/users` | Admin |
| POST | `/api/users` | Admin |
| GET | `/api/users/{id}` | Yes |
| PUT | `/api/users/{id}` | Admin |
| DELETE | `/api/users/{id}` | Admin |
| GET | `/api/roles` | Admin |
| GET | `/api/settings` | Admin |
| PUT | `/api/settings` | Admin |
| GET | `/api/settings/modules` | Yes |

---

## Assets

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/assets` | Yes (list, filter, search, pagination) |
| POST | `/api/assets` | Yes |
| GET | `/api/assets/{id}` | Yes |
| PUT | `/api/assets/{id}` | Yes |
| DELETE | `/api/assets/{id}` | Manager+ |
| GET | `/api/assets/export` | Yes |
| GET | `/api/assets/stats` | Yes |
| GET | `/api/assets/types` | Yes |
| GET | `/api/assets/lifecycle` | Yes |
| GET | `/api/assets/{id}/history` | Yes |

---

## Purchasing (Purchase Orders)

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/purchasing/pos` | Yes |
| POST | `/api/purchasing/pos` | Yes |
| GET | `/api/purchasing/pos/{id}` | Yes |
| PUT | `/api/purchasing/pos/{id}` | Yes |
| DELETE | `/api/purchasing/pos/{id}` | Manager+ |
| GET | `/api/purchasing/vendors` | Yes |
| POST | `/api/purchasing/vendors` | Yes |
| GET | `/api/purchasing/grns` | Yes |
| POST | `/api/purchasing/grns` | Yes |

---

## Risk Management

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/risk/risks` | Yes |
| POST | `/api/risk/risks` | Yes |
| GET | `/api/risk/risks/{id}` | Yes |
| PUT | `/api/risk/risks/{id}` | Yes |
| DELETE | `/api/risk/risks/{id}` | Manager+ |
| GET | `/api/risk/assessments` | Yes |
| POST | `/api/risk/assessments` | Yes |
| GET | `/api/risk/treatments` | Yes |
| GET | `/api/risk/kris` | Yes |
| POST | `/api/risk/kris` | Yes |
| GET | `/api/risk/dashboard` | Yes |

---

## Quality Management

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/quality/documents` | Yes |
| POST | `/api/quality/documents` | Yes |
| GET | `/api/quality/audits` | Yes |
| POST | `/api/quality/audits` | Yes |
| GET | `/api/quality/findings` | Yes |
| POST | `/api/quality/findings` | Yes |
| GET | `/api/quality/capa` | Yes |
| POST | `/api/quality/capa` | Yes |
| GET | `/api/quality/kpis` | Yes |

---

## Backup & DR

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/backup/jobs` | Yes |
| POST | `/api/backup/jobs` | Yes |
| POST | `/api/backup/jobs/{id}/run` | Yes |
| GET | `/api/backup/history` | Yes |
| GET | `/api/backup/verifications` | Yes |
| POST | `/api/backup/verifications` | Yes |
| GET | `/api/backup/dr-plans` | Yes |
| GET | `/api/backup/dashboard` | Yes |

---

## AI Assistant

| Method | Path | Auth |
|--------|------|------|
| POST | `/api/ai/chat` | Yes (streaming SSE) |
| GET | `/api/ai/sessions` | Yes |
| POST | `/api/ai/sessions` | Yes |
| GET | `/api/ai/history` | Yes |
| POST | `/api/ai/clear` | Yes |
| GET | `/api/ai/workflows` | Yes |
| POST | `/api/ai/workflows` | Yes |
| POST | `/api/ai/workflows/{id}/execute` | Yes |

---

## Network Monitoring

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/network/devices` | Yes |
| POST | `/api/network/devices` | Yes |
| GET | `/api/network/devices/{id}/interfaces` | Yes |
| GET | `/api/network/bandwidth` | Yes |
| GET | `/api/network/alerts` | Yes |

---

## Service Desk

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/service-desk/tickets` | Yes |
| POST | `/api/service-desk/tickets` | Yes |
| GET | `/api/service-desk/tickets/{id}` | Yes |
| PUT | `/api/service-desk/tickets/{id}` | Yes |

---

## Projects

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/projects` | Yes |
| POST | `/api/projects` | Yes |
| GET | `/api/projects/{id}/tasks` | Yes |
| POST | `/api/projects/{id}/tasks` | Yes |

---

## Finance

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/finance/budgets` | Yes |
| POST | `/api/finance/budgets` | Finance+ |
| GET | `/api/finance/expenses` | Yes |
| POST | `/api/finance/expenses` | Yes |
| GET | `/api/finance/cost-centers` | Yes |

---

## Reports & Dashboard

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/reports` | Yes |
| POST | `/api/reports/generate` | Yes |
| GET | `/api/reports/export/{format}` | Yes |
| GET | `/api/dashboard/stats` | Yes |
| GET | `/api/dashboard/recent-activity` | Yes |

---

## Audit Trail

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/audit/log` | Admin |
| GET | `/api/audit/log/{id}` | Admin |
| GET | `/api/audit/user/{user_id}` | Admin |
| GET | `/api/audit/export` | Admin |

---

## Notifications

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/notifications` | Yes |
| POST | `/api/notifications/mark-read` | Yes |
| GET | `/api/notifications/unread-count` | Yes |

---

## Maintenance

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/maintenance/schedules` | Yes |
| POST | `/api/maintenance/schedules` | Yes |
| GET | `/api/maintenance/history` | Yes |

---

## Contracts

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/contracts` | Yes |
| POST | `/api/contracts` | Yes |
| GET | `/api/contracts/renewals` | Yes |

---

## Compliance

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/compliance/regulations` | Yes |
| POST | `/api/compliance/regulations` | Admin |
| GET | `/api/compliance/assessments` | Yes |

---

## Export / Utility Endpoints

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/assets/export/{format}` | Yes |
| GET | `/api/reports/export/{id}/{format}` | Yes |
| GET | `/api/audit/export/{format}` | Admin |

---

## SSH Report, IRMC, Capacity, Backup Check

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/ssh-report/export` | Yes | Export SSH login per-server per-date (PDF), max 365 hari |
| GET | `/api/ssh-report/reports/daily` | Yes | Daily SSH login summary, max 365 hari |
| GET | `/api/ssh-report/servers` | Yes | Server list with login stats, max 365 hari |
| GET | `/api/ssh-report/export-data` | Yes | Raw SSH login records export, max 365 hari |
| GET | `/api/irmc-reports/daily` | Yes | Daily IRMC check report, max 365 hari |
| GET | `/api/capacity-reports/daily` | Yes | Daily capacity report (latest per server), max 365 hari |
| GET | `/api/capacity-reports/export` | Yes | Export capacity per-date (PDF), max 365 hari |
| GET | `/api/capacity-planning/servers` | Yes | Server list with latest metrics, max 365 hari |
| GET | `/api/backup-check/export` | Yes | Export backup records per-date (PDF), max 365 hari |
| GET | `/api/backup-check/servers` | Yes | Server list with backup status, max 365 hari |

Note: Semua endpoint dengan parameter `from_date`/`to_date` memiliki batas maksimal 365 hari. Backend mengembalikan 400 jika rentang melebihi 365 hari.

---

## Response Format

### Success (single)

```json
{
  "id": 1,
  "name": "...",
  "created_at": "...",
  "updated_at": "..."
}
```

### Success (paginated list)

```json
{
  "items": [...],
  "total": 100,
  "page": 1,
  "per_page": 20,
  "pages": 5
}
```

### Success (stats/dashboard)

```json
{
  "total": 100,
  "active": 80,
  "by_category": {...},
  "trend": {...}
}
```

### Error

```json
{
  "detail": "Error message",
  "code": "ERROR_CODE"
}
```
