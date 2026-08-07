# Database

## Database Overview

- Engine: SQLite 3
- File: `backend/app.db`
- Mode: WAL (Write-Ahead Logging) untuk concurrent reads
- Cache: 64MB
- Migrations: Alembic (34 migration files di `backend/migrations/`)
- Backup: Auto daily via APScheduler

---

## Connection Management

- SQLAlchemy 2.0 Async (untuk AI) + sync session
- Pool size: 5 (per worker) -- total 25 koneksi concurrent
- WAL mode memungkinkan 1 writer + banyak readers simultan
- Retry logic (max 3x) untuk database locked errors
- WAL checkpoint otomatis setiap 1000 write operations

---

## Schema: Models & Tables (50+ tables)

### Auth & Users

- `users` -- user accounts, roles, preferences
- `sessions` -- active session management
- `login_history` -- login attempt log
- `password_history` -- last 5 passwords
- `user_module_permissions` -- RBAC override per user
- `csrf_tokens` -- CSRF protection tokens
- `user_settings` -- per-user configuration
- `otp_codes` -- encrypted OTP storage

### Master Data

- `locations` -- lokasi fisik (data center, ruangan)
- `departments` -- departemen organisasi
- `vendors` -- vendor & supplier
- `manufacturers` -- manufacturer IT equipment
- `categories` -- kategori multi-level

### IT Assets (Polimorfik)

- `assets` -- base table untuk semua asset (common fields)
- Tabel ekstensi per tipe:
  - `asset_server` -- server fisik/virtual
  - `asset_network` -- network devices
  - `asset_software` -- software licenses
  - `asset_license` -- license management
  - `asset_database` -- database instances
  - `asset_cloud` -- cloud resources
- `asset_history` -- perubahan status asset
- `asset_assignments` -- assignment ke user/lokasi
- `asset_audit` -- audit records

### Purchasing

- `purchase_orders` -- PO header
- `po_items` -- PO line items
- `goods_receipts` -- GRN
- `grn_items` -- GRN line items
- `vendor_evaluations` -- vendor performance

### Risk Management

- `risks` -- risk register entries
- `risk_assessments` -- penilaian risiko berkala
- `risk_treatments` -- treatment plans
- `kris` -- Key Risk Indicators
- `risk_scenarios` -- scenario analysis

### Quality Management

- `quality_documents` -- document control
- `audits` -- internal/external audit schedule
- `audit_findings` -- temuan audit
- `capa` -- Corrective & Preventive Actions
- `quality_kpis` -- quality metrics

### Backup & DR

- `backup_jobs` -- backup job configuration
- `backup_history` -- execution history
- `backup_verifications` -- restore test results
- `disaster_recovery_plans` -- DRP documents

### AI & Chat

- `chat_messages` -- full conversation history
- `chat_sessions` -- session management
- `ai_prompts` -- system prompts
- `ai_memory` -- conversation memory
- `workflows` -- AI workflow definitions
- `workflow_executions` -- workflow runs
- `knowledge_base` -- RAG knowledge documents
- `wordlists` -- intent classification keywords

### Monitoring

- `network_devices` -- monitored devices
- `network_interfaces` -- interface perangkat
- `bandwidth_usage` -- bandwidth history
- `alerts` -- alert/notification history
- `maintenance_schedules` -- maintenance plans
- `maintenance_history` -- execution log

### Finance

- `budgets` -- budget planning
- `cost_centers` -- cost center management
- `expenses` -- expense tracking
- `approvals` -- approval workflow

### Other

- `service_desk_tickets` -- ticket management
- `projects` -- project management
- `project_tasks` -- task breakdown
- `contracts` -- contract lifecycle
- `contract_renewals` -- renewal tracking
- `compliance_regulations` -- regulation library
- `compliance_mappings` -- control mapping
- `notifications` -- notification queue
- `audit_log` -- system audit trail
- `system_settings` -- global configuration
- `migrations` -- Alembic version tracking

---

## Relationships Diagram (Text)

Key relationships:

- `assets` -> `asset_server/network/software/license/database/cloud` (1:1 via asset_id)
- `users` -> `sessions` (1:N), `login_history` (1:N), `user_settings` (1:1)
- `purchase_orders` -> `po_items` (1:N) -> `goods_receipts` (1:N via PO)
- `risks` -> `risk_assessments` (1:N), `risk_treatments` (1:N), `kris` (1:N)
- `audits` -> `audit_findings` (1:N) -> `capa` (1:N)
- `chat_sessions` -> `chat_messages` (1:N)
- `projects` -> `project_tasks` (1:N)

---

## Migration System

- Tool: Alembic
- Location: `backend/migrations/`
- Total: 34 migration files
- Auto-generate: `alembic revision --autogenerate -m "description"`
- Apply: `alembic upgrade head`
- Rollback: `alembic downgrade -1`
- Migration aman: setiap migration dalam transaction

---

## Data Retention & Cleanup

- Login history: 90 hari
- Chat messages: 180 hari
- Audit log: 1 tahun
- Bandwidth history: 90 hari
- Backup history: 30 hari
- Session expired: langsung hapus
- OTP expired: cleanup tiap 1 jam via scheduler
