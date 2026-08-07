#!/bin/bash
# Stop all Super Apps services

DIR="$(cd "$(dirname "$0")" && pwd)"
# Shared helper for Admin UI (sqlite-web) lifecycle
source "$DIR/admin-ui.sh"

echo "🛑 Stopping Super Apps services..."
echo ""

# Check if PM2 is available
if command -v pm2 &> /dev/null; then
    echo "📋 Stopping via PM2..."
    
    # Stop all services
    pm2 stop ecosystem.config.js 2>/dev/null
    if [ $? -eq 0 ]; then
        echo "✓ All services stopped"
    else
        echo "⚠️  No PM2 processes found"
    fi
    
    # Delete from PM2 process list
    pm2 delete ecosystem.config.js 2>/dev/null || true
    
    # Save PM2 state (so processes don't restart on next pm2 save)
    pm2 save 2>/dev/null || true

    # Stop sqlite-web (Admin UI) — not managed by PM2
    stop_sqlite_web
    
    echo ""
    echo "📊 Current PM2 status:"
    pm2 status
    
else
    echo "⚠️  PM2 not found, stopping services by port..."
    echo ""
    
    # Fallback: kill by port
    for port in 8081 8001 8002 8003 8004 8005 8082 3001 3443; do
        pid=$(lsof -ti :"$port" 2>/dev/null)
        if [ -n "$pid" ]; then
            kill -9 "$pid" 2>/dev/null
            echo "✓ Killed port $port (PID $pid)"
        else
            echo "  Port $port — not running"
        fi
    done
fi

# Belt-and-braces: re-kill admin-ui in case backend-1 was SIGKILLed before
# its graceful shutdown could stop the detached sqlite-web child.
stop_sqlite_web

# Fast confirmation (single pass, no waiting) — kill any stragglers.
echo ""
echo "🔍 Confirming all ports are down:"
stragglers=0
for port in 8081 8001 8002 8003 8004 8005 8082 3443 3001; do
  pid=$(lsof -ti :"$port" 2>/dev/null)
  if [ -n "$pid" ]; then
    kill -9 "$pid" 2>/dev/null
    echo "  ⚠ Killed straggler on port $port (PID $pid)"
    stragglers=1
  fi
done
if [ "$stragglers" = "0" ]; then
  echo "  ✓ All services stopped clean (frontend, backend ×5, model-server, admin-ui)"
fi

echo ""
echo "✅ All services stopped successfully"
