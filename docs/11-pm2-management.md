# PM2 Process Management Guide

Dokumentasi ini menjelaskan cara mengelola Super Apps services menggunakan PM2.

## Daftar Isi

1. [Overview](#overview)
2. [Installation](#installation)
3. [Quick Start](#quick-start)
4. [PM2 Commands](#pm2-commands)
5. [Auto-Start on Boot](#auto-start-on-boot)
6. [Monitoring](#monitoring)
7. [Logs Management](#logs-management)
8. [Troubleshooting](#troubleshooting)

---

## Overview

Super Apps menggunakan PM2 (Process Manager 2) untuk mengelola semua services:

- **superapps-model-server** (port 8081) - AI/ML model server
- **superapps-backend-1** to **superapps-backend-5** (port 8001-8005) - Backend API workers
- **superapps-frontend** (port 3443 HTTPS, 3001 HTTP) - Frontend server

### Keuntungan Menggunakan PM2

| Fitur | Deskripsi |
|-------|-----------|
| **Auto-restart** | Services otomatis restart jika crash |
| **Load balancing** | 5 backend workers untuk distribusi beban |
| **Monitoring** | Real-time monitoring CPU, RAM, uptime |
| **Log management** | Centralized logging dengan rotation |
| **Zero downtime** | Restart tanpa downtime (graceful reload) |
| **Startup script** | Auto-start saat server boot |

---

## Installation

PM2 sudah terinstall secara global. Untuk verifikasi:

```bash
pm2 --version
```

Jika belum terinstall:

```bash
npm install -g pm2
```

---

## Quick Start

### Start All Services

```bash
./start-all.sh
```

Script ini akan:
1. Stop existing PM2 processes (jika ada)
2. Load environment variables (SECRET_KEY, ENCRYPTION_KEY, CORS, dll)
3. Start semua services via PM2
4. Health check untuk semua ports
5. Tampilkan status dan access URLs

### Stop All Services

```bash
./stop-all.sh
```

Script ini akan:
1. Stop semua PM2 processes
2. Delete dari PM2 process list
3. Save PM2 state

### Restart All Services

```bash
./restart-all.sh
```

Script ini akan:
1. Restart semua services (graceful)
2. Tampilkan status setelah restart

---

## PM2 Commands

### Status & Monitoring

```bash
# Show all processes
pm2 status

# Real-time monitoring (dashboard)
pm2 monit

# Show detailed info for specific app
pm2 describe superapps-backend-1

# Show process tree
pm2 pid
```

### Start/Stop/Restart

```bash
# Start all services
pm2 start ecosystem.config.js

# Stop all services
pm2 stop ecosystem.config.js

# Restart all services
pm2 restart ecosystem.config.js

# Restart specific app
pm2 restart superapps-backend-1

# Reload (zero downtime)
pm2 reload ecosystem.config.js

# Graceful reload
pm2 reload superapps-backend-1

# Delete all from PM2
pm2 delete ecosystem.config.js
```

### Logs

```bash
# View all logs (streaming)
pm2 logs

# View specific app logs
pm2 logs superapps-backend-1

# View last 100 lines
pm2 logs --lines 100

# View logs without streaming
pm2 logs --nostream

# Flush all logs
pm2 flush

# Reload logs
pm2 reloadLogs
```

### Process Management

```bash
# Save current process list
pm2 save

# Restore previously saved process list
pm2 resurrect

# Reset all monitored processes
pm2 reset all

# Update PM2 to latest version
pm2 update
```

---

## Auto-Start on Boot

### Setup Startup Script

PM2 dapat auto-start saat server boot. Setup sekali saja:

```bash
# Generate startup script
pm2 startup
```

Output akan menampilkan command seperti:

```bash
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u $USER --hp /home/$USER
```

**Copy dan execute command tersebut:**

```bash
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u soni_buruzi --hp /home/soni_buruzi
```

### Save Process List

Setelah startup script di-setup, save process list:

```bash
pm2 save
```

### Verify Setup

```bash
# Check if startup script is installed
pm2 startup

# List systemd services
systemctl list-unit-files | grep pm2
```

### Disable Auto-Start

Jika ingin disable auto-start:

```bash
pm2 unstartup
sudo rm /etc/systemd/system/pm2-$USER.service
sudo systemctl daemon-reload
```

---

## Monitoring

### Real-Time Dashboard

```bash
pm2 monit
```

Dashboard akan menampilkan:
- CPU usage per process
- Memory usage per process
- Uptime
- Restart count
- Logs (real-time)

### Web Dashboard (PM2 Plus)

PM2 menyediakan web dashboard (opsional):

```bash
pm2 plus
```

Scan QR code atau buka link untuk akses dashboard online.

### Key Metrics

| Metric | Healthy | Warning | Critical |
|--------|---------|---------|----------|
| **CPU** | < 70% | 70-90% | > 90% |
| **Memory** | < 70% | 70-90% | > 90% |
| **Restarts** | 0-2 | 3-5 | > 5 |
| **Uptime** | > 24h | 1-24h | < 1h |

---

## Logs Management

### Log Locations

Semua logs disimpan di folder `logs/`:

```
logs/
├── model-server-out.log
├── model-server-error.log
├── backend-out.log
├── backend-error.log
├── frontend-out.log
└── frontend-error.log
```

### Log Rotation

PM2 otomatis rotate logs saat mencapai 10MB. Konfigurasi di `ecosystem.config.js`:

```javascript
{
  max_size: "10M",
  retain: 10,  // Keep last 10 rotated files
}
```

### View Logs

```bash
# PM2 logs (recommended)
pm2 logs

# Direct file access
tail -f logs/backend-out.log
tail -f logs/backend-error.log

# Search logs
pm2 logs | grep "ERROR"
```

### Clear Logs

```bash
# Flush all PM2 logs
pm2 flush

# Clear specific log file
> logs/backend-out.log
```

---

## Troubleshooting

### Services Not Starting

**Problem:** Services tidak start atau langsung crash

**Solution:**

```bash
# Check error logs
pm2 logs --err --lines 50

# Check process status
pm2 describe <app-name>

# Restart with verbose
pm2 restart <app-name> --update-env
```

### High Memory Usage

**Problem:** Memory usage terlalu tinggi (> 90%)

**Solution:**

```bash
# Check which process uses most memory
pm2 status

# Restart process to free memory
pm2 restart <app-name>

# Check memory limit in ecosystem.config.js
# Adjust max_memory_restart if needed
```

### Port Already in Use

**Problem:** Port 8081, 8001-8005, 3443, atau 3001 sudah digunakan

**Solution:**

```bash
# Find process using the port
lsof -ti :8081

# Kill the process
kill -9 <PID>

# Or use stop-all.sh
./stop-all.sh

# Then start again
./start-all.sh
```

### Environment Variables Not Loaded

**Problem:** Environment variables tidak ter-load oleh PM2

**Solution:**

```bash
# Restart with update-env flag
pm2 restart ecosystem.config.js --update-env

# Or use start-all.sh (recommended)
./start-all.sh
```

### PM2 Daemon Not Running

**Problem:** PM2 daemon tidak running

**Solution:**

```bash
# Start PM2 daemon
pm2 ping

# Or resurrect saved processes
pm2 resurrect
```

### Check Health

```bash
# Quick health check
pm2 status

# Detailed health check
for port in 8081 8001 8002 8003 8004 8005 3443; do
  curl -skf https://127.0.0.1:$port/health && echo "Port $port: OK" || echo "Port $port: FAILED"
done
```

---

## Best Practices

### 1. Always Use Scripts

Gunakan `start-all.sh`, `stop-all.sh`, dan `restart-all.sh` untuk memastikan environment variables ter-load dengan benar.

### 2. Monitor Regularly

```bash
# Daily check
pm2 status

# Weekly review
pm2 logs --lines 1000 | grep "ERROR"
```

### 3. Keep Logs Clean

```bash
# Weekly log cleanup
pm2 flush
```

### 4. Update PM2

```bash
# Monthly update
npm update -g pm2
pm2 update
```

### 5. Backup Configuration

```bash
# Backup ecosystem.config.js
cp ecosystem.config.js ecosystem.config.js.backup

# Backup PM2 dump
pm2 save
cp ~/.pm2/dump.pm2 ~/.pm2/dump.pm2.backup
```

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    PM2 Process Manager                   │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────────┐                                   │
│  │ Model Server     │  Port 8081                        │
│  │ (AI/ML Models)   │  Memory: ~2GB                     │
│  └──────────────────┘                                   │
│                                                          │
│  ┌──────────────────┐  ┌──────────────────┐            │
│  │ Backend Worker 1 │  │ Backend Worker 2 │  ...       │
│  │ Port 8001        │  │ Port 8002        │            │
│  │ Memory: ~250MB   │  │ Memory: ~250MB   │            │
│  └──────────────────┘  └──────────────────┘            │
│                                                          │
│  ┌──────────────────┐                                   │
│  │ Frontend Server  │  Port 3443 (HTTPS)                │
│  │ (Next.js)        │  Port 3001 (HTTP redirect)        │
│  │ Memory: ~150MB   │                                   │
│  └──────────────────┘                                   │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## Related Documentation

- [Architecture](./01-architecture.md)
- [Deployment](./02-deployment.md)
- [Security](./03-security.md)
- [Troubleshooting](./10-troubleshooting.md)

---

**Last Updated:** 2026-07-31  
**Version:** 1.0
