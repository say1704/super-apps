# Risk Assessment Module

## Overview
- Path: /modules/risk
- Purpose: Risk assessment and management (ISO 27001:2022 A.5.10)
- Status: LOCKED (Production Ready)

## Features
- CRUD operations for risk assessments
- Pagination: 10/20/50/100 rows per page
- Sortable columns
- Search & Filters
- Risk level calculation (likelihood x impact)
- Mitigation tracking
- Export CSV

## API Endpoints
- GET /api/risk-assessments - List with pagination
- POST /api/risk-assessments - Create
- PUT /api/risk-assessments/{id} - Update
- DELETE /api/risk-assessments/{id} - Delete

## Files
- frontend/app/modules/risk/page.tsx
- backend/main.py

## Database
- Table: risk_assessments
- Key fields: risk_name, description, likelihood, impact, risk_level, mitigation, status, owner, review_date
