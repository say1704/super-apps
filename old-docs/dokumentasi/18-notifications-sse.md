# Module 18: Notifications & Real-time (SSE)

## 1. Function
In-app notification system with read/unread tracking, Server-Sent Events (SSE) for real-time updates, and online user presence detection.

## 2. Business Logic

### 2.1 Notifications
- **Per-User**: Each notification belongs to a specific user
- **Types**: task_assigned, incident_created, etc. (driven by `notification_dispatcher`)
- **Read Status**: `is_read` boolean, with unread-only filter and mark-all-read
- **Links**: Optional `link` field for navigation to related content
- **Pagination**: Default 50 per page, ordered by created_at descending

### 2.2 SSE (Server-Sent Events)
- **Connection**: `/events/stream` establishes persistent SSE connection per user
- **Authentication**: Uses query param token via `get_current_user_from_query`
- **Heartbeat**: 30-second timeout heartbeat to keep connection alive
- **Events**: `task_created`, `task_updated`, `worklog_created`, `incident_created`, `user_offline`, etc.
- **CORS**: Origin validation via `_is_origin_allowed()`
- **Disconnect**: On client disconnect, broadcasts `user_offline` event

### 2.3 Online Users
- Tracked via SSE manager connection state
- Returns user_id, username, full_name, role, last_login
- Count included in response

## 3. API Endpoints

| Method | Endpoint | Response Model | Auth | Description |
|--------|----------|---------------|------|-------------|
| GET | `/notifications` | `NotificationListPaginatedResponse` | JWT | List user's notifications |
| GET | `/notifications/unread-count` | `UnreadCountResponse` | JWT | Get unread notification count |
| POST | `/notifications/{id}/read` | `MessageResponse` | JWT | Mark single notification as read |
| POST | `/notifications/read-all` | `MarkAllReadResponse` | JWT | Mark all notifications as read |
| GET | `/events/stream` | SSE stream | Query Token | Real-time event stream |
| GET | `/online-users` | `OnlineUserListResponse` | JWT | Get currently online users |

### 3.1 Query Parameters (GET /notifications)

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | int | 1 | Page number |
| `page_size` | int | 50 | Items per page |
| `unread_only` | bool | false | Show only unread notifications |

## 4. Database Schema

### `notifications`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | Integer (PK) | No | - | Auto-increment |
| `user_id` | Integer (FK→users.id) | No | - | Target user |
| `type` | String(50) | No | - | Notification type |
| `title` | String(255) | No | - | Notification title |
| `message` | Text | No | - | Notification body |
| `is_read` | Boolean | Yes | false | Read status |
| `link` | String(500) | Yes | - | Navigation link |
| `created_at` | DateTime | Yes | utcnow | Creation timestamp |

### PostgreSQL Migration

```sql
CREATE TABLE notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  link VARCHAR(500),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_notification_user ON notifications(user_id);
CREATE INDEX idx_notification_read ON notifications(is_read);
CREATE INDEX idx_notification_created ON notifications(created_at);
```
