# Arsitektur Sistem

## Service Topology

```
┌─────────────────────────────────────────────────────────────┐
│                          Browser                              │
│                    https://localhost:3443                       │
│                           │ atau                                │
│                    http://localhost:3001                        │
│                           │ 301 redirect                        │
└──────────────────────┬──────────────────────────────────────┘
                       ▼
┌──────────────────────────────────────────────────────────────┐
│              Node.js Custom Server (server.js)                │
│  Port 3443 (HTTPS) / 3001 (HTTP → HTTPS redirect)            │
│  Fallback dev: port 3001 (HTTP, no SSL — jika tidak ada cert) │
│                                                              │
│  Features:                                                   │
│  • JWT verification (cookie/header)                          │
│  • Rate limiting (30 req/min per IP)                         │
│  • Audit logging (timestamp, IP, method, path, status)       │
│  • /admin-ui proxy → sqlite-web (8082)                       │
│  • HTTP 301 redirect → HTTPS (HSTS header)                   │
│  • / → Next.js request handler                               │
└──────┬───────────────────────────────────────────────────────┘
       │                             │
       ▼                             ▼
┌─────────────────┐     ┌─────────────────────────┐
│  Next.js App     │     │  sqlite-web (Admin UI)  │
│  (App Router)    │     │  Port 8082 (HTTP)       │
│                  │     │  • Password auth (-P)   │
│                  │     │  • Prefix /admin-ui     │
│                  │     │  • localhost-only       │
└────────┬─────────┘     └─────────────────────────┘
         │ HTTPS (localhost only)
         ▼
┌─────────────────────────────────────────────────────────────┐
│              Backend Workers (PM2, 5 instances)               │
│  Ports 8001-8005 (sticky session via IP hash)                │
│                                                              │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌───────┐ │
│  │ Worker 1│ │ Worker 2│ │ Worker 3│ │ Worker 4│ │Wkr 5  │ │
│  │ :8001   │ │ :8002   │ │ :8003   │ │ :8004   │ │:8005  │ │
│  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘ └───┬───┘ │
│       │           │           │           │           │      │
│       └───────────┴───────────┴───────────┴───────────┘      │
│                    Shared SQLite Database                     │
└────────┬──────────────────────────────────────────────────────┘
         │ HTTPS (localhost, self-signed)
         ▼
┌──────────────────────────────────────────────────────────────┐
│                AI Model Server (model_server.py)              │
│  Port 8081 (HTTPS)                                           │
│                                                              │
│  • Light model: Qwen 2.5 1.5B (chat, intent, wizard)         │
│  • Heavy model: Qwen 2.5 7B (complex reasoning, workflows)   │
│  • Embedder: gte-Qwen2 (RAG embeddings)                      │
│  • Shared context: 8192 tokens                                │
│  • Batch inference, streaming SSE                             │
│  • SSL self-signed cert (verify=False in client)              │
└──────────────────────────────────────────────────────────────┘
```

## Port Mapping

| Service | Port | Protocol | Keterangan |
|---------|------|----------|------------|
| Frontend (HTTPS) | 3443 | HTTPS | Server.js custom, primary |
| Frontend (HTTP redirect) | 3001 | HTTP | 301 redirect ke HTTPS |
| Frontend (dev fallback) | 3001 | HTTP | Development tanpa SSL |
| Backend Worker 1 | 8001 | HTTPS | Sticky session, SSL |
| Backend Worker 2 | 8002 | HTTPS | Sticky session, SSL |
| Backend Worker 3 | 8003 | HTTPS | Sticky session, SSL |
| Backend Worker 4 | 8004 | HTTPS | Sticky session, SSL |
| Backend Worker 5 | 8005 | HTTPS | Sticky session, SSL |
| Model Server | 8081 | HTTPS | AI LLM, self-signed SSL |
| sqlite-web | 8082 | HTTP | Admin UI (localhost only) |

## Data Flow

**Request Flow (non-AI):**

1. Browser → HTTPS port 443 (atau HTTP port 80 → 301 redirect) → server.js
2. server.js verifikasi JWT cookie/header
3. Jika valid, forward ke Next.js handler
4. Next.js render page atau panggil API route
5. API route panggil backend worker (https://127.0.0.1:800X)
6. Backend query SQLite, return response
7. Response balik ke browser

**AI Request Flow:**

1. Chat message → backend → AI bridge
2. AI bridge panggil model server via HTTPS (https://127.0.0.1:8081)
3. Model server: intent classification → RAG fetch → LLM inference
4. Jika perlu data, AI wizard collect data → generate response
5. Streaming response via SSE ke frontend

**Admin UI Flow:**

1. Browser → /admin-ui → server.js (via port 443 HTTPS atau 80 redirect)
2. server.js verifikasi JWT (sama seperti regular request)
3. Proxy ke http://127.0.0.1:8082/admin-ui/ (HTTP internal, localhost-only)
4. sqlite-web auth via password (-P)
5. Database langsung file SQLite

## Database Architecture

- SQLite single-file (`backend/app.db`) dengan WAL mode
- Concurrent writes di-handle oleh WAL + retry logic
- Semua worker share file DB yang sama
- Migration: 34 file di `backend/migrations/`
- Backup: scheduled harian via APScheduler + PM2 cron
- WAL checkpoint setiap 1000 operasi

## PM2 Process Management

| Process Name | Mode | Instances | Memory Limit |
|-------------|------|-----------|-------------|
| backend | fork | 5 (clustered via IP hash) | 4GB per instance |
| frontend | fork | 1 | 2GB |
| model-server | fork | 1 | 8GB |
| sqlite-web | fork | 1 | 512MB |
| **Total** | | **8** | **~40.5 GB** |

## Staggered Restart Strategy

Backend workers di-restart bergantian (interval 3 detik) untuk zero-downtime. Urutan: 8001 → 8004 → 8002 → 8005 → 8003.
