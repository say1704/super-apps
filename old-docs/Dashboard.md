# Dashboard

## Overview

The Dashboard is the main landing page displayed after successful login. It provides an IT Management overview with system-wide statistics, today's productivity metrics, and quick-access shortcuts to all 15 modules. Data is delivered in real-time via Server-Sent Events (SSE) with automatic updates and visual feedback when values change.

| Property | Value |
|---|---|
| **Route** | `/` (root) |
| **File** | `frontend/app/page.tsx` |
| **Framework** | Next.js (App Router, Client Component) |
| **Auth Required** | Yes |
| **Real-time** | SSE with auto-reconnect |

---

## Features

### System-Wide Stats Cards

Eight stat cards display aggregate counts across the entire system:

| Card | Source Field | Color | Description |
|---|---|---|---|
| Open Incidents | `open_incidents` | Red | Incident reports with status = "Open" |
| High Vulnerabilities | `high_vulnerabilities` | Orange | Sum of `high_count` from all vulnerability reports |
| Active Tasks | `active_tasks` | Blue | Project tasks where status != "done" |
| Total Documents | `documents_count` | Green | Total document library entries |
| L&M Records | `log_maintenance_count` | Purple | Total log & maintenance entries |
| Server Checks | `monthly_checks_count` | Indigo | Total monthly server check records |
| Risk Assessments | `risk_assessments_count` | Orange | Total risk assessment forms |
| Quality Objectives | `quality_objectives_count` | Green | Total quality objective records |

### Today's Overview

Seven metrics provide a snapshot of daily and weekly productivity:

| Metric | Source | Description |
|---|---|---|
| Today's Tasks | `enhancedData.today.tasks` | Tasks due today |
| Today's Worklogs | `enhancedData.today.worklogs` | Worklogs logged today |
| Hours Today | `enhancedData.today.hours` | Total hours logged today (rounded to 1 decimal) |
| Week Hours | `enhancedData.week.hours` | Total hours logged this week (Mon–today) |
| Completion Rate | `enhancedData.tasks.completion_rate` | Percentage of tasks with status = "done" |
| Overdue | `enhancedData.overdue` | Count of incomplete tasks past their due date |
| Urgent Tasks | `enhancedData.priority.urgent` | Tasks with priority = "high" |

### Task Status Breakdown

A three-column panel shows the pipeline of project tasks:

| Status | Color | Filter |
|---|---|---|
| To Do | Gray | `status = "todo"` |
| Doing | Blue | `status = "doing"` |
| Done | Green | `status = "done"` |

### Weekly Activity by Category

Lists the top 5 worklog categories for the current week (Monday through today), showing category name and entry count. Displays "No worklogs this week" when empty.

### Activity Chart

A bar chart visualizing worklog counts for the last 7 days. Bar heights are normalized to the day with the highest count (minimum 10% height). Each bar is labeled with the date in `id-ID` locale format (e.g., "4 Mei").

### Overdue Tasks

A red-tinted panel listing up to 5 overdue tasks (incomplete tasks where `due_date < today`). Each entry shows the task title and its due date. The panel is hidden when there are no overdue tasks.

### Module Shortcut Grid

A responsive grid of 15 module cards with emoji icons. Each card links to its respective module page and scales up on hover.

| Module | Icon | Route | Key |
|---|---|---|---|
| Log & Maintenance | 📝 | `/modules/log-maintenance` | `log-maintenance` |
| Server Capacity | 📈 | `/modules/monthly-server-check` | `monthly-server-check` |
| Vulnerability Report | 🔒 | `/modules/vulnerability` | `vulnerability` |
| Incident Report | ⚠️ | `/modules/incident` | `incident` |
| Documentation | 📚 | `/modules/documentation` | `documentation` |
| Asset Register | 📦 | `/modules/assets` | `assets` |
| Risk Assessment | ⚖️ | `/modules/risk` | `risk` |
| Quality Objectives | 🎯 | `/modules/quality` | `quality` |
| Form Uploads | 📄 | `/modules/forms` | `forms` |
| Worklog | 📅 | `/modules/worklog` | `worklog` |
| Project Tasks | ✅ | `/modules/tasks` | `tasks` |
| Backup Analytics | 💾 | `/modules/backup-analytics` | `backup-analytics` |
| Backup Check | 🔍 | `/modules/backup-check` | `backup-check` |
| Activity Logs | 📋 | `/modules/activity` | `activity` |
| Settings | ⚙️ | `/modules/settings` | `settings` |

---

## Real-time Features

### SSE Connection

The dashboard establishes a Server-Sent Events connection on mount via `useRealtimeEvents` hook. The connection uses the `SSEClient` class which provides automatic reconnection with exponential backoff.

| Property | Value |
|---|---|
| **Endpoint** | `/events/stream` |
| **Auth** | Token passed as query parameter (`?token=...`) |
| **Heartbeat** | 30-second comment heartbeat (`: heartbeat`) |
| **Max Reconnect Attempts** | 10 |
| **Backoff Strategy** | Exponential, starting at 1s, capped at 30s |

### Event Handlers

The dashboard listens for four event types and triggers a debounced data refetch (2-second debounce) on each:

| Event | Trigger |
|---|---|
| `task_created` | New project task created |
| `task_updated` | Existing project task modified |
| `worklog_created` | New worklog entry logged |
| `incident_created` | New incident report filed |

### Visual Feedback

- **Flash Effect**: When a stat value changes after an SSE-triggered refetch, the affected card briefly scales to 105% with a blue ring (`scale-105 ring-2 ring-blue-400`) for 1 second.
- **Live Badge**: A green pulsing dot with "Live" text appears in the header when the SSE connection is active.
- **Last Updated**: A relative timestamp ("Just now", "5s ago", "2m ago") updates every 5 seconds.
- **Online Users**: Displays the count of currently connected users, refreshed every 30 seconds and on `user_online`/`user_offline` events.

### Polling Fallback

In addition to SSE, the dashboard polls both stats endpoints every 60 seconds to ensure data freshness.

---

## API Endpoints Used

### GET `/dashboard/stats`

Returns system-wide aggregate counts. Requires Bearer token authentication.

**Response:**

```json
{
  "total_users": 12,
  "log_maintenance_count": 450,
  "irmc_checks_count": 80,
  "monthly_checks_count": 120,
  "vulnerability_reports_count": 35,
  "incident_reports_count": 15,
  "documents_count": 200,
  "assets_hardware_count": 50,
  "assets_software_count": 30,
  "assets_vm_count": 25,
  "configuration_items_count": 40,
  "form_uploads_count": 60,
  "risk_assessments_count": 20,
  "quality_objectives_count": 10,
  "open_incidents": 5,
  "high_vulnerabilities": 12,
  "active_tasks": 25
}
```

**Source:** `backend/main.py:1548`

### GET `/api/dashboard/enhanced`

Returns enriched dashboard data including today's metrics, weekly breakdown, task status, priority distribution, overdue tasks, and recent activity. Requires Bearer token authentication.

**Response:**

```json
{
  "today": {
    "tasks": 3,
    "worklogs": 5,
    "hours": 4.5
  },
  "week": {
    "worklogs": 22,
    "hours": 18.0,
    "by_category": [
      { "name": "Incident", "count": 8 },
      { "name": "Maintenance", "count": 6 }
    ]
  },
  "tasks": {
    "total": 50,
    "todo": 15,
    "doing": 10,
    "done": 25,
    "completion_rate": 50.0
  },
  "priority": {
    "urgent": 5,
    "normal": 30,
    "low": 15
  },
  "overdue": 3,
  "overdue_tasks": [
    { "id": 1, "title": "Fix server issue", "due_date": "2026-04-28" }
  ],
  "recent_activity": [
    { "date": "2026-04-28", "count": 5 },
    { "date": "2026-04-29", "count": 3 }
  ]
}
```

**Source:** `backend/main.py:4787`

### GET `/events/stream`

SSE event stream endpoint. Authentication is done via query parameter (`?token=...`) because `EventSource` does not support custom headers. Returns a `StreamingResponse` with `text/event-stream` media type.

**Events emitted:**

| Event | Data |
|---|---|
| `connected` | `{ user_id, username }` |
| `task_created` | Task details |
| `task_updated` | Task details |
| `worklog_created` | Worklog details |
| `incident_created` | Incident details |
| `user_online` | User details |
| `user_offline` | User details |

**Source:** `backend/main.py:4311`

### GET `/api/online-users`

Returns the list of currently connected users with enriched profile information. Requires Bearer token authentication.

**Response:**

```json
{
  "users": [
    {
      "user_id": 1,
      "username": "admin",
      "full_name": "Administrator",
      "role": "superadmin"
    }
  ],
  "count": 1
}
```

**Source:** `backend/main.py:4355`

---

## Files

| File | Purpose |
|---|---|
| `frontend/app/page.tsx` | Main dashboard page component (357 lines) |
| `frontend/hooks/useRealtimeEvents.ts` | React hook for SSE connection, online users, and event handling (69 lines) |
| `frontend/lib/event-source.ts` | `SSEClient` class with auto-reconnect and exponential backoff (94 lines) |
| `backend/main.py` | Backend endpoints: `/dashboard/stats` (line 1548), `/api/dashboard/enhanced` (line 4787), `/events/stream` (line 4311), `/api/online-users` (line 4355) |

---

## Component Structure

### StatCard

Reusable component for displaying a single metric with color-coded background and optional flash animation.

**Props:**

| Prop | Type | Description |
|---|---|---|
| `title` | `string` | Label displayed above the value |
| `value` | `number \| string` | The metric value (number or formatted string like "50.0%") |
| `color` | `string` | One of: `red`, `orange`, `blue`, `green`, `purple`, `indigo` |
| `isDark` | `boolean` | Whether dark mode is active |
| `flash` | `boolean` (optional) | Triggers scale + ring animation when true |

**Color Mapping:**

| Color | Light Mode | Dark Mode |
|---|---|---|
| `red` | `bg-red-100 text-red-800` | `bg-red-900/50 text-red-300` |
| `orange` | `bg-orange-100 text-orange-800` | `bg-orange-900/50 text-orange-300` |
| `blue` | `bg-blue-100 text-blue-800` | `bg-blue-900/50 text-blue-300` |
| `green` | `bg-green-100 text-green-800` | `bg-green-900/50 text-green-300` |
| `purple` | `bg-purple-100 text-purple-800` | `bg-purple-900/50 text-purple-300` |
| `indigo` | `bg-indigo-100 text-indigo-800` | `bg-indigo-900/50 text-indigo-300` |

**Source:** `frontend/app/page.tsx:339`

### Module Grid

Renders a responsive grid (`grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5`) of module cards. Each card is a Next.js `Link` component with hover effects (`hover:shadow-lg hover:scale-105`).

---

## Security

### Authentication

- The page requires a valid authenticated user. Unauthenticated users are redirected to `/login` via `router.push('/login')`.
- All API requests include a `Bearer` token in the `Authorization` header.
- The SSE endpoint receives the token as a query parameter (`?token=...`) due to `EventSource` API limitations.

### Module Visibility

Module cards are filtered based on the user's `user.modules` array:

```tsx
allModules.filter(
  (m) => !user?.modules || user.modules.length === 0 || user.modules.includes(m.key)
)
```

- If `user.modules` is `null`, `undefined`, or an empty array, all modules are visible.
- Otherwise, only modules whose `key` is present in `user.modules` are displayed.

### SSE Token Exposure

The SSE token is passed in the URL query string. This is a known limitation of the `EventSource` API which does not support custom headers. The token is URL-encoded before being appended to the connection URL.

---

## Data Flow

```
┌─────────────────────────────────────────────────────┐
│                    Dashboard Page                    │
│                                                      │
│  ┌──────────────┐    ┌───────────────────────────┐  │
│  │  fetchDashboard() │                           │  │
│  │  (60s interval)   │                           │  │
│  └───────┬──────┘    │                           │  │
│          │           │    ┌──────────────────┐   │  │
│          ▼           │    │  useRealtimeEvents│   │  │
│  ┌──────────────┐    │    │  (SSE connection) │   │  │
│  │ GET /dashboard│    │    └────────┬─────────┘   │  │
│  │ /stats        │    │             │             │  │
│  │               │    │             │ events      │  │
│  │ GET /api/     │    │             ▼             │  │
│  │ dashboard/    │    │    ┌──────────────────┐   │  │
│  │ enhanced      │    │    │ handleSSEEvent() │   │  │
│  └───────┬───────┘    │    │ (2s debounce)    │   │  │
│          │            │    └────────┬─────────┘   │  │
│          ▼            │             │             │  │
│  ┌──────────────┐    │             │             │  │
│  │ setStats()   │    │             ▼             │  │
│  │ setEnhanced  │    │    ┌──────────────────┐   │  │
│  │ Data()       │    │    │ fetchDashboard() │   │  │
│  └───────┬──────┘    │    │ (with flash)     │   │  │
│          │            │    └──────────────────┘   │  │
│          ▼                                       │  │
│  ┌──────────────┐                                │  │
│  │ Flash Effect │                                │  │
│  │ on changed   │                                │  │
│  │ cards        │                                │  │
│  └──────────────┘                                │  │
│                                                   │  │
└───────────────────────────────────────────────────┘
```
