# Panduan Konfigurasi Super Apps

**Dokumen ini menjelaskan seluruh file konfigurasi yang digunakan dalam proyek Super Apps.**

---

## 1. Backend Environment Variables

### File: `backend/.env`
**Lokasi:** `backend/.env`

File ini berisi variabel lingkungan sensitif yang digunakan oleh backend FastAPI. **Jangan commit file `.env` ke version control.**

#### Variabel Wajib (Required)

| Variabel | Fungsi | Contoh |
|---|---|---|
| `SECRET_KEY` | JWT secret key untuk sign & verifikasi token autentikasi (access token, refresh token, OTP token). | `0ncUOQmmJzPkR1VS-OG3jIBKb6ymHeZVaF-XoMbUbRM` |
| `ASSET_ENCRYPTION_KEY` | Kunci enkripsi Fernet untuk data sensitif di Asset Register (password, credential). **JANGAN diubah setelah asset dibuat** — data terenkripsi akan tidak bisa dibaca. | `<ASSET_ENCRYPTION_KEY>` |
| `PASSWORD_VERIFICATION_KEY` | Password verifikasi yang diperlukan user untuk melihat password asset yang terenkripsi. | `<set-a-strong-verification-key>` |

#### Variabel Opsional (Optional)

| Variabel | Fungsi | Default |
|---|---|---|
| `ADMIN_PASS` | Password admin untuk sqlite-web (Admin UI di port 8002). Jika tidak diset, akan di-generate random saat startup. | Random |
| `CORS_ORIGINS` | Daftar origin yang diizinkan untuk CORS (comma-separated). Jika kosong, semua `https://` origin diizinkan. | Kosong (allow all https) |
| `CORS_SUBNET` | Pembatasan subnet untuk CORS, misal `192.168.60.0/24`. | Kosong |
| `ALLOWED_IPS` | IP whitelist (comma-separated). Jika kosong, semua IP diterima. | Kosong (accept all) |
| `APP_VERSION` | Versi aplikasi yang ditampilkan di endpoint `/health`. | `1.0.0` |
| `SUPERAPP_DB_NAME` | Nama file database SQLite. Jika tidak diset, default `superapps.db`. | `superapps.db` |

#### Cara Generate Key

```bash
# SECRET_KEY
python3 -c "import secrets; print(secrets.token_hex(32))"
# atau
openssl rand -base64 48

# ASSET_ENCRYPTION_KEY
python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

#### Template
File `backend/.env.example` tersedia sebagai template. Salin ke `.env` dan isi nilai yang sesuai:

```bash
cp backend/.env.example backend/.env
```

---

## 2. Frontend Environment Variables

### File: `frontend/.env.local`
**Lokasi:** `frontend/.env.local`

| Variabel | Fungsi | Default |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | URL backend API yang dipanggil oleh frontend Next.js. | `https://127.0.0.1:8001` |

**Catatan:** Prefix `NEXT_PUBLIC_` berarti variabel ini tersedia di sisi client (browser). Pastikan URL sesuai dengan alamat dan port backend yang sedang berjalan.

---

## 3. Path Configuration (Backend Python)

### File: `backend/utils/config.py`
**Lokasi:** `backend/utils/config.py`

Modul ini mengatur path database dan backup secara terpusat. Semua modul backend menggunakan fungsi dari file ini.

#### Struktur Path

| Konstanta | Nilai | Keterangan |
|---|---|---|
| `BACKEND_DIR` | Direktori `backend/` | Root folder backend |
| `DATA_DIR` | `backend/data/` | Direktori utama untuk data |
| `DB_PATH` | `backend/data/superapps.db` | File database SQLite utama |
| `BACKUP_DIR` | `backend/data/backups/` | Direktori file backup database |
| `LEGACY_DB_PATH` | `backend/superapps.db` | Path database lama (akan di-migrate otomatis) |
| `LEGACY_BACKUP_DIR` | `backend/backups/` | Direktori backup lama (akan di-migrate otomatis) |

#### Fungsi

| Fungsi | Keterangan |
|---|---|
| `get_db_path()` | Mengembalikan path database SQLite utama |
| `get_backup_dir()` | Mengembalikan direktori backup |
| `ensure_data_dirs()` | Membuat direktori `data/` dan `data/backups/` jika belum ada |
| `migrate_legacy_db()` | Memindahkan database lama (`superapps.db` di root backend) dan backup lama ke `data/` secara otomatis saat startup |

#### Auto-Migration
Saat backend pertama kali startup setelah refactoring path (Phase 139), sistem otomatis:
1. Memindahkan `backend/superapps.db` → `backend/data/superapps.db`
2. Memindahkan `backend/backups/*.db` → `backend/data/backups/`
3. Menghapus folder `backend/backups/` jika sudah kosong

---

## 4. Database Configuration

### File: `backend/database.py`
**Lokasi:** `backend/database.py`

Konfigurasi engine SQLite dan session management.

#### PRAGMA Settings

| PRAGMA | Nilai | Keterangan |
|---|---|---|
| `journal_mode` | `WAL` | Write-Ahead Logging — lebih cepat dan aman |
| `synchronous` | `NORMAL` | Balance antara performa dan durability |
| `cache_size` | `-2048` | Cache 2MB (negatif = dalam KiB) |
| `foreign_keys` | `ON` | Enforce foreign key constraints |
| `temp_store` | `MEMORY` | Temporary table di memory |

#### Fungsi

| Fungsi | Keterangan |
|---|---|
| `get_engine()` | Membuat/mengembalikan SQLAlchemy engine dengan PRAGMA settings |
| `SessionLocal` | Session factory untuk database transactions |
| `get_db()` | Dependency FastAPI untuk inject database session (yield pattern) |
| `init_db()` | Membuat semua tabel berdasarkan model (`Base.metadata.create_all`) |

---

## 5. Konfigurasi Build & Runtime

### Backend Dependencies
**File:** `backend/requirements.txt`

Berisi seluruh Python package yang dibutuhkan backend FastAPI. Install dengan:

```bash
pip install -r backend/requirements.txt
```

### Frontend Dependencies
**File:** `frontend/package.json`

Berisi dependencies dan scripts Next.js. Install dan jalankan dengan:

```bash
cd frontend
npm install
npm run dev
```

### Next.js Configuration
**File:** `frontend/next.config.ts`

Konfigurasi build Next.js (App Router, TypeScript, dll).

### Tailwind CSS Configuration
**File:** `frontend/tailwind.config.ts`

Konfigurasi Tailwind CSS dengan `darkMode: 'class'` untuk dukungan tema gelap/terang.

---

## 6. Startup Scripts

### `start_backend.sh`
**Lokasi:** `start_backend.sh`

Script untuk menjalankan backend FastAPI di port **8001** (HTTPS).

### `start.sh`
**Lokasi:** `start.sh`

Script untuk menjalankan backend dan frontend secara bersamaan.

---

## 7. SSL/TLS Certificates

### Direktori: `certs/`
**Lokasi:** `certs/`

Berisi sertifikat SSL/TLS untuk HTTPS backend. Pastikan file sertifikat dan key tersedia sebelum menjalankan backend.

---

## Ringkasan Singkat

| Komponen | File | Port Default |
|---|---|---|
| Backend API | `backend/.env` | 8001 (HTTPS) |
| Frontend Web | `frontend/.env.local` | 3001 |
| Database | `backend/data/superapps.db` | — |
| Backup DB | `backend/data/backups/` | — |
| Admin UI (sqlite-web) | `backend/.env` (`ADMIN_PASS`) | 8002 |
