# Rencana Uji — Aset & APD di staging (rilis gel. 7, 2026-10-14)

- **Ruang lingkup:** fitur [arsip](../../features/arsip/README.md) gelombang 2a Aset & APD (ARS-D1–D6) setelah saklar `FEATURES.assets` dinyalakan di jalur rilis; sekaligus memastikan Time Management yang ikut terpasang (merge develop, D-043) **tersembunyi** (`FEATURES.timeManagement = false`).
- **Aturan yang diuji:** ARS-D1–D6, PLAN §4.2 (`asset.manage`), §4.3 baris aset, PROMPT §3.5 (cek akses), §3.7 (notifikasi/BAST tanpa harga), §3.11 (migrasi), D-043 (saklar rilis).
- **Di luar lingkup:** perilaku yang sudah lulus lokal dan tidak berubah (kode duplikat 409, PT lain 422, unik parsial, idempoten konfirmasi — test api/web); isi email cron `asset-daily` (integration); fitur Time Management (milik Mat, belum dirilis).
- **Lingkungan:** staging — rilis `219b372` (merge develop `5859111`), PR #49 → `6864a1a`, PR #50 → `03dac3b`, `Deploy staging` #38509894453; Supabase `iwgzuwcxsxnbjibhbqgh`; Playwright headless (playwright-core + chrome-headless-shell 1243).
- **Data uji:** akun uji SA/HR/MGR/EMP (`.env.staging`), karyawan akun uji "Rizky Ramadhan"; kategori/jenis/aset berpenanda `Q<RUN>`. Staging memuat nama asli (D-066) → screenshot diperiksa sebelum diarsip.
- **Persiapan:** tidak ada grant baru (HR uji sengaja tanpa `asset.manage`, L-07).
- **Kriteria lulus:** semua P1 & P2 LULUS; tidak ada bug P1/P2 terbuka; 0 error JS/5xx.
- **Suite:** [cases/staging.md](../cases/staging.md) TC-STG-073 s.d. TC-STG-087.
