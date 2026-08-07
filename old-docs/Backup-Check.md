# Backup Check

## Overview

Monitor backup status from QNAP NAS devices via SSH. Connects to configured servers, parses backup log files, and presents results in a sortable, filterable table with server history tracking.

| Property | Value |
|---|---|
| **Route** | `/modules/backup-check` |
| **File** | `frontend/app/modules/backup-check/page.tsx` |
| **Status** | LOCKED (Production Ready) |
| **Auth Required** | Yes |
| **Credential Storage** | None (in-memory only, deleted after session) |

---

## Security Design

### Zero-Trust Authentication

- Manual credential input required per session
- No credential storage — credentials exist in memory only
- Credentials are deleted immediately after use
- All communication encrypted via HTTPS

---

## Features

### SSH Connection

Establishes SSH connections to QNAP NAS devices using user-provided credentials. Connections are transient and credentials are never persisted.

### Backup Log Parsing

Parses backup log files from QNAP NAS servers to extract status, timestamps, and relevant metadata.

### Database Storage

Parsed results are saved to the `BackupHistory` table for historical tracking and trend analysis.

### Auto-Detect New Servers

Automatically discovers and registers new servers encountered during backup checks.

### Status Labels

Clear human-readable date labels:
- **Today** — backup completed within the current day
- **Yesterday** — backup completed the previous day
- **X days ago** — backup completed N days prior

### Rotating Group Sort

Click the status column header to rotate sort priority through three modes:
1. **OK** first (healthy servers on top)
2. **Warning** first (attention-needed servers on top)
3. **Critical** first (failing servers on top)

### Pagination

Configurable rows per page: 10, 20, 50, or 100.

### Search & Filter

Filter results by:
- IP address
- Status (OK / Warning / Critical)
- Date range

### Server History Modal

Displays a 30-day trend view for any server with aggregate statistics including success rate, failure count, and last successful backup date.

### Progress Tracking

Real-time progress bar displayed during backup check operations, updated via operation ID polling.

### Performance Optimization

- GREP-based log parsing for speed
- Parallel processing across multiple servers
- Duplicate entry skipping to avoid redundant database writes

---

## API Endpoints

### POST `/api/backup-check/test-connection`

Tests SSH connectivity to a QNAP NAS server using provided credentials.

**Request Body:**

```json
{
  "host": "192.168.1.100",
  "port": 22,
  "username": "admin",
  "password": "..."
}
```

**Response:**

```json
{
  "success": true,
  "message": "Connection successful"
}
```

### POST `/api/backup-check/run-manual`

Initiates a manual backup check operation across configured servers.

**Request Body:**

```json
{
  "servers": [
    { "host": "192.168.1.100", "port": 22, "username": "admin", "password": "..." }
  ]
}
```

**Response:**

```json
{
  "operation_id": "uuid-here",
  "message": "Backup check started"
}
```

### GET `/api/backup-check/servers`

Returns the list of configured backup servers with their latest check results.

**Response:**

```json
{
  "servers": [
    {
      "name": "NAS-01",
      "ip": "192.168.1.100",
      "last_status": "OK",
      "last_check": "2026-05-04T10:30:00Z"
    }
  ]
}
```

### GET `/api/backup-check/progress/{operation_id}`

Returns real-time progress for a running backup check operation.

**Response:**

```json
{
  "operation_id": "uuid-here",
  "total": 10,
  "completed": 5,
  "status": "running"
}
```

### GET `/api/backup-check/server/{server_name}/history`

Returns 30-day backup history for a specific server.

**Response:**

```json
{
  "server_name": "NAS-01",
  "history": [
    { "date": "2026-05-04", "status": "OK", "details": "..." },
    { "date": "2026-05-03", "status": "OK", "details": "..." }
  ],
  "statistics": {
    "total_checks": 30,
    "successful": 28,
    "failed": 2,
    "success_rate": 93.3
  }
}
```

---

## Files

| File | Purpose |
|---|---|
| `frontend/app/modules/backup-check/page.tsx` | Main page component |
| `frontend/app/modules/backup-check/components/` | UI components (4 files) |
| `backend/api/backup_check_simple.py` | API route handlers |
| `backend/utils/ssh_handler.py` | SSH connection management |
| `backend/utils/backup_parser.py` | QNAP backup log parsing |
| `backend/models.py` | Data models (`BackupHistory` table) |

---

## Data Flow

```
┌─────────────────────────────────────────────────────────┐
│                    Backup Check Module                   │
│                                                          │
│  ┌──────────────────┐                                   │
│  │ User Input        │                                   │
│  │ Credentials       │                                   │
│  └────────┬─────────┘                                   │
│           │                                             │
│           ▼                                             │
│  ┌──────────────────┐                                   │
│  │ Backend API       │                                   │
│  │ (in-memory only)  │                                   │
│  └────────┬─────────┘                                   │
│           │                                             │
│           ▼                                             │
│  ┌──────────────────┐                                   │
│  │ SSH Connect       │                                   │
│  │ to QNAP NAS       │                                   │
│  └────────┬─────────┘                                   │
│           │                                             │
│           ▼                                             │
│  ┌──────────────────┐                                   │
│  │ Parse Log Files   │                                   │
│  │ (GREP, parallel)  │                                   │
│  └────────┬─────────┘                                   │
│           │                                             │
│           ▼                                             │
│  ┌──────────────────┐                                   │
│  │ Return Results    │                                   │
│  │ Save to DB        │                                   │
│  └────────┬─────────┘                                   │
│           │                                             │
│           ▼                                             │
│  ┌──────────────────┐                                   │
│  │ Credentials       │                                   │
│  │ DELETED           │                                   │
│  └──────────────────┘                                   │
│                                                          │
└─────────────────────────────────────────────────────────┘
```
