#!/bin/bash

# Super Apps - IT Management System
# Startup Script (Dev + Production)

set -e

# ==================== CONFIG ====================
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# Keep PM2 state project-local (dump/pids/daemon under super-apps/.pm2), not ~/.pm2.
export PM2_HOME="$SCRIPT_DIR/.pm2"
CERT_DIR="$SCRIPT_DIR/certs"
CERT_FILE="$CERT_DIR/cert.pem"
KEY_FILE="$CERT_DIR/key.pem"
MODEL_SERVER_PORT=8081
BACKEND_PORT=8006
FRONTEND_PORT=3001
ADMIN_UI_PORT=8082

# ==================== HELPERS ====================

find_pm2() {
    for candidate in "$SCRIPT_DIR/node_modules/.bin/pm2" "$HOME/.npm-global/bin/pm2" "/usr/local/bin/pm2" "/usr/bin/pm2"; do
        if [ -x "$candidate" ]; then
            echo "$candidate"
            return 0
        fi
    done
    return 1
}

stop_all() {
    local pm2_bin
    pm2_bin=$(find_pm2) || true
    if [ -n "$pm2_bin" ]; then
        echo "Stopping PM2 services..."
        "$pm2_bin" stop "$SCRIPT_DIR/ecosystem.config.js" 2>/dev/null || true
        "$pm2_bin" save 2>/dev/null || true
    fi
    echo "Killing processes on ports $MODEL_SERVER_PORT, 8001-8010, $FRONTEND_PORT, $ADMIN_UI_PORT..."
    for __p in "$MODEL_SERVER_PORT" 8001 8002 8003 8004 8005 8006 8007 8008 8009 8010 "$FRONTEND_PORT" "$ADMIN_UI_PORT"; do
        kill -9 $(lsof -ti:"$__p") 2>/dev/null || true
    done
    sleep 1
    rm -f "$SCRIPT_DIR/frontend/.next/dev/lock" 2>/dev/null
}

show_status() {
    local pm2_bin
    pm2_bin=$(find_pm2) || true
    echo "=== Super Apps - Status ==="
    if [ -n "$pm2_bin" ]; then
        echo "--- PM2 ---"
        "$pm2_bin" status 2>&1
    fi
    echo "--- Ports ---"
    for port in $MODEL_SERVER_PORT 8001 8002 8003 8004 8005 8006 8007 8008 8009 8010 $FRONTEND_PORT $ADMIN_UI_PORT; do
        local pid
        pid=$(lsof -ti:"$port" 2>/dev/null || true)
        if [ -n "$pid" ]; then
            local pname
            pname=$(ps -p "$pid" -o comm= 2>/dev/null || echo "unknown")
            echo "  Port $port: RUNNING (PID $pid - $pname)"
        else
            echo "  Port $port: not running"
        fi
    done
}

# ==================== FLAG PARSING ====================
MODE="dev"
ACTION="start"

for arg in "$@"; do
    case "$arg" in
        --prod) MODE="prod" ;;
        --build) ACTION="build" ;;
        --restart) ACTION="restart" ;;
        --stop) ACTION="stop" ;;
        --status) ACTION="status" ;;
        --help|-h)
            echo "Super Apps - Startup Script"
            echo ""
            echo "Usage:"
            echo "  ./start.sh                  Start in dev mode (nohup + next dev)"
            echo "  ./start.sh --prod           Start in production mode (PM2 + next start)"
            echo "  ./start.sh --prod --build   Build frontend then start prod"
            echo "  ./start.sh --status         Show status (PM2 + ports)"
            echo "  ./start.sh --stop           Stop all services (PM2 + ports)"
            echo "  ./start.sh --restart        Restart in current mode"
            echo "  ./start.sh --prod --restart Restart production via PM2"
            echo "  ./start.sh --help           This help"
            exit 0
            ;;
    esac
done

# ==================== UNIVERSAL ACTIONS (work in any mode) ====================

case "$ACTION" in
    status)
        show_status
        exit 0
        ;;
    stop)
        stop_all
        echo "All services stopped."
        exit 0
        ;;
    restart)
        echo "Restarting services..."
        stop_all
        # fall through to start below
        ;;
esac

# ==================== PRODUCTION MODE ACTIONS (require --prod) ====================

if [ "$MODE" = "prod" ]; then
    PM2_BIN=""
    PM2_BIN=$(find_pm2) || true
    if [ -z "$PM2_BIN" ]; then
        echo "ERROR: PM2 not found. Install with: npm install -g pm2"
        exit 1
    fi

    case "$ACTION" in
        build)
            echo "Building frontend for production..."
            cd "$SCRIPT_DIR/frontend"
            npm run build
            echo "Frontend build complete."
            exit 0
            ;;
    esac
fi

# ==================== SHARED INIT ====================

if [ "$MODE" = "dev" ]; then
    echo "Starting Super Apps - IT Management System (dev mode)..."
    echo "Cleaning up existing processes..."
    for __p in "$MODEL_SERVER_PORT" 8001 8002 8003 8004 8005 8006 8007 8008 8009 8010 "$FRONTEND_PORT" "$ADMIN_UI_PORT"; do
        kill -9 $(lsof -ti:"$__p") 2>/dev/null || true
    done
    sleep 1
    rm -f frontend/.next/dev/lock 2>/dev/null
else
    echo "Starting Super Apps - IT Management System (production mode)..."
fi

# ==================== SSL CERTIFICATE CHECK ====================
USE_SSL=false
if [ -f "$CERT_FILE" ] && [ -f "$KEY_FILE" ]; then
    USE_SSL=true
    echo "SSL certificate found - HTTPS on :3443, HTTP redirect on :3001"
else
    echo "No SSL certificate found - starting with HTTP on :$FRONTEND_PORT"
    [ "$MODE" = "dev" ] && echo "Run: ./scripts/generate-cert.sh  (to enable HTTPS with trusted cert)"
fi

# ==================== ENVIRONMENT VARIABLES ====================
# Auto-detect LAN IP and subnet for network access
LAN_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
if [ -n "$LAN_IP" ]; then
    export CORS_SUBNET="$(echo "$LAN_IP" | cut -d. -f1-3).0/24"
    export ALLOWED_HOSTS="localhost,127.0.0.1,${LAN_IP}"
fi

if [ "$USE_SSL" = true ]; then
    export COOKIE_SECURE="true"
    export MODEL_SERVER_URL="https://127.0.0.1:8081"
    export CORS_ORIGINS="https://localhost:3443,https://127.0.0.1:3443${LAN_IP:+,https://${LAN_IP}:3443}"
else
    export COOKIE_SECURE="false"
    export MODEL_SERVER_URL="http://127.0.0.1:8081"
fi

# SECRET_KEY and ASSET_ENCRYPTION_KEY are loaded by the backend at startup
# from backend/.superapps/{secret,encryption}.key (see utils/key_manager.py).
# They are intentionally NOT exported so PM2 does not capture them in dump.pm2.

# ==================== PRODUCTION MODE (PM2) ====================
if [ "$MODE" = "prod" ]; then
    export NODE_ENV=production

    # Export env so PM2 processes inherit them
    export COOKIE_SECURE

    echo "Starting model server via PM2..."
    "$PM2_BIN" delete superapps-model-server 2>/dev/null || true
    "$PM2_BIN" start "$SCRIPT_DIR/ecosystem.config.js" --only superapps-model-server --update-env

    echo "Starting 5 backend workers via PM2..."
    for i in 1 2 3 4 5; do
        "$PM2_BIN" delete "superapps-backend-$i" 2>/dev/null || true
    done
    for i in 1 2 3 4 5; do
        "$PM2_BIN" start "$SCRIPT_DIR/ecosystem.config.js" --only "superapps-backend-$i" --update-env
    done

    echo "Starting frontend via PM2..."
    "$PM2_BIN" delete superapps-frontend 2>/dev/null || true
    "$PM2_BIN" start "$SCRIPT_DIR/ecosystem.config.js" --only superapps-frontend --update-env

    # Run admin password setup in background (don't block startup)
    echo "Setting admin UI password..."
    cd "$SCRIPT_DIR/backend"
    timeout 15 ./venv/bin/python -c "
import sys; sys.path.insert(0, '.')
from dotenv import load_dotenv; load_dotenv()
import os
from database import SessionLocal
from models import AppSettings
from utils.password_encrypt import encrypt_password
db = SessionLocal()
try:
    rec = db.query(AppSettings).filter(AppSettings.key == 'admin_ui_password').first()
    if rec and rec.value:
        sys.exit(0)
    pass_val = os.environ.get('ADMIN_PASS', '')
    if not pass_val:
        import secrets, string
        pass_val = ''.join(secrets.choice(string.ascii_letters + string.digits) for _ in range(16))
    encrypted = encrypt_password(pass_val)
    if rec:
        rec.value = encrypted
    else:
        db.add(AppSettings(category='general', key='admin_ui_password', value=encrypted))
    db.commit()
    print('Admin UI password saved')
except Exception as e:
    print(f'Admin UI password setup skipped: {e}')
finally:
    db.close()
" 2>&1 | grep -v "^$" || echo "Admin password setup skipped (timeout or error)"

    cd "$SCRIPT_DIR"
    "$PM2_BIN" save
    echo "PM2 save done."

    # Verify
    echo "Waiting for services to start..."
    sleep 3
    "$PM2_BIN" status

    LOCAL_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
    echo ""
    echo "Application started (production mode)!"
    echo "-------------------------------------------------------"
    if [ "$USE_SSL" = true ]; then
        echo "  Frontend:     https://127.0.0.1:3443"
        echo "  HTTP → HTTPS: http://127.0.0.1:3001 (redirect)"
        echo "  Admin UI:     https://127.0.0.1:3443/admin-ui"
    else
        echo "  Frontend:     http://127.0.0.1:$FRONTEND_PORT"
        echo "  Admin UI:     http://127.0.0.1:$ADMIN_UI_PORT"
    fi
    MS_PROTO="http"; [ "$USE_SSL" = true ] && MS_PROTO="https"
    echo "  Model Server: ${MS_PROTO}://127.0.0.1:$MODEL_SERVER_PORT"
    echo "  Backend:      5 workers (8001-8005)"
    API_PROTO="http"; [ "$USE_SSL" = true ] && API_PROTO="https"
    echo "  API Docs:     ${API_PROTO}://127.0.0.1:8001/docs"
    if [ -n "$LOCAL_IP" ]; then
        if [ "$USE_SSL" = true ]; then
            echo "  From network: https://$LOCAL_IP:3443"
        else
            echo "  From network: http://$LOCAL_IP:$FRONTEND_PORT"
        fi
    fi
    echo "-------------------------------------------------------"
    echo "Commands:"
    echo "  $0 --status"
    echo "  $0 --stop"
    echo "  $0 --restart   (or $0 --prod --restart)"
    echo ""
    echo "Logs: ./logs/backend-{error,out}.log, ./logs/frontend-{error,out}.log"
    exit 0
fi

# ==================== DEV MODE (nohup) ====================

# ==================== START MODEL SERVER ====================
echo "Starting model server on port $MODEL_SERVER_PORT..."
cd "$SCRIPT_DIR/backend"

if [ "$USE_SSL" = true ]; then
    nohup ./venv/bin/python -m uvicorn model_server:app \
        --host 0.0.0.0 --port $MODEL_SERVER_PORT \
        --ssl-certfile "$CERT_FILE" --ssl-keyfile "$KEY_FILE" \
        > /tmp/model-server.log 2>&1 &
else
    nohup ./venv/bin/python -m uvicorn model_server:app \
        --host 0.0.0.0 --port $MODEL_SERVER_PORT \
        > /tmp/model-server.log 2>&1 &
fi

MODEL_PID=$!
echo "Model server PID $MODEL_PID"

# Wait for model server health (non-blocking — models load in background)
for i in $(seq 1 15); do
    sleep 1
    if [ "$USE_SSL" = true ]; then
        MODEL_CHECK=$(curl -sk https://127.0.0.1:$MODEL_SERVER_PORT/health -o /dev/null -w "%{http_code}" 2>/dev/null)
    else
        MODEL_CHECK=$(curl -s http://127.0.0.1:$MODEL_SERVER_PORT/health -o /dev/null -w "%{http_code}" 2>/dev/null)
    fi
    if [ "$MODEL_CHECK" = "200" ]; then
        echo "Model server HTTP ready"
        break
    fi
    if ! kill -0 $MODEL_PID 2>/dev/null; then
        echo "Model server process died."
        tail -5 /tmp/model-server.log 2>/dev/null || true
        exit 1
    fi
done

echo ""

# ==================== START BACKEND (5 workers) ====================
BACKEND_PORT_END=$((BACKEND_PORT + 4))
echo "Starting 5 backend workers on ports $BACKEND_PORT-$BACKEND_PORT_END..."
cd "$SCRIPT_DIR/backend"

for __port in $(seq $BACKEND_PORT $BACKEND_PORT_END); do
    if [ "$USE_SSL" = true ]; then
        ENABLE_SUDO_MODE=true nohup ./venv/bin/python -m uvicorn main:app \
            --host 0.0.0.0 --port "$__port" \
            --ssl-certfile "$CERT_FILE" --ssl-keyfile "$KEY_FILE" \
            > /tmp/backend-${__port}.log 2>&1 &
    else
        ENABLE_SUDO_MODE=true nohup ./venv/bin/python -m uvicorn main:app \
            --host 0.0.0.0 --port "$__port" \
            > /tmp/backend-${__port}.log 2>&1 &
    fi
    echo "Worker port $__port → PID $!"
    sleep 1
done

echo "Waiting for backend workers to start..."
BACKEND_STARTED=false
for i in $(seq 1 30); do
    sleep 1
    for __port in $(seq $BACKEND_PORT $BACKEND_PORT_END); do
        if [ "$USE_SSL" = true ]; then
            BACKEND_CHECK=$(curl -sk https://127.0.0.1:$__port/health -o /dev/null -w "%{http_code}" 2>/dev/null)
        else
            BACKEND_CHECK=$(curl -s http://127.0.0.1:$__port/health -o /dev/null -w "%{http_code}" 2>/dev/null)
        fi
        if [ "$BACKEND_CHECK" = "200" ]; then
            BACKEND_STARTED=true
            break 2
        fi
    done
done

if [ "$BACKEND_STARTED" != "true" ]; then
    echo "Backend workers failed to start. Check /tmp/backend-*.log"
    for __port in $(seq $BACKEND_PORT $BACKEND_PORT_END); do
        echo "--- backend-${__port}.log (tail 5) ---"
        tail -5 /tmp/backend-${__port}.log 2>/dev/null || true
    done
    exit 1
fi

echo "Backend OK (ports $BACKEND_PORT-$BACKEND_PORT_END)"

# ==================== ADMIN UI PASSWORD ====================
echo "Setting admin UI password..."
cd "$SCRIPT_DIR/backend"
timeout 15 ./venv/bin/python -c "
import sys; sys.path.insert(0, '.')
from dotenv import load_dotenv; load_dotenv()
import os
from database import SessionLocal
from models import AppSettings
from utils.password_encrypt import encrypt_password
db = SessionLocal()
try:
    rec = db.query(AppSettings).filter(AppSettings.key == 'admin_ui_password').first()
    if rec and rec.value:
        sys.exit(0)
    pass_val = os.environ.get('ADMIN_PASS', '')
    if not pass_val:
        import secrets, string
        pass_val = ''.join(secrets.choice(string.ascii_letters + string.digits) for _ in range(16))
    encrypted = encrypt_password(pass_val)
    if rec:
        rec.value = encrypted
    else:
        db.add(AppSettings(category='general', key='admin_ui_password', value=encrypted))
    db.commit()
    print('Admin UI password saved')
except Exception as e:
    print(f'Admin UI password setup skipped: {e}')
finally:
    db.close()
" 2>&1 | grep -v "^$" || echo "Admin password setup skipped (timeout or error)"
echo "Admin UI will be started by backend on port $ADMIN_UI_PORT"

cd "$SCRIPT_DIR"

# ==================== START FRONTEND ====================
echo "Starting Next.js frontend on port $FRONTEND_PORT..."
cd "$SCRIPT_DIR/frontend"

if [ "$USE_SSL" = true ]; then
    PORT=$FRONTEND_PORT nohup ./node_modules/.bin/next dev \
        --experimental-https \
        --experimental-https-key "$KEY_FILE" \
        --experimental-https-cert "$CERT_FILE" \
        > /tmp/frontend.log 2>&1 &
else
    PORT=$FRONTEND_PORT nohup ./node_modules/.bin/next dev \
        > /tmp/frontend.log 2>&1 &
fi

FRONTEND_PID=$!
cd "$SCRIPT_DIR"

echo "Waiting for frontend to start..."
FRONTEND_STARTED=false
for i in $(seq 1 30); do
    sleep 1
    if [ "$USE_SSL" = true ]; then
        FRONTEND_CHECK=$(curl -sk https://127.0.0.1:$FRONTEND_PORT/login -o /dev/null -w "%{http_code}" 2>/dev/null)
    else
        FRONTEND_CHECK=$(curl -s http://127.0.0.1:$FRONTEND_PORT/login -o /dev/null -w "%{http_code}" 2>/dev/null)
    fi
    if [ "$FRONTEND_CHECK" = "200" ]; then
        FRONTEND_STARTED=true
        break
    fi
    if ! kill -0 $FRONTEND_PID 2>/dev/null; then
        echo "Frontend process died."
        break
    fi
done

if [ "$FRONTEND_STARTED" != "true" ]; then
    echo "Frontend not responding. Check /tmp/frontend.log"
    tail -20 /tmp/frontend.log 2>/dev/null || true
    exit 1
fi

echo "Frontend OK on port $FRONTEND_PORT"

# ==================== CHECK MODEL SERVER STATUS ====================
echo "Model server detail:"
if [ "$USE_SSL" = true ]; then
    curl -sk https://127.0.0.1:$MODEL_SERVER_PORT/health 2>/dev/null | python3 -m json.tool 2>/dev/null || true
else
    curl -s http://127.0.0.1:$MODEL_SERVER_PORT/health 2>/dev/null | python3 -m json.tool 2>/dev/null || true
fi
echo ""

# ==================== OUTPUT ====================
LOCAL_IP=$(hostname -I 2>/dev/null | awk '{print $1}')

echo ""
echo "Application started (dev mode)!"
echo "-------------------------------------------------------"
if [ "$USE_SSL" = true ]; then
    echo "  Frontend:     https://127.0.0.1:$FRONTEND_PORT"
    echo "  Admin UI:     https://127.0.0.1:$ADMIN_UI_PORT"
else
    echo "  Frontend:     http://127.0.0.1:$FRONTEND_PORT"
    echo "  Admin UI:     http://127.0.0.1:$ADMIN_UI_PORT"
fi
MS_PROTO="http"; [ "$USE_SSL" = true ] && MS_PROTO="https"
echo "  Model Server: ${MS_PROTO}://127.0.0.1:$MODEL_SERVER_PORT"
echo "  Backend:      5 workers ($BACKEND_PORT-$BACKEND_PORT_END)"
API_PROTO="http"; [ "$USE_SSL" = true ] && API_PROTO="https"
echo "  API Docs:     ${API_PROTO}://127.0.0.1:$BACKEND_PORT/docs"
if [ -n "$LOCAL_IP" ]; then
    if [ "$USE_SSL" = true ]; then
        echo "  From network: https://$LOCAL_IP:$FRONTEND_PORT"
    else
        echo "  From network: http://$LOCAL_IP:$FRONTEND_PORT"
    fi
fi
echo "-------------------------------------------------------"
echo ""
echo "Default Login: admin / CHANGE_ME"
echo ""
echo "Logs: /tmp/backend.log, /tmp/frontend.log"
echo "Press Ctrl+C to stop all services"
echo ""

wait
