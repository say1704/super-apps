# Project Tasks Module

## Overview
- Path: /modules/tasks
- Purpose: Task management with Kanban board, sprints, and burndown charts
- Status: LOCKED (Production Ready)

## Architecture
- Split Panel: Table (left, sortable) + Detail Panel (right, click row)
- Sprint/Burndown toggle

## Features
- Table view with sortable columns (title, status, priority, assignee, due_date, estimated_hours)
- Pagination: 10/20/50/100 rows per page
- Bulk actions: bulk delete, bulk status change
- Filters: Search, Status, Priority, Assignee, Tags, Date range
- Inline status change per row
- Task Detail Panel with tabs: Details, Worklogs, History
- Inline edit mode in detail panel
- Time tracking: estimated_hours, actual_hours with progress bar
- Add/edit/delete worklogs from detail panel
- CSV export + PDF export + print
- Sprint CRUD with task assignment
- Burndown chart with ideal burndown line

## API Endpoints
- GET /api/project-tasks - List with pagination, filters
- POST /api/project-tasks - Create
- PUT /api/project-tasks/{id} - Update
- DELETE /api/project-tasks/{id} - Delete
- POST /api/project-tasks/bulk - Bulk operations
- GET/POST/PUT/DELETE /api/sprints - Sprint CRUD
- GET /api/project-tasks/{id}/worklogs - Worklogs for task
- POST/PUT/DELETE /api/project-tasks/{id}/worklogs - Worklog CRUD

## Files
- frontend/app/modules/tasks/page.tsx
- frontend/app/modules/tasks/TaskTable.tsx
- frontend/app/modules/tasks/TaskDetailPanel.tsx
- frontend/app/modules/tasks/BurndownPanel.tsx
- frontend/app/modules/tasks/api.ts
- frontend/app/modules/tasks/types.ts
- backend/models.py (ProjectTask + Sprint)
- backend/main.py

## Database
- Tables: project_tasks, sprints, sprint_tasks
- Key fields: title, description, status, priority, assignee, due_date, estimated_hours, actual_hours, tags
