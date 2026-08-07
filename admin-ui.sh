#!/bin/bash
# Shared Admin UI (sqlite-web) lifecycle helper.
# Sourced by start-all.sh, stop-all.sh, restart-all.sh.
# sqlite-web is a detached child of superapps-backend-1, NOT a PM2 process,
# so `pm2 stop`/`pm2 delete` does not kill it — provide an explicit stop routine.

stop_sqlite_web() {
  if [ -f /tmp/sqlite-web.pid ]; then
    kill "$(cat /tmp/sqlite-web.pid)" 2>/dev/null || true
    rm -f /tmp/sqlite-web.pid /tmp/sqlite-web-password
  fi
  pkill -f "bin/sqlite_web" 2>/dev/null || true
}

# Detect the primary LAN IP (skips docker/private bridge ranges when possible).
detect_lan_ip() {
  local ip=""
  ip=$(ip route get 8.8.8.8 2>/dev/null | grep -oP 'src \K[^ ]+')
  if [ -z "$ip" ]; then
    ip=$(hostname -I 2>/dev/null | tr ' ' '\n' | grep -v '^172\.' | grep -v '^10\.' | head -1)
  fi
  if [ -z "$ip" ]; then
    ip=$(hostname -I 2>/dev/null | awk '{print $1}')
  fi
  echo "$ip"
}

print_summary_banner() {
  local lan_ip
  lan_ip=$(detect_lan_ip)
  echo ""
  echo "-------------------------------------------------------"
  echo "  🌐 Frontend:     https://127.0.0.1:3443 (HTTP→3001 redirect)"
  echo "  🔧 Backend:      5 workers (8001-8005, localhost only)"
  echo "  🎨 Admin UI:     https://127.0.0.1:3443/admin-ui"
  echo "  🤖 Model Server: https://127.0.0.1:8081"
  if [ -n "$lan_ip" ]; then
    echo "  📱 From network: https://$lan_ip:3443"
  fi
  echo "-------------------------------------------------------"
}

health_checks() {
  echo ""
  echo "🔍 Health Checks:"
  for port in 8081 8001 8002 8003 8004 8005 8082 3443 3001; do
    local proto="https"
    if [ "$port" = "3001" ] || [ "$port" = "8082" ]; then
      proto="http"
    fi
    local code="000"
    for i in $(seq 1 40); do
      code=$(curl -ks -o /dev/null -w "%{http_code}" --max-time 4 "$proto://127.0.0.1:$port/health")
      [ "$code" = "000" ] && code=$(curl -ks -o /dev/null -w "%{http_code}" --max-time 4 "$proto://127.0.0.1:$port/")
      [ "$code" != "000" ] && break
      sleep 1
    done
    if [ "$code" != "000" ]; then
      echo "  ✓ Port $port — HEALTHY"
    else
      echo "  ✗ Port $port — NOT RESPONDING"
    fi
  done
}
