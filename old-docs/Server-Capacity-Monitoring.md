# Server Capacity Monitoring (SAR)

## Overview

| Attribute | Value |
|-----------|-------|
| **Path** | `/modules/monthly-server-check` |
| **Purpose** | Monitor server capacity using SAR (System Activity Report) logs |
| **Status** | LOCKED (Production Ready) |
| **Compliance** | ISO 27001:2022 |

## Features

- **Resource Monitoring**: CPU, RAM, Disk, and Network bandwidth tracking
- **Capacity Projection**: Linear regression-based forecasting for 1m, 3m, 6m, and 12m horizons
- **Visualization**: Line charts, Bar charts, and Pie charts
- **Export Options**: CSV and PDF report generation
- **Smart Sudo Mode**: Automatic privilege escalation for non-root SSH users
- **SSH Authentication**: Key-based (ED25519) and Password-based (session-only)
- **Parallel Bulk Scan**: Concurrent scanning of 100+ servers
- **Server Detail Modal**: Three-tab interface (Table, Charts, Projection)
- **Auto-Status Classification**: OK / Warning / Critical based on configurable thresholds

## Key Metrics

| Metric | Description | Data Source |
|--------|-------------|-------------|
| CPU Usage | Peak and average utilization | `sar -u` |
| RAM Usage | Peak and average memory consumption | `sar -r` |
| Disk Usage | All partitions (dynamic detection) | `df -h` |
| Network Bandwidth | Receive (RX) and Transmit (TX) throughput | `sar -n DEV` |
| Active Connections | Current network connection count | `ss` / `netstat` |

## Thresholds

| Metric | OK | Warning | Critical |
|--------|-----|---------|----------|
| CPU Peak | <= 80% | 80-90% | > 90% |
| RAM Peak | <= 80% | 80-90% | > 90% |
| Disk Usage | <= 80% | 80-90% | > 90% |

### Status Logic

```
IF peak_value <= 80%  → Status: OK (Green)
IF 80% < peak_value <= 90% → Status: Warning (Yellow)
IF peak_value > 90% → Status: Critical (Red)
```

## SSH Authentication

### Security Model

| Principle | Implementation |
|-----------|----------------|
| Zero-Trust | Credentials held in RAM only; never persisted to disk |
| Key Authentication | ED25519 keys recommended; loaded per-session |
| Password Authentication | Session-only; cleared from memory after use |
| Smart Sudo Mode | Automatic `sudo` escalation for non-root users with configured password |

### Authentication Flow

1. User provides SSH credentials (key or password)
2. Credentials stored in volatile memory only
3. Connection established to target server
4. If non-root user, Smart Sudo Mode attempts `sudo` with provided password
5. SAR commands executed with elevated privileges
6. Credentials cleared from memory on session close

## API Endpoints

### Server Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/capacity/servers` | List all monitored servers |
| `POST` | `/api/capacity/scan` | Scan a single server |
| `POST` | `/api/capacity/scan-all` | Parallel bulk scan (100+ servers) |
| `GET` | `/api/capacity/progress/{id}` | Get scan progress by session ID |

### Data & Export

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/capacity/{hostname}/history` | Get historical metrics for a server |
| `GET` | `/api/capacity/{hostname}/export/csv` | Export server metrics as CSV |
| `GET` | `/api/capacity/{hostname}/export/pdf` | Export server metrics as PDF |
| `GET` | `/api/capacity/{hostname}/projection` | Get capacity projection data |

### Request/Response Examples

#### Scan Single Server

```json
POST /api/capacity/scan
{
  "hostname": "prod-web-01",
  "ip_address": "192.168.1.10",
  "auth_type": "key",
  "ssh_key": "<base64-encoded-key>",
  "username": "admin",
  "sudo_password": "<optional>"
}
```

#### Bulk Scan

```json
POST /api/capacity/scan-all
{
  "servers": [
    { "hostname": "prod-web-01", "ip_address": "192.168.1.10", ... },
    { "hostname": "prod-db-01", "ip_address": "192.168.1.20", ... }
  ],
  "concurrency": 10
}
```

## File Structure

### Backend

| File | Purpose |
|------|---------|
| `backend/api/capacity_planning.py` | API route handlers for capacity endpoints |
| `backend/utils/ssh_handler.py` | SSH connection management, authentication, and SAR command execution |
| `backend/utils/capacity_projection.py` | Linear regression engine for capacity forecasting |
| `backend/utils/progress_tracker.py` | Real-time progress tracking for bulk scan operations |

### Frontend

| File | Purpose |
|------|---------|
| `frontend/app/modules/monthly-server-check/page.tsx` | Main dashboard page with server list and bulk scan controls |
| `frontend/app/modules/monthly-server-check/components/server-detail-modal.tsx` | Modal component with Table, Charts, and Projection tabs |

## Database

### Table: `capacity_metrics`

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER (PK) | Auto-incrementing primary key |
| `hostname` | TEXT | Server hostname |
| `ip_address` | TEXT | Server IP address |
| `date` | TEXT | Scan date (ISO 8601 format) |
| `cpu_avg` | REAL | Average CPU utilization (%) |
| `cpu_peak` | REAL | Peak CPU utilization (%) |
| `ram_avg` | REAL | Average RAM utilization (%) |
| `ram_peak` | REAL | Peak RAM utilization (%) |
| `disk_root_pct` | REAL | Root partition usage (%) |
| `disk_data_pct` | REAL | Data partition usage (%) |
| `disk_data_label` | TEXT | Data partition mount point label |
| `network_rx` | REAL | Network receive throughput (Mbps) |
| `network_tx` | REAL | Network transmit throughput (Mbps) |
| `status` | TEXT | Auto-calculated status: `OK`, `Warning`, `Critical` |
| `created_at` | TEXT | Record creation timestamp |
| `updated_at` | TEXT | Record last update timestamp |

### Schema Definition

```sql
CREATE TABLE IF NOT EXISTS capacity_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hostname TEXT NOT NULL,
    ip_address TEXT NOT NULL,
    date TEXT NOT NULL,
    cpu_avg REAL DEFAULT 0,
    cpu_peak REAL DEFAULT 0,
    ram_avg REAL DEFAULT 0,
    ram_peak REAL DEFAULT 0,
    disk_root_pct REAL DEFAULT 0,
    disk_data_pct REAL DEFAULT 0,
    disk_data_label TEXT DEFAULT '',
    network_rx REAL DEFAULT 0,
    network_tx REAL DEFAULT 0,
    status TEXT DEFAULT 'OK',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);
```

## SAR Commands

The module executes the following SAR commands on target servers:

| Command | Output | Parsed Metrics |
|---------|--------|----------------|
| `sar -u` | CPU utilization | `%user`, `%system`, `%iowait`, `%idle` |
| `sar -r` | Memory utilization | `kbmemfree`, `kbmemused`, `%memused` |
| `sar -n DEV` | Network statistics | `rxkB/s`, `txkB/s` per interface |
| `df -h` | Disk filesystem usage | Partition size, used, available, use% |
| `ss -s` | Socket statistics | Total connections, established, time-wait |

## Capacity Projection

### Algorithm

Linear regression is applied to historical metric data to forecast future utilization:

```
y = mx + b

Where:
  y = predicted utilization
  m = slope (rate of change per day)
  x = days from now
  b = current utilization baseline
```

### Projection Horizons

| Horizon | Days | Use Case |
|---------|------|----------|
| 1 Month | 30 | Short-term capacity planning |
| 3 Months | 90 | Quarterly review and budgeting |
| 6 Months | 180 | Mid-term infrastructure planning |
| 12 Months | 360 | Annual capacity budget and procurement |

### Projection Output

```json
{
  "hostname": "prod-web-01",
  "metric": "cpu_peak",
  "current": 72.5,
  "projections": {
    "1m": { "value": 78.3, "status": "OK" },
    "3m": { "value": 85.1, "status": "Warning" },
    "6m": { "value": 94.7, "status": "Critical" },
    "12m": { "value": 112.0, "status": "Critical" }
  },
  "trend": "increasing",
  "slope_per_day": 0.065
}
```

## Frontend Components

### Server Detail Modal

The modal provides three tabs for comprehensive server analysis:

| Tab | Content |
|-----|---------|
| **Table** | Raw metric data in tabular format with sortable columns |
| **Charts** | Visual representation using Line, Bar, and Pie charts |
| **Projection** | Capacity forecast with trend indicators and status alerts |

### Dashboard Features

- Server inventory table with real-time status indicators
- Bulk scan initiation with progress bar
- Filter and search by hostname, IP, or status
- Quick-access export buttons (CSV/PDF)
- Threshold configuration panel

## Security Considerations

| Aspect | Implementation |
|--------|----------------|
| Credential Storage | RAM-only; zero disk persistence |
| Key Format | ED25519 (preferred) or RSA 4096-bit minimum |
| Session Management | Connections closed and credentials wiped after scan |
| Sudo Password | Passed via stdin; never logged or stored |
| Audit Trail | All scan operations logged with timestamp and user |
| Compliance | ISO 27001:2022 A.8.23 (Web Filtering), A.8.20 (Network Security) |

## Troubleshooting

| Issue | Cause | Resolution |
|-------|-------|------------|
| SSH Connection Refused | Wrong port or firewall | Verify port 22 is open and SSH daemon is running |
| Permission Denied | Non-root user without sudo | Enable Smart Sudo Mode and provide sudo password |
| SAR Not Found | `sysstat` package not installed | Run `apt install sysstat` or `yum install sysstat` on target |
| Scan Timeout | Server unreachable or slow response | Increase timeout in SSH handler configuration |
| Projection Inaccurate | Insufficient historical data | Requires minimum 7 days of scan data for reliable projections |
