# Deployment Guide

## Quick Deploy (Rsync + Install Script)

Cara tercepat deploy di server baru:

### Di Server Lama (Source)

```bash
# Rsync ke server baru (exclude folder yang akan di-regenerate)
rsync -avz \
  --exclude='backend/venv' \
  --exclude='frontend/node_modules' \
  --exclude='.next' \
  /path/to/super-apps/ user@server:/opt/super-apps/
```

### Di Server Baru (Target)

```bash
cd /opt/super-apps

# Fully automatic install (download AI models + start app)
./install.sh

# Optional flags:
./install.sh --gpu              # GPU mode untuk AI acceleration
./install.sh --skip-models      # Skip AI model download (~5.8GB)
./install.sh --no-start         # Install only, tidak start aplikasi
./install.sh --help             # Show all options
```

**Install Script mendukung:**
- Ubuntu 22.04 / 24.04
- CentOS Stream 9 / 10

**Yang diinstall otomatis:**
1. Python 3.12 + virtual environment
2. Node.js 20 + npm
3. Build tools (gcc, cmake, dll)
4. PM2 (process manager)
5. SSL certificates (self-signed)
6. Python dependencies (requirements.txt)
7. Node dependencies (npm install)
8. **Frontend production build** (npm run build)
9. **AI Models** (~5.8GB dari HuggingFace)
10. **Start application with PM2** + auto-start on boot

> **Catatan:** `install.sh` adalah fully automatic installer. Setelah selesai, aplikasi langsung running dengan PM2 dan akan auto-restart jika server reboot.

> **Penting:** Saat rsync, **exclude** folder `backend/venv`, `frontend/node_modules`, dan `.next` — folder ini akan di-regenerate oleh `install.sh` di server baru.

---

## Manual Setup

Jika prefer setup manual atau OS tidak didukung:

### Prerequisites

- Python 3.12+
- Node.js 20+
- npm
- mkcert (untuk SSL lokal)
- PM2 (`npm install -g pm2`)
- Git

## Step-by-Step Setup

### 1. Clone & Environment

```bash
git clone <repo-url> super-apps
cd super-apps
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

### 2. Frontend Dependencies

```bash
cd frontend
npm install
```

### 3. SSL Certificates (Self-Signed)

Script akan otomatis mendeteksi LAN IPs dan memasukkannya ke certificate:

```bash
bash scripts/generate-cert.sh
```

Atau manual:

```bash
mkdir -p certs
mkcert -install
mkcert -key-file certs/key.pem -cert-file certs/cert.pem localhost 127.0.0.1 ::1 192.168.x.x
```

### 4. Environment Variables

Buat `.env` di root:

```bash
# Security
SECRET_KEY=generate-random-64-chars-hex
ASSET_ENCRYPTION_KEY=generate-random-44-chars-base64
OTP_ENCRYPTION_KEY=generate-random-44-chars-base64
SESSION_SECRET=generate-random-string

# Database
DATABASE_URL=sqlite:///./app.db

# Production (wajib diisi untuk production)
APP_URL=https://your-server-ip-or-domain
CORS_ORIGINS=https://your-server-ip-or-domain,https://www.your-domain.com
NODE_ENV=production

# AI Model
MODEL_PATH=../models
LIGHT_MODEL=Qwen2.5-1.5B-Instruct-Q4_K_M.gguf
HEAVY_MODEL=Qwen2.5-7B-Instruct-Q4_K_M.gguf

# Email (SMTP untuk OTP & notifikasi)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
EMAIL_FROM=noreply@example.com

# SSH untuk server monitoring
SSH_USER=monitor
SSH_KEY_PATH=~/.ssh/id_rsa
```

> **Catatan:** `APP_URL` dan `CORS_ORIGINS` **wajib** diisi untuk production. Jika tidak diisi, backend akan error saat startup.

### 5. Database Migration

Migration otomatis dijalankan saat startup. Tidak perlu perintah manual.

Jika perlu reset database:
```bash
rm backend/data/superapps.db
./start-all.sh  # akan create fresh database + run all migrations
```

### 6. Download AI Models

Letakkan model GGUF di `models/`:

- Qwen2.5-1.5B-Instruct-Q4_K_M.gguf (light)
- Qwen2.5-7B-Instruct-Q4_K_M.gguf (heavy)
- gte-Qwen2 embedding model

Update path di `config/ai.yaml` jika perlu.

## Startup & Shutdown

**Development Mode:**

```bash
bash start.sh
```

Menjalankan backend worker (single) + frontend dev server di `http://localhost:3001`.

**Production Mode (Recommended - PM2):**

```bash
bash start.sh --prod
```

Menjalankan semua service via PM2 (5 backend workers, frontend, model server).

Akses: `https://IP:3443` — HTTP port 3001 auto redirect ke HTTPS.

**Alternative Production Mode (nohup):**

```bash
bash start-all.sh
```

Menjalankan semua service via nohup (tanpa PM2). Gunakan ini hanya jika PM2 tidak tersedia atau untuk testing cepat.

**Stop:**

```bash
bash stop-all.sh
```

Script ini akan otomatis stop semua PM2 services jika PM2 tersedia. Jika PM2 tidak tersedia, akan fallback ke stop by port.

**PM2 Management:**

```bash
pm2 status                # check semua service
pm2 restart all           # restart semua
pm2 restart backend       # restart all 5 workers (staggered)
pm2 restart frontend      # restart frontend server
pm2 restart model-server  # restart AI model
pm2 logs                  # view all logs
pm2 logs backend          # tail backend logs
pm2 monit                 # monitoring dashboard
pm2 save                  # save current state
pm2 startup               # auto-start on boot
pm2 unstartup             # disable auto-start
```

## Memory Management

Per-service memory limits di PM2 config (ecosystem.config.js):

- Backend worker (x5): 5GB max each
- Frontend: 512MB max
- Model server: 10GB max

Pantau dengan `pm2 monit` atau `pm2 status`.

## SSL & Certificates

- **Self-signed via mkcert** — untuk development dan internal network
- **Production external** — ganti dengan Let's Encrypt atau internal CA
- Port 3443/3001 tidak butuh root privileges (non-privileged ports)
- Semua service pakai SSL:
  - Frontend: HTTPS port 3443 (Node.js server.js)
  - HTTP redirect: port 3001 → 301 redirect ke HTTPS
  - Backend workers: HTTPS port 8001-8005 (localhost only)
  - Model server: HTTPS port 8081 (localhost only)
  - sqlite-web: HTTP localhost-only (di belakang auth proxy)
- Self-signed cert → `verify=False` di client HTTP (internal)

## Backup & Restore

**Database Backup:**

```bash
# Manual
cp backend/app.db backend/backups/app.db.$(date +%Y%m%d_%H%M%S)

# Otomatis (via scheduler)
# Setiap hari jam 02:00, retention 30 hari
```

**Restore:**

```bash
# Stop semua service
bash stop-all.sh

# Backup dulu DB yang rusak
cp backend/app.db backend/app.db.corrupted

# Copy backup
cp backend/backups/app.db.20260101_020000 backend/app.db

# Restart
bash start-all.sh
```

## Disaster Recovery

1. Semua service crash: `bash start-all.sh` (auto-restart via PM2)
2. DB corruption: restore dari backup terakhir
3. Model server gagal: AI fallback ke "maaf, sedang tidak tersedia"
4. Frontend down: backend masih bisa diakses langsung via port 8001 (HTTPS)
5. SSL cert expired: regenerate `bash scripts/generate-cert.sh` + restart service

## Logs

Semua log terpusat di PM2:

```bash
pm2 logs                      # semua service
pm2 logs backend --lines 100  # 100 baris terakhir backend
pm2 logs frontend             # frontend logs (include audit trail)
pm2 logs model-server         # AI model logs
```

Log individual juga ada di:

- `backend/logs/` — debug, error, access logs per worker
- `frontend/.next/logs/` — Next.js logs
- PM2 logs di `~/.pm2/logs/`

---

## Install Script Details

`install.sh` adalah **fully automatic installer** yang menangani semua setup dari nol sampai aplikasi running.

### Supported OS

| OS | Versions |
|----|----------|
| Ubuntu Server | 22.04, 24.04 |
| CentOS Stream | 9, 10 |

### Usage

```bash
# Basic install (CPU-only AI, auto-start)
./install.sh

# GPU mode (CUDA acceleration)
./install.sh --gpu

# Skip AI model download (~5.8GB)
./install.sh --skip-models

# Install only, don't start application
./install.sh --no-start

# Combine flags
./install.sh --gpu --skip-models --no-start

# Show help
./install.sh --help
```

### What Gets Installed

**System packages:**
- Python 3.12 + venv + dev headers
- Node.js 20.x + npm
- Build tools (gcc, g++, cmake, make)
- OpenSSL, libffi, git, curl, lsof

**Python packages:**
- All dependencies from `backend/requirements.txt`
- llama-cpp-python (CPU or CUDA depending on --gpu flag)
- PyTorch + sentence-transformers for AI

**Node packages:**
- All dependencies from `frontend/package.json`
- PM2 (process manager)

**SSL certificates:**
- Auto-generate self-signed cert via openssl
- Covers: localhost, 127.0.0.1, LAN IP

**AI Models (auto-download from HuggingFace):**
- Qwen 2.5 1.5B Instruct (light model, ~1.1GB)
- Qwen 2.5 7B Instruct (heavy model, ~4.7GB in 2 parts)
- Embedder model (MiniLM, auto-downloaded by sentence-transformers)

**Application:**
- Auto-start via `start-all.sh`
- PM2 configured for auto-start on boot
- All services managed by PM2

### Installation Flow

```
[1/8] Installing system dependencies...
[2/8] Setting up Python virtual environment...
[3/8] Setting up frontend...
[4/8] Installing PM2...
[5/8] Generating SSL certificates...
[6/8] Setting permissions...
[7/8] Downloading AI models... (optional, can skip with --skip-models)
[8/8] Starting application (PM2 production mode)...
      Setting up PM2 startup...

✅ Installation Complete!
Application is running with PM2!
```

### After Installation

**If started automatically (default):**
```bash
pm2 status              # check all services
pm2 logs                # view logs
pm2 restart all         # restart all services
pm2 monit               # monitor services
./stop-all.sh           # stop all services
```

**If installed with --no-start:**
```bash
./start.sh --prod       # start application with PM2
pm2 startup             # setup auto-start on boot
```

### Manual Install (Unsupported OS)

Jika OS tidak didukung, install manual:

```bash
# Python 3.12
sudo apt install python3.12 python3.12-venv python3.12-dev  # Ubuntu
sudo dnf install python3.12 python3.12-devel                # CentOS

# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install nodejs

# Build tools
sudo apt install build-essential cmake libssl-dev libffi-dev  # Ubuntu
sudo dnf install gcc gcc-c++ make cmake openssl-devel libffi-devel  # CentOS

# PM2
sudo npm install -g pm2

# Python venv
cd backend
python3.12 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Frontend
cd ../frontend
npm install
npm run build

# SSL cert
cd ..
mkdir -p certs
openssl req -x509 -newkey rsa:4096 -nodes \
  -keyout certs/key.pem -out certs/cert.pem \
  -days 365 -subj "/CN=localhost"

# Start
./start-all.sh
```
