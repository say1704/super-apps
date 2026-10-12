# Modul-Modul Sistem

Dokumen ini mendokumentasikan 26 modul fitur yang tersedia di sistem Super Apps.

---

## 1. Auth/Login

- **Tujuan**: Mengelola autentikasi pengguna, keamanan akses, dan otorisasi berbasis peran
- **Fitur Utama**:
  - Login dengan username/password
  - Two-Factor Authentication (2FA) via OTP email
  - Session management (multi-device, force logout)
  - Forgot password & reset password
  - Role-Based Access Control (RBAC)
  - IP whitelist untuk admin endpoints
  - Inactivity auto-logout (15 menit)
- **UI Pages**: `/login`, `/otp`, `/forgot-password`
- **Data Model**: `users`, `roles`, `permissions`, `sessions`, `otp_codes`, `login_history`
- **Integrasi**: Semua modul (gateway autentikasi)
- **Export**: Login history (CSV)

---

## 2. Dashboard

- **Tujuan**: Memberikan overview real-time kondisi sistem melalui widget KPI dan chart interaktif
- **Fitur Utama**:
  - Widget KPI (total asset, open tickets, risk score, dll)
  - Chart interaktif (bar, line, pie, donut)
  - Recent activity feed
  - Quick actions (create asset, open ticket, dll)
  - Module-specific dashboard
  - Filter waktu (hari, minggu, bulan, custom)
- **UI Pages**: `/dashboard`
- **Data Model**: Query agregat dari semua modul
- **Integrasi**: Assets, Risk, Service Desk, Project, Finance, Backup
- **Export**: Dashboard snapshot (PDF)

---

## 3. Assets

- **Tujuan**: Mengelola seluruh siklus hidup aset IT (server, network, software, lisensi, database, cloud)
- **Fitur Utama**:
  - CRUD untuk semua tipe aset
  - Kategorisasi: server, network, software, lisensi, database, cloud
  - Search & filter multi-kriteria
  - Asset lifecycle tracking (procurement → active → retired)
  - Relasi antar aset (server → database → software)
  - Export data aset
  - Asset health score (ML-based)
- **UI Pages**: `/assets`, `/assets/[id]`, `/assets/new`, `/assets/[id]/edit`
- **Data Model**: `assets`, `asset_servers`, `asset_network`, `asset_software`, `asset_licenses`, `asset_databases`, `asset_cloud`, `asset_history`
- **Integrasi**: Purchasing, Maintenance, Network Monitoring, Backup & DR, Location
- **Export**: CSV, PDF, Excel

---

## 4. Purchasing

- **Tujuan**: Mengelola proses procurement dari purchase order hingga goods receipt
- **Fitur Utama**:
  - Purchase order creation & approval workflow
  - Vendor management (master data, contact, performance)
  - Goods Receipt Note (GRN)
  - Vendor evaluation & rating
  - PO status tracking (draft, pending approval, approved, received, closed)
  - Budget check sebelum approval
- **UI Pages**: `/purchasing`, `/purchasing/pos/[id]`
- **Data Model**: `purchase_orders`, `po_items`, `goods_receipts`, `vendor_evaluations`
- **Integrasi**: Finance (budget), Approvals, Assets (asset registration setelah GRN), Vendor
- **Export**: PO (PDF), GRN (PDF), Vendor Evaluation (CSV)

---

## 5. Risk Management

- **Tujuan**: Mengidentifikasi, menilai, dan mengelola risiko IT secara terstruktur
- **Fitur Utama**:
  - Risk register (daftar semua risiko)
  - Penilaian risiko: Likelihood × Impact = Risk Score
  - Risk matrix visual (5×5 heatmap)
  - Treatment plan (mitigate, accept, transfer, avoid)
  - Key Risk Indicators (KRIs)
  - Risk trend analysis
  - Residual risk tracking
- **UI Pages**: `/risk`, `/risk/[id]`
- **Data Model**: `risks`, `risk_assessments`, `risk_treatments`, `risk_kris`, `risk_matrix`
- **Integrasi**: Compliance, Audit, Assets, Project (risk per project)
- **Export**: Risk Register (CSV, PDF), Risk Matrix (PDF)

---

## 6. Quality Management

- **Tujuan**: Mengelola sistem manajemen mutu termasuk document control dan audit
- **Fitur Utama**:
  - Document control (versioning, approval, review cycle)
  - Audit schedule & planning
  - Audit findings & corrective actions
  - CAPA (Corrective and Preventive Action)
  - Quality KPIs & dashboard
  - Non-conformance tracking
- **UI Pages**: `/quality`, `/quality/documents`, `/quality/audits`
- **Data Model**: `quality_documents`, `quality_audits`, `quality_findings`, `quality_capa`, `quality_kpis`
- **Integrasi**: Compliance, Audit Trail, Notifications
- **Export**: Audit Report (PDF), CAPA Report (CSV)

---

## 7. Backup & DR

- **Tujuan**: Mengelola backup database, restore verification, dan disaster recovery plans
- **Fitur Utama**:
  - Backup job configuration (full, incremental)
  - Schedule backup (cron-based)
  - Execution history & status
  - Restore verification (test restore)
  - DR plans & runbooks
  - Backup integrity check
  - Alert jika backup gagal
  - **Backup Analytics — tab Agregasi (per-server)**: agregasi file & size, plus **komparasi tanggal-sama antar-bulan** (ukuran backup di tanggal yang sama tiap bulan, mis. 2 Okt vs 2 Sep vs 2 Agu …) dengan delta ▲/▼ dan toleransi ±hari
- **UI Pages**: `/backup`, `/backup/jobs`, `/backup/verifications`, `/modules/backup-analytics`
- **Data Model**: `backup_jobs`, `backup_history`, `backup_verifications`, `dr_plans`
- **Integrasi**: Notifications (alert gagal), Assets (database asset), System Monitor
- **Export**: Backup Report (PDF), DR Plan (PDF)

---

## 8. AI Assistant

- **Tujuan**: Menyediakan asisten AI multi-intent untuk chat, data wizard, dan workflow automation
- **Fitur Utama**:
  - Multi-intent chatbot (Q&A, data query, create, update)
  - RAG (Retrieval-Augmented Generation) dengan knowledge base
  - Data wizard: create data kompleks via NLP multi-step
  - Workflow automation: eksekusi predefined workflows
  - Conversation memory (short & long-term)
  - Saran & follow-up questions otomatis
  - Audit trail untuk semua AI actions
- **UI Pages**: `/ai`, `/ai/workflows`
- **Data Model**: `ai_memory`, `knowledge_base`, `workflows`, `workflow_steps`, `ai_sessions`, `wordlists`
- **Integrasi**: Semua modul (AI bisa create/read/update data di modul mana pun)
- **Export**: Chat history (CSV)

---

## 9. Network Monitoring

- **Tujuan**: Memonitor perangkat jaringan dan traffic secara real-time
- **Fitur Utama**:
  - Device discovery (SNMP)
  - Interface monitoring (up/down, errors, discards)
  - Bandwidth tracking & utilization
  - Alert rules (threshold-based)
  - Network topology view
  - Historical performance data
  - CPU/memory monitoring untuk network devices
- **UI Pages**: `/network`, `/network/devices`
- **Data Model**: `network_devices`, `network_interfaces`, `network_bandwidth`, `network_alerts`, `network_history`
- **Integrasi**: Assets (network device asset), Notifications (alert), AI (query status)
- **Export**: Network Report (PDF), Bandwidth Report (CSV)

---

## 10. Maintenance

- **Tujuan**: Mengelola jadwal perawatan preventif dan korektif untuk aset
- **Fitur Utama**:
  - Preventive maintenance schedule
  - Corrective work orders
  - Maintenance history log
  - Asset maintenance calendar
  - Maintenance checklist & procedures
  - Spare parts tracking
  - Maintenance cost tracking
- **UI Pages**: `/maintenance`
- **Data Model**: `maintenance_schedules`, `maintenance_work_orders`, `maintenance_history`, `maintenance_checklists`
- **Integrasi**: Assets, Notifications (reminder schedule), Finance (cost)
- **Export**: Maintenance Schedule (PDF), Work Order (PDF), History (CSV)

---

## 11. Service Desk

- **Tujuan**: Mengelola tiket layanan IT dari pembuatan hingga resolusi
- **Fitur Utama**:
  - Ticket creation & management
  - SLA tracking (response time, resolution time)
  - Priority matrix (Impact × Urgency)
  - Category management
  - Ticket assignment (manual & auto)
  - Knowledge base integration (suggest solutions)
  - Escalation rules
  - Customer satisfaction survey
- **UI Pages**: `/service-desk`, `/service-desk/tickets/[id]`
- **Data Model**: `tickets`, `ticket_comments`, `ticket_attachments`, `ticket_categories`, `ticket_sla`, `ticket_escalations`
- **Integrasi**: Notifications (assignment, resolution), Assets (affected asset), Help/Knowledge Base, AI (auto-suggest)
- **Export**: Ticket Report (CSV, PDF), SLA Report (PDF)

---

## 12. Project Management

- **Tujuan**: Mengelola portofolio proyek dengan task breakdown dan milestone tracking
- **Fitur Utama**:
  - Project portfolio overview
  - Task breakdown (WBS)
  - Milestone tracking
  - Gantt chart view
  - Resource allocation
  - Budget vs actual tracking
  - Project dependencies
  - Timeline & deadline management
- **UI Pages**: `/projects`, `/projects/[id]`
- **Data Model**: `projects`, `project_tasks`, `project_milestones`, `project_resources`, `project_budgets`
- **Integrasi**: Finance (budget), Assets (project assets), Risk (project risk), Notifications
- **Export**: Project Plan (PDF), Gantt Chart (PDF), Task List (CSV)

---

## 13. Contract Management

- **Tujuan**: Mengelola siklus hidup kontrak vendor dan mitra
- **Fitur Utama**:
  - Contract lifecycle (draft → active → expired)
  - Renewal alerts & notifications
  - Document attachment (PDF kontrak)
  - Compliance check (terms & conditions)
  - SLA monitoring
  - Contract value tracking
  - Amendment & change management
- **UI Pages**: `/contracts`, `/contracts/[id]`
- **Data Model**: `contracts`, `contract_attachments`, `contract_amendments`, `contract_sla`
- **Integrasi**: Vendor, Purchasing, Finance, Notifications (renewal), Approvals
- **Export**: Contract Summary (PDF), Contract List (CSV)

---

## 14. Compliance

- **Tujuan**: Memastikan kepatuhan terhadap regulasi dan standar yang berlaku
- **Fitur Utama**:
  - Regulation library (ISO 27001, SOC 2, GDPR, dll)
  - Control mapping (regulasi → kontrol teknis)
  - Compliance assessment & scoring
  - Gap analysis
  - Remediation plan
  - Compliance dashboard & reports
  - Audit preparation tools
- **UI Pages**: `/compliance`
- **Data Model**: `compliance_regulations`, `compliance_controls`, `compliance_assessments`, `compliance_gaps`
- **Integrasi**: Risk Management, Quality Management, Audit Trail, Reports
- **Export**: Compliance Report (PDF), Gap Analysis (CSV, PDF)

---

## 15. Finance

- **Tujuan**: Mengelola perencanaan anggaran, pengeluaran, dan approval keuangan
- **Fitur Utama**:
  - Budget planning & allocation
  - Expense tracking & categorization
  - Cost center management
  - Approval workflow (budget, expense)
  - Budget vs actual comparison
  - Financial reports & analytics
  - Multi-currency support
- **UI Pages**: `/finance`, `/finance/budgets`
- **Data Model**: `budgets`, `budget_items`, `expenses`, `cost_centers`, `finance_approvals`
- **Integrasi**: Purchasing, Project (budget), Approvals, Reports
- **Export**: Budget Report (PDF, Excel), Expense Report (CSV, PDF)

---

## 16. Reports

- **Tujuan**: Menyediakan laporan built-in dan kustom untuk semua modul
- **Fitur Utama**:
  - Built-in reports (predefined untuk setiap modul)
  - Custom report builder (drag & drop fields)
  - Export multi-format (CSV, PDF, Excel)
  - Report scheduling (daily, weekly, monthly)
  - Report templates
  - Chart & visualisasi dalam report
  - Email distribution otomatis
- **UI Pages**: `/reports`
- **Data Model**: `reports`, `report_templates`, `report_schedules`, `report_history`
- **Integrasi**: Semua modul (sumber data)
- **Export**: CSV, PDF, Excel

---

## 17. Notifications

- **Tujuan**: Mengelola pengiriman notifikasi email dan in-app ke pengguna
- **Fitur Utama**:
  - Email notification (SMTP)
  - In-app notifications (real-time via SSE)
  - Alert rules (threshold-based)
  - Notification preferences per user
  - Notification history
  - Bulk notification
  - Template management
- **UI Pages**: `/notifications`
- **Data Model**: `notifications`, `notification_templates`, `notification_preferences`, `notification_alerts`
- **Integrasi**: Semua modul (sumber event), Service Desk (ticket assignment), Backup (alert)
- **Export**: Notification History (CSV)

---

## 18. Audit Trail

- **Tujuan**: Mencatat semua aktivitas dan perubahan data untuk kepentingan audit
- **Fitur Utama**:
  - Activity log (siapa, apa, kapan, dari mana)
  - Data changes tracking (before/after)
  - User tracking (login, logout, action)
  - Filter & search audit log
  - Export audit trail
  - Retention policy (auto-cleanup 90 hari)
- **UI Pages**: `/audit`
- **Data Model**: `audit_logs`
- **Integrasi**: Semua modul (semua create/update/delete tercatat), Compliance
- **Export**: CSV, PDF

---

## 19. Asset Audit

- **Tujuan**: Melakukan audit fisik aset dan rekonsiliasi dengan database
- **Fitur Utama**:
  - Physical audit scheduling
  - Barcode/QR code scanning
  - Reconciliation (fisik vs database)
  - Discrepancy reporting
  - Audit history
  - Sign-off & verification
- **UI Pages**: (dalam modul Assets)
- **Data Model**: `asset_audits`, `asset_audit_items`, `asset_discrepancies`
- **Integrasi**: Assets, Audit Trail, Reports
- **Export**: Audit Report (PDF), Discrepancy Report (CSV)

---

## 20. Settings

- **Tujuan**: Mengelola konfigurasi sistem, pengguna, peran, dan modul
- **Fitur Utama**:
  - System configuration (general settings)
  - User management (CRUD, active/inactive)
  - Role management (create role, assign permissions)
  - Module management (enable/disable modul)
  - Session management (view active sessions, force logout)
  - IP whitelist configuration
  - Maintenance mode
- **UI Pages**: `/settings`, `/settings/users`, `/settings/roles`, `/settings/modules`
- **Data Model**: `system_settings`, `users`, `roles`, `permissions`, `modules`
- **Integrasi**: Semua modul (konfigurasi)
- **Export**: User List (CSV)

---

## 21. Location

- **Tujuan**: Mengelola data lokasi fisik untuk data center, ruangan, dan rack
- **Fitur Utama**:
  - Location hierarchy: site → building → floor → room → rack
  - Data center management
  - Rack elevation view
  - Asset placement tracking (aset di rack mana)
  - Location search & filter
- **UI Pages**: (dalam modul Assets)
- **Data Model**: `locations`, `location_racks`, `location_datacenters`
- **Integrasi**: Assets (penempatan aset), Network Monitoring
- **Export**: Location List (CSV)

---

## 22. Vendor

- **Tujuan**: Mengelola data master vendor dan hubungan dengan perusahaan
- **Fitur Utama**:
  - Vendor master data (company info, contact, address)
  - Contact management (multiple contacts per vendor)
  - Performance rating & evaluation
  - Vendor category (hardware, software, service, cloud)
  - Contract history per vendor
  - Purchase history per vendor
- **UI Pages**: (dalam modul Purchasing)
- **Data Model**: `vendors`, `vendor_contacts`, `vendor_evaluations`, `vendor_categories`
- **Integrasi**: Purchasing, Contract Management, Finance
- **Export**: Vendor List (CSV), Vendor Evaluation (PDF)

---

## 23. Help/Knowledge Base

- **Tujuan**: Menyediakan dokumentasi pengguna, FAQ, dan knowledge articles
- **Fitur Utama**:
  - FAQ (Frequently Asked Questions)
  - User guide & documentation
  - Knowledge articles (searchable)
  - Category & tag management
  - Article rating & feedback
  - Integration dengan AI Assistant (RAG source)
  - Version history untuk articles
- **UI Pages**: `/help`
- **Data Model**: `help_articles`, `help_categories`, `help_faq`, `knowledge_base`
- **Integrasi**: AI Assistant (knowledge source), Service Desk (suggest articles)
- **Export**: Article (PDF)

---

## 24. Approvals

- **Tujuan**: Mengelola workflow approval untuk berbagai transaksi (PO, expense, contract)
- **Fitur Utama**:
  - Approval workflow definition (multi-level)
  - Approval request & notification
  - Approve/reject dengan comment
  - Delegation (approver bisa delegate)
  - Approval history
  - Escalation jika tidak di-approve dalam waktu tertentu
  - Batch approval
- **UI Pages**: (inline di modul terkait)
- **Data Model**: `approval_workflows`, `approval_requests`, `approval_history`
- **Integrasi**: Purchasing (PO approval), Finance (expense approval), Contract Management, Notifications
- **Export**: Approval History (CSV)

---

## 25. Data Export/Import

- **Tujuan**: Menyediakan fasilitas export bulk dan import berbasis template
- **Fitur Utama**:
  - Bulk export (semua data modul dalam format terstruktur)
  - Template-based import (download template → isi → upload)
  - Import validation & error reporting
  - Field mapping untuk import
  - Scheduled export
  - Export format: CSV, Excel, JSON
- **UI Pages**: (inline di Settings atau masing-masing modul)
- **Data Model**: `export_jobs`, `import_jobs`, `import_templates`
- **Integrasi**: Semua modul (sumber/tujuan data)
- **Export**: CSV, Excel, JSON

---

## 26. System Monitor

- **Tujuan**: Memonitor kesehatan sistem, performa, dan status service
- **Fitur Utama**:
  - Health check endpoints
  - Performance metrics (CPU, memory, disk)
  - Backup status dashboard
  - Service status (backend, frontend, model server, admin UI)
  - Uptime monitoring
  - Alert jika service down
  - System logs viewer
- **UI Pages**: (Admin section)
- **Data Model**: `system_health`, `system_metrics`, `service_status`
- **Integrasi**: Backup & DR, Notifications (alert down), Settings
- **Export**: System Report (PDF)

---

## 27. Log Management — SSH Report

- **Tujuan**: Import dan analisis login SSH dari report file (.log) yang di-generate server via crontab
- **Fitur Utama**:
  - Bulk import via SSH ke banyak server (parallel workers)
  - Parse otomatis format report (Berhasil, Gagal, Top User, Top IP)
  - RBAC by `owner_role`: superadmin lihat semua, user lain lihat data sesuai role
  - Batch file I/O untuk performa bulk scan
  - Filter by hostname, IP, status, date range (max 365 hari)
  - Server detail modal (5 tabs): daily history, successful, failed, top users, top IPs
- **UI Pages**: `/modules/ssh-report`
- **Data Model**: `ssh_login_logs` — hostname, login_timestamp, username, source_ip, status, auth_method, scan_date, owner_role
- **RBAC**: Data-level — kolom `owner_role` difilter sesuai role user. Superadmin bypass.
- **Export**: PDF per-server per-date (No | Hostname | Date | Total | Success | Failed), CSV (detail modal)
- **Date range**: Max 365 hari (backend + frontend validation)

---

## 28. IRMC Health Check

- **Tujuan**: Monitoring status iRMC server harian dengan screenshot evidence
- **Fitur Utama**:
  - CRUD check entry (server_name, check_date, status, notes)
  - Folder grouping dengan color coding
  - Screenshot upload (PNG/JPG)
  - RBAC: owner atau superadmin untuk edit/delete
  - Grid/List view toggle
- **UI Pages**: `/modules/irmc`
- **Data Model**: `irmc_checks`, `irmc_folders`
- **RBAC**: Page-level via `UserModuleAccess`
- **Export**: PDF per-date (No | Server | Date | Status | Notes) — sorted by date, hostname
- **Date range**: Max 365 hari (backend + frontend validation)

---

## 29. Capacity Monitoring (Monthly Server Check)

- **Tujuan**: Monitoring kapasitas server via SAR logs — CPU, RAM, Disk peak usage
- **Fitur Utama**:
  - Bulk import via SSH ke banyak server (parallel workers)
  - Dashboard stats (total servers, OK/Warning/Critical)
  - Server detail dengan history chart (CPU, RAM, Disk trend)
  - Auto-detect disk partition (/, /Backup, /usr/local/syb)
  - Alert threshold (CPU/RAM/Disk > 90%)
- **UI Pages**: `/modules/monthly-server-check`
- **Data Model**: `capacity_metrics` — hostname, tanggal, cpu_peak, ram_peak, disk_root_pct, status
- **RBAC**: Page-level via `UserModuleAccess` (data infrastruktur global, tidak ada filter data-level)
- **Export**: PDF per-server per-date (No | Hostname | Date | Status | CPU | RAM | Disk) — sorted by date, hostname
- **Date range**: Max 365 hari (backend + frontend validation)

---

## 30. Backup Check

- **Tujuan**: Verifikasi backup server harian via SSH — cek file/folder backup terkini
- **Fitur Utama**:
  - SSH connection test
  - Auto-detect check mode (file count, size, or custom)
  - Manual run untuk server tertentu
  - Daily history per server
  - Server health status (file count, total size, days since last backup)
  - **Daftar file per hari** _(2026-10-08)_ — expand baris di 📊 Server History untuk melihat file apa saja yang ter-backup hari itu (badge section `[LOG]/[APP]/[SCRIPT]`); live search tanpa Enter. Data ditangkap saat scan ke kolom `backup_history.file_list` (2 format log auto-detect: `Daftar file:` flat & `===== FILES BACKED UP =====` grouped); record lama tampil "belum tersedia" sampai di-scan ulang. _(2026-10-12: fix parser Format 1 — baris kosong di dalam daftar tidak lagi memutus capture; deteksi Format 2 diperketat ke banner `=`)_
- **UI Pages**: `/modules/backup-check`
- **Data Model**: `backup_records` — server, check_date, files, size_bytes, status; `backup_history.file_list` (Text/JSON nullable) — daftar file ter-backup per hari
- **RBAC**: Page-level via `UserModuleAccess`
- **Export**: PDF per-date (No | Server | Date | Files | Size | Status) — sorted by date, server
- **Date range**: Max 365 hari (backend + frontend validation)
