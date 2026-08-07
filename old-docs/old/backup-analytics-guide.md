# 📊 BACKUP ANALYTICS - CAPACITY PLANNING GUIDE

**Status:** ✅ Complete - Ready for Production
**Created:** February 26, 2026
**Module:** `/modules/backup-analytics`

---

## 🎯 OVERVIEW

Backup Analytics provides comprehensive data analysis for **capacity planning** with:
- Historical backup data storage
- Time-series analytics (daily, monthly trends)
- Server-level performance tracking
- Storage growth projection
- Status distribution analysis

---

## 🏗️ ARCHITECTURE

### Data Flow:
```
QNAP NAS (SSH)
    ↓
Backup Check Module (Manual Trigger)
    ↓
Parse Logs → Display Dashboard (Real-time)
    ↓
Save to Database (BackupHistory) ← NEW!
    ↓
Analytics API (Aggregation & Trends)
    ↓
Analytics Dashboard (Charts & Tables)
```

### Database Schema:
```sql
CREATE TABLE backup_history (
    id INTEGER PRIMARY KEY,
    server_name VARCHAR NOT NULL,      -- Server IP
    backup_date DATE NOT NULL,          -- Backup date
    jumlah_files INTEGER DEFAULT 0,     -- File count
    total_size_bytes INTEGER DEFAULT 0, -- Size in bytes
    status VARCHAR DEFAULT 'OK',        -- OK/Warning/Critical
    filename VARCHAR,                   -- Log filename
    created_at TIMESTAMP DEFAULT NOW(), -- When recorded
    created_by INTEGER                  -- User ID
);

-- Indexes for performance
CREATE INDEX idx_server ON backup_history(server_name);
CREATE INDEX idx_date ON backup_history(backup_date);
CREATE INDEX idx_created ON backup_history(created_at);
```

---

## 📋 FEATURES

### Option A: **Pagination** ✅
- View all historical records with pagination
- Configurable rows per page (10/20/50/100)
- Sortable columns (Date, Files, Size, Status)

### Option B: **Date Range Filter** ✅
- Filter by period: 7/30/90/180/365 days
- Daily trend analysis
- Monthly aggregation

### Option C: **Server History** ✅
- Click server → View detailed history
- Per-server statistics (avg, max, min)
- Status distribution per server

---

## 📊 ANALYTICS ENDPOINTS

### 1. **Summary Statistics**
```
GET /api/backup-analytics/summary?days=30
```

**Response:**
```json
{
  "period_days": 30,
  "total_records": 150,
  "servers_count": 5,
  "status_breakdown": {
    "OK": 140,
    "Warning": 8,
    "Critical": 2
  },
  "avg_files_per_backup": 12500,
  "avg_size_per_backup_gb": 2.35,
  "total_storage_tb": 0.35
}
```

---

### 2. **Servers List**
```
GET /api/backup-analytics/servers
```

**Response:**
```json
{
  "servers": [
    {
      "server_name": "192.168.60.192",
      "latest_date": "2026-02-25",
      "latest_files": 15234,
      "latest_size_gb": 2.30,
      "status": "OK"
    }
  ],
  "total_servers": 5
}
```

---

### 3. **Server History** (Option C)
```
GET /api/backup-analytics/server/{server_name}?days=30
```

**Response:**
```json
{
  "server_name": "192.168.60.192",
  "period_days": 30,
  "statistics": {
    "total_records": 30,
    "avg_files": 14500,
    "avg_size_gb": 2.25,
    "max_files": 16000,
    "max_size_gb": 2.50,
    "ok_days": 28,
    "warning_days": 2,
    "critical_days": 0
  },
  "history": [
    {
      "id": 1,
      "server_name": "192.168.60.192",
      "backup_date": "2026-02-25",
      "jumlah_files": 15234,
      "total_size_bytes": 2469606195,
      "status": "OK",
      "backup_date": "2026-02-25"
    }
  ]
}
```

---

### 4. **Daily Trend** (Option B)
```
GET /api/backup-analytics/daily-trend?days=30
```

**Response:**
```json
{
  "period_days": 30,
  "daily_data": [
    {
      "date": "2026-02-25",
      "backup_count": 5,
      "total_files": 72500,
      "total_size_gb": 11.25,
      "avg_files_per_server": 14500
    }
  ]
}
```

---

### 5. **Monthly Aggregation**
```
GET /api/backup-analytics/monthly-aggregation?months=12
```

**Response:**
```json
{
  "period_months": 12,
  "monthly_data": [
    {
      "year": 2026,
      "month": 2,
      "backup_count": 150,
      "total_files": 2175000,
      "total_size_tb": 0.35,
      "avg_files_per_day": 72500
    }
  ]
}
```

---

### 6. **Top Servers**
```
GET /api/backup-analytics/top-servers?limit=10&days=30
```

**Response:**
```json
{
  "period_days": 30,
  "top_by_storage_gb": [
    {
      "server_name": "192.168.60.192",
      "total_size_gb": 69.00,
      "avg_files": 14500,
      "backup_days": 30
    }
  ],
  "top_by_files": [
    {
      "server_name": "192.168.60.192",
      "total_files": 435000,
      "avg_size_gb": 2.30,
      "backup_days": 30
    }
  ]
}
```

---

### 7. **Status Distribution**
```
GET /api/backup-analytics/status-distribution?days=30
```

**Response:**
```json
{
  "period_days": 30,
  "overall": {
    "OK": 140,
    "Warning": 8,
    "Critical": 2
  },
  "daily": [
    {
      "date": "2026-02-25",
      "status": "OK",
      "count": 5
    }
  ]
}
```

---

## 🖥️ ANALYTICS DASHBOARD

### Access:
**URL:** http://localhost:3001/modules/backup-analytics

### Features:
1. **Period Selector** - 7/30/90/180/365 days
2. **Summary Cards** - Total backups, avg files, avg size, total storage
3. **Status Breakdown** - OK/Warning/Critical distribution
4. **Servers Table** - Latest status per server (clickable)
5. **History Panel** - Server history or daily trend

### Usage:
1. **Select Period** (e.g., 30 days)
2. **View Summary** - Overall statistics
3. **Click Server** - View detailed history (Option C)
4. **Analyze Trends** - Daily/monthly patterns (Option B)

---

## 📈 CAPACITY PLANNING USE CASES

### 1. **Storage Growth Projection**
```sql
-- Monthly storage growth
SELECT 
  year, month, 
  SUM(total_size_bytes) as monthly_size
FROM backup_history
GROUP BY year, month
ORDER BY year, month;
```

**Use:** Plan storage capacity for next quarter/year

---

### 2. **Server Performance Ranking**
```sql
-- Top 10 servers by storage
SELECT 
  server_name,
  AVG(jumlah_files) as avg_files,
  SUM(total_size_bytes) as total_size
FROM backup_history
GROUP BY server_name
ORDER BY total_size DESC
LIMIT 10;
```

**Use:** Identify high-usage servers for optimization

---

### 3. **Backup Success Rate**
```sql
-- Success rate per server
SELECT 
  server_name,
  COUNT(*) as total_days,
  SUM(CASE WHEN status = 'OK' THEN 1 ELSE 0 END) as ok_days,
  ROUND(100.0 * SUM(CASE WHEN status = 'OK' THEN 1 ELSE 0 END) / COUNT(*), 2) as success_rate
FROM backup_history
GROUP BY server_name;
```

**Use:** Identify problematic servers

---

### 4. **Daily/Weekly Patterns**
```sql
-- Average files per day of week
SELECT 
  EXTRACT(DOW FROM backup_date) as day_of_week,
  AVG(jumlah_files) as avg_files
FROM backup_history
GROUP BY day_of_week
ORDER BY day_of_week;
```

**Use:** Optimize backup schedule

---

### 5. **Anomaly Detection**
```sql
-- Days with unusual file counts
SELECT 
  server_name,
  backup_date,
  jumlah_files,
  avg_files,
  (jumlah_files - avg_files) as deviation
FROM backup_history
CROSS JOIN (
  SELECT AVG(jumlah_files) as avg_files
  FROM backup_history
)
WHERE ABS(jumlah_files - avg_files) > avg_files * 0.5;
```

**Use:** Detect backup failures or data loss

---

## 🔧 INTEGRATION WITH TIMESCALEDB

### For Production (Docker):

**1. Update docker-compose.yml:**
```yaml
services:
  timescaledb:
    image: timescale/timescaledb-ha:pg17
    # ... existing config ...
  
  super-apps:
    build: ./backend
    environment:
      - DATABASE_URL=postgresql://user:pass@timescaledb:5432/superapps
    depends_on:
      - timescaledb
```

**2. Create Hypertable:**
```sql
-- Convert to timeseries hypertable
SELECT create_hypertable('backup_history', 'created_at');

-- Add compression policy
SELECT add_compression_policy('backup_history', INTERVAL '1 month');
```

**3. Benefits:**
- Automatic partitioning by time
- Compression for old data
- Continuous aggregates for fast queries
- Retention policies

---

## 📊 METABASE INTEGRATION

### Pre-built Dashboards:

**1. Backup Overview**
- Total backups per day
- Storage growth trend
- Success rate over time

**2. Server Performance**
- Top 10 servers by storage
- Server health heatmap
- Backup duration trends

**3. Capacity Planning**
- Storage projection (next 6 months)
- Growth rate analysis
- Cost estimation

---

## 🚀 QUICK START

### 1. Run Backup Check (Collect Data)
```
1. Go to: /modules/backup-check
2. Enter NAS credentials
3. Click "Check Backups"
4. Data auto-saved to database ✅
```

### 2. View Analytics
```
1. Go to: /modules/backup-analytics
2. Select period (e.g., 30 days)
3. View summary, trends, server history
```

### 3. Export Data
```sql
-- Export to CSV for external analysis
COPY (
  SELECT * FROM backup_history
  WHERE backup_date >= NOW() - INTERVAL '30 days'
) TO '/tmp/backup_data.csv' WITH CSV HEADER;
```

---

## 📝 API TESTING

### Using curl:
```bash
# Summary
curl "http://localhost:8001/api/backup-analytics/summary?days=30" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Server history
curl "http://localhost:8001/api/backup-analytics/server/192.168.60.192?days=30" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Daily trend
curl "http://localhost:8001/api/backup-analytics/daily-trend?days=30" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Using API Docs:
```
http://localhost:8001/docs#/Backup%20Analytics
```

---

## 🔒 SECURITY

- **Authentication Required** - JWT token
- **User Tracking** - `created_by` field
- **Read-Only Analytics** - No data modification
- **Rate Limiting** - Recommended for production

---

## 📊 DATABASE MIGRATION

### From SQLite to PostgreSQL/TimescaleDB:

**1. Export SQLite data:**
```bash
sqlite3 superapps.db ".mode csv" ".headers on" "SELECT * FROM backup_history;" > backup_data.csv
```

**2. Import to PostgreSQL:**
```sql
COPY backup_history FROM '/path/backup_data.csv' WITH CSV HEADER;
```

**3. Create indexes:**
```sql
CREATE INDEX idx_server ON backup_history(server_name);
CREATE INDEX idx_date ON backup_history(backup_date);
CREATE INDEX idx_created ON backup_history(created_at);
```

---

## 🎯 NEXT STEPS

### Future Enhancements:
- [ ] Interactive charts (Chart.js / Recharts)
- [ ] Storage growth prediction (ML)
- [ ] Automated alerts for anomalies
- [ ] Integration with existing TimescaleDB
- [ ] Export to PDF reports
- [ ] Custom date range picker

---

**Last Updated:** February 26, 2026
**Author:** Super Apps Development Team
**Status:** ✅ Ready for Production
