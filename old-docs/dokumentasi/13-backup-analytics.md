# Module 13: Backup Analytics & Check

## 1. Function
Comprehensive backup monitoring and analytics system tracking daily backup status per server, with storage projections, anomaly detection, ML-based predictions, capacity planning, alerts, and scheduled reports.

## 2. Business Logic

### 2.1 Backup History
- Records daily backup per server: file count, total size (bytes/KB/MB/GB), status (OK/Warning/Critical)
- Size auto-formatted to human-readable units

### 2.2 Analytics & Projections
- **Daily Growth**: Uses median daily growth (or average for < 3 data points) to reduce noise
- **Storage Projection**: Linear projection for N months with floor check (no negative)
- **Per-Server Projection**: Individual server growth projections
- **Per-Server Comparison**: Top servers by growth percentage (6-month horizon)
- **Capacity Metrics**: Current usage vs total capacity, threshold warnings (80%/90%/100%)
- **Timeline**: Historical daily aggregates + projected future points for charts

### 2.3 Reports
- **Daily Report**: All servers with backup on target date, with totals
- **Last Month Report**: Aggregated by server for previous month
- **Daily Trend**: Files per day, size per day over N days
- **Monthly Aggregation**: Year/month grouping for long-term planning
- **Top Servers**: Ranked by storage usage and file count
- **Status Distribution**: OK/Warning/Critical breakdown over time
- **Summary**: Period stats, status breakdown, volume change rate

### 2.4 Alerts
- **Missing Backups**: Servers with no backup in N days
- **Top Offenders**: Highest growth % servers (filters out < 1GB and low absolute growth)
- **Status Distribution**: Current status across all servers

### 2.5 Server Detail
- Full history for a server with statistics (avg, max, success rate)
- Daily growth calculation per server

### 2.6 Scheduled Reports
- Configure frequency (daily/weekly/monthly), recipients, time, chart/table inclusion
- Email validation on save

### 2.7 Analytics KPI Strip
- Total volume, avg daily growth %, success rate, active servers, alert count
- Uses CTE for latest backup per server (no double-count)

### 2.8 Snapshot Comparison
- Today vs yesterday snapshot per server
- Fallback to previous day if today empty
- Growth calculation between snapshots

## 3. API Endpoints

| Method | Endpoint | Response Model | Auth | Description |
|--------|----------|---------------|------|-------------|
| GET | `/backup-analytics/per-server-projection` | `dict` | - | 6-month per-server projection |
| GET | `/backup-analytics/daily-report` | `dict` | - | Daily report (today/yesterday) |
| GET | `/backup-analytics/last-month-report` | `dict` | - | Previous month aggregation |
| GET | `/backup-analytics/projection` | `dict` | - | Storage projection with growth rate |
| GET | `/backup-analytics/summary` | `dict` | - | Summary stats, volume change rate |
| GET | `/backup-analytics/servers` | `dict` | - | All servers with latest backup |
| GET | `/backup-analytics/server/{server_name}` | `dict` | - | Server history and statistics |
| GET | `/backup-analytics/daily-trend` | `dict` | - | Daily backup trend |
| GET | `/backup-analytics/monthly-aggregation` | `dict` | - | Monthly aggregation |
| GET | `/backup-analytics/top-servers` | `dict` | - | Top servers by storage/files |
| GET | `/backup-analytics/status-distribution` | `dict` | - | Status distribution over time |
| GET | `/backup-analytics/timeline` | `dict` | - | Historical + projected timeline |
| GET | `/backup-analytics/per-server-comparison` | `dict` | - | Current vs 6-month comparison |
| GET | `/backup-analytics/capacity-metrics` | `dict` | - | Capacity planning with thresholds |
| GET | `/backup-analytics/alerts` | `dict` | - | Missing backups, top offenders |
| GET | `/backup-analytics/server/{server_ip}/detail` | `dict` | - | Server drill-down detail |
| POST | `/backup-analytics/schedule` | `dict` | - | Save scheduled report config |
| GET | `/backup-analytics/analytics/summary` | `dict` | - | KPI strip (volume, growth, success) |
| GET | `/backup-analytics/analytics/snapshots` | `dict` | - | Today vs yesterday comparison |

## 4. Database Schema

### `backup_history`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | Integer (PK) | No | - | Auto-increment |
| `server_name` | String | No | - | Server IP/name |
| `backup_date` | Date | No | - | Date of backup |
| `jumlah_files` | Integer | Yes | 0 | Number of files |
| `total_size_bytes` | Integer | Yes | 0 | Size in bytes |
| `total_size_kb` | Float | Yes | 0 | Size in KB |
| `total_size_mb` | Float | Yes | 0 | Size in MB |
| `total_size_gb` | Float | Yes | 0 | Size in GB |
| `status` | String | Yes | "OK" | OK, Warning, Critical |
| `filename` | String | Yes | - | Original log filename |
| `created_at` | DateTime | Yes | utcnow | Record creation timestamp |
| `created_by` | Integer (FK→users.id) | Yes | - | User who ran the check |

**Indexes**: `server_name`, `backup_date`, composite `(server_name, backup_date)`, `created_at`

### PostgreSQL Migration

```sql
CREATE TABLE backup_history (
  id SERIAL PRIMARY KEY,
  server_name VARCHAR(255) NOT NULL,
  backup_date DATE NOT NULL,
  jumlah_files INTEGER DEFAULT 0,
  total_size_bytes INTEGER DEFAULT 0,
  total_size_kb FLOAT DEFAULT 0,
  total_size_mb FLOAT DEFAULT 0,
  total_size_gb FLOAT DEFAULT 0,
  status VARCHAR(20) DEFAULT 'OK',
  filename VARCHAR(500),
  created_at TIMESTAMP DEFAULT NOW(),
  created_by INTEGER REFERENCES users(id)
);

CREATE INDEX idx_backup_server ON backup_history(server_name);
CREATE INDEX idx_backup_date ON backup_history(backup_date);
CREATE INDEX idx_backup_server_date ON backup_history(server_name, backup_date);
CREATE INDEX idx_backup_created_at ON backup_history(created_at);
```
