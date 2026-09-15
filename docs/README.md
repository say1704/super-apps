# super-apps — IT Management System

Aplikasi manajemen IT terintegrasi untuk monitoring aset, risiko, kualitas, backup, dan analitik dengan AI asisten.

## Tech Stack

- **Frontend**: Next.js 16 (App Router), TypeScript, Tailwind CSS, Tremor, Tremor Raw, shadcn/ui
- **Backend**: Python 3.12, FastAPI, SQLAlchemy 2.0, APScheduler
- **Database**: SQLite 3 (WAL mode, 64MB cache)
- **AI/ML**: llama-cpp-python (Qwen 2.5 7B/1.5B), sentence-transformers (gte-Qwen2), scikit-learn, Prophet
- **Proxy/Server**: Node.js custom HTTPS server (JWT auth, rate limiting, audit log)
- **Admin UI**: sqlite-web (password auth, single-port via proxy)
- **Deployment**: PM2, mkcert SSL, 5 backend workers

## Quick Start

1. Clone repo
2. `python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt`
3. `cd frontend && npm install`
4. `bash start.sh` (dev) atau `bash start-all.sh` (prod)
5. Buka `https://localhost:3443` — HTTP port 3001 auto redirect ke HTTPS

## Arsitektur Singkat

```
Browser ──HTTPS──› Next.js (3443) ──HTTPS──› Backend (8001-8005)
    │               └──/admin-ui──› sqlite-web (8082, HTTP localhost)
    └──HTTP 3001──› 301 redirect ke HTTPS 3443
Backend ──HTTPS──› Model Server (8081)
```

- 5 backend workers load-balanced dengan IP-hash sticky session
- Semua internal service pakai HTTPS (self-signed cert)
- HTTP port 80 → 301 redirect ke HTTPS port 443
- AI model server HTTPS dengan verify=False untuk self-signed

## Daftar Modul (26)

- **Auth**: login, 2FA OTP email, RBAC, session management
- **Dashboard**: widgets, charts, KPI, recent activity
- **Assets**: IT asset lifecycle (server, network, software, lisensi, database, cloud)
- **Purchasing**: procurement, vendor, PO, GRN
- **Risk Management**: risk register, assessment, treatment, KRIs
- **Quality Management**: QMS, audit, CAPA, document control, KPI
- **Backup & DR**: schedule, restore, retention, verification
- **AI Assistant**: multi-intent chatbot, RAG, wizard, workflows
- **Audit Trail**: activity log, changes, user tracking
- **Network Monitoring**: device, interface, bandwidth, alerts
- **Maintenance**: preventive, corrective, scheduler
- **Service Desk**: ticket, SLA, priorities, categories
- **Project Management**: project, task, milestone, Gantt
- **Contract Management**: contract lifecycle, renewal alerts
- **Compliance**: regulation, mapping, assessment
- **Finance**: budget, cost center, approval
- **Reports**: built-in + ad-hoc report builder
- **Notifications**: email, in-app, alert rules
- **Help**: knowledge base, FAQ, user guide
- **Settings**: user management, roles, system config, backup
- dan seterusnya hingga 26 modul.

## Struktur Direktori

```
super-apps/
├── backend/          # FastAPI backend
│   ├── api/          # Route handlers (38 files)
│   ├── models/       # SQLAlchemy models
│   ├── utils/        # Utilities (48 files)
│   ├── main.py       # Entry point
│   └── ...
├── frontend/         # Next.js frontend
│   ├── app/          # Pages & API routes
│   ├── components/   # Shared components
│   ├── lib/          # Auth context, helpers
│   └── server.js     # Custom HTTPS proxy server
├── docs/             # Dokumentasi
├── certs/            # SSL certificates
├── start-all.sh      # Production startup (PM2)
├── stop-all.sh       # Stop all services (PM2)
├── restart-all.sh    # Restart all services (PM2)
├── ecosystem.config.js  # PM2 config
└── ...
```

## Process Management (PM2)

Super Apps menggunakan PM2 untuk process management. Lihat [PM2 Management Guide](./11-pm2-management.md) untuk detail lengkap.

### Quick Commands

```bash
# Start all services
./start-all.sh

# Stop all services
./stop-all.sh

# Restart all services
./restart-all.sh

# View status
pm2 status

# View logs
pm2 logs
```

### Auto-Start on Boot

Setup PM2 untuk auto-start saat server boot:

```bash
# Generate startup script
pm2 startup

# Execute the output command (example):
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u $USER --hp /home/$USER

# Save process list
pm2 save
```

## Dokumentasi

- [Architecture](./01-architecture.md)
- [Deployment](./02-deployment.md)
- [Security](./03-security.md)
- [Database](./04-database.md)
- [API Reference](./05-api-reference.md)
- [Modules](./06-modules.md)
- [AI System](./07-ai-system.md)
- [Frontend](./08-frontend.md)
- [Backend](./09-backend.md)
- [Troubleshooting](./10-troubleshooting.md)
- [PM2 Management](./11-pm2-management.md)
- [AI Insights (Deteksi Anomali)](./12-ai-insights.md)
- [Lessons Learned](./13-lessons-learned.md)
- [Migration Guide](./migration-guide.md)
