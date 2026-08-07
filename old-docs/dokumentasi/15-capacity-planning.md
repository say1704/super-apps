# Module 15: Capacity Planning (SAR)

## 1. Function
SAR (System Activity Report) based server capacity monitoring with SSH-based log fetching, CPU/RAM/Disk/Network metrics parsing, capacity projections using linear regression, and dynamic disk partition tracking.

## 2. Business Logic

### 2.1 SAR Log Fetching
- **SSH Connection**: Connects to servers via SSH to fetch SAR log files from `/var/log/sa/`
- **Authentication**: Supports root or sudo mode (experimental, controlled by `ENABLE_SUDO_MODE` env var)
- **Auto-Detect Mode**: Determines scan scope based on last import time:
  - 30+ days since import → monthly (365 days)
  - Monday + 7+ days → weekly (30 days)
  - 1+ day since import → daily (7 days)
  - Already imported today → quick check (3 days)
- **Progress Tracking**: Async operation with polling via `/progress/{operation_id}`
- **Batch Scan**: Parallel scanning of multiple servers via thread pool

### 2.2 SAR Log Parsing
- **CPU**: user%, system%, iowait%, idle%, peak (100 - idle)
- **RAM**: kbmemfree, kbcommit, memused% (auto-normalized if raw KB > 100)
- **Disk**: Parses `df -h` output, maps `/` as root, dynamically maps secondary disk (`/Backup`, `/data`, `/usr/local/syb`, or first physical partition)
- **All Partitions**: Stores every disk partition in separate `disk_partitions` table
- **Status Calculation**: Thresholds at 80% (warning) and 90% (critical) for CPU, RAM, Disk

### 2.3 Capacity Projections
- **Linear Regression**: Predicts when metrics will reach critical thresholds
- **Metrics**: Disk partitions, CPU peak, RAM peak
- **Urgency Levels**: ok, warning, critical based on days until threshold
- **Projection Data**: Historical data range, trend direction, slope, R-squared

### 2.4 Server Dashboard
- Latest metrics per server with status breakdown (OK/Warning/Critical)
- Server detail with N-day history and averages
- Partition-level history and summary statistics

### 2.5 Disk Partitions
- Dynamic tracking of all disk partitions per server per date
- Unique constraint on `(tanggal, hostname, mount_point)`
- History per partition for trend analysis

## 3. API Endpoints

| Method | Endpoint | Response Model | Auth | Description |
|--------|----------|---------------|------|-------------|
| POST | `/capacity-planning/fetch` | `dict` | JWT | Start SAR scan (async, returns operation_id) |
| GET | `/capacity-planning/progress/{operation_id}` | `dict` | - | Get scan progress |
| POST | `/capacity-planning/scan-all` | `dict` | JWT | Batch scan multiple servers (parallel) |
| GET | `/capacity-planning/scan-mode` | `dict` | - | Get auto-detected scan mode |
| GET | `/capacity-planning/servers` | `dict` | - | List servers with latest metrics |
| GET | `/capacity-planning/servers/{hostname}` | `dict` | - | Server detail with history |
| GET | `/capacity-planning/servers/{hostname}/history` | `dict` | - | Paginated daily history |
| GET | `/capacity-planning/servers/{hostname}/partitions` | `dict` | - | All partitions for server |
| GET | `/capacity-planning/servers/{hostname}/partitions/{mount_point}/history` | `dict` | - | Partition usage history |
| GET | `/capacity-planning/servers/{hostname}/partitions/summary` | `dict` | - | Partition statistics |
| GET | `/capacity-planning/servers/{hostname}/projection` | `dict` | - | Capacity projection (linear regression) |
| GET | `/capacity-planning/dashboard/stats` | `dict` | - | Dashboard summary stats |
| DELETE | `/capacity-planning/servers/{hostname}` | `dict` | JWT | Delete all data for server |

## 4. Database Schema

### `capacity_metrics`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | Integer (PK) | No | - | Auto-increment |
| `tanggal` | Date | No | - | Date of metrics |
| `hostname` | String | No | - | Server hostname |
| `ip_address` | String | Yes | - | Server IP |
| `source` | String | Yes | "sar_ssh" | Data source |
| `cpu_user_avg` | Float | Yes | 0 | Avg CPU user % |
| `cpu_system_avg` | Float | Yes | 0 | Avg CPU system % |
| `cpu_iowait_avg` | Float | Yes | 0 | Avg CPU iowait % |
| `cpu_idle_avg` | Float | Yes | 0 | Avg CPU idle % |
| `cpu_peak` | Float | Yes | 0 | Peak CPU % |
| `ram_avg` | Float | Yes | 0 | Avg RAM usage % |
| `ram_peak` | Float | Yes | 0 | Peak RAM usage % |
| `kbmemfree_avg` | Float | Yes | 0 | Avg free memory (KB) |
| `kbcommit_avg` | Float | Yes | 0 | Avg committed memory (KB) |
| `disk_root_pct` | Integer | Yes | 0 | Root partition usage % |
| `disk_data_pct` | Integer | Yes | 0 | Secondary partition usage % |
| `disk_data_label` | String | Yes | "/Backup" | Secondary partition label |
| `net_rx_peak` | Float | Yes | 0 | Peak network RX (Mbps) |
| `net_tx_peak` | Float | Yes | 0 | Peak network TX (Mbps) |
| `net_conn` | Integer | Yes | 0 | Network connections |
| `status` | String | Yes | "ok" | ok, warning, critical |
| `alert_reason` | Text | Yes | - | Alert description |
| `parsed_at` | DateTime | Yes | utcnow | Parse timestamp |
| `log_file` | String | Yes | - | Source log filename |
| `created_by` | String | Yes | - | Username who triggered scan |

**Unique Constraint**: `(tanggal, hostname)`

### `disk_partitions`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | Integer (PK) | No | - | Auto-increment |
| `hostname` | String | No | - | Server hostname |
| `tanggal` | Date | No | - | Date |
| `mount_point` | String | No | - | Mount point (e.g., `/`, `/Backup`) |
| `filesystem` | String | Yes | - | Filesystem (e.g., `/dev/sda1`) |
| `size` | String | Yes | - | Total size |
| `used` | String | Yes | - | Used space |
| `avail` | String | Yes | - | Available space |
| `use_pct` | Integer | Yes | - | Usage percentage |
| `source` | String | Yes | "sar_ssh" | Data source |
| `created_at` | DateTime | Yes | utcnow | Creation timestamp |

**Unique Constraint**: `(tanggal, hostname, mount_point)`

### PostgreSQL Migration

```sql
CREATE TABLE capacity_metrics (
  id SERIAL PRIMARY KEY,
  tanggal DATE NOT NULL,
  hostname VARCHAR(255) NOT NULL,
  ip_address VARCHAR(50),
  source VARCHAR(20) DEFAULT 'sar_ssh',
  cpu_user_avg FLOAT DEFAULT 0,
  cpu_system_avg FLOAT DEFAULT 0,
  cpu_iowait_avg FLOAT DEFAULT 0,
  cpu_idle_avg FLOAT DEFAULT 0,
  cpu_peak FLOAT DEFAULT 0,
  ram_avg FLOAT DEFAULT 0,
  ram_peak FLOAT DEFAULT 0,
  kbmemfree_avg FLOAT DEFAULT 0,
  kbcommit_avg FLOAT DEFAULT 0,
  disk_root_pct INTEGER DEFAULT 0,
  disk_data_pct INTEGER DEFAULT 0,
  disk_data_label VARCHAR(100) DEFAULT '/Backup',
  net_rx_peak FLOAT DEFAULT 0,
  net_tx_peak FLOAT DEFAULT 0,
  net_conn INTEGER DEFAULT 0,
  status VARCHAR(20) DEFAULT 'ok',
  alert_reason TEXT,
  parsed_at TIMESTAMP DEFAULT NOW(),
  log_file VARCHAR(500),
  created_by VARCHAR(100),
  UNIQUE (tanggal, hostname)
);

CREATE INDEX idx_capacity_hostname ON capacity_metrics(hostname);
CREATE INDEX idx_capacity_tanggal ON capacity_metrics(tanggal);
CREATE INDEX idx_capacity_status ON capacity_metrics(status);

CREATE TABLE disk_partitions (
  id SERIAL PRIMARY KEY,
  hostname VARCHAR(255) NOT NULL,
  tanggal DATE NOT NULL,
  mount_point VARCHAR(255) NOT NULL,
  filesystem VARCHAR(255),
  size VARCHAR(50),
  used VARCHAR(50),
  avail VARCHAR(50),
  use_pct INTEGER,
  source VARCHAR(20) DEFAULT 'sar_ssh',
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (tanggal, hostname, mount_point)
);

CREATE INDEX idx_disk_hostname ON disk_partitions(hostname);
CREATE INDEX idx_disk_tanggal ON disk_partitions(tanggal);
CREATE INDEX idx_disk_mount ON disk_partitions(mount_point);
```
