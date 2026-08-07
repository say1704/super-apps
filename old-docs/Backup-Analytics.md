# Backup Analytics Module

## Overview

- **Path:** `/modules/backup-analytics`
- **Purpose:** Dashboard monitoring dan analytics untuk backup storage semua server — siapa yang backup, siapa yang tidak, prediksi kapasitas, deteksi anomali, dan machine learning forecasting
- **Status:** COMPLETE (Full redesign + ML Predictive Analytics)
- **Last Updated:** May 5, 2026

## Architecture

```
frontend/app/modules/backup-analytics/
├── page.tsx                     # Main dashboard (11 tabs, summary cards, trend chart)
├── types/
│   └── index.ts                 # 14 TypeScript interfaces
├── hooks/
│   ├── useFilterState.ts        # URL-based filter state management
│   └── useBackupData.ts         # SWR data fetching with auth
├── lib/
│   └── utils.ts                 # Format helpers, CSV/PDF export
└── components/                  # 18 components
    ├── SummaryCards.tsx         # 8 KPI cards
    ├── TrendChart.tsx           # Daily trend area chart
    ├── SectionTabs.tsx          # 11-tab navigation
    ├── UnifiedServerTable.tsx   # Main server table (search, sort, pagination, sparkline)
    ├── HeatmapGrid.tsx          # Calendar heatmap (server × date)
    ├── AnomalyTable.tsx         # Anomaly detection results
    ├── HistoryOverview.tsx      # Period summary + consistency table
    ├── ServerDetailDrawer.tsx   # Slide-out server detail (chart + history table)
    ├── ServerAggregation.tsx    # Multi-period aggregation (7d to 12mo)
    ├── CapacityProjection.tsx   # Linear capacity projection table
    ├── MLPredictions.tsx        # ML forecasting table + health/trend/risk badges
    ├── ClusterView.tsx          # Server clustering visualization
    ├── PredictionChart.tsx      # Recharts composed chart (modal)
    ├── HealthScoreBadge.tsx     # Health score badge (0-100, A-F)
    ├── TrendBadge.tsx           # Trend classification badge (6 types)
    ├── RiskBadge.tsx            # Risk level badge (4 levels)
    ├── AnomalyBadge.tsx         # Anomaly severity indicator
    └── ModelSelector.tsx        # ML model dropdown

backend/
├── api/
│   ├── backup_analytics.py      # 30+ analytics endpoints
│   └── backup_analytics_ml.py   # 16 ML endpoints
└── ml/                          # 11 ML modules
    ├── predictor.py             # 5 ML models + auto-selection
    ├── anomaly.py               # 3 detection methods + ensemble
    ├── seasonality.py           # Weekly/monthly/quarterly patterns
    ├── cache.py                 # Model cache (24hr TTL)
    ├── metrics.py               # MAPE, RMSE, MAE, R²
    ├── utils.py                 # Data preprocessing
    ├── health_score.py          # Health score (0-100, A-F)
    ├── trend_classifier.py      # 6 trend categories
    ├── clustering.py            # 5 server clusters
    ├── failure_risk.py          # 6-factor risk scoring
    └── anomaly_forecast.py      # Early warning system
```

## Dashboard Features

### Summary Cards (8 KPI)

| Card | Data Source | Keterangan |
|------|-------------|------------|
| Total KB | Dashboard summary | Total ukuran backup dalam KB |
| Total MB | Dashboard summary | Total ukuran backup dalam MB |
| Total GB | Dashboard summary | Total ukuran backup dalam GB |
| Total Files | Dashboard summary | Jumlah total file backup |
| Server Aktif | Dashboard summary | Jumlah server yang backup hari ini |
| Belum Backup | Missing-today endpoint | Jumlah server yang TIDAK backup hari ini |
| Avg Growth % | Server-growth endpoint | Rata-rata pertumbuhan storage harian |
| Anomali | Anomalies endpoint | Jumlah anomali terdeteksi (spike/drop) |

### Trend Chart

- **Tipe:** Recharts AreaChart
- **Data:** Daily total GB + total files
- **Day Range Selector:** 7 / 14 / 30 / 60 hari
- **Auto-refresh:** 60 detik

### Server Detail Drawer

- **Trigger:** Klik tombol "Detail" di baris server manapun
- **Konten:**
  - 6 summary cards (latest size, files, status, consistency, growth, last backup)
  - Recharts LineChart (historical size over time)
  - History table (tanggal, size, files, status) dengan pagination 10/halaman
  - Export CSV + PDF
- **Day Range:** 7 / 30 / 60 hari
- **Tutup:** Klik overlay atau tekan ESC

### Filter System

- **URL-based state** via `useFilterState` hook
- **Parameters:** `tab`, `server`, `range`, `trendDays`, `heatmapDays`, `growthDays`
- **Range mapping:** `7d`=7, `14d`=14, `30d`=30, `60d`=60, `6mo`=180

### Export Features

| Component | CSV | PDF |
|-----------|-----|-----|
| UnifiedServerTable | ✅ | ❌ |
| AnomalyTable | ✅ | ❌ |
| HistoryOverview | ✅ | ❌ |
| ServerAggregation | ✅ | ❌ |
| CapacityProjection | ✅ | ❌ |
| MLPredictions | ✅ | ❌ |
| ServerDetailDrawer | ✅ | ✅ |

---

## Tabs (11 Total)

### 1. Semua (`all`)

**Komponen:** `UnifiedServerTable`

Tampilan lengkap semua server dengan:
- **Search** — filter by IP
- **Sort** — klik header kolom (ip, size, files, growth)
- **Pagination** — 20 server per halaman
- **Sparkline** — mini trend chart per server (7 data point terakhir)
- **Status badge** — OK (hijau), Warning (kuning), Critical (merah)
- **Growth %** — persentase pertumbuhan storage
- **Detail button** — buka ServerDetailDrawer

**API:** `GET /analytics/unified-servers?days=N`

### 2. Belum Backup (`missing`)

**Komponen:** `UnifiedServerTable` (filtered: `days_ago > 1`)

Menampilkan server yang **tidak backup hari ini**:
- Diurutkan by `days_ago` descending (yang paling lama tidak backup di atas)
- Badge count di tab menunjukkan jumlah server yang belum backup

**API:** `GET /analytics/missing-today`

### 3. Top 10 (`top`)

**Komponen:** `UnifiedServerTable` (sorted by `size_gb` DESC, limit 10)

10 server dengan **ukuran backup terbesar**:
- Berguna untuk identifikasi server yang paling banyak consuming storage

**API:** `GET /analytics/top-servers?limit=10`

### 4. Growth (`growth`)

**Komponen:** `UnifiedServerTable` (filtered: `growth_pct > 0`, sorted DESC, limit 10)

10 server dengan **pertumbuhan storage tertinggi**:
- Filter server yang punya growth positif
- Berguna untuk capacity planning — server mana yang cepat penuh

**API:** `GET /analytics/server-growth?days=N&limit=10`

### 5. Heatmap (`heatmap`)

**Komponen:** `HeatmapGrid`

Calendar heatmap grid:
- **Rows** = server IP
- **Columns** = tanggal
- **Cell color** = hijau (ada backup) / abu-abu (tidak ada backup)
- **Sticky column** = server IP (scroll horizontal tetap terlihat)
- **Day range selector** = 7 / 14 / 30 hari

**API:** `GET /analytics/heatmap?days=N`

### 6. Anomali (`anomalies`)

**Komponen:** `AnomalyTable`

Deteksi anomali berdasarkan threshold:
- **Drop** = ukuran backup turun >30% dari hari sebelumnya
- **Spike** = ukuran backup naik >100% dari hari sebelumnya
- **Pagination** = 15 per halaman
- **Color-coded** change % (merah untuk spike, biru untuk drop)
- **Badge count** di tab menunjukkan jumlah anomali

**API:** `GET /analytics/anomalies?days=30&drop_threshold=30&spike_threshold=100`

### 7. Proyeksi (`projection`)

**Komponen:** `CapacityProjection`

Tabel proyeksi kapasitas per server (linear growth):
- **Horizon selector** = 30 / 60 / 180 hari
- **Kolom:** IP, current size, projected 30d/60d/180d, trend badge
- **Trend badge** = increasing (merah), decreasing (hijau), stable (abu-abu)
- **Export CSV**

**API:** `GET /analytics/capacity-projection?horizon_months=N`

### 8. ML Prediction (`ml-predict`)

**Komponen:** `MLPredictions`

Tabel prediksi ML dengan Health Score, Trend, dan Risk:
- **Summary stats** = rata-rata health score, server risiko tinggi, total server
- **Horizon selector** = 3 / 6 / 12 bulan
- **Data selector** = 90 / 180 / 365 hari
- **Kolom:** IP, Lihat (chart modal), KB, MB, GB, 1B, 3B, 6B, Health, Trend, Risk
- **Chart modal** = klik "Lihat" → muncul overlay dengan PredictionChart (historical + prediction + confidence bands)
- **Legend** = penjelasan Health/Trend/Risk scales di bawah tabel
- **Export CSV**

**API:**
- `GET /analytics/ml/enhanced-predict-all?horizon_months=N&days=N`
- `GET /analytics/ml/predict/{ip}?horizon_months=N&days=N` (modal)

### 9. Clusters (`clusters`)

**Komponen:** `ClusterView`

Pengelompokan server berdasarkan perilaku backup:
- **Data selector** = 30 / 90 / 180 hari
- **5 cluster cards** (expandable):
  - `large_stable` — ukuran besar, stabil
  - `fast_growing` — pertumbuhan sangat cepat
  - `volatile` — fluktuatif, tidak terprediksi
  - `small_stable` — ukuran kecil, stabil
  - `at_risk` — konsistensi rendah / sering miss
- **Cluster detail** = avg size, growth rate, consistency, server list

**API:** `GET /analytics/ml/clusters?days=N`

### 10. History (`history`)

**Komponen:** `HistoryOverview`

Ringkasan historis backup:
- **Date range picker** = pilih periode start/end
- **Period summary cards** = total GB, total files, avg consistency, success rate
- **Consistency table** = backup consistency per server (backup_days / total_days = %)
- **Color-coded badges** = hijau (high consistency), kuning (medium), merah (low)
- **Pagination** = 10 per halaman
- **Clickable rows** = buka ServerDetailDrawer
- **Export CSV**

**API:**
- `GET /analytics/period-summary?start=X&end=Y`
- `GET /analytics/consistency?days=30`

### 11. Agregasi (`aggregation`)

**Komponen:** `ServerAggregation`

Agregasi multi-periode per server:
- **Server selector** = dropdown dari unified server list + manual IP input
- **13 periode** = 7 hari, 14 hari, 30 hari, 60 hari, 90 hari, 6 bulan, 9 bulan, 12 bulan, dll
- **Kolom per periode:** backup_count, total_files, total_size, avg_size, first_date, last_date
- **Export CSV**

**API:**
- `GET /analytics/unified-servers?days=30` (server list)
- `GET /analytics/server/{ip}/aggregation` (aggregation data)

---

## Data Models (TypeScript Interfaces)

| Interface | Fields |
|-----------|--------|
| `DashboardSummary` | total_kb, total_mb, total_gb, total_files, server_count, avg_file_mb, backed_up_today, missing_count, avg_daily_growth_pct, anomaly_count |
| `UnifiedServer` | ip, last_backup, days_ago, size_kb/mb/gb, files, status ("OK"/"Warning"/"Critical"), growth_pct, trend[] |
| `UnifiedServerListData` | servers[], total, summary{} |
| `MissingServer` | ip, last_backup, days_ago, size_kb/mb/gb, files |
| `TopServer` | ip, size_kb/mb/gb, files, last_backup |
| `GrowthServer` | ip, current_kb/mb/gb, first_kb/mb/gb, total_growth_kb/mb/gb, daily_growth_kb/mb/gb, growth_pct, data_points, trend[] |
| `HeatmapResponse` | servers[], dates[], grid: Record<server, Record<date, number>> |
| `Anomaly` | ip, date, prev_size_kb/mb/gb, curr_size_kb/mb/gb, change_pct, type ("drop"/"spike"), files |
| `TrendEntry` | date, total_kb/mb/gb, total_files |
| `ServerHistoryEntry` | date, size_kb/mb/gb, files, status |
| `ServerDetailResponse` | server_ip, period_days, summary{}, history[] |
| `ConsistencyServer` | ip, backup_days, total_days, consistency_pct, size_kb/mb/gb, files, last_backup |
| `PeriodSummaryResponse` | period{start,end,total_days}, summary{}, most_consistent{}, consistency[] |
| `AggregationPeriod` | period, days, backup_count, total_files, total_size_kb/mb/gb, avg_size_kb/mb/gb, first_date, last_date |
| `ServerAggregationResponse` | server_ip, latest_backup, latest_size_kb/mb/gb, periods[] |

---

## Backend Endpoints

### Analytics Endpoints (`backup_analytics.py`)

#### Simple Dashboard

| Method | Path | Parameters | Returns |
|--------|------|-----------|---------|
| GET | `/analytics/dashboard` | — | Server list + summary totals |
| GET | `/analytics/unified-servers` | `days` (default 30) | Unified server list with growth %, trend, summary |
| GET | `/analytics/simple-trend` | `days` (default 30) | Daily trend: date, total_gb, total_files |
| GET | `/analytics/simple-projection` | `horizon_months` (default 6) | Per-server projection: ip, current_gb, predicted_gb, growth_pct |

#### 5 Main Features

| Method | Path | Parameters | Returns |
|--------|------|-----------|---------|
| GET | `/analytics/missing-today` | — | Servers not backed up today |
| GET | `/analytics/top-servers` | `limit` (default 10) | Top servers by storage |
| GET | `/analytics/server-growth` | `days` (default 30), `limit` (default 10) | Top growth servers with trend data |
| GET | `/analytics/heatmap` | `days` (default 30) | Calendar heatmap grid |
| GET | `/analytics/anomalies` | `days` (default 30), `drop_threshold` (30), `spike_threshold` (100) | Anomaly detection results |

#### Detail / History / Aggregation

| Method | Path | Parameters | Returns |
|--------|------|-----------|---------|
| GET | `/analytics/server/{ip}/history` | `days` (default 30) | Server history with summary |
| GET | `/analytics/consistency` | `days` (default 30) | Backup consistency per server |
| GET | `/analytics/period-summary` | `start`, `end` (YYYY-MM-DD) | Period summary + consistency list |
| GET | `/analytics/server/{ip}/aggregation` | — | 13-period aggregation per server |

#### Capacity Projection

| Method | Path | Parameters | Returns |
|--------|------|-----------|---------|
| GET | `/analytics/capacity-projection` | `horizon_months` (default 6) | Per-server projection with trend classification |

#### Legacy Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/per-server-projection` | Per-server 6-month projections |
| GET | `/daily-report` | Daily backup report for specific date |
| GET | `/last-month-report` | Last month aggregated data |
| GET | `/projection` | Storage projection with growth rate |
| GET | `/summary` | Backup summary (30d default) |
| GET | `/servers` | List all servers with latest backup |
| GET | `/server/{name}` | Detailed backup history for server |
| GET | `/daily-trend` | Daily backup trend |
| GET | `/monthly-aggregation` | Monthly aggregation (12mo default) |
| GET | `/top-servers` | Top servers by storage and file count |
| GET | `/status-distribution` | Status distribution (OK/Warning/Critical) |
| GET | `/timeline` | Daily storage timeline + projection |
| GET | `/per-server-comparison` | Per-server current vs 6-month projection |
| GET | `/capacity-metrics` | Capacity metrics with threshold warnings |
| GET | `/alerts` | Missing backups, top offenders, status distribution |
| GET | `/server/{ip}/detail` | Detailed server info for drill-down |
| POST | `/schedule` | Save scheduled report config |

### ML Endpoints (`backup_analytics_ml.py`)

| Method | Path | Parameters | Returns |
|--------|------|-----------|---------|
| GET | `/ml/predict/{ip}` | `horizon_months`, `model`, `confidence_level`, `days`, `resample` | ML prediction + historical data |
| GET | `/ml/predict-all` | `horizon_months`, `days`, `resample` | Predictions for all servers |
| GET | `/ml/enhanced-predict-all` | `horizon_months`, `days`, `resample` | Predictions + health + trend + risk |
| GET | `/ml/anomalies/{ip}` | `method`, `days` | ML anomaly detection |
| GET | `/ml/anomalies-all` | `days`, `method` | Cross-server anomalies |
| GET | `/ml/seasonality/{ip}` | `days` | Seasonality patterns |
| GET | `/ml/models` | — | Available ML models list |
| POST | `/ml/retrain/{ip}` | — | Invalidate model cache |
| GET | `/ml/cache/stats` | — | Cache statistics |
| GET | `/ml/accuracy/{ip}` | `days` | Backtesting accuracy metrics |
| GET | `/ml/health-score/{ip}` | `days` | Health score (0-100, A-F) |
| GET | `/ml/health-score-all` | `days` | Health scores for all servers |
| GET | `/ml/trend/{ip}` | `days` | Trend classification (6 types) |
| GET | `/ml/failure-risk/{ip}` | `days`, `prediction_days` | Failure risk prediction |
| GET | `/ml/failure-risk-all` | `days`, `prediction_days` | Failure risk for all servers |
| GET | `/ml/clusters` | `days` | Server clustering (5 clusters) |
| GET | `/ml/anomaly-forecast/{ip}` | `horizon_months`, `days` | Anomaly early warning |

---

## ML Predictive Analytics

### Overview

Menyediakan forecasting canggih, time series analysis, dan anomaly detection menggunakan machine learning models.

### Models Implemented

**ML = Machine Learning (Pembelajaran Mesin)** — Teknik dimana komputer "belajar" dari data historis untuk membuat prediksi, tanpa diprogram secara eksplisit.

| Model | Library | Min Data | Speed | Accuracy | Penjelasan |
|-------|---------|----------|-------|----------|------------|
| **Linear** | scikit-learn | 10 | ⚡ Fast | Moderate | Garis lurus terbaik (`y = mx + b`). Cocok untuk data tumbuh stabil. |
| **Polynomial** | scikit-learn | 10 | ⚡ Fast | Good | Curve (`y = ax² + bx + c`). Cocok untuk data tumbuh melengkung. |
| **Exponential Smoothing** | statsmodels | 14 | 🟡 Moderate | Good | Bobot lebih ke data terbaru, deteksi trend + seasonality. |
| **Prophet** | prophet | 30 | 🔴 Slow | Excellent | Model Facebook. Auto deteksi trend, seasonality, holiday, changepoints. |
| **SARIMAX** | statsmodels | 30 | 🔴 Slow | Excellent | Autoregression + moving average + seasonality. |

### Auto Model Selection

| Data Points | Model | Alasan |
|-------------|-------|--------|
| < 10 | ❌ Error | Data terlalu sedikit |
| 10-29 | Linear | Model simple sudah cukup |
| 30-99 | Polynomial / Exponential Smoothing | Cukup untuk pattern sederhana |
| 100+ (low volatility) | Prophet / SARIMAX | Model canggih bisa dimanfaatkan |
| 100+ (high volatility, CV > 2) | Exponential Smoothing | Data terlalu fluktuatif untuk Prophet |

**Fallback:** Jika MAPE > 100%, otomatis fallback ke Linear.

### Accuracy Metrics

| Metrik | Penjelasan |
|--------|-----------|
| **MAPE** | Mean Absolute Percentage Error — akurasi dalam persentase. <10% = Excellent, 10-20% = Good, 20-50% = Fair, >50% = Poor |
| **RMSE** | Root Mean Square Error — rata-rata kesalahan dalam satuan GB |
| **MAE** | Mean Absolute Error — rata-rata prediksi meleset X GB |
| **R²** | R-squared — seberapa baik model menjelaskan variasi data (0-1) |

### Anomaly Detection Methods

| Method | Library | Description |
|--------|---------|-------------|
| Z-Score | scipy | Points beyond ±2σ or ±3σ |
| IQR | numpy | Outliers beyond 1.5×IQR |
| Isolation Forest | scikit-learn | ML-based anomaly detection |
| **Ensemble** | Combined | Konfirmasi anomali jika terdeteksi oleh 2+ methods |

### Seasonality Detection

| Pattern | Detection Method |
|---------|-----------------|
| Weekly | Day-of-week effects dengan ANOVA significance test |
| Monthly | Month-of-year effects + end-of-month spike detection |
| Quarterly | Quarter-of-year patterns |

### Model Caching

- **TTL:** 24 jam (86400 detik)
- **Storage:** Memory (LRU dict) + Disk (pickle files)
- **Invalidation:** Manual via `/ml/retrain/{ip}` atau otomatis saat TTL expired

### Dependencies

```
numpy>=1.26
pandas>=2.1
scikit-learn>=1.4
scipy>=1.12
prophet>=1.1
statsmodels>=0.14
```

---

### Phase 10: ML Features Detail

#### 1. Health Score (Skor Kesehatan Backup)

Skor **0-100** yang mengukur kesehatan backup server secara keseluruhan. Seperti **nilai rapor** — semakin tinggi skor, semakin "sehat" pola backup server tersebut.

**5 Aspek Penilaian:**

| Aspek | Bobot | Yang Dinilai |
|-------|-------|-------------|
| **Konsistensi** | 30% | Seberapa rutin backup dilakukan — apakah tiap hari ada atau sering bolong |
| **Anomali** | 25% | Apakah ukuran backup normal atau ada lonjakan/penurunan aneh |
| **Pertumbuhan** | 20% | Apakah pertumbuhan storage stabil (tidak terlalu cepat/lambat) |
| **Status** | 15% | Apakah status backup-nya `success` atau sering `failed` |
| **Kesegaran** | 10% | Kapan backup terakhir — baru atau sudah lama tidak backup |

**Grade:**

| Score | Grade | Arti | Penjelasan untuk Auditor |
|-------|-------|------|-------------------------|
| 90-100 | A | Sangat Sehat | Backup rutin setiap hari, tidak ada anomali, pertumbuhan storage normal, semua success |
| 80-89 | B | Sehat | Backup hampir rutin, ada 1-2 minor issue tapi tidak signifikan |
| 70-79 | C | Cukup | Ada beberapa hari tidak backup, atau ada anomali ukuran yang perlu dicek |
| 60-69 | D | Kurang | Backup tidak konsisten (sering bolong), atau pertumbuhan storage tidak wajar |
| 0-59 | F | Buruk | Backup sering gagal, banyak anomali, sudah lama tidak backup — butuh tindakan segera |

#### 2. Trend Classification (Klasifikasi Tren)

| Trend | Icon | Kondisi | Warna |
|-------|------|---------|-------|
| `growing_fast` | ↑↑ | Pertumbuhan >10%/bulan | Merah |
| `growing_slow` | ↑ | Pertumbuhan 2-10%/bulan | Kuning |
| `stable` | → | Perubahan -2% sampai +2%/bulan | Hijau |
| `shrinking` | ↓ | Pertumbuhan < -2%/bulan | Hijau |
| `volatile` | ↯ | Coefficient of Variation > 0.5 | Orange |
| `seasonal` | ↻ | Ada pola musiman + CV < 0.3 | Ungu |

#### 3. Failure Risk Prediction (Prediksi Risiko Kegagalan)

Memprediksi **probabilitas server gagal backup** dalam 7 hari ke depan.

**6 Faktor Risiko:**

| Faktor | Bobot | Penjelasan |
|--------|-------|------------|
| Miss Rate | 30% | Seberapa sering backup terlewat |
| Declining Trend | 20% | Apakah ukuran backup menurun |
| Anomaly Frequency | 20% | Seberapa sering terjadi anomali |
| Freshness | 15% | Sudah berapa hari sejak backup terakhir |
| Status History | 15% | Berapa sering status Critical |
| File Count Consistency | 10% | Apakah jumlah file konsisten |

**Risk Level:**

| Score | Level | Arti |
|-------|-------|------|
| 0-29 | Low | Risiko rendah, backup sehat |
| 30-59 | Medium | Risiko sedang, perlu monitoring |
| 60-79 | High | Risiko tinggi, perlu investigasi |
| 80-100 | Critical | Risiko sangat tinggi, tindakan segera |

#### 4. Server Clustering (Pengelompokan Server)

| Cluster | Rule | Deskripsi |
|---------|------|-----------|
| `at_risk` | freshness > 7 hari ATAU consistency < 30% | Server bermasalah |
| `fast_growing` | growth_rate > 3%/hari | Pertumbuhan sangat cepat |
| `volatile` | variance_cv > 0.5 | Fluktuatif, tidak terprediksi |
| `large_stable` | avg_size > 10 GB | Ukuran besar, stabil |
| `small_stable` | Default | Ukuran kecil, stabil |

#### 5. Anomaly Forecasting (Prediksi Anomali)

Sistem **early warning** yang memprediksi kapan anomali berikutnya mungkin terjadi:
- Hitung threshold anomali (mean + 2×std_dev)
- Cek setiap prediksi ML terhadap threshold
- Return tanggal anomali terdekat, severity, dan confidence

### Cara Baca ML Prediction Chart

Saat klik tombol **"Lihat"** di kolom Chart, muncul grafik dengan:

1. **Garis Biru Solid** = Data aktual (historis)
2. **Garis Kuning Putus-putus** = Prediksi ML
3. **Area Biru Transparan** = Confidence band 95%
4. **Garis Abu-abu "Today"** = Batas historis vs prediksi

**Interpretasi:**
- Confidence band **sempit** → prediksi akurat
- Confidence band **lebar** → prediksi tidak pasti
- Garis predicted **naik** → storage akan bertambah
- Garis predicted **turun** → storage akan berkurang

### Perbedaan: Proyeksi vs ML Prediction

| Feature | 📊 Proyeksi | 🤖 ML Prediction |
|---------|------------|-----------------|
| Algorithm | Linear growth | 5 ML models + auto-selection |
| Confidence Intervals | ❌ | ✅ (95% bands) |
| Accuracy Metrics | ❌ | ✅ (MAPE, RMSE, R²) |
| Seasonality Detection | ❌ | ✅ (Weekly/Monthly/Quarterly) |
| Anomaly Detection | Fixed threshold | Ensemble (Z-Score + IQR + Isolation Forest) |
| Health Score | ❌ | ✅ (0-100, A-F) |
| Trend Classification | ❌ | ✅ (6 categories) |
| Failure Risk | ❌ | ✅ (6-factor scoring) |
| Server Clustering | ❌ | ✅ (5 clusters) |
| Model Caching | ❌ | ✅ (24hr TTL) |

---

## Data Flow

```
User buka /backup-analytics
  │
  ├─ useFilterState → baca URL params (tab, server, range)
  │
  ├─ useBackupData → SWR fetch data (authenticated)
  │   ├─ GET /analytics/unified-servers (selalu)
  │   ├─ GET /analytics/simple-trend (selalu)
  │   ├─ GET /analytics/dashboard (tab=all)
  │   ├─ GET /analytics/missing-today (tab=all/missing)
  │   ├─ GET /analytics/top-servers (tab=all/top)
  │   ├─ GET /analytics/server-growth (tab=all/growth)
  │   ├─ GET /analytics/heatmap (tab=all/heatmap)
  │   └─ GET /analytics/anomalies (tab=all/anomalies)
  │
  ├─ Render SummaryCards (8 KPI)
  ├─ Render TrendChart (area chart)
  ├─ Render SectionTabs (11 tabs)
  └─ Render tab-specific component
       │
       └─ User klik "Detail" → ServerDetailDrawer
            └─ GET /analytics/server/{ip}/history?days=N

ML Tab flow:
  ├─ GET /analytics/ml/enhanced-predict-all → tabel data
  └─ GET /analytics/ml/predict/{ip} → modal chart
       ├─ PredictionEngine.auto_predict()
       ├─ calculate_health_score()
       ├─ classify_trend()
       └─ predict_failure_risk()
```

---

## Bug Fixes

| Tanggal | Bug | File | Fix |
|---------|-----|------|-----|
| May 5, 2026 | `highRiskCount` threshold | `MLPredictions.tsx` | `>= 50` → `>= 60` (match backend) |
| May 5, 2026 | HealthScoreBadge thresholds | `HealthScoreBadge.tsx` | 90/75/60/40 → 90/80/70/60 |
| May 5, 2026 | RiskBadge thresholds | `RiskBadge.tsx` | 70/50/30 → 80/60/30 |
| May 5, 2026 | SVG gradient compatibility | `PredictionChart.tsx` | Replaced with solid fill + opacity |
| May 5, 2026 | Response format mismatch | `MLPredictions.tsx` | Added `useMemo` transformer |
| May 5, 2026 | `current_gb` undefined crash | `MLPredictions.tsx` | Added null guards |
| May 5, 2026 | `model_used.startsWith` crash | `MLPredictions.tsx` | Added null guard |
| May 5, 2026 | ClusterView type mismatch | `ClusterView.tsx` | Added `CLUSTER_META` mapping |
| May 5, 2026 | Unused `current_gb` prop | `PredictionChart.tsx` | Removed from props |
| May 5, 2026 | Export CSV crash | `MLPredictions.tsx` | Added null guards for all numeric fields |
