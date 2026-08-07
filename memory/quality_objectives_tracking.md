---
name: Quality Objectives Spreadsheet Experience
description: User wants spreadsheet-like flexibility for ISO 27001 Quality Objectives monthly tracking — replacing Excel workflow
type: feedback
---

**Rule:** Quality Objectives monthly tracking must feel like Excel — no rigid schema, free-form rows, image upload per cell, copy-paste text friendly.

**Why:** User is a SysAdmin who has been using Excel for this. Rejected rigid fixed-schema (metric_name/target/tools) — "aku gak paham, aku ingin se-flexible mungkin tracking nya, aku gak paham, aku ingin se-flexible mungkin tracking nya atau isainya."

**How to apply:**
- Each row has: a free-text label + 12 month textareas + summary textarea
- Each month cell can contain text OR an image (uploaded via 🖼️ button → stored as base64 data URI)
- Backend stores everything as JSON array in `quality_objectives.monthly_data` column
- Data structure: `[{label: string, cells: Record<string,string>, attachment?: Record}]`
- No enforced schema per cell — user types/copies whatever they want
- Monthly data saved via `POST /api/quality-objectives/{id}/monthly-data` with `{monthly_data: [...]}`