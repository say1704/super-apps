#!/bin/bash
# Restart all Super Apps services using PM2

DIR="$(cd "$(dirname "$0")" && pwd)"
# Shared helper for Admin UI (sqlite-web) lifecycle
source "$DIR/admin-ui.sh"

echo "🔄 Restarting Super Apps services..."
echo ""

# Check if PM2 is available
if ! command -v pm2 &> /dev/null; then
    echo "❌ PM2 is not installed. Install with: npm install -g pm2"
    exit 1
fi

# Check if services are running
if pm2 describe ecosystem.config.js > /dev/null 2>&1; then
    echo "📋 Restarting existing PM2 processes..."
    # Stop sqlite-web (Admin UI) first so backend-1 rebinds 8082 cleanly
    stop_sqlite_web
    pm2 restart ecosystem.config.js
else
    echo "⚠️  No PM2 processes found. Starting fresh..."
    ./start-all.sh
    exit $?
fi

# Wait for restart
echo ""
echo "⏳ Waiting for services to restart..."

# Health checks (also waits for services to come back up)
health_checks

# Show status
echo ""
echo "📊 PM2 Status:"
pm2 status

echo ""
echo "✅ All services restarted successfully"
print_summary_banner
echo ""
echo "📝 View logs: pm2 logs"
echo "📊 Monitor: pm2 monit"
