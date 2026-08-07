# Quality Objectives Module

## Overview

| Attribute | Details |
|-----------|---------|
| **Path** | `/modules/quality` |
| **Purpose** | Track and manage quality objectives (ISO 27001:2022) |
| **Status** | LOCKED (Production Ready) |

## Features

- CRUD operations for quality objectives
- Pagination: 10/20/50/100 rows per page
- Sortable columns
- Search & Filters
- Progress tracking
- Target vs actual measurement
- Export CSV

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/quality-objectives` | List with pagination |
| POST | `/api/quality-objectives` | Create |
| PUT | `/api/quality-objectives/{id}` | Update |
| DELETE | `/api/quality-objectives/{id}` | Delete |

## Files

| Component | Path |
|-----------|------|
| Frontend | `frontend/app/modules/quality/page.tsx` |
| Backend | `backend/main.py` |

## Database

**Table:** `quality_objectives`

| Field | Type | Description |
|-------|------|-------------|
| `objective` | string | Objective name/title |
| `description` | text | Detailed description |
| `target` | numeric | Target value |
| `actual` | numeric | Actual value achieved |
| `unit` | string | Measurement unit |
| `status` | string | Current status |
| `owner` | string | Responsible person |
| `due_date` | date | Target completion date |
| `created_at` | timestamp | Record creation timestamp |
