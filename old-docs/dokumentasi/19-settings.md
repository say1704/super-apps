# Module 19: Settings

## 1. Function
System settings management including SMTP email configuration, app settings by category, Admin UI (sqlite-web) management, database backup/restore, and automated backup scheduling.

## 2. Business Logic

### 2.1 SMTP Settings
- **Key-Value Store**: Stored in `smtp_settings` table with predefined keys
- **Keys**: smtp_host, smtp_port, smtp_username, smtp_password, smtp_from_email, smtp_from_name, smtp_use_tls, smtp_enabled
- **Test Email**: Validates SMTP connectivity (socket test) and sends test email with full error handling (auth, connect, timeout)

### 2.2 App Settings
- **Categories**: general, security, notification, api
- **Key-Value Store**: Stored in `app_settings` table with category grouping
- **CRUD by Category**: Get/update all settings within a category
- **All Settings**: `/settings/all` returns all categories in one response

### 2.3 Admin UI (sqlite-web)
- **Management**: Start/stop/restart sqlite-web process on port 8002
- **Password Protection**: `SQLITE_WEB_PASSWORD` env variable
- **Process Detection**: Uses `pgrep` to check if sqlite-web is running
- **Activity Logging**: All Admin UI actions logged

### 2.4 Database Backup
- **Manual Backup**: Copies `superapps.db` to `backups/` with timestamp filename
- **List Backups**: Shows filename, size, creation time for all backups
- **Restore**: Replaces current database with backup file
- **Delete**: Removes backup file
- **Activity Logging**: All backup operations logged

### 2.5 Backup Schedule
- **Frequency**: hourly, daily, weekly, monthly
- **Time**: HH:MM format with validation
- **Day Options**: day_of_week (0-6), day_of_month (1-28)
- **Retention**: retention_days and max_backups limits
- **Auto-Scheduler**: Integrates with `APScheduler` via `backup_scheduler`
- **Run Now**: Manual trigger of scheduled backup

## 3. API Endpoints

### 3.1 SMTP

| Method | Endpoint | Response Model | Auth | Description |
|--------|----------|---------------|------|-------------|
| GET | `/settings/smtp` | `dict` | JWT | Get SMTP configuration |
| PUT | `/settings/smtp` | `MessageResponse` | JWT | Update SMTP settings |
| POST | `/settings/smtp/test` | `SmtpTestResponse` | JWT | Test SMTP connection and send email |

### 3.2 App Settings

| Method | Endpoint | Response Model | Auth | Description |
|--------|----------|---------------|------|-------------|
| GET | `/settings/{category}` | `dict` | JWT | Get settings for category |
| PUT | `/settings/{category}` | `MessageResponse` | JWT | Update settings for category |
| GET | `/settings/all` | `dict` | JWT | Get all settings |

### 3.3 Admin UI

| Method | Endpoint | Response Model | Auth | Description |
|--------|----------|---------------|------|-------------|
| GET | `/settings/admin-ui` | `AdminUiResponse` | JWT | Get Admin UI status |
| POST | `/settings/admin-ui` | `MessageResponse` | JWT | Set password and restart |
| POST | `/settings/admin-ui/restart` | `MessageResponse` | JWT | Restart Admin UI |

### 3.4 Backup

| Method | Endpoint | Response Model | Auth | Description |
|--------|----------|---------------|------|-------------|
| POST | `/settings/backup` | `SettingsBackupResponse` | JWT | Create manual backup |
| GET | `/settings/backup/list` | `dict` | JWT | List all backups |
| POST | `/settings/backup/restore` | `SettingsRestoreResponse` | JWT | Restore from backup |
| DELETE | `/settings/backup/{filename}` | `MessageResponse` | JWT | Delete backup file |

### 3.5 Backup Schedule

| Method | Endpoint | Response Model | Auth | Description |
|--------|----------|---------------|------|-------------|
| GET | `/settings/backup/schedule` | `dict` | JWT | Get backup schedule |
| POST | `/settings/backup/schedule` | `MessageResponse` | JWT | Create/update schedule |
| POST | `/settings/backup/schedule/run-now` | `MessageResponse` | JWT | Trigger backup immediately |

## 4. Database Schema

### `smtp_settings`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | Integer (PK) | No | - | Auto-increment |
| `key` | String | No | - | Unique setting key |
| `value` | Text | Yes | - | Setting value |
| `updated_at` | DateTime | Yes | utcnow | Last update timestamp |
| `version` | Integer | Yes | 0 | Optimistic locking |

### `app_settings`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | Integer (PK) | No | - | Auto-increment |
| `category` | String | No | - | general, security, notification, api |
| `key` | String | No | - | Unique setting key |
| `value` | Text | Yes | - | Setting value |
| `updated_at` | DateTime | Yes | utcnow | Last update timestamp |
| `version` | Integer | Yes | 0 | Optimistic locking |

### `backup_schedule`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | Integer (PK) | No | - | Auto-increment |
| `frequency` | String | No | "daily" | hourly, daily, weekly, monthly |
| `time` | String | Yes | "02:00" | HH:MM format |
| `day_of_week` | Integer | Yes | - | 0=Monday to 6=Sunday |
| `day_of_month` | Integer | Yes | - | 1-28 |
| `enabled` | Boolean | Yes | true | Schedule enabled |
| `retention_days` | Integer | Yes | 30 | Auto-delete old backups |
| `max_backups` | Integer | Yes | 10 | Max backups to keep |
| `last_run` | DateTime | Yes | - | Last execution timestamp |
| `next_run` | DateTime | Yes | - | Next scheduled timestamp |
| `created_at` | DateTime | Yes | utcnow | Creation timestamp |

### PostgreSQL Migration

```sql
CREATE TABLE smtp_settings (
  id SERIAL PRIMARY KEY,
  key VARCHAR(100) UNIQUE NOT NULL,
  value TEXT,
  updated_at TIMESTAMP DEFAULT NOW(),
  version INTEGER DEFAULT 0
);

CREATE TABLE app_settings (
  id SERIAL PRIMARY KEY,
  category VARCHAR(50) NOT NULL,
  key VARCHAR(100) UNIQUE NOT NULL,
  value TEXT,
  updated_at TIMESTAMP DEFAULT NOW(),
  version INTEGER DEFAULT 0
);

CREATE INDEX idx_app_settings_category ON app_settings(category);

CREATE TABLE backup_schedule (
  id SERIAL PRIMARY KEY,
  frequency VARCHAR(20) NOT NULL DEFAULT 'daily',
  time VARCHAR(10) DEFAULT '02:00',
  day_of_week INTEGER,
  day_of_month INTEGER,
  enabled BOOLEAN DEFAULT true,
  retention_days INTEGER DEFAULT 30,
  max_backups INTEGER DEFAULT 10,
  last_run TIMESTAMP,
  next_run TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
```
