#!/bin/bash
DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR="$DIR/logs"
mkdir -p "$LOG_DIR"

# Shared helper for Admin UI (sqlite-web) lifecycle
source "$DIR/admin-ui.sh"

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    echo "❌ PM2 is not installed. Install with: npm install -g pm2"
    exit 1
fi

echo "🚀 Starting Super Apps with PM2..."
echo ""

# Stop existing PM2 processes (clean start)
echo "📋 Stopping existing PM2 processes..."
pm2 stop ecosystem.config.js 2>/dev/null || true
pm2 delete ecosystem.config.js 2>/dev/null || true
sleep 1

# Clean up any leftover sqlite-web (Admin UI) — not managed by PM2
stop_sqlite_web

# Set file permissions for database
for db_file in "$DIR/superapps.db" "$DIR/backend/data/superapps.db"; do
  [ -f "$db_file" ] && chmod 600 "$db_file"
done

# Auto-detect LAN IP and subnet for network access
LAN_IP=$(ip route get 8.8.8.8 2>/dev/null | grep -oP 'src \K[^ ]+')
if [ -z "$LAN_IP" ]; then
    LAN_IP=$(hostname -I 2>/dev/null | tr ' ' '\n' | grep -v '^172\.' | grep -v '^10\.' | head -1)
fi
if [ -z "$LAN_IP" ]; then
    LAN_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
fi
LAN_SUBNET=$(echo "$LAN_IP" | cut -d. -f1-3).0/24

# Export environment variables (will be inherited by PM2)
export COOKIE_SECURE="true"
export MODEL_SERVER_URL="https://127.0.0.1:8081"
export ENABLE_SUDO_MODE="true"
export CORS_ORIGINS="https://localhost:3443,https://127.0.0.1:3443,https://${LAN_IP}:3443"
export CORS_SUBNET="$LAN_SUBNET"
export APP_URL="https://localhost:3443"
export ALLOWED_HOSTS="localhost,127.0.0.1,${LAN_IP}"
export NODE_ENV="production"
export NODE_EXTRA_CA_CERTS="$DIR/certs/rootCA.pem"

# Auto-generate SECRET_KEY if not set — backend loads from backend/.superapps/secret.key
SECRET_KEY_FILE="$DIR/backend/.superapps/secret.key"
if [ -z "$SECRET_KEY" ]; then
    if [ ! -f "$SECRET_KEY_FILE" ]; then
        SECRET_KEY=$(openssl rand -base64 48 2>/dev/null || python3 -c "import secrets; print(secrets.token_urlsafe(48))")
        mkdir -p "$(dirname "$SECRET_KEY_FILE")"
        echo "$SECRET_KEY" > "$SECRET_KEY_FILE"
        chmod 600 "$SECRET_KEY_FILE"
        echo "🔑 Auto-generated SECRET_KEY — saved to $SECRET_KEY_FILE"
    else
        echo "🔑 SECRET_KEY file exists at $SECRET_KEY_FILE (loaded by backend)"
    fi
fi

# Auto-generate ASSET_ENCRYPTION_KEY if not set — backend loads from backend/.superapps/encryption.key
ENCRYPTION_KEY_FILE="$DIR/backend/.superapps/encryption.key"
if [ -z "$ASSET_ENCRYPTION_KEY" ]; then
    if [ ! -f "$ENCRYPTION_KEY_FILE" ]; then
        ASSET_ENCRYPTION_KEY=$(python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())" 2>/dev/null)
        if [ -z "$ASSET_ENCRYPTION_KEY" ]; then
            ASSET_ENCRYPTION_KEY=$(python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())")
        fi
        mkdir -p "$(dirname "$ENCRYPTION_KEY_FILE")"
        echo "$ASSET_ENCRYPTION_KEY" > "$ENCRYPTION_KEY_FILE"
        chmod 600 "$ENCRYPTION_KEY_FILE"
        echo "🔐 Auto-generated ASSET_ENCRYPTION_KEY — saved to $ENCRYPTION_KEY_FILE"
    else
        echo "🔐 ASSET_ENCRYPTION_KEY file exists at $ENCRYPTION_KEY_FILE (loaded by backend)"
    fi
fi

echo ""
echo "📦 Starting all services via PM2..."
pm2 start ecosystem.config.js

# Wait for services to start
echo ""
echo "⏳ Waiting for services to initialize..."

# Health checks
health_checks

# Show PM2 status
echo ""
echo "📊 PM2 Status:"
pm2 status

# Show access URLs
print_summary_banner
echo ""
echo "📝 Useful PM2 commands:"
echo "  pm2 status              - Show all processes"
echo "  pm2 logs                - View logs (all apps)"
echo "  pm2 logs <app-name>     - View logs (specific app)"
echo "  pm2 monit               - Real-time monitoring"
echo "  pm2 restart all         - Restart all services"
echo "  ./stop-all.sh           - Stop all services"
echo ""
echo "🛑 Stop all: $DIR/stop-all.sh"
