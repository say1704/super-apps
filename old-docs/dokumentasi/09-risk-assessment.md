# Module 9: Risk Assessment

## 1. Function
ISO 27001 risk management system with 4 sheets: Penilaian Risiko (Risk Assessment), Interested Parties, Peluang (Opportunities), and Isu Matrix. Supports risk score calculation (frequency × impact), before/after/target risk levels, and soft delete.

## 2. Business Logic

### 2.1 Penilaian Risiko (Risk Assessment)
- **Risk Score Calculation**: `nilai_risiko_dasar = frekuensi_sebelum × dampak_sebelum`, `nilai_risiko_sisa = frekuensi_sesudah × dampak_sesudah`, `nilai_risiko_target = frekuensi_target × dampak_target`
- **Status Values**: "Belum Dimulai", "In Progress", "Selesai"
- **Soft Delete**: Sets `deleted_at` timestamp instead of hard delete
- **Optimistic Locking**: Version-based conflict detection on updates
- **Stats**: Counts critical risk (nilai_risiko_dasar >= 15), overdue treatment (target_waktu < today and not Selesai), in progress

### 2.2 Interested Parties
- Tracks stakeholders, their needs, expectations, associated risks and opportunities
- Soft delete support

### 2.3 Peluang (Opportunities)
- Opportunity management with grade scoring
- Before/after benefit comparison (manfaat_diharapkan vs manfaat_saat_ini)
- Action plan tracking (what, resources, who, when, how)
- Soft delete support

### 2.4 Isu Matrix
- Issues categorized with associated risks and opportunities
- Soft delete support

### 2.5 Risk Assessment Form
- Container form with document number, version, approval workflow
- Contains sub-items: logs, risk items, opportunities, issues, ISMS notes

## 3. API Endpoints

### 3.1 Penilaian Risiko

| Method | Endpoint | Response Model | Auth | Description |
|--------|----------|---------------|------|-------------|
| GET | `/penilaian-risiko` | `RiskItemListPaginatedResponse` | JWT | List with search, status filter, pagination |
| POST | `/penilaian-risiko` | `MessageResponse` | JWT | Create (auto-calculates risk scores) |
| PUT | `/penilaian-risiko/{item_id}` | `MessageResponse` | JWT | Update (optimistic lock) |
| DELETE | `/penilaian-risiko/{item_id}` | `MessageResponse` | JWT | Soft delete |
| GET | `/penilaian-risiko/stats` | `RiskStatsResponse` | JWT | Stats (critical, overdue, in progress) |

### 3.2 Interested Parties

| Method | Endpoint | Response Model | Auth | Description |
|--------|----------|---------------|------|-------------|
| GET | `/interested-parties` | `InterestedPartyListPaginatedResponse` | JWT | List with search, risk filter |
| POST | `/interested-parties` | `MessageResponse` | JWT | Create |
| PUT | `/interested-parties/{item_id}` | `MessageResponse` | JWT | Update (optimistic lock) |
| DELETE | `/interested-parties/{item_id}` | `MessageResponse` | JWT | Soft delete |

### 3.3 Peluang

| Method | Endpoint | Response Model | Auth | Description |
|--------|----------|---------------|------|-------------|
| GET | `/peluang` | `PeluangListPaginatedResponse` | JWT | List with search, who filter |
| POST | `/peluang` | `MessageResponse` | JWT | Create |
| PUT | `/peluang/{item_id}` | `MessageResponse` | JWT | Update (optimistic lock) |
| DELETE | `/peluang/{item_id}` | `MessageResponse` | JWT | Soft delete |

### 3.4 Isu Matrix

| Method | Endpoint | Response Model | Auth | Description |
|--------|----------|---------------|------|-------------|
| GET | `/isu-matrix` | `IsuMatrixListPaginatedResponse` | JWT | List with search, kategori filter |
| POST | `/isu-matrix` | `MessageResponse` | JWT | Create |
| PUT | `/isu-matrix/{item_id}` | `MessageResponse` | JWT | Update (optimistic lock) |
| DELETE | `/isu-matrix/{item_id}` | `MessageResponse` | JWT | Soft delete |

### 3.5 Risk Assessment Form

| Method | Endpoint | Response Model | Auth | Description |
|--------|----------|---------------|------|-------------|
| GET | `/risk-assessment` | `RiskAssessmentListPaginatedResponse` | JWT | List forms |
| POST | `/risk-assessment` | `MessageResponse` | JWT | Create form |
| GET | `/risk-assessment/{form_id}/items` | `dict` | JWT | Get all items for form |
| POST | `/risk-assessment/{form_id}/items` | `MessageResponse` | JWT | Create risk item for form |

## 4. Database Schema

### `penilaian_risiko`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | Integer (PK) | No | - | Auto-increment |
| `nama_isu` | String | Yes | - | Issue name |
| `proses_bisnis` | String | Yes | - | Business process |
| `nama_asset` | String | Yes | - | Asset name |
| `kerentanan` | Text | Yes | - | Vulnerability |
| `ancaman` | Text | Yes | - | Threat |
| `risiko` | Text | Yes | - | Risk |
| `akibat_dampak` | Text | Yes | - | Impact consequence |
| `frekuensi_sebelum` | Integer | Yes | - | Frequency before |
| `frekuensi_sebelum_desc` | Text | Yes | - | Frequency before description |
| `dampak_sebelum` | Integer | Yes | - | Impact before |
| `dampak_sebelum_desc` | Text | Yes | - | Impact before description |
| `dampak_sebelum_finansial` | Text | Yes | - | Financial impact before |
| `nilai_risiko_dasar` | Integer | Yes | - | Base risk score (freq × impact) |
| `pengendalian_yang_ada` | Text | Yes | - | Existing controls |
| `pemilihan_kontrol` | Text | Yes | - | Control selection |
| `frekuensi_sesudah` | Integer | Yes | - | Frequency after |
| `frekuensi_sesudah_desc` | Text | Yes | - | Frequency after description |
| `dampak_sesudah` | Integer | Yes | - | Impact after |
| `dampak_sesudah_desc` | Text | Yes | - | Impact after description |
| `dampak_sesudah_finansial` | Text | Yes | - | Financial impact after |
| `nilai_risiko_sisa` | Integer | Yes | - | Residual risk score |
| `pengendalian_tambahan` | Text | Yes | - | Additional controls |
| `kebutuhan_sumber_daya` | Text | Yes | - | Resource requirements |
| `penanggung_jawab` | String | Yes | - | Person in charge |
| `target_waktu` | Date | Yes | - | Target time |
| `frekuensi_target` | Integer | Yes | - | Target frequency |
| `frekuensi_target_desc` | Text | Yes | - | Target frequency description |
| `dampak_target` | Integer | Yes | - | Target impact |
| `dampak_target_desc` | Text | Yes | - | Target impact description |
| `dampak_target_finansial` | Text | Yes | - | Target financial impact |
| `nilai_risiko_target` | Integer | Yes | - | Target risk score |
| `tanggal_peninjauan` | Date | Yes | - | Review date |
| `status_pelaksanaan` | String | Yes | "Belum Dimulai" | Implementation status |
| `created_at` | DateTime | Yes | utcnow | Creation timestamp |
| `updated_at` | DateTime | Yes | utcnow | Last update timestamp |
| `deleted_at` | DateTime | Yes | - | Soft delete timestamp |
| `version` | Integer | Yes | 0 | Optimistic locking |

### `interested_parties`, `peluang`, `isu_matrix`
Similar pattern: CRUD columns + `deleted_at` (soft delete) + `version` (optimistic lock)

### PostgreSQL Migration

```sql
CREATE TABLE penilaian_risiko (
  id SERIAL PRIMARY KEY,
  nama_isu VARCHAR(255), proses_bisnis VARCHAR(255), nama_asset VARCHAR(255),
  kerentanan TEXT, ancaman TEXT, risiko TEXT, akibat_dampak TEXT,
  frekuensi_sebelum INTEGER, frekuensi_sebelum_desc TEXT,
  dampak_sebelum INTEGER, dampak_sebelum_desc TEXT, dampak_sebelum_finansial TEXT,
  nilai_risiko_dasar INTEGER,
  pengendalian_yang_ada TEXT, pemilihan_kontrol TEXT,
  frekuensi_sesudah INTEGER, frekuensi_sesudah_desc TEXT,
  dampak_sesudah INTEGER, dampak_sesudah_desc TEXT, dampak_sesudah_finansial TEXT,
  nilai_risiko_sisa INTEGER,
  pengendalian_tambahan TEXT, kebutuhan_sumber_daya TEXT,
  penanggung_jawab VARCHAR(255), target_waktu DATE,
  frekuensi_target INTEGER, frekuensi_target_desc TEXT,
  dampak_target INTEGER, dampak_target_desc TEXT, dampak_target_finansial TEXT,
  nilai_risiko_target INTEGER,
  tanggal_peninjauan DATE,
  status_pelaksanaan VARCHAR(50) DEFAULT 'Belum Dimulai',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP,
  version INTEGER DEFAULT 0
);

CREATE INDEX idx_risiko_status ON penilaian_risiko(status_pelaksanaan) WHERE deleted_at IS NULL;
CREATE INDEX idx_risiko_target_waktu ON penilaian_risiko(target_waktu) WHERE deleted_at IS NULL;
CREATE INDEX idx_risiko_nilai_dasar ON penilaian_risiko(nilai_risiko_dasar) WHERE deleted_at IS NULL;
```
