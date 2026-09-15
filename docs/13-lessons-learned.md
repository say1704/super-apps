# Lessons Learned — super-apps

Rangkuman pelajaran dari membangun & memelihara super-apps (43 router API, 19 file model,
frontend Next.js, 5 worker backend, model-server AI lokal). Format tiap poin:
**Pelajaran → Kenapa → Cara menerapkan.**

---

## 1. Arsitektur & Skalabilitas

- **Multi-worker + state per-proses itu jebakan halus.** 5 worker uvicorn (8001–8005) tidak berbagi
  memori: rate-limit (slowapi `memory://`), SSE, model AI in-proc, dan progress scan **per-proses**.
  → *Terapkan:* apa pun yang butuh state bersama harus lewat **DB** atau **di-pin ke satu worker**.
  Di proxy Next (`frontend/app/api/proxy/[[...path]]/route.ts`) auth/AI/SSE + write yang memicu
  broadcast di-pin ke worker-1; sisanya sticky per-browser (cookie `sa_worker`) + failover GET.
- **Model berat dipisah jadi service sendiri (8081).** Supaya 5 worker tak masing-masing memuat GGUF.
  → *Terapkan:* beban berat/singleton (ML model, cache besar) taruh di proses terpisah, panggil via HTTP.
- **SQLite bisa untuk multi-worker bila WAL.** Nol kejadian `database is locked` di produksi.
  → *Terapkan:* WAL mode + transaksi pendek; commit sekali di akhir batch, bukan per baris.

## 2. Pola Kode yang Terbukti Baik

- **Satu engine, modul = entri registry.** AI Insights memakai `DETECTORS = {module: fn}` sehingga
  "semua modul" jadi konfigurasi, bukan N implementasi. → *Terapkan:* untuk fitur lintas-modul,
  buat core generik + registry, bukan copy-paste per modul.
- **Parser sebagai fungsi murni & testable.** `utils/backup_parser.py`, `utils/inventory_parser.py`,
  `_extract_jar` — tanpa DB/SSH, mudah diuji dengan sampel log. → *Terapkan:* pisahkan parsing dari I/O;
  uji dulu dengan data nyata sebelum menyambung ke pipeline.
- **Reuse primitive, jangan hitung ulang.** Deteksi anomali memakai `ml/anomaly.py` yang sama dengan
  Backup Analytics. → *Terapkan:* cari implementasi eksisting sebelum menulis baru.
- **Idempotensi lewat fingerprint/upsert.** Scan berulang tak menduplikasi (dedupe per
  modul·entity·sinyal·tanggal); ingest inventory replace-per-tanggal. → *Terapkan:* setiap job berulang
  wajib punya kunci idempoten.

## 3. Logika & Data (Jebakan Nyata)

- **`create_all` hanya membuat TABEL baru, tidak meng-ALTER tabel lama.** Menambah kolom ke tabel yang
  sudah ada TIDAK otomatis lewat `create_all` (`app_lifecycle.py:66`). → *Terapkan:* tabel baru → aman;
  **kolom baru** → pakai custom migration runner (`[MIGRATE] …`, mis. `019_worklog_photos`) atau ALTER
  manual. Rancang model agar hindari perubahan kolom bila memungkinkan (contoh: satuan diinfer di
  frontend, bukan menambah kolom `unit`).
- **Ada dua sumber model — pilih yang benar.** Package `backend/models/` adalah yang canonical;
  file `backend/models.py` **legacy/mati** (mis. `SSHLoginLog` di package punya kolom yang tak ada di
  file). → *Terapkan:* selalu tambah/ubah model di **package**, verifikasi `from models import X`.
- **Urutan route penting.** `/settings/{category}` harus tetap paling bawah agar tak menelan route
  spesifik. → *Terapkan:* route berpola `{param}` selalu didaftar SETELAH route statis.
- **Timezone/naive-datetime bikin metrik salah.** Pakai util `utils.timezone` (`to_iso`, `utcnow`),
  simpan UTC, format di tepi. → *Terapkan:* jangan campur naive & aware datetime.
- **Data dunia-nyata kotor.** Log SSH agregat memakai timestamp sintetis (tengah malam); baseline harus
  pakai hitungan harian `scan_date`, bukan jam. → *Terapkan:* pahami cara data dihasilkan sebelum
  menganalisanya; jangan asumsikan field selalu bermakna.

## 4. Security

- **RBAC berlapis, bukan satu titik.** Menu disembunyikan di frontend **dan** endpoint menolak di
  backend; kunci modul harus sama di 3 tempat (`frontend/lib/modules.ts`, `navigation.ts`,
  `backend/api/dependencies.py ALL_MODULES`). → *Terapkan:* jangan andalkan hanya UI; backend tetap
  otoritatif. Modul baru default **hanya superadmin** sampai di-grant (Settings → Module Access).
- **Kepemilikan data (`owner_role`) perlu keputusan sadar.** Temuan/`row` ber-`owner_role` NULL
  (sumber tanpa owner) mudah "tak terlihat" oleh non-superadmin. → *Terapkan:* tentukan eksplisit —
  data umum (NULL) terlihat pemegang modul, data ber-owner tetap terbatas.
- **Rahasia tidak pernah masuk git.** `*.key`, `*.env`, `backend/.superapps/`, `backend/data/`
  di-`.gitignore`; kunci auto-generate saat runtime (`utils/key_manager.ensure_secret_keys`).
  → *Terapkan:* generate-or-load dari file gitignored / env; jangan hardcode di file yang di-commit
  (mis. `ecosystem.config.js` memuat key dari file, bukan menuliskannya).
- **Auth kuat**: JWT + 2FA OTP email, hashing password (passlib), rate-limit login (slowapi),
  header keamanan/CSP (`utils/security_config.py`), `ProxyHeadersMiddleware` dg `trusted_hosts`.
  → *Terapkan:* jadikan default, bukan tambahan belakangan.
- **Isolasi jaringan sebagai kontrol nyata.** Model-server (8081) & antar-service pakai HTTPS
  self-signed dengan `verify=False`; model-server praktis tak meng-enforce auth → yang melindungi
  adalah **bind 127.0.0.1**. → *Terapkan:* sadari kontrol sebenarnya (network boundary) dan jangan
  ekspos port internal; bila service internal perlu dipublik, tambahkan auth dulu.
- **Repo privat itu wajib** (kode + pola internal). SAST gate (bandit/semgrep) + dependency audit
  (pip-audit/npm audit) disiapkan di CI. → *Terapkan:* jalankan gate keamanan otomatis; tinjau temuan.

## 5. Per-Module (Pola Ingest & Sajian)

- **Pola parse yang konsisten**: SSH-report/SAR/Backup semua = SSH ke server → `ls` folder log →
  `cat` per file → parse → upsert, dengan **background thread + progress polling**
  (`utils/progress_tracker`). → *Terapkan:* ikuti pola yang sudah ada; ingest baru menempel ke alur
  yang ada (contoh: inventory `*_application-*.log` numpang proses SAR, satu folder, satu sesi SSH).
- **Satukan yang serumpun, jangan bikin menu baru sembarangan.** Inventory jadi **tab** di Server
  Capacity; komparasi antar-tanggal jadi **1 kalender 2 fungsi**. → *Terapkan:* utamakan menempel pada
  konteks yang relevan; menu baru hanya bila memang layanan tersendiri (mis. AI Insights).
- **Sajikan informasi yang bisa dimengerti.** Angka mentah (`6076986579`) → **5.66 GB**; beri konteks
  ("lebih tinggi dari biasanya +30%, normal ≈ 4.34 GB"); tanggal Bahasa; hindari persen menyesatkan
  saat baseline ~0. → *Terapkan:* format satuan + kalimat, buang jargon dari teks utama.

## 6. Operasional & Deployment

- **PM2 harus dikelola konsisten.** `PM2_HOME` project-local (`.pm2`) — kelola **hanya** via
  `./start-all.sh` / `./stop-all.sh`; `npx pm2` polos memunculkan daemon `~/.pm2` liar.
  → *Terapkan:* bungkus operasi PM2 di skrip; set `PM2_HOME` eksplisit untuk query read-only.
- **Log tak akan rotate sendiri.** `max_size/retain` di `ecosystem.config.js` diabaikan tanpa modul
  `pm2-logrotate`; `backend-out.log` sempat 576MB. → *Terapkan:* matikan access-log berisik
  (`--no-access-log`), gate log per-request (`PROXY_DEBUG`), pasang `pm2-logrotate`.
- **CI/CD bisa merah karena non-teknis.** Semua job "gagal 2 detik" ternyata **billing GitHub Actions**
  (repo privat, kuota habis), bukan bug. → *Terapkan:* baca **anotasi** run dulu; bedakan gagal
  setup/billing vs gagal test (durasi & pesan beda).
- **Perubahan kode = worker perlu restart.** Edit engine tak berlaku sampai worker dimuat ulang.
  → *Terapkan:* restart via skrip setelah perubahan backend; verifikasi `/health` semua worker 200.

## 7. AI/ML

- **Deteksi terukur, LLM hanya menjelaskan.** Anomali ditemukan statistik/ML (z-score+IQR+Isolation
  Forest ensemble); LLM lokal hanya menulis narasi/rekomendasi high/critical. → *Terapkan:* pisahkan
  "keputusan terukur" dari "penjelasan bahasa"; jaga determinisme.
- **LLM lokal (CPU) mahal waktu.** Narasi hanya untuk temuan penting + batch + disimpan (tak
  regenerasi). → *Terapkan:* batasi pemanggilan LLM; cache hasilnya.
- **Kalibrasi berbasis data, bukan riset abstrak.** Ambang (σ, IQR, contamination, aturan) disetel
  dari false-positive/terlewat pada data nyata. → *Terapkan:* rilis → amati beberapa hari → setel.

## 8. Proses Kerja & Kolaborasi

- **Disiplin scope.** Kerjakan yang diminta; fitur "nice-to-have"/korelasi ditaruh sebagai v2 kecuali
  diminta tegas. → *Terapkan:* konfirmasi cakupan di depan; hindari scope-creep.
- **Verifikasi sebelum klaim.** Buktikan dengan `curl`/query/test (404→401, seed data → hasil),
  jangan asumsi. Contoh: error "semua tab gagal" ternyata router belum diregistrasi, bukan bug fitur.
  → *Terapkan:* tunjukkan bukti; jangan percaya asumsi awal (termasuk asumsi sendiri).
- **Tanya saat ada percabangan nyata.** Keputusan yang mengubah bentuk kerja (tempat, teknik, trigger)
  ditanyakan lewat pilihan singkat, bukan ditebak. → *Terapkan:* satu-dua pertanyaan terarah > salah arah.
- **Plan dulu untuk fitur besar.** Eksplorasi kode (reuse!) → rancang → konfirmasi → implementasi
  berlapis + commit per lapisan. → *Terapkan:* untuk perubahan lintas-file, rencanakan & pecah commit.

## 9. Checklist Anti-Pattern (Hindari)

- [ ] Menaruh state bersama di memori worker (harus DB / pin worker).
- [ ] Menambah **kolom** ke tabel lama dan mengharap `create_all` menerapkannya.
- [ ] Mengubah `backend/models.py` (legacy) alih-alih package `backend/models/`.
- [ ] Route `{param}` didaftar sebelum route statis.
- [ ] Meng-hardcode rahasia di file yang di-commit; lupa `.gitignore` untuk `.key`/`.env`/`data/`.
- [ ] Mengekspos port service internal tanpa auth (andalkan bind 127.0.0.1).
- [ ] Menyajikan angka mentah tanpa satuan/konteks ke pengguna.
- [ ] Menjalankan `npx pm2` polos (bikin daemon `~/.pm2` liar) alih-alih skrip.
- [ ] Menyimpulkan CI "bug" tanpa membaca anotasi (bisa jadi billing).
- [ ] Memakai LLM untuk keputusan yang seharusnya terukur.

---

> Dokumen hidup — perbarui saat menemukan pelajaran baru. Terkait: [Architecture](./01-architecture.md),
> [Security](./03-security.md), [AI System](./07-ai-system.md), [AI Insights](./12-ai-insights.md),
> [PM2 Management](./11-pm2-management.md), [Troubleshooting](./10-troubleshooting.md).
