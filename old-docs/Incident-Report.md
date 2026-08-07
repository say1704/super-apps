# Incident Report Module

## Overview

| Attribute | Details |
|-----------|---------|
| **Path** | `/modules/incident` |
| **Purpose** | Track and manage incident reports |
| **Status** | LOCKED (Production Ready) |

## Features

- CRUD operations for incident reports
- Pagination: 10 / 20 / 50 / 100 rows per page
- Sortable columns
- Search & Filters
- Export CSV
- Status tracking: Open, In Progress, Resolved, Closed
- Incident type categorization
- Modular components

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/incident-report` | List incident reports (with pagination) |
| `POST` | `/api/incident-report` | Create a new incident report |
| `PUT` | `/api/incident-report/{id}` | Update an existing incident report |
| `DELETE` | `/api/incident-report/{id}` | Delete an incident report |

## Files

```
frontend/app/modules/incident/page.tsx
frontend/app/modules/incident/components/
backend/main.py
```

## Database

**Table:** `incident_reports`

| Field | Description |
|-------|-------------|
| `incident_date` | Date the incident occurred |
| `server_name` | Affected server name |
| `incident_type` | Category of the incident |
| `description` | Incident details |
| `status` | Current status (Open, In Progress, Resolved, Closed) |
| `resolution` | Resolution details |
| `created_at` | Record creation timestamp |
