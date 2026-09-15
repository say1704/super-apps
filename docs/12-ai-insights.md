# AI Insights — Deteksi Anomali Lintas-Modul

Modul **AI Insights** (`anomaly-insights`) memindai data operasional di berbagai modul,
menemukan **anomali** secara otomatis (statistik + ML), lalu menuliskan **penjelasan &
rekomendasi berbahasa Indonesia** dengan LLM lokal. Tujuannya: operator tidak perlu
mengecek tiap modul satu per satu untuk mencari kejanggalan.

## Cara Kerja (Ringkas)

```
Data modul (harian) → Engine deteksi (ml/anomaly ensemble + aturan) → AnomalyFinding (DB)
                                          ↘ LLM lokal (narasi high/critical)
                                          ↘ Notifikasi bell + SSE (high/critical)
UI: menu AI Insights · panel per-modul · kartu Dashboard
```

- **Deteksi**: `backend/ml/anomaly.py` `AnomalyDetector` — ensemble **Z-score + IQR + Isolation
  Forest** (anomali dikonfirmasi bila ≥2 metode setuju) untuk deret waktu harian, ditambah
  **aturan ringan** untuk sinyal non-deret (mis. source IP baru, drift inventory).
- **Baseline** 30 hari; hanya memunculkan anomali yang jatuh di **3 hari terakhir** (actionable).
- **Narasi**: LLM lokal (Qwen via model-server 8081) hanya untuk temuan **high/critical** (hemat CPU),
  disimpan di kolom `narrative` (tidak diregenerasi tiap buka).
- **Deteksi bersifat unsupervised** (tak perlu data berlabel) & **terukur** — LLM hanya menjelaskan,
  tidak menentukan anomali.

## Modul yang Dipantau

| Modul (`module`) | Sinyal | Metode |
|---|---|---|
| `ssh-report` | Lonjakan login gagal (brute-force) per host; **source IP baru** (novelty) + username | Ensemble + aturan |
| `capacity` | Outlier CPU peak, RAM peak, pemakaian disk `/` per host | Ensemble |
| `vulnerability` | Lonjakan jumlah temuan **High** per server | Ensemble |
| `backup-analytics` | Ukuran backup tak wajar (naik/turun → indikasi backup gagal/parsial) | Ensemble (reuse) |
| `incident` | Lonjakan jumlah insiden (30 hari vs 30 hari sebelumnya) | Aturan rasio |
| `inventory` | Drift jumlah software/JAR antar snapshot | Aturan selisih |

> Belum dipantau (data tipis/kategorikal atau tidak relevan): IRMC, monthly-check, risk, quality,
> worklog, tasks, assets, forms, log-management. Menambah modul = daftar 1 detektor baru di registry
> `DETECTORS` (`backend/utils/anomaly_engine.py`).

## Alur Kerja Harian (Direkomendasikan)

1. **Tarik/impor data** seperti biasa di tiap modul (SSH fetch, SAR/Capacity scan, Backup,
   Vulnerability upload, dll).
2. Buka **AI Insights → "Scan semua modul"** untuk menganalisa data terbaru; anomali muncul di tabel.
3. **Triase**: klik baris → detail (perbandingan nilai + narasi AI + drill-down ke modul sumber),
   lalu **Ack** (sedang ditangani) atau **Resolve** (selesai).

Aman di-scan berkali-kali sehari — dedupe via `fingerprint` per (modul·entity·sinyal·tanggal); scan
ulang hanya memperbarui, tidak menggandakan.

## Otomatis vs Manual

- **Terjadwal**: job harian **06:00** (`run_daily_anomaly_scan` via APScheduler, didaftarkan di
  `backend/utils/app_lifecycle.py`) → deteksi semua modul, simpan, narasikan, buat notifikasi bell
  untuk temuan high/critical baru.
- **On-demand**: tombol **"Scan semua modul"** (halaman AI Insights) atau **"Analisa"** (panel per-modul).
- ⚠️ **Timing**: bila impor data dilakukan **setelah** 06:00, auto-scan pagi memakai data kemarin —
  andalkan scan manual setelah impor, atau ubah jam job di `app_lifecycle.py`
  (`CronTrigger(hour=6, minute=0)`).

## Antarmuka

- **Menu AI Insights** (`/modules/anomaly-insights`): ringkasan per severity, filter
  (modul/severity/status), **Scan semua modul**, tabel temuan, **Ack/Resolve**, dan **detail modal**
  (kartu perbandingan nilai berformat manusiawi + delta, narasi AI, tombol *Buka modul sumber*).
- **Panel per-modul**: komponen `frontend/components/AnomalyPanel.tsx` — saat ini disematkan di
  **SSH Report**; drop-in `<AnomalyPanel module="…" />` untuk halaman modul lain.
- **Kartu Dashboard**: ringkasan jumlah anomali open per severity (link ke menu).

## Format Angka (Manusiawi)

Nilai mentah diformat sesuai satuan agar mudah dimengerti:

| Sinyal | Satuan | Contoh tampilan |
|---|---|---|
| `backup_size_anomaly` | bytes | `5.66 GB` (bukan `6076986579`) |
| `capacity_*_outlier` | persen | `98%` |
| `ssh_bruteforce_spike`, `vuln_high_spike`, dll | hitungan | `60`, `25` |

Contoh pesan: `Ukuran backup: 5.66 GB (15 Sep 2026) — lebih tinggi dari biasanya (+30%) — normal ≈ 4.34 GB.`
Bila baseline nyaris nol, persen yang menyesatkan disembunyikan → `… — lebih tinggi tajam dari biasanya
yang nyaris nol.`

## API

Prefix `/api/v1` · semua butuh auth · RBAC per `owner_role`.

| Method & Path | Fungsi |
|---|---|
| `GET /anomaly/findings?module=&severity=&status=&limit=` | Daftar temuan |
| `GET /anomaly/summary` | Hitung open per severity/modul (untuk Dashboard) |
| `POST /anomaly/scan?module=<x\|all>` | Deteksi on-demand → simpan → broadcast `anomaly_detected` (auto-refresh) |
| `POST /anomaly/{id}/ack` | Tandai *acknowledged* |
| `POST /anomaly/{id}/resolve` | Tandai *resolved* |

Status temuan: `open` → `ack` → `resolved`. Auto-refresh UI via event SSE `anomaly_detected`.

## RBAC & Akses

- **Menu**: seperti modul lain — superadmin otomatis; role lain harus diberi akses lewat
  **Settings → Module Access** (key `anomaly-insights`, harus sama di `frontend/lib/modules.ts`,
  `frontend/lib/navigation.ts`, dan `backend/api/dependencies.py`).
- **Isi temuan**: superadmin melihat semua; non-superadmin melihat temuan dengan `owner_role == role`-nya
  **atau** temuan umum (`owner_role` NULL, mis. capacity/incident yang sumbernya tak ber-owner).

## Parameter yang Bisa Dikalibrasi

Di `backend/utils/anomaly_engine.py`:

| Konstanta | Default | Arti |
|---|---|---|
| `BASELINE_DAYS` | 30 | Jendela membangun deret baseline |
| `RECENT_DAYS` | 3 | Hanya munculkan anomali dalam N hari terakhir |
| `MIN_POINTS` | 5 | Minimal titik data untuk deteksi statistik |

Di `ml/anomaly.py`: z-score 2.0σ, IQR 1.5×, Isolation Forest `contamination=0.05`.
Ambang aturan: `new_source_ip` (≥5 → high), `inventory_drift` (±5 software/±3 JAR), incident (>1.5×).
**Kalibrasi berbasis data**: jalankan beberapa hari, tandai false-positive/terlewat, lalu sesuaikan.

## Batasan

- Narasi LLM lokal (CPU) lambat → hanya high/critical + batch + disimpan.
- SSH: baris login-gagal agregat memakai timestamp sintetis (tengah malam) → baseline pakai **hitungan
  harian** `scan_date`; analisis jam-akses hanya andal untuk login **sukses**.
- Butuh riwayat cukup (Isolation Forest ≥10 titik; jatuh ke z-score/IQR bila data sedikit).
- Temuan bersifat **data-dependent** — modul tanpa anomali akan kosong (bukan error).
- Live-refresh SSE andal saat **scan manual**; job harian tetap membuat temuan + notifikasi bell.

## File Terkait

- Backend: `backend/models/anomaly.py` (model), `backend/utils/anomaly_engine.py` (engine),
  `backend/api/anomaly.py` (API), `backend/utils/app_lifecycle.py` (job harian),
  `backend/ml/anomaly.py` (primitive deteksi).
- Frontend: `frontend/app/modules/anomaly-insights/page.tsx` (menu),
  `frontend/components/AnomalyPanel.tsx` (panel), `frontend/app/page.tsx` (kartu Dashboard).
