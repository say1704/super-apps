# Authentication & Login

## Overview
- Path: /login
- Purpose: User authentication system
- Status: COMPLETE

## Features
- Username/password login
- JWT token-based authentication
- Access token + Refresh token
- Role-based access control (superadmin, auditor, manager, viewer)
- Module-based access control (per-user module permissions)
- Login lockout after failed attempts (configurable)
- Password policy enforcement (configurable)
- Password visibility toggle (eye icon)
- Theme toggle (dark/light mode)

## Login Flow
1. User enters username and password
2. POST /token with form data
3. Backend verifies password, checks lockout status
4. Returns access_token, refresh_token, user info with modules
5. Frontend stores token in localStorage
6. Redirects to dashboard

## Token Management
- Access token expiry: configurable (default 8 hours)
- Refresh token expiry: configurable (default 30 days)
- Auto-logout on 401 response
- Token stored in localStorage with user info

## API Endpoints
- POST /token - Login (OAuth2PasswordBearer)
- POST /token/refresh - Refresh access token

## Security Features
- Password hashing with bcrypt
- Login attempt tracking
- Account lockout after max attempts
- Lockout duration configurable in Settings
- Activity logging for LOGIN/LOGOUT

## Files
- frontend/app/login/page.tsx
- frontend/lib/auth.tsx
- frontend/lib/token-manager.ts
- backend/main.py (token endpoints)
- backend/models.py (User model with verify_password)

## Database
- Table: users
- Key fields: username, hashed_password, full_name, role, is_active, login_attempts, locked_until, last_failed_login

## Default Users
| Username | Role | Password |
|----------|------|----------|
| admin | superadmin | CHANGE_ME |
| soni | superadmin | soni123 |
| test | viewer | test123 |
