# Keamanan Sistem

## Ringkasan Keamanan

Sistem menerapkan defense-in-depth: HTTPS, JWT, RBAC, rate limiting, CSRF, IP whitelist, session management, dan input sanitization.

---

## 1. Authentication Flow

### Login Process

1. User submit credentials (username + password)
2. Backend verifikasi password (bcrypt)
3. Jika valid, generate JWT token (HS256) dengan payload: user_id, username, role, session_id
4. Set cookie: `__Secure-access_token` (production) atau `access_token` (development)
5. Browser redirect ke dashboard

### JWT Implementation

- Algorithm: HS256
- Secret: dari `SECRET_KEY` env variable (64-char hex)
- Expiry: 24 jam
- Cookie: HttpOnly, Secure (production), SameSite=Lax
- Alternatif: `Authorization: Bearer <token>` header

### 2FA / OTP via Email

- Opsional per user (enabled/disabled)
- Generate 6-digit OTP (valid 5 menit)
- Encrypted di DB via `OTP_ENCRYPTION_KEY` (Fernet)
- Dikirim via SMTP email
- Verify OTP -> session di-activate

---

## 2. Session Management

- Session stored di SQLite (`sessions` table)
- Setiap request diverifikasi: token valid, belum expired, IP match, user-agent match (basic)
- Inactivity timeout: 15 menit -> session expired
- Concurrent session: dibatasi 3 per user
- Logout: hapus session dari DB + clear cookie
- Admin bisa revoke semua session user

---

## 3. RBAC (Role-Based Access Control)

### Role Hierarchy

1. **Admin** -- akses penuh semua modul
2. **Manager** -- akses sesuai modul yang di-assign
3. **User** -- akses terbatas (read + create, no delete)
4. **Viewer** -- read-only

### Module Permissions

Setiap modul memiliki 4 level akses:

- `view` -- lihat data
- `create` -- tambah data baru
- `edit` -- ubah data existing
- `delete` -- hapus data

### User-level Override

Permission bisa di-override per-user (tidak harus mengikuti role). Disimpan di `user_module_permissions` table.

---

## 4. Middleware Stack (Backend)

Backend menerapkan 7 middleware berurutan di `main.py`:

| Urutan | Middleware | Fungsi |
|--------|------------|--------|
| 1 | `CORSMiddleware` | Allow frontend origin via regex (origin list + subnet) |
| 2 | `SessionMiddleware` | Session context |
| 3 | `SecurityMiddleware` | Security headers |
| 4 | `RateLimitMiddleware` | slowapi per endpoint |
| 5 | `ProcessTimeMiddleware` | Request duration logging |
| 6 | `AuthMiddleware` | JWT verification + RBAC |
| 7 | `IPWhitelistMiddleware` | IP filtering untuk admin |
| 8 | `CSRFMiddleware` | Validasi origin/referer untuk mutasi request |

Detail implementasi ada di `backend/utils/middleware.py`, `backend/utils/security_config.py`, dan `backend/main.py`.

### CORS Configuration

- **Environment variable**: `CORS_ORIGINS` — comma-separated list of allowed HTTPS origins
- **Subnet filter**: `CORS_SUBNET` — CIDR range untuk LAN access (e.g., `192.168.60.0/24`)
- **Auto-detect**: `start-all.sh` mendeteksi LAN IP via `ip route get` untuk mengisi CORS_ORIGINS + CORS_SUBNET
- **Production**: Hanya HTTPS origin yang diizinkan. Localhost/127.0.0.1 selalu diizinkan.
- **CSRF middleware**: Memvalidasi `Origin` header untuk semua request POST/PUT/DELETE/PATCH. Jika origin tidak match → 403.

### 365-Day Date Range Validation

Semua endpoint report dengan parameter `from_date`/`to_date` memiliki batas maksimal **365 hari**:

- **Backend**: Setelah parsing tanggal, hitung `(end_date - start_date).days > 365` → return 400
- **Frontend**: Sebelum panggil API, hitung `diffDays > 365` → alert + batalkan request
- **Module yang menerapkan**: SSH Report, IRMC, Capacity (Monthly Server Check), Backup Check
- **Pola implementasi** (backend):
  ```python
  if (end_date - start_date).days > 365:
      raise HTTPException(status_code=400, detail="Date range too large. Maximum 365 days allowed")
  ```
- **Pola implementasi** (frontend):
  ```javascript
  const diffDays = Math.ceil((new Date(toDate).getTime() - new Date(fromDate).getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays > 365) { alert('Date range maximum 365 days'); return; }
  ```

---

## 5. CSRF Protection

- CSRF token di-generate per session
- Disimpan di `csrf_tokens` table
- Dikirim via cookie (separate dari auth cookie)
- Frontend menyertakan token di header `X-CSRF-Token`
- Backend verifikasi untuk mutasi request (POST, PUT, DELETE)
- Token expiry: 1 jam

---

## 6. IP Whitelist

- Untuk akses admin endpoints tertentu
- Daftar IP di `ip_whitelist` table
- Admin manage via settings page
- Jika IP tidak cocok -> 403 Forbidden
- Bisa di-nonaktifkan

---

## 7. Password Security

- Hash: bcrypt (cost factor 12)
- Minimum length: 8 karakter
- Format: huruf besar, kecil, angka, simbol (opsional di settings)
- History: 5 password terakhir tidak boleh sama
- Max failed attempts: 5 -> account lock 30 menit
- Reset password via email OTP

---

## 8. Data Encryption

### Asset Encryption

- Field sensitif di assets dienkripsi dengan `ASSET_ENCRYPTION_KEY`
- Algorithm: Fernet (symmetric AES-128-CBC + HMAC-SHA256)
- Encrypted fields: password, private_key, secret_key, api_key
- Decrypt hanya saat ditampilkan ke user authorized

### OTP Encryption

- OTP dienkripsi dengan `OTP_ENCRYPTION_KEY` (Fernet terpisah)
- Hanya OTP yang belum expired yang bisa didekripsi

---

## 9. Admin UI Security

### Lapisan Keamanan /admin-ui

1. sqlite-web password protection (`-P`) -- basic auth
2. Hanya bind ke `127.0.0.1` (localhost-only, tidak bisa diakses langsung)
3. Proxy via frontend `server.js` yang mewajibkan JWT valid
4. Rate limiting terpisah untuk /admin-ui (30 req/min per IP)
5. Audit logging semua request ke /admin-ui

### Watchdog

- Daemon thread di `backend/utils/admin_ui_manager.py`
- Mengecek sqlite-web tiap 30 detik
- Restart otomatis jika crash
- File lock (`fcntl.flock`) untuk cross-process safety antar 5 worker

---

## 10. Session Inactivity

- Timeout: 15 menit idle
- Detected via frontend inactivity hook (`useInactivityTimeout`)
- Popup warning 60 detik sebelum timeout
- Auto-logout + redirect ke login page
- Session tetap valid jika ada aktivitas

---

## 11. Optimistic Locking

- Setiap tabel update punya kolom `version` (integer)
- Update: `WHERE version = :old_version`
- Jika version berubah -> conflict -> retry (max 3x)
- Mencegah lost update di concurrent environment

---

## 12. Input Sanitization

- SQL injection: SQLAlchemy parameterized queries
- XSS: Pydantic validation + escape output di frontend
- File upload: validasi tipe file (whitelist), size limit (10MB), scan nama file
- API input: Pydantic schemas dengan strict validation
