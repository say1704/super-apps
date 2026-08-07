# Notifications Module

## Overview
- Path: /modules/notifications
- Purpose: In-app notification system with email support
- Status: COMPLETE

## Notification Types
| Type | Trigger | Email |
|------|---------|-------|
| Task Assigned | Task assigned to user | Yes |
| Incident Created | New incident report | Yes |
| Backup Failed | Backup check failure | Yes |
| Task Due Reminder | Task approaching due date | Yes |

## Features
- Notification inbox page with list view
- Unread count badge in sidebar bell icon
- Mark as read / Mark all as read
- Auto-fetch unread count every 60 seconds
- Email delivery via SMTP (configurable in Settings)
- 4 HTML email templates (task_assigned, incident_created, backup_failed, task_due_reminder)

## API Endpoints
- GET /api/notifications - List notifications
- GET /api/notifications/unread-count - Unread count
- POST /api/notifications/{id}/read - Mark as read
- POST /api/notifications/read-all - Mark all as read

## Files
- frontend/app/modules/notifications/page.tsx
- frontend/components/sidebar.tsx (bell icon with badge)
- backend/utils/email_service.py
- backend/utils/notification_dispatcher.py
- backend/templates/email/ (4 HTML templates)
- backend/main.py (notification endpoints)

## Database
- Table: notifications
- Key fields: user_id, type, title, message, is_read, created_at

## Email Service
- SMTP configuration from Settings
- HTML email templates with branding
- Configurable alert recipients
