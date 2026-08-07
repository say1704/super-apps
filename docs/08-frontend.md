# Frontend Documentation

## Tech Stack

| Teknologi | Versi / Detail |
|-----------|----------------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript (strict) |
| CSS | Tailwind CSS v4 |
| UI Components | Tremor, Tremor Raw, shadcn/ui |
| Charts | Tremor Chart, Recharts |
| State | React Context |
| Testing | Vitest (unit), Playwright (e2e) |

## Pages & Routes

### Route Structure

```
/app
├── /login                         — Login page
├── /otp                           — 2FA OTP verification
├── /forgot-password               — Reset password
├── /dashboard                     — Main dashboard with KPI widgets
├── /assets                        — Asset list
├── /assets/[id]                   — Asset detail
├── /assets/new                    — Create asset
├── /assets/[id]/edit              — Edit asset
├── /purchasing                    — Purchase orders
├── /purchasing/pos/[id]           — PO detail
├── /risk                          — Risk register
├── /risk/[id]                     — Risk detail
├── /quality                       — Quality dashboard
├── /quality/documents             — Document control
├── /quality/audits                — Audit management
├── /backup                        — Backup & DR
├── /backup/jobs                   — Backup jobs
├── /backup/verifications          — Restore verification
├── /network                       — Network monitoring
├── /network/devices               — Device list
├── /service-desk                  — Ticket list
├── /service-desk/tickets/[id]     — Ticket detail
├── /projects                      — Project list
├── /projects/[id]                 — Project detail (Gantt)
├── /contracts                     — Contract list
├── /contracts/[id]                — Contract detail
├── /compliance                    — Compliance dashboard
├── /finance                       — Finance dashboard
├── /finance/budgets               — Budget management
├── /ai                            — AI Assistant chat
├── /ai/workflows                  — Workflow management
├── /reports                       — Report center
├── /notifications                 — Notification list
├── /audit                         — Audit trail (Admin)
├── /settings                      — System settings (Admin)
├── /settings/users                — User management
├── /settings/roles                — Role management
├── /settings/modules              — Module configuration
├── /help                          — Knowledge base & FAQ
└── /maintenance                   — Maintenance schedule
```

## Component Architecture

### Directory Structure

```
components/
├── layout/
│   ├── AppShell                  — Main layout with sidebar
│   ├── Sidebar                   — Navigation sidebar (module-based)
│   ├── Topbar                    — Top bar with search, notifications, user menu
│   └── Breadcrumb                — Breadcrumb navigation
├── ui/
│   ├── Button, Input, Select, Modal, Table, Card, Badge...
│   └── (dari Tremor + shadcn/ui)
├── data/
│   ├── DataTable                 — Dynamic table with sort, filter, pagination
│   ├── SearchBar                 — Global search with filters
│   ├── FilterPanel               — Advanced filter controls
│   └── ExportButton              — Export CSV/PDF/Excel
├── dashboard/
│   ├── KPIWidget                 — Stat card with trend
│   ├── ChartCard                 — Chart wrapper
│   ├── RecentActivity            — Activity feed
│   └── QuickActions              — Action shortcuts
├── charts/
│   ├── BarChart, LineChart, PieChart, AreaChart, DonutChart
│   └── (wrapper untuk Tremor + Recharts)
├── realtime/
│   ├── NotificationBell          — Live notification count
│   ├── ConnectionStatus          — SSE connection indicator
│   └── LiveUpdates               — Real-time data display
├── content/
│   ├── DashboardContent          — Module-specific dashboards
│   ├── FormFields                — Reusable form components
│   ├── DetailView                — Read-only detail layout
│   └── EmptyState                — Empty state placeholder
└── ai/
    ├── ChatInterface             — Full chat UI
    ├── MessageBubble             — Chat message (user/AI)
    ├── TypingIndicator           — AI typing animation
    ├── SuggestionChips           — Quick action suggestions
    └── WizardDialog              — Multi-step wizard modal
```

## Auth Flow (Frontend)

### Alur Autentikasi

1. **`lib/AuthContext.tsx`** — provide user state, login/logout functions
2. **Login**: POST `/api/auth/login` → set cookie → redirect ke dashboard
3. **OTP**: POST `/api/auth/otp/verify` → activate session
4. **Token refresh**: Auto-refresh via axios interceptor (jika 401, coba refresh)
5. **Route protection**: `AuthGuard` wrapper + `useAuth` hook
6. **Role-based UI**: Conditional rendering berdasarkan `user.role`
7. **Inactivity**: `useInactivityTimeout` hook → warning → auto-logout (15 menit)

## State Management

### React Context (Global)

| Context | State |
|---------|-------|
| `AuthContext` | user, session, permissions |
| `ThemeContext` | dark/light mode |
| `NotificationContext` | unread count, notifications |

### Custom Hooks (Module-specific)

| Hook | Fungsi |
|------|--------|
| `useAssets` | Asset CRUD operations |
| `useRisk` | Risk operations |
| `useTickets` | Ticket management |
| `useAI` | AI chat, sessions |

## API Proxy (`server.js`)

### Fitur Proxy

- Verifikasi JWT (cookie `access_token` atau `__Secure-access_token`)
- Rate limit (30 req/min per IP, 429 jika limit exceeded)
- Audit log (timestamp, IP, method, path, status, duration)
- Proxy `/admin-ui/*` → `http://127.0.0.1:8082/admin-ui/*`
- Proxy `/` → Next.js handler
- Serving static files
- Compression
- HTTPS

## Testing

### Unit Tests (Vitest)

- Test utils, hooks, components
- Run: `npx vitest`

### E2E Tests (Playwright)

- Browser automation
- Full user flow testing
- Run: `npx playwright test`

## Key Custom Hooks

| Hook | Deskripsi |
|------|-----------|
| `useAuth` | Authentication state & methods |
| `useInactivityTimeout` | 15 menit idle detection |
| `useSSE` | Server-Sent Events untuk real-time data |
| `useTheme` | Dark/light mode toggle |
| `useKeyboardShortcuts` | Keyboard navigation (Ctrl+K search, Escape close) |
| `useOptimisticLock` | Version conflict handling |
| `useDebounce` | Debounced search input |
| `usePagination` | Paginated data fetching |
