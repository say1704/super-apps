# Modul 01: Otentikasi & Manajemen Pengguna

## 1. Fungsi & Peran Modul

Modul ini merupakan **gerbang utama** seluruh aplikasi Super Apps IT Management System. Modul ini menangani seluruh siklus hidup identitas pengguna — mulai dari registrasi mandiri, persetujuan admin, login (dengan opsi 2FA), manajemen sesi, hingga penghapusan akun.

### User Persona

| Persona | Deskripsi | Akses |
|---------|-----------|-------|
| **Public User** | Orang yang belum terdaftar | Hanya bisa mengakses halaman Login & Register |
| **Pending User** | Sudah register, menunggu persetujuan admin | Tidak bisa login, status `pending_approval` |
| **Regular User** | User aktif dengan role `viewer`, `auditor`, `manager` | Login normal, akses modul sesuai role/override |
| **Admin** | Administrator dengan role `admin` | Semua modul + manajemen user, role, approval |
| **Superadmin** | Administrator tertinggi dengan role `superadmin` | Semua modul + semua pengaturan sistem |

### Fitur Utama
- Login dengan username/password + cookie-based JWT auth
- Two-Factor Authentication (2FA/TOTP) via Google Authenticator
- Self-registration dengan workflow approval admin
- Password reset via email token
- Account lockout setelah N kali gagal login
- Session management (multi-device, revoke, max concurrent)
- 3-tier RBAC: Admin → ALL, Override → DB, Default → Role
- Bulk user operations (approve, reject, delete, status change)
- Optimistic locking pada user update

---

## 2. Logika Bisnis & Workflow

### 2.1 Workflow Registrasi & Approval

```
[Public User]                  [System]                      [Admin]
     │                            │                             │
     ├─ POST /auth/register ─────►│                             │
     │  (username, email,         │                             │
     │   full_name, password)     │                             │
     │                            │─ Validate password policy   │
     │                            │─ Create user status=pending │
     │                            │─ Send email to all admins   │
     │◄─ 200 "Waiting approval"───┤                             │
     │                            │                             │
     │                            │◄──── GET /settings/users    │
     │                            │      ?status=pending_approval│
     │                            │                             │
     │                            │◄──── POST /users/{id}/approve│
     │                            │      {role: "viewer"}       │
     │                            │─ Set status=active          │
     │                            │─ Create UserModuleAccess     │
     │                            │  from role.modules           │
     │                            │─ Send welcome email          │
     │                            │                             │
     │◄──── Welcome Email ────────┤                             │
     │                            │                             │
     ├─ POST /token ─────────────►│                             │
     │  (username, password)      │                             │
     │◄─ JWT tokens + user data───┤                             │
```

### 2.2 Workflow Login (3-Tier RBAC Resolution)

```
User POST /token (username, password)
  │
  ├─ 1. Validate credentials
  ├─ 2. Check status (active/pending_approval/rejected)
  ├─ 3. Check account lockout
  ├─ 4. Check 2FA enabled?
  │     ├─ YES → Return {requires_2fa: true} → User verifies TOTP → POST /auth/2fa/login-verify
  │     └─ NO  → Continue
  ├─ 5. Check max concurrent sessions → Evict oldest if exceeded
  ├─ 6. Generate JWT (access_token + refresh_token) with JTI
  ├─ 7. Create session record in user_sessions table
  ├─ 8. Resolve user modules (3-tier):
  │     ├─ Tier 1: role in (admin, superadmin)? → Return ALL_MODULES (21 modules)
  │     ├─ Tier 2: user_module_access records exist? → Return those modules
  │     └─ Tier 3: Fallback → Role.modules JSON array
  ├─ 9. Load role.settings_tabs
  └─ 10. Return {user, access_token, refresh_token} + set httpOnly cookies
```

### 2.3 Workflow Password Reset

```
User POST /auth/request-password-reset {username}
  │
  ├─ Generate random token (secrets.token_urlsafe(32))
  ├─ Save token + expiry (1 hour) to user record
  ├─ Send email with reset link: {APP_URL}/reset-password?token={token}
  └─ Return "If username exists, token sent" (anti-enumeration)

User POST /auth/reset-password {reset_token, new_password}
  │
  ├─ Find user by reset_token
  ├─ Check token expiry
  ├─ Validate new password against security policy
  ├─ Hash new password (bcrypt)
  ├─ Clear reset_token, login_attempts, locked_until
  ├─ Set password_changed_at = now()
  ├─ Invalidate ALL user sessions (force re-login)
  └─ Return "Password reset successful"
```

### 2.4 Workflow 2FA Setup

```
User POST /auth/2fa/setup
  │
  ├─ Generate TOTP secret (pyotp.random_base32())
  ├─ Save secret to user.two_factor_secret
  ├─ Generate provisioning URI: otpauth://totp/Super Apps:user@email?secret=XXX&issuer=Super Apps
  ├─ Generate QR code image (base64)
  └─ Return {secret, qr_code_uri, manual_entry_key}

User POST /auth/2fa/verify {code}
  │
  ├─ Verify TOTP code against stored secret (pyotp.TOTP.verify())
  ├─ If valid → Set two_factor_enabled = True
  └─ Return "2FA enabled successfully"
```

### 2.5 Workflow Session Management

```
User GET /auth/sessions
  │
  └─ Return all active sessions for current user

User POST /auth/sessions/{session_id}/revoke
  │
  └─ Set session.is_active = False

User POST /auth/sessions/revoke-all
  │
  └─ Set ALL sessions is_active = False (keeps current request alive)

User POST /auth/logout
  │
  ├─ Decode JWT to get JTI
  ├─ Invalidate session by JTI
  └─ Clear httpOnly cookies (access_token, refresh_token)
```

### 2.6 Account Lockout Logic

```
Login attempt fails:
  ├─ login_attempts += 1
  ├─ last_failed_login = now()
  ├─ If login_attempts >= max_login_attempts (default: 5):
  │     locked_until = now() + lockout_duration_minutes (default: 30 min)
  │     Return 423 "Account locked"
  └─ Else: Return 401 "Incorrect username or password"

Login attempt succeeds:
  ├─ login_attempts = 0
  ├─ locked_until = None
  ├─ last_failed_login = None
  └─ last_login = now()

Auto-unlock:
  └─ If locked_until <= now(): Reset attempts & lock on next login attempt
```

---

## 3. Implementasi Teknologi & API

### 3.1 Komponen Frontend (Next.js)

| Komponen | Path | Fungsi |
|----------|------|--------|
| Login Page | `app/login/page.tsx` | Form login username/password, link ke register & forgot password |
| Register Page | `app/register/page.tsx` | Form registrasi mandiri (username, email, full_name, password) |
| Reset Password Page | `app/reset-password/page.tsx` | Form input reset token + new password |
| Settings Page (Users Tab) | `app/modules/settings/page.tsx` | CRUD user, bulk actions, approval workflow |
| Settings Page (Roles Tab) | `app/modules/settings/page.tsx` | CRUD role, module assignment, settings tabs |
| Settings Page (Modules Tab) | `app/modules/settings/page.tsx` | Access Matrix — override module per user |
| Session Timeout Modal | `components/SessionTimeoutModal.tsx` | Countdown warning before auto-logout |
| Inactivity Timer Hook | `hooks/useInactivityTimer.ts` | Track user activity, trigger timeout warning |
| Auth Context | `lib/auth.tsx` | JWT token management, apiRequest wrapper, auth state |
| Token Manager | `lib/token-manager.ts` | SessionStorage token persistence |
| Sidebar | `components/sidebar.tsx` | Module visibility based on user.modules + role |
| RBAC Utilities | `lib/rbac.ts` | `getVisibleTabs()` based on role + settings_tabs |

### 3.2 Daftar API Endpoints

#### Authentication

| Method | URL | Auth | Rate Limit | Request Payload | Response | Function |
|--------|-----|------|------------|-----------------|----------|----------|
| POST | `/api/v1/token` | None | 5/min | `OAuth2PasswordRequestForm` (username, password) | `LoginResponse`: `{user, access_token, refresh_token}` + httpOnly cookies | `login()` |
| POST | `/api/v1/token/refresh` | Cookie | — | `refresh_token` (httpOnly cookie) | `RefreshTokenResponse`: `{access_token, refresh_token}` | `refresh_token()` |
| POST | `/api/v1/auth/register` | None | 3/min | `UserRegister`: `{username, email, full_name, password}` | `MessageResponse`: `{message}` | `register_user()` |
| POST | `/api/v1/auth/request-password-reset` | None | 3/min | `PasswordResetRequest`: `{username}` | `MessageResponse`: `{message}` (+ reset_token if email not configured) | `request_password_reset()` |
| POST | `/api/v1/auth/reset-password` | None | 3/min | `PasswordResetConfirm`: `{reset_token, new_password}` | `MessageResponse`: `{message}` | `reset_password()` |
| GET | `/api/v1/users/me` | JWT | — | — | `UserWithModules`: `{id, username, email, full_name, role, modules, settings_tabs, ...}` | `get_me()` |
| POST | `/api/v1/auth/logout` | JWT | — | — | `MessageResponse`: `{message}` | `logout()` |

#### 2FA

| Method | URL | Auth | Rate Limit | Request Payload | Response | Function |
|--------|-----|------|------------|-----------------|----------|----------|
| POST | `/api/v1/auth/2fa/setup` | JWT | — | — | `TwoFASetupResponse`: `{secret, qr_code_uri, manual_entry_key}` | `setup_2fa()` |
| POST | `/api/v1/auth/2fa/verify` | JWT | — | `TwoFAVerifyRequest`: `{code}` | `MessageResponse`: `{message}` | `verify_2fa_setup()` |
| POST | `/api/v1/auth/2fa/disable` | JWT | — | `TwoFADisableRequest`: `{password, code}` | `MessageResponse`: `{message}` | `disable_2fa()` |
| GET | `/api/v1/auth/2fa/status` | JWT | — | — | `TwoFAStatusResponse`: `{enabled: boolean}` | `get_2fa_status()` |
| POST | `/api/v1/auth/2fa/login-verify` | None | 5/min | `TwoFALoginRequest`: `{username, code}` | `LoginResponse`: `{user, access_token, refresh_token}` | `login_verify_2fa()` |
| POST | `/api/v1/auth/2fa/regenerate` | JWT | — | — | `TwoFASetupResponse`: `{secret, qr_code_uri, manual_entry_key}` | `regenerate_2fa_secret()` |

#### Session Management

| Method | URL | Auth | Rate Limit | Request Payload | Response | Function |
|--------|-----|------|------------|-----------------|----------|----------|
| GET | `/api/v1/auth/sessions` | JWT | — | — | `SessionListResponse`: `{sessions: [{id, ip_address, user_agent, created_at, expires_at, is_active}]}` | `get_sessions()` |
| POST | `/api/v1/auth/sessions/{id}/revoke` | JWT | — | — | `MessageResponse`: `{message}` | `revoke_session()` |
| POST | `/api/v1/auth/sessions/revoke-all` | JWT | — | — | `BulkOperationResponse`: `{message, count}` | `revoke_all_sessions()` |

#### User Management (Admin)

| Method | URL | Auth | Rate Limit | Request Payload | Response | Function |
|--------|-----|------|------------|-----------------|----------|----------|
| GET | `/api/v1/settings/users` | JWT | — | Query: `page, page_size, status` | `UserListPaginatedResponse`: `{data: [{id, username, email, full_name, role, is_active, modules, override_modules, status, last_login}], pagination}` | `get_users()` |
| POST | `/api/v1/settings/users` | JWT | 20/min | `UserCreate`: `{username, email, full_name, password, role}` | `UserResponse`: `{id, username, email, full_name, role, is_active}` | `create_user_endpoint()` |
| PUT | `/api/v1/settings/users/{id}` | JWT | — | `UserUpdate`: `{email?, full_name?, role?, is_active?, password?}` | `UserResponse` + `version` | `update_user_endpoint()` |
| DELETE | `/api/v1/settings/users/{id}` | JWT | — | — | `MessageResponse`: `{message}` | `delete_user_endpoint()` |
| POST | `/api/v1/settings/users/{id}/approve` | JWT (admin) | — | `UserApprovalRequest`: `{role}` | `MessageResponse`: `{message}` | `approve_user()` |
| POST | `/api/v1/settings/users/{id}/reject` | JWT (admin) | — | `UserApprovalRequest`: `{role?, reason?}` | `MessageResponse`: `{message}` | `reject_user()` |
| GET | `/api/v1/settings/users/{id}/modules` | JWT | — | — | `UserModulesResponse`: `{module: can_access, ...}` | `get_user_modules()` |
| PUT | `/api/v1/settings/users/{id}/modules` | JWT | — | `ModuleAccess[]`: `[{module, can_access}]` | `MessageResponse`: `{message}` | `update_user_modules()` |

#### Bulk User Operations (Admin)

| Method | URL | Auth | Rate Limit | Request Payload | Response | Function |
|--------|-----|------|------------|-----------------|----------|----------|
| POST | `/api/v1/settings/users/bulk-delete` | JWT (admin) | 10/min | `{ids: number[]}` | `BulkOperationResponse`: `{message, count}` | `bulk_delete_users()` |
| POST | `/api/v1/settings/users/bulk-status` | JWT (admin) | 10/min | `{ids: number[], status: string}` | `BulkOperationResponse`: `{message, count}` | `bulk_update_user_status()` |
| POST | `/api/v1/settings/users/bulk-approve` | JWT (admin) | 10/min | `{users: [{user_id, role}]}` | `BulkOperationResponse`: `{message, count, errors?}` | `bulk_approve_users()` |
| POST | `/api/v1/settings/users/bulk-reject` | JWT (admin) | 10/min | `{ids: number[], reason?}` | `BulkOperationResponse`: `{message, count, errors?}` | `bulk_reject_users()` |

#### Role Management (Admin)

| Method | URL | Auth | Rate Limit | Request Payload | Response | Function |
|--------|-----|------|------------|-----------------|----------|----------|
| GET | `/api/v1/settings/roles` | JWT | — | Query: `page, page_size` | `RoleListPaginatedResponse`: `{data: [{id, name, description, modules, settings_tabs, is_system, user_count}], pagination}` | `get_roles()` |
| POST | `/api/v1/settings/roles` | JWT | — | `RoleCreate`: `{name, description, modules[], settings_tabs[]}` | `RoleResponse`: `{id, name, description, modules, settings_tabs, is_system}` | `create_role()` |
| PUT | `/api/v1/settings/roles/{id}` | JWT | — | `RoleUpdate`: `{description?, modules?, settings_tabs?}` | `VersionResponse`: `{message, version}` | `update_role()` |
| DELETE | `/api/v1/settings/roles/{id}` | JWT | — | — | `MessageResponse`: `{message}` | `delete_role()` |

#### Module Catalog

| Method | URL | Auth | Rate Limit | Request Payload | Response | Function |
|--------|-----|------|------------|-----------------|----------|----------|
| GET | `/api/v1/settings/modules` | None | — | — | `AllModulesResponse`: `{modules: string[]}` | `get_available_modules()` |

### 3.3 Package/Library Pihak Ketiga yang Direkomendasikan

| Package | Versi | Fungsi |
|---------|-------|--------|
| `bcrypt` atau `passlib[bcrypt]` | latest | Password hashing (argon2/bcrypt) |
| `python-jose[cryptography]` | latest | JWT encode/decode (HS256) |
| `pyotp` | latest | TOTP generation & verification (2FA) |
| `qrcode` | latest | QR code generation untuk 2FA setup |
| `python-dotenv` | latest | Load `.env` file |
| `aiosmtplib` | latest | Async email sending (background) |
| `slowapi` | latest | Rate limiting (per-endpoint) |
| `@nestjs/jwt` | latest | JWT module (NestJS) |
| `@nestjs/passport` + `passport-jwt` | latest | JWT strategy (NestJS) |
| `@nestjs/throttler` | latest | Rate limiting (NestJS) |
| `otplib` | latest | TOTP generation & verification (NestJS) |
| `qrcode` (npm) | latest | QR code generation (NestJS) |
| `@nestjs/mailer` + `nodemailer` | latest | Email service (NestJS) |

---

## 4. Skema Database (PostgreSQL)

### 4.1 Tabel: `users`

| Field | Tipe Data | Constraints | Default | Deskripsi |
|-------|-----------|-------------|---------|-----------|
| `id` | SERIAL | PRIMARY KEY | — | Auto-increment user ID |
| `username` | VARCHAR(100) | UNIQUE, NOT NULL, INDEX | — | Login username |
| `email` | VARCHAR(255) | UNIQUE, NOT NULL, INDEX | — | Email address |
| `hashed_password` | VARCHAR(255) | NOT NULL | — | Bcrypt-hashed password |
| `full_name` | VARCHAR(255) | — | NULL | Display name |
| `role` | VARCHAR(50) | NOT NULL | `'viewer'` | Role name (FK → roles.name) |
| `status` | VARCHAR(20) | NOT NULL | `'pending_approval'` | `active`, `pending_approval`, `rejected` |
| `is_active` | BOOLEAN | — | `FALSE` | Account active flag |
| `two_factor_enabled` | BOOLEAN | — | `FALSE` | 2FA enabled flag |
| `two_factor_secret` | VARCHAR(100) | — | NULL | TOTP secret key |
| `login_attempts` | INTEGER | — | `0` | Failed login counter |
| `locked_until` | TIMESTAMP | — | NULL | Account lockout expiry |
| `last_failed_login` | TIMESTAMP | — | NULL | Last failed login timestamp |
| `last_login` | TIMESTAMP | — | NULL | Last successful login timestamp |
| `reset_token` | VARCHAR(255) | — | NULL | Password reset token |
| `reset_token_expires` | TIMESTAMP | — | NULL | Password reset token expiry |
| `password_changed_at` | TIMESTAMP | — | NULL | Last password change timestamp |
| `version` | INTEGER | — | `0` | Optimistic locking version |
| `created_at` | TIMESTAMP | — | `NOW()` | Record creation timestamp |
| `updated_at` | TIMESTAMP | — | `NOW()` | Record update timestamp |

**Indexes:**
- `idx_users_username` (username)
- `idx_users_email` (email)
- `idx_users_status` (status)
- `idx_users_role` (role)

### 4.2 Tabel: `roles`

| Field | Tipe Data | Constraints | Default | Deskripsi |
|-------|-----------|-------------|---------|-----------|
| `id` | SERIAL | PRIMARY KEY | — | Auto-increment role ID |
| `name` | VARCHAR(50) | UNIQUE, NOT NULL | — | Role name (e.g., `viewer`, `admin`) |
| `description` | TEXT | — | NULL | Role description |
| `modules` | JSONB | — | `'[]'` | Array of module keys this role can access |
| `settings_tabs` | JSONB | — | `'["general", "sessions"]'` | Array of settings tab keys |
| `is_system` | BOOLEAN | — | `FALSE` | System role (cannot be deleted) |
| `version` | INTEGER | — | `0` | Optimistic locking version |
| `created_at` | TIMESTAMP | — | `NOW()` | Record creation timestamp |

**Indexes:**
- `idx_roles_name` (name)

### 4.3 Tabel: `user_module_access`

| Field | Tipe Data | Constraints | Default | Deskripsi |
|-------|-----------|-------------|---------|-----------|
| `id` | SERIAL | PRIMARY KEY | — | Auto-increment ID |
| `user_id` | INTEGER | NOT NULL, FK → users.id, INDEX | — | User reference |
| `module` | VARCHAR(50) | NOT NULL | — | Module key (e.g., `dashboard`, `tasks`) |
| `can_access` | BOOLEAN | NOT NULL | `TRUE` | Access grant flag |

**Indexes:**
- `idx_uma_user_id` (user_id)
- `idx_uma_user_module` (user_id, module) — Composite index for fast lookup

**Composite Unique Constraint:**
- `UNIQUE(user_id, module)` — Prevent duplicate module assignments per user

### 4.4 Tabel: `user_sessions`

| Field | Tipe Data | Constraints | Default | Deskripsi |
|-------|-----------|-------------|---------|-----------|
| `id` | SERIAL | PRIMARY KEY | — | Auto-increment session ID |
| `user_id` | INTEGER | NOT NULL, FK → users.id, INDEX | — | User reference |
| `token_jti` | VARCHAR(255) | UNIQUE, NOT NULL, INDEX | — | JWT JTI (unique session identifier) |
| `ip_address` | VARCHAR(45) | — | NULL | Client IP address |
| `user_agent` | TEXT | — | NULL | Browser/device user agent |
| `created_at` | TIMESTAMP | — | `NOW()` | Session creation timestamp |
| `expires_at` | TIMESTAMP | — | `NOW() + 7 days` | Session expiry timestamp |
| `is_active` | BOOLEAN | — | `TRUE` | Session active flag |

**Indexes:**
- `idx_sessions_user_id` (user_id)
- `idx_sessions_token_jti` (token_jti)
- `idx_sessions_user_active` (user_id, is_active) — For active session count

### 4.5 Tabel: `app_settings`

| Field | Tipe Data | Constraints | Default | Deskripsi |
|-------|-----------|-------------|---------|-----------|
| `id` | SERIAL | PRIMARY KEY | — | Auto-increment ID |
| `category` | VARCHAR(50) | NOT NULL, INDEX | — | Settings category (e.g., `security`) |
| `key` | VARCHAR(100) | NOT NULL | — | Setting key name |
| `value` | TEXT | — | NULL | Setting value |

**Indexes:**
- `idx_app_settings_category` (category)
- `idx_app_settings_category_key` (category, key) — Composite index

**Security Settings Records:**
| category | key | Default Value | Deskripsi |
|----------|-----|---------------|-----------|
| `security` | `max_login_attempts` | `5` | Max failed attempts before lockout |
| `security` | `lockout_duration_minutes` | `30` | Lockout duration in minutes |
| `security` | `max_concurrent_sessions` | `0` | Max concurrent sessions (0 = unlimited) |
| `security` | `session_timeout` | `1440` | Session timeout in minutes (24h) |
| `security` | `min_password_length` | `8` | Minimum password length |
| `security` | `require_uppercase` | `true` | Require uppercase letter |
| `security` | `require_numbers` | `true` | Require number |
| `security` | `require_special_chars` | `false` | Require special character |
| `security` | `password_expiry_days` | `0` | Password expiry (0 = never) |

### 4.6 Struktur Relasi

```
┌─────────────┐       ┌──────────────────────┐       ┌─────────────┐
│   roles     │       │       users          │       │user_sessions│
├─────────────┤       ├──────────────────────┤       ├─────────────┤
│ id (PK)     │◄──────│ role (FK→roles.name) │       │ id (PK)     │
│ name (UK)   │       │ id (PK)              │    ┌──│ user_id     │
│ modules     │       │ username (UK)        │    │  │ token_jti   │
│ settings_tabs│      │ email (UK)           │    │  │ ip_address  │
│ is_system   │       │ hashed_password      │    │  │ user_agent  │
│ version     │       │ status               │    │  │ expires_at  │
└─────────────┘       │ two_factor_enabled   │    │  │ is_active   │
                      │ login_attempts       │    │  └─────────────┘
                      │ locked_until         │    │
                      │ password_changed_at  │    │
                      │ version              │    │
                      └──────────┬───────────┘    │
                                 │                │
                                 │ 1:N            │ 1:N
                                 ▼                │
                      ┌──────────────────────┐    │
                      │user_module_access    │    │
                      ├──────────────────────┤    │
                      │ id (PK)              │    │
                      │ user_id (FK→users.id)│────┘
                      │ module               │
                      │ can_access           │
                      └──────────────────────┘
```

**Relasi Summary:**
- `roles` 1:N `users` — Satu role bisa dimiliki banyak user (via `role` string FK)
- `users` 1:N `user_module_access` — Satu user bisa punya banyak module access records
- `users` 1:N `user_sessions` — Satu user bisa punya banyak active sessions
- `users` N:M `modules` — Via `user_module_access` join table
- `app_settings` — Key-value store, tidak ada FK, diakses via category + key
