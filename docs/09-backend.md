# Backend Documentation

## Directory Structure

```
backend/
├── main.py                          # FastAPI entry point, middleware, startup
├── database.py                      # SQLAlchemy engine & session
├── models.py                        # All SQLAlchemy models (50+)
├── models/                          # Split models (jika ada)
├── api/                             # Route handlers (38 files)
│   ├── auth.py                      # Login, logout, OTP, password
│   ├── users.py                     # User & role management
│   ├── assets.py                    # Asset CRUD
│   ├── asset_server.py              # Server-specific operations
│   ├── asset_network.py             # Network-specific operations
│   ├── purchasing.py                # PO, vendor, GRN
│   ├── risk.py                      # Risk register, assessment
│   ├── quality.py                   # QMS, audit, CAPA
│   ├── backup.py                    # Backup jobs, DR
│   ├── ai_chat.py                   # AI chat endpoint (SSE)
│   ├── ai_wizard.py                 # AI wizard endpoint
│   ├── ai_workflow.py               # AI workflow endpoint
│   ├── network.py                   # Network monitoring
│   ├── maintenance.py               # Maintenance schedule
│   ├── service_desk.py              # Ticket management
│   ├── projects.py                  # Project management
│   ├── contracts.py                 # Contract management
│   ├── compliance.py                # Compliance & regulation
│   ├── finance.py                   # Budget & expense
│   ├── reports.py                   # Report & analytics
│   ├── notifications.py             # Notification management
│   ├── audit.py                     # Audit trail
│   ├── dashboard.py                 # Dashboard stats
│   ├── settings.py                  # System settings
│   └── ...                          # Module-specific routes
├── utils/                           # Utilities (48 files)
│   ├── auth.py                      # JWT generation/verification
│   ├── middleware.py                 # Custom middleware
│   ├── security.py                  # Encryption, hashing
│   ├── csrf.py                      # CSRF token management
│   ├── email.py                     # SMTP email sender
│   ├── email_templates.py           # Email template rendering
│   ├── export.py                    # CSV, PDF, Excel export
│   ├── ip_whitelist.py              # IP filtering
│   ├── ai_bridge.py                 # AI model communication
│   ├── ai_engine.py                 # Intent classification + RAG + wizard
│   ├── ai_model_client.py           # HTTP client to model server
│   ├── admin_ui_manager.py          # sqlite-web watchdog
│   ├── scheduler.py                 # APScheduler scheduled jobs
│   ├── backup_manager.py            # DB backup logic
│   ├── retention.py                 # Data retention cleanup
│   ├── ssh_client.py                # SSH for server monitoring
│   ├── ml_predictor.py              # ML prediction models
│   ├── ml_anomaly.py                # Anomaly detection
│   ├── ml_seasonality.py            # Seasonality decomposition
│   ├── ml_health_score.py           # Asset health scoring
│   ├── ml_clustering.py             # K-means clustering
│   ├── notification_manager.py      # Notification dispatch
│   ├── audit_logger.py              # Audit logging
│   └── ...                          # Other utilities
├── config/
│   └── ai.yaml                      # AI model configuration
├── migrations/                      # Alembic migrations (34 files)
├── app_knowledge.md                 # AI knowledge base
└── app.db                           # SQLite database file
```

## Middleware Stack

Middleware diterapkan berurutan di `main.py`:

| Urutan | Middleware | Fungsi |
|--------|-----------|--------|
| 1 | **CORSMiddleware** | Allow origin frontend (localhost:3001/3443) |
| 2 | **SessionMiddleware** | Attach session context ke setiap request |
| 3 | **SecurityMiddleware** | Set security headers (HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy) |
| 4 | **RateLimitMiddleware** | slowapi, limit per endpoint (default 60/min, login 10/min, forgot-password 3/min) |
| 5 | **ProcessTimeMiddleware** | Catat durasi request, log slow requests (>5 detik) |
| 6 | **AuthMiddleware** | Verifikasi JWT dari cookie/header, attach user ke request.state, cek module permission |
| 7 | **IPWhitelistMiddleware** | Filter IP untuk admin endpoints |

## Scheduler (APScheduler)

### Database

SQLite (untuk persistence jobs)

### Scheduled Jobs

| Job | Waktu | Deskripsi |
|-----|-------|-----------|
| Daily DB Backup | 02:00 | Backup app.db ke folder backups/ |
| Retention Cleanup | 03:00 | Hapus data expired (login history 90d, chat 180d, dll) |
| AI Memory Cleanup | 04:00 | Hapus memory lama |
| Backup Verification Reminder | 08:00 | Notifikasi jika verify >7 hari |
| WAL Checkpoint | Every 1000 writes | Inline di database.py (bukan scheduler) |
| Session Cleanup | Every 1 jam | Hapus expired sessions |
| OTP Cleanup | Every 1 jam | Hapus OTP expired |
| Admin UI Watchdog | Every 30 detik | Cek health sqlite-web |

## Key Utilities

### Email Templates (8 templates)

| Template | Kegunaan |
|----------|----------|
| OTP verification | Kirim kode OTP untuk 2FA |
| Password reset | Link reset password |
| Ticket assignment | Notifikasi ticket ditugaskan |
| Ticket resolution | Notifikasi ticket selesai |
| Approval request | Minta approval ke manager |
| Approval notification | Konfirmasi approval |
| Backup failure alert | Alert backup gagal |
| Contract renewal reminder | Pengingat perpanjangan kontrak |

### SSH Operations

| Operasi | Deskripsi |
|---------|-----------|
| Fetch SAR data | System Activity Report untuk capacity planning |
| Remote backup check | Verifikasi backup jarak jauh |
| Disk usage monitoring | Monitor penggunaan disk |
| Service status check | Cek status service remote |

## Machine Learning Pipeline

### 1. Predictor (`ml_predictor.py`)

- Prophet-based time series forecasting
- CPU usage, memory, disk, bandwidth prediction (7-30 days)
- Confidence intervals

### 2. Anomaly Detection (`ml_anomaly.py`)

- Isolation Forest untuk outlier detection
- Features: resource usage patterns, error rates, response times
- Alert jika anomaly score > threshold

### 3. Seasonality (`ml_seasonality.py`)

- STL decomposition (Seasonal-Trend-Loess)
- Identifikasi daily, weekly, monthly patterns
- Digunakan untuk capacity planning

### 4. Health Score (`ml_health_score.py`)

- Weighted scoring:
  - Uptime: 30%
  - Performance: 25%
  - Security: 20%
  - Maintenance: 15%
  - Age: 10%
- Score 0-100
- Trend analysis (improving/declining)

### 5. Clustering (`ml_clustering.py`)

- K-means untuk asset grouping
- Features: usage, age, criticality, location
- Identify under/over-utilized assets
