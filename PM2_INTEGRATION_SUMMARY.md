# PM2 Integration Summary

## Overview
Super Apps sekarang fully terintegrasi dengan PM2 untuk production deployment.

## Changes Made

### 1. install.sh
**Changed:**
- Line 319: `./start-all.sh` → `./start.sh --prod`
- Removed: `pm2 save` (sudah dihandle oleh start.sh --prod)
- Updated: Output messages untuk mencerminkan PM2 usage

**Impact:**
- Aplikasi sekarang start dengan PM2 secara otomatis
- PM2 startup dikonfigurasi untuk auto-start on boot
- Semua services di-manage oleh PM2

### 2. stop-all.sh
**Changed:**
- Added: PM2 detection dan graceful stop
- Fallback: Stop by port jika PM2 tidak tersedia

**Before:**
```bash
for port in 8081 8001 8002 8003 8004 8005 3001 3443; do
  pid=$(lsof -ti :"$port" 2>/dev/null)
  if [ -n "$pid" ]; then
    kill -9 "$pid" 2>/dev/null
    echo "Killed port $port (PID $pid)"
  fi
done
```

**After:**
```bash
if command -v pm2 &> /dev/null; then
    echo "Stopping services via PM2..."
    pm2 stop ecosystem.config.js 2>/dev/null || true
    pm2 delete ecosystem.config.js 2>/dev/null || true
    echo "✓ All PM2 services stopped"
else
    echo "PM2 not found, stopping services by port..."
    # ... fallback to port-based stop
fi
```

### 3. docs/02-deployment.md
**Updated:**
- Startup & Shutdown section
- Installation Flow diagram
- After Installation commands
- Added alternative production mode (nohup) documentation

## Benefits

### ✅ Auto-Restart on Crash
- PM2 otomatis restart services jika crash
- Tidak perlu manual intervention

### ✅ Auto-Start on Boot
- Services otomatis start saat server reboot
- Configured via `pm2 startup`

### ✅ Centralized Management
- `pm2 status` - check semua services
- `pm2 logs` - view all logs
- `pm2 restart all` - restart semua services
- `pm2 monit` - monitoring dashboard

### ✅ Graceful Shutdown
- `stop-all.sh` sekarang stop PM2 services dengan benar
- Fallback ke port-based stop jika PM2 tidak tersedia

## Usage

### Production Deployment (Recommended)
```bash
# Install and start with PM2
./install.sh

# Or start manually with PM2
./start.sh --prod
```

### Development
```bash
# Start without PM2 (for development)
./start.sh
```

### Stop Services
```bash
./stop-all.sh
```

### PM2 Commands
```bash
pm2 status              # Check service status
pm2 logs                # View logs
pm2 restart all         # Restart all services
pm2 monit               # Monitor services
pm2 startup             # Setup auto-start on boot
pm2 unstartup           # Disable auto-start
```

## Backward Compatibility

- `start-all.sh` masih tersedia untuk yang tidak mau pakai PM2
- `stop-all.sh` fallback ke port-based stop jika PM2 tidak ada
- Tidak ada breaking changes untuk existing deployments

## Testing

✅ Syntax check passed
✅ stop-all.sh tested (fallback mode)
✅ Documentation updated

## Next Steps

1. Deploy ke production server
2. Test PM2 integration di production
3. Verify auto-start on boot
4. Monitor services dengan `pm2 monit`
