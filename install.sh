#!/bin/bash
# Super Apps - Dependency Installer
# Usage: ./install.sh [--gpu] [--help]
# Supports: Ubuntu 22.04/24.04, CentOS Stream 9/10

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# Keep PM2 state project-local (dump/pids/daemon under super-apps/.pm2), not ~/.pm2.
export PM2_HOME="$SCRIPT_DIR/.pm2"
GPU_MODE=false
SKIP_MODELS=false
NO_START=false
FORCE_RECREATE=false

for arg in "$@"; do
    case "$arg" in
        --gpu) GPU_MODE=true ;;
        --skip-models) SKIP_MODELS=true ;;
        --no-start) NO_START=true ;;
        --force) FORCE_RECREATE=true ;;
        --help|-h)
            echo "Super Apps - Fully Automatic Installer"
            echo ""
            echo "Usage: ./install.sh [options]"
            echo ""
            echo "Options:"
            echo "  --gpu          Install llama-cpp-python with CUDA support"
            echo "  --skip-models  Skip AI model download (~5.8GB)"
            echo "  --no-start     Install only, don't start application"
            echo "  --force        Force recreate venv and node_modules"
            echo "  --help         Show this help"
            echo ""
            echo "Examples:"
            echo "  ./install.sh                    # Full install + start app"
            echo "  ./install.sh --gpu              # GPU mode + start app"
            echo "  ./install.sh --skip-models      # Skip AI download + start app"
            echo "  ./install.sh --no-start         # Install only, manual start later"
            echo ""
            echo "Supports: Ubuntu 22.04/24.04, CentOS Stream 9/10"
            exit 0
            ;;
    esac
done

echo -e "${BLUE}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║      Super Apps - Fully Automatic Installer               ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""

# ── Detect OS ──────────────────────────────────────────────────────────────
detect_os() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        OS_ID="$ID"
        OS_VERSION="$VERSION_ID"
        OS_NAME="$PRETTY_NAME"
    else
        echo -e "${RED}Error: Cannot detect OS. /etc/os-release not found.${NC}"
        exit 1
    fi
}

detect_os
echo -e "${GREEN}Detected OS:${NC} $OS_NAME"
echo ""

# ── Check if running as root ───────────────────────────────────────────────
if [ "$EUID" -eq 0 ]; then
    SUDO=""
else
    if command -v sudo &> /dev/null; then
        SUDO="sudo"
    else
        echo -e "${RED}Error: Not running as root and sudo not available.${NC}"
        exit 1
    fi
fi

# ── Install System Dependencies ────────────────────────────────────────────
install_ubuntu() {
    echo -e "${YELLOW}[1/8] Installing system dependencies (Ubuntu)...${NC}"

    $SUDO apt update -y

    # Python 3.12
    if ! command -v python3.12 &> /dev/null; then
        $SUDO apt install -y software-properties-common
        $SUDO add-apt-repository -y ppa:deadsnakes/ppa
        $SUDO apt update -y
        $SUDO apt install -y python3.12 python3.12-venv python3.12-dev
    else
        echo -e "  ${GREEN}✓${NC} Python 3.12 already installed"
    fi

    # Build tools
    $SUDO apt install -y build-essential cmake git curl lsof openssl \
        libssl-dev libffi-dev libnss3-tools

    # Node.js 20
    if ! command -v node &> /dev/null || [ "$(node -v | cut -d. -f1 | tr -d 'v')" -lt 20 ]; then
        curl -fsSL https://deb.nodesource.com/setup_20.x | $SUDO -E bash -
        $SUDO apt install -y nodejs
    else
        echo -e "  ${GREEN}✓${NC} Node.js $(node -v) already installed"
    fi

    echo -e "  ${GREEN}✓${NC} System dependencies installed"
}

install_centos() {
    echo -e "${YELLOW}[1/8] Installing system dependencies (CentOS)...${NC}"

    $SUDO dnf install -y dnf-plugins-core

    # Python 3.12
    if ! command -v python3.12 &> /dev/null; then
        $SUDO dnf install -y python3.12 python3.12-devel
    else
        echo -e "  ${GREEN}✓${NC} Python 3.12 already installed"
    fi

    # Build tools
    $SUDO dnf install -y gcc gcc-c++ make cmake git curl lsof openssl \
        openssl-devel libffi-devel nss-tools

    # Node.js 20
    if ! command -v node &> /dev/null || [ "$(node -v | cut -d. -f1 | tr -d 'v')" -lt 20 ]; then
        curl -fsSL https://rpm.nodesource.com/setup_20.x | $SUDO bash -
        $SUDO dnf install -y nodejs
    else
        echo -e "  ${GREEN}✓${NC} Node.js $(node -v) already installed"
    fi

    echo -e "  ${GREEN}✓${NC} System dependencies installed"
}

case "$OS_ID" in
    ubuntu|debian) install_ubuntu ;;
    centos|rhel|rocky|almalinux) install_centos ;;
    *)
        echo -e "${RED}Error: Unsupported OS '$OS_ID'.${NC}"
        echo "Supported: Ubuntu 22.04/24.04, CentOS Stream 9/10"
        exit 1
        ;;
esac

echo ""

# ── Setup Python Virtual Environment ───────────────────────────────────────
echo -e "${YELLOW}[2/8] Setting up Python virtual environment...${NC}"

cd "$SCRIPT_DIR/backend"

validate_venv() {
    if [ ! -d "venv" ]; then
        return 1
    fi
    if ! ./venv/bin/python3.12 --version &>/dev/null; then
        echo -e "  ${YELLOW}  venv python broken (shebang mismatch)${NC}"
        return 1
    fi
    if ! ./venv/bin/pip --version &>/dev/null; then
        echo -e "  ${YELLOW}  venv pip broken${NC}"
        return 1
    fi
    return 0
}

if [ "$FORCE_RECREATE" = true ] || ! validate_venv; then
    if [ -d "venv" ]; then
        echo -e "  ${YELLOW}Removing invalid virtual environment...${NC}"
        rm -rf venv
    fi
    python3.12 -m venv venv
    echo -e "  ${GREEN}✓${NC} Virtual environment created"
else
    echo -e "  ${GREEN}✓${NC} Virtual environment already exists and valid"
fi

source venv/bin/activate
pip install --upgrade pip setuptools wheel

echo -e "  ${GREEN}✓${NC} Installing Python packages..."

if [ "$GPU_MODE" = true ]; then
    echo -e "  ${YELLOW}  GPU mode: Installing llama-cpp-python with CUDA...${NC}"
    CMAKE_ARGS="-DGGML_CUDA=on" FORCE_CMAKE=1 pip install llama-cpp-python==0.3.1
    pip install -r requirements.txt
else
    pip install -r requirements.txt
fi

deactivate
echo -e "  ${GREEN}✓${NC} Python packages installed"
echo ""

# ── Setup Frontend ─────────────────────────────────────────────────────────
echo -e "${YELLOW}[3/8] Setting up frontend...${NC}"

cd "$SCRIPT_DIR/frontend"

validate_node_modules() {
    if [ ! -d "node_modules" ]; then
        return 1
    fi
    if ! node --version &>/dev/null; then
        echo -e "  ${YELLOW}  node binary missing${NC}"
        return 1
    fi
    if [ ! -f "node_modules/.package-lock.json" ]; then
        echo -e "  ${YELLOW}  node_modules incomplete (no .package-lock.json)${NC}"
        return 1
    fi
    return 0
}

if [ "$FORCE_RECREATE" = true ] || ! validate_node_modules; then
    if [ -d "node_modules" ]; then
        echo -e "  ${YELLOW}Removing invalid node_modules...${NC}"
        rm -rf node_modules
    fi
    npm install
    echo -e "  ${GREEN}✓${NC} npm packages installed"
else
    echo -e "  ${GREEN}✓${NC} node_modules already exists and valid"
fi

echo -e "  ${YELLOW}  Building frontend for production...${NC}"
npm run build
echo -e "  ${GREEN}✓${NC} Frontend build complete"

echo -e "  ${GREEN}✓${NC} Frontend ready"
echo ""

# ── Install PM2 ────────────────────────────────────────────────────────────
echo -e "${YELLOW}[4/8] Installing PM2...${NC}"

if ! command -v pm2 &> /dev/null; then
    $SUDO npm install -g pm2
    echo -e "  ${GREEN}✓${NC} PM2 installed"
else
    echo -e "  ${GREEN}✓${NC} PM2 already installed"
fi

echo ""

# ── Generate SSL Certificates ──────────────────────────────────────────────
echo -e "${YELLOW}[5/8] Generating SSL certificates...${NC}"

cd "$SCRIPT_DIR"

if [ -f "certs/cert.pem" ] && [ -f "certs/key.pem" ]; then
    echo -e "  ${GREEN}✓${NC} SSL certificates already exist"
else
    mkdir -p certs

    # Try mkcert first, fallback to openssl
    if command -v mkcert &> /dev/null; then
        echo -e "  Using mkcert..."
        LAN_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
        mkcert -install 2>/dev/null || true
        mkcert -cert-file certs/cert.pem -key-file certs/key.pem \
            localhost 127.0.0.1 ::1 "$LAN_IP" 2>/dev/null || {
            echo -e "  ${YELLOW}mkcert failed, falling back to openssl...${NC}"
            openssl req -x509 -newkey rsa:4096 -nodes \
                -keyout certs/key.pem -out certs/cert.pem \
                -days 365 -subj "/CN=localhost" \
                -addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:$LAN_IP"
        }
    else
        echo -e "  Using openssl (self-signed)..."
        LAN_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
        openssl req -x509 -newkey rsa:4096 -nodes \
            -keyout certs/key.pem -out certs/cert.pem \
            -days 365 -subj "/CN=localhost" \
            -addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:$LAN_IP"
    fi

    chmod 600 certs/key.pem
    chmod 644 certs/cert.pem
    echo -e "  ${GREEN}✓${NC} SSL certificates generated"
fi

echo ""

# ── Set Permissions ────────────────────────────────────────────────────────
echo -e "${YELLOW}[6/8] Setting permissions...${NC}"

cd "$SCRIPT_DIR"

# Make scripts executable
chmod +x start-all.sh stop-all.sh start.sh 2>/dev/null || true

# Create logs directory
mkdir -p logs

# Fix DB permissions
for db_file in superapps.db backend/data/superapps.db; do
    [ -f "$db_file" ] && chmod 600 "$db_file"
done

# Create secrets directory
mkdir -p "$HOME/.superapps"
chmod 700 "$HOME/.superapps"

echo -e "  ${GREEN}✓${NC} Permissions set"
echo ""

# ── Download AI Models ─────────────────────────────────────────────────────
if [ "$SKIP_MODELS" = false ]; then
    echo -e "${YELLOW}[7/8] Downloading AI models (~5.8GB, this may take a while)...${NC}"
    
    AI_DIR="$SCRIPT_DIR/backend/data/ai"
    mkdir -p "$AI_DIR"
    
    # Check if models already exist
    if [ -f "$AI_DIR/qwen2.5-1.5b-instruct-q4_k_m.gguf" ] && [ -f "$AI_DIR/qwen2.5-7b-instruct-q4_k_m-00001-of-00002.gguf" ]; then
        echo -e "  ${GREEN}✓${NC} AI models already exist, skipping download"
    else
        echo -e "  ${YELLOW}Downloading Qwen 2.5 1.5B (light model)...${NC}"
        wget -q --show-progress -O "$AI_DIR/qwen2.5-1.5b-instruct-q4_k_m.gguf" \
            "https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf" || {
            echo -e "  ${RED}✗ Failed to download light model${NC}"
            echo -e "  ${YELLOW}You can download manually later or run with --skip-models${NC}"
        }
        
        echo -e "  ${YELLOW}Downloading Qwen 2.5 7B part 1/2 (heavy model)...${NC}"
        wget -q --show-progress -O "$AI_DIR/qwen2.5-7b-instruct-q4_k_m-00001-of-00002.gguf" \
            "https://huggingface.co/Qwen/Qwen2.5-7B-Instruct-GGUF/resolve/main/qwen2.5-7b-instruct-q4_k_m-00001-of-00002.gguf" || {
            echo -e "  ${RED}✗ Failed to download heavy model part 1${NC}"
        }
        
        echo -e "  ${YELLOW}Downloading Qwen 2.5 7B part 2/2 (heavy model)...${NC}"
        wget -q --show-progress -O "$AI_DIR/qwen2.5-7b-instruct-q4_k_m-00002-of-00002.gguf" \
            "https://huggingface.co/Qwen/Qwen2.5-7B-Instruct-GGUF/resolve/main/qwen2.5-7b-instruct-q4_k_m-00002-of-00002.gguf" || {
            echo -e "  ${RED}✗ Failed to download heavy model part 2${NC}"
        }
        
        echo -e "  ${GREEN}✓${NC} AI models downloaded"
    fi
else
    echo -e "${YELLOW}[7/8] Skipping AI models download (--skip-models)${NC}"
fi

echo ""

# ── Validate Encryption Key ─────────────────────────────────────────────────
echo -e "${YELLOW}[7.5/8] Validating encryption key...${NC}"

ENCRYPTION_KEY_FILE="$HOME/.superapps/encryption.key"

if [ -f "$ENCRYPTION_KEY_FILE" ]; then
    if python3 -c "
import base64, sys
key = open('$ENCRYPTION_KEY_FILE').read().strip()
decoded = base64.urlsafe_b64decode(key.encode())
assert len(decoded) == 32
" 2>/dev/null; then
        echo -e "  ${GREEN}✓${NC} Encryption key valid"
    else
        echo -e "  ${YELLOW}  Key format invalid (possible double-encoding)${NC}"
        cd "$SCRIPT_DIR/backend"
        source venv/bin/activate
        
        ENCRYPTED_COUNT=$(python3 -c "
import sqlite3, os
db_path = os.path.join('$SCRIPT_DIR', 'backend', 'data', 'superapps.db')
if os.path.exists(db_path):
    conn = sqlite3.connect(db_path)
    count = conn.execute('SELECT COUNT(*) FROM asset_users WHERE password_encrypted IS NOT NULL').fetchone()[0]
    conn.close()
    print(count)
else:
    print(0)
" 2>/dev/null || echo "0")
        
        if [ "$ENCRYPTED_COUNT" -gt 0 ] 2>/dev/null; then
            echo -e "  ${YELLOW}  Found $ENCRYPTED_COUNT encrypted records — running automatic migration...${NC}"
            echo "yes" | python3 "$SCRIPT_DIR/backend/scripts/migrate_encryption_key.py" 2>&1 || {
                echo -e "  ${RED}✗ Encryption migration failed${NC}"
                deactivate
                cd "$SCRIPT_DIR"
                exit 1
            }
            echo -e "  ${GREEN}✓${NC} Encryption key migration completed"
        else
            echo -e "  ${YELLOW}  No encrypted data found — removing broken key${NC}"
            rm -f "$ENCRYPTION_KEY_FILE"
            echo -e "  ${GREEN}✓${NC} Broken key removed (will auto-generate on next start)"
        fi
        
        deactivate
        cd "$SCRIPT_DIR"
    fi
else
    echo -e "  ${GREEN}✓${NC} No existing key (will be auto-generated on start)"
fi

echo ""

# ── Start Application ─────────────────────────────────────────────────────
if [ "$NO_START" = false ]; then
    echo -e "${YELLOW}[8/8] Starting application (PM2 production mode)...${NC}"
    
    cd "$SCRIPT_DIR"
    
    # Start the application with PM2
    ./start.sh --prod
    
    # Setup PM2 to start on boot
    echo -e "  ${YELLOW}Setting up PM2 startup (auto-restart on boot)...${NC}"
    pm2 startup 2>/dev/null || {
        echo -e "  ${YELLOW}PM2 startup setup skipped (may require manual setup)${NC}"
    }
    
    echo -e "  ${GREEN}✓${NC} Application started with PM2 and configured for auto-start on boot"
else
    echo -e "${YELLOW}[8/8] Skipping application start (--no-start)${NC}"
    echo -e "  ${BLUE}Run './start.sh --prod' to start the application with PM2${NC}"
fi

echo ""

# ── Done ───────────────────────────────────────────────────────────────────
LAN_IP=$(hostname -I 2>/dev/null | awk '{print $1}')

echo -e "${BLUE}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║              ✅ Installation Complete!                    ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""

if [ "$NO_START" = false ]; then
    echo -e "${GREEN}Application is running with PM2!${NC}"
    echo ""
    echo -e "${GREEN}Access:${NC}"
    echo "  Local:    https://localhost:3443"
    [ -n "$LAN_IP" ] && echo "  Network:  https://$LAN_IP:3443"
    echo ""
    echo -e "${GREEN}PM2 Management Commands:${NC}"
    echo "  Status:   pm2 status"
    echo "  Logs:     pm2 logs"
    echo "  Restart:  pm2 restart all"
    echo "  Monitor:  pm2 monit"
    echo "  Stop:     ./stop-all.sh"
else
    echo -e "${GREEN}Installation complete!${NC}"
    echo ""
    echo -e "${GREEN}Start the application with PM2:${NC}"
    echo "  ./start.sh --prod"
    echo ""
    echo -e "${GREEN}After starting, access:${NC}"
    echo "  Local:    https://localhost:3443"
    [ -n "$LAN_IP" ] && echo "  Network:  https://$LAN_IP:3443"
fi

echo ""
echo -e "${YELLOW}First login: user 'admin' — set/change the admin password immediately after first login.${NC}"
echo ""

if [ "$NO_START" = false ]; then
    echo -e "${BLUE}PM2 is configured to auto-start on boot${NC}"
    echo "  To disable: pm2 unstartup"
    echo ""
    echo -e "${BLUE}Useful PM2 commands:${NC}"
    echo "  pm2 status          - Check service status"
    echo "  pm2 logs            - View logs"
    echo "  pm2 restart all     - Restart all services"
    echo "  pm2 monit           - Monitor services"
else
    echo -e "${BLUE}To start with PM2:${NC}"
    echo "  ./start.sh --prod"
    echo ""
    echo -e "${BLUE}Then setup PM2 to start on boot:${NC}"
    echo "  pm2 startup"
    echo "  pm2 save"
fi

echo ""
