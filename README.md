# Super Apps — IT Management System

Internal IT management platform: asset & capacity monitoring, iRMC checks, backup
verification & analytics, vulnerability/incident/risk/quality (ISMS) tracking, log
maintenance, worklog/tasks, documentation, and an on-prem AI assistant.

- **Frontend:** Next.js (production build, served over HTTPS on `:3443`)
- **Backend:** FastAPI / uvicorn — **5 workers** on `:8001`–`:8005` (SQLite, WAL)
- **AI model server:** llama.cpp (Qwen) on `:8081`
- **Process manager:** PM2 (`ecosystem.config.js`)

## Architecture notes

- All API traffic flows through the Next.js proxy (`frontend/app/api/proxy/`), which
  **load-balances across the 5 backend workers** with per-browser sticky sessions;
  auth, AI, and SSE paths are pinned to the first worker. Tune the pool via
  `BACKEND_URLS`.
- Backend workers bind `127.0.0.1` only; the LAN-facing entrypoint is the frontend on
  `:3443` (LAN IP auto-detected for CORS/allowed-hosts).

### Verify load balancing

`scripts/lb-check.sh` confirms the proxy is distributing traffic (reads the frontend
proxy log; non-destructive by default):

```bash
./scripts/lb-check.sh              # distribution, pinning, sticky-cookie assignment
./scripts/lb-check.sh --failover   # also stops one worker, checks fail-over, restarts it
```

Checks: cookie `sa_worker=n` routes to worker `n`; `/ai/*` and `/token` stay pinned to
worker-1; new clients get a `sa_worker` cookie. Exits non-zero if any check fails
(CI/cron friendly).

## Setup

### Quick install (recommended)

One command handles system deps, Python venv, frontend build, PM2, TLS certs, and
AI model download (Ubuntu 22.04/24.04, CentOS Stream 9/10):

```bash
./install.sh              # full install + start
./install.sh --help       # options: --gpu, --skip-models, --no-start, --force
```

### Manual setup

```bash
# 1. Backend deps (Python venv)
cd backend && python3 -m venv venv && ./venv/bin/pip install -r requirements.txt

# 2. Frontend deps + build
cd ../frontend && npm install && npm run build

# 3. TLS certs (self-signed for local/LAN)
../scripts/generate-cert.sh

# 4. Start everything (PM2)
cd .. && npx pm2 start ecosystem.config.js
```

## Secrets & configuration

No secrets are committed. Provide them locally (all git-ignored):

- **`MODEL_SERVER_API_KEY`** — shared backend↔model-server key. Auto-generated into
  `backend/.superapps/model_server.key` on first start, or set via the env var.
- **`backend/.env`** — see `backend/.env.example`.
- **TLS** — `certs/` (generated, not committed).
- Runtime data (`backend/data/`, SQLite DB, `backend/logs/`) is git-ignored.

## Tests (Playwright E2E)

Credentials come from environment variables — never hardcoded:

```bash
SA_ADMIN_USER=admin SA_ADMIN_PASS='***' \
SA_USER=soni SA_USER_PASS='***' \
  npx playwright test -c playwright.admin-setting.config.ts
```
