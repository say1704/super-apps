# 📦 BACKUP CHECK MODULE - SETUP GUIDE

**Status:** ✅ Complete - Ready for Testing
**Created:** February 26, 2026
**Location:** `/home/soni_buruzi/Workspace/01_Projects/IT_Projects/2026/super-apps/modules/backup-check`

---

## 🎯 OVERVIEW

The **Backup Check Module** allows you to monitor backup status from QNAP NAS via SSH with zero-trust security design.

### Key Features:
- ✅ **Zero-Trust Authentication** - Manual credential input per session
- ✅ **In-Memory Only** - No credential storage
- ✅ **Real-time SSH Connection** - Direct connection to NAS
- ✅ **Log Parsing** - Reuses existing parser.py logic
- ✅ **Status Dashboard** - Visual summary with OK/Warning/Critical status
- ✅ **Export to CSV** - Download backup reports

---

## 🔐 SECURITY DESIGN

### Zero-Trust Architecture:
```
User Input → Backend API → SSH Connect → Parse Logs → Return Results → DELETE Credentials
```

**Security Features:**
- ❌ No credential storage in database
- ❌ No credential storage in files
- ❌ No environment variables for credentials
- ✅ Credentials in-memory only (deleted after use)
- ✅ HTTPS encryption (in production)
- ✅ Manual input required per session

---

## 📋 PREREQUISITES

### 1. QNAP NAS Configuration

**SSH Access:**
- Enable SSH on QNAP NAS (Control Panel → Network & File Services → Telnet/SSH)
- Create dedicated user for backup monitoring (e.g., `backup_reader`)
- Grant read-only access to backup log directory

**Log File Location:**
- Default path: `/share/backup_logs`
- Log files must follow naming pattern: `log-*.log`

### 2. Log File Format

Expected log format (from parser.py):
```
========================================
Backup Report - 192.168.60.192
Date: 24-02-2026
========================================

Jumlah Files: 15234
Total Size Files Yang Di Backup: 2469606195 Bytes

========================================
```

**Supported Filename Patterns:**
- `log-192_24-02-2026.log` → `192.168.60.192`
- `log-dev-10_24-02-2026.log` → `10.20.100.10`
- `log-10_20_24-02-2026.log` → `10.20.10.20`
- `log-5_24-02-2026.log` → `10.20.100.5`

---

## 🚀 USAGE

### 1. Access the Module

Navigate to: **http://localhost:3001/modules/backup-check**

### 2. Enter NAS Credentials

Fill in the form:
- **NAS IP Address:** `192.168.1.100` (or your NAS IP)
- **Username:** `backup_reader`
- **Password:** `••••••••`
- **Backup Path:** `/share/backup_logs`

### 3. Test Connection (Optional)

Click **🔌 Test Connection** to verify SSH connectivity before running full backup check.

### 4. Check Backups

Click **✅ Check Backups** to:
- Connect to NAS via SSH
- List all `.log` files in the specified path
- Parse each log file
- Calculate status for each server
- Display results in dashboard

### 5. View Results

**Summary Cards:**
- 🖥️ Total Servers
- ✅ OK (Files ≥ 1000 AND Size ≥ 100MB)
- ⚠️ Warning (Files < 1000 OR Size < 100MB)
- ❌ Critical (Files = 0 AND Size = 0)
- 📄 Total Files
- 💾 Total Size

**Backup Table:**
| Server | Date | Files | Size | Status |
|--------|------|-------|------|--------|
| 192.168.60.192 | 2026-02-24 | 15,234 | 2.30 GB | ✅ OK |
| 10.20.100.10 | 2026-02-24 | 8,456 | 1.80 GB | ✅ OK |
| 10.20.100.11 | 2026-02-24 | 0 | 0 GB | ❌ Critical |

### 6. Export Report

Click **📥 Export CSV** to download backup status report.

---

## 🔧 API ENDPOINTS

### Test Connection
```
POST /api/backup-check/test-connection
Content-Type: application/json

{
  "nas_ip": "192.168.1.100",
  "username": "backup_reader",
  "password": "your_password",
  "port": 22
}
```

**Response:**
```json
{
  "success": true,
  "message": "Connected to 192.168.1.100"
}
```

### Run Backup Check
```
POST /api/backup-check/run-manual
Content-Type: application/json

{
  "nas_ip": "192.168.1.100",
  "username": "backup_reader",
  "password": "your_password",
  "path": "/share/backup_logs",
  "port": 22
}
```

**Response:**
```json
{
  "summary": {
    "total_servers": 3,
    "ok_count": 2,
    "warning_count": 0,
    "critical_count": 1,
    "total_files": "23,690",
    "total_size": "4.10 GB"
  },
  "records": [
    {
      "server": "192.168.60.192",
      "date": "2026-02-24",
      "files": 15234,
      "files_formatted": "15,234",
      "size_bytes": 2469606195,
      "size_formatted": "2.30 GB",
      "status": "OK",
      "filename": "log-192_24-02-2026.log"
    }
  ],
  "message": "Successfully checked 3 servers"
}
```

### Get Status Guide
```
GET /api/backup-check/status-guide
```

**Response:**
```json
{
  "status_levels": {
    "OK": {
      "description": "Backup berjalan normal",
      "criteria": "Files >= 1000 AND Size >= 100MB"
    },
    "Warning": {
      "description": "Backup mungkin ada masalah",
      "criteria": "Files < 1000 OR Size < 100MB"
    },
    "Critical": {
      "description": "Backup gagal atau tidak ada data",
      "criteria": "Files = 0 AND Size = 0"
    }
  }
}
```

---

## 📁 FILE STRUCTURE

```
backend/
├── api/
│   └── backup_check.py          # API endpoints
├── utils/
│   ├── ssh_handler.py           # SSH connection handler
│   └── backup_parser.py         # Log file parser

frontend/
└── app/modules/backup-check/
    ├── page.tsx                 # Main dashboard page
    └── components/
        ├── credential-form.tsx  # NAS credential input
        ├── summary-cards.tsx    # Status summary cards
        └── backup-table.tsx     # Backup status table
```

---

## 🧪 TESTING

### Manual SSH Test
```bash
ssh backup_reader@192.168.1.100
# Enter password
ls /share/backup_logs/*.log
cat /share/backup_logs/log-192_24-02-2026.log
```

### API Test (curl)
```bash
# Test connection
curl -X POST http://localhost:8001/api/backup-check/test-connection \
  -H "Content-Type: application/json" \
  -d '{
    "nas_ip": "192.168.1.100",
    "username": "backup_reader",
    "password": "your_password",
    "port": 22
  }'

# Run backup check
curl -X POST http://localhost:8001/api/backup-check/run-manual \
  -H "Content-Type: application/json" \
  -d '{
    "nas_ip": "192.168.1.100",
    "username": "backup_reader",
    "password": "your_password",
    "path": "/share/backup_logs",
    "port": 22
  }'
```

---

## ⚠️ TROUBLESHOOTING

### SSH Connection Failed
**Error:** `Authentication failed`
- Verify username and password
- Check if SSH is enabled on NAS
- Ensure user has SSH access permissions

**Error:** `Connection timeout`
- Verify NAS IP address
- Check network connectivity
- Ensure NAS is powered on and accessible

### No Log Files Found
**Error:** `No log files found`
- Verify backup path is correct
- Check if log files exist: `ls /share/backup_logs/*.log`
- Ensure file permissions allow reading

### Parsing Errors
**Error:** `Unrecognized filename format`
- Verify log filename follows supported patterns
- Check filename format matches expected pattern

**Error:** `Unrecognized date format`
- Ensure date in filename is in DD-MM-YYYY or YYYYMMDD format

---

## 🔒 SECURITY BEST PRACTICES

1. **Use Dedicated User:** Create a read-only user specifically for backup monitoring
2. **Limit Path Access:** Grant access only to backup log directory
3. **Enable SSH Key Auth:** For automated systems (not implemented yet)
4. **Monitor Access:** Review SSH access logs on NAS regularly
5. **Use HTTPS:** In production, always use HTTPS for frontend

---

## 📊 INTEGRATION WITH EXISTING SYSTEM

### Docker Architecture
```yaml
services:
  timescaledb:    # Database (existing)
  parser:         # Existing backup log parser (runs automatically)
  pgadmin:        # DB admin (existing)
  metabase:       # Analytics (existing)
  super-apps:     # New - includes Backup Check module
```

### Data Flow
```
QNAP NAS (SSH)
    ↓
Backup Check Module (Manual Trigger)
    ↓
Parse Logs (parser.py logic)
    ↓
Display Dashboard (Frontend)
    ↓
Export CSV (Optional)
```

**Note:** This module does NOT write to database. It's a real-time monitoring tool only.

---

## 📝 NEXT STEPS

### Future Enhancements:
- [ ] Save historical backup status to database
- [ ] Add alerting for Critical status
- [ ] Schedule automatic backup checks
- [ ] Support for multiple NAS devices
- [ ] SSH key authentication option
- [ ] Backup trend charts and analytics

---

**Last Updated:** February 26, 2026
**Author:** Super Apps Development Team
**Status:** ✅ Ready for Production Testing
