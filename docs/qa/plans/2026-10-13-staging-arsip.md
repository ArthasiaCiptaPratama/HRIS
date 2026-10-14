# Rencana Uji — Arsip karyawan gel. 1 & Layanan Mandiri di staging (rilis gel. 6, 2026-10-13)

- **Ruang lingkup:** fitur [arsip](../../features/arsip/README.md) — saklar `FEATURES.archive` + `FEATURES.selfService` dinyalakan di jalur rilis: tabel Arsip lintas karyawan (gel. 1a–1b), Data File & Jenis dokumen (1b), Layanan Mandiri + Pengajuan Perubahan Data (1c), ekspor Excel (1d).
- **Aturan yang diuji:** PLAN §4.2 (Arsip Keluarga & Bank butuh grant), §4.3 (cakupan per role), §4.5.1 (tidak memutus pengajuan sendiri), D-008 (grant dibaca dari DB tiap request), D-054 (pengajuan perubahan data), D-055 (katalog jenis dokumen), D-058 (ekspor), PROMPT §3.7 (notifikasi tanpa data), D-043 (saklar rilis).
- **Di luar lingkup:** perilaku rinci yang sudah lulus lokal dan tidak berubah (unggah/versi dokumen, riwayat jabatan, cetak, cron `document-expiry`) — runs 2026-10-05 s.d. 2026-10-08; pengajuan bagian sensitif (Data pribadi, Rekening) karena butuh grant pribadi/rekening yang tidak dimiliki HR uji.
- **Lingkungan:** staging — rilis `42df46e` (PR #47 → `62632e2`, PR #48 → `d0e652b`, `Deploy staging` #38374784477), Supabase `iwgzuwcxsxnbjibhbqgh`, Playwright headless (playwright-core + chrome-headless-shell 1243).
- **Data uji:** akun uji SA/HR/MGR/EMP (`.env.staging`), karyawan akun uji "Rizky Ramadhan"; nilai pengajuan berpenanda `QA STG Kontak <RUN>`. Staging memuat nama asli bagan (D-066) → screenshot daftar hanya diambil setelah disaring ke karyawan akun uji.
- **Persiapan (izin pemilik projek 2026-10-13):** grant `employee.changes.review` untuk HR uji, diberikan SA lewat API saat uji (TC-STG-060).
- **Kriteria lulus:** semua P1 & P2 LULUS; tidak ada bug P1/P2 terbuka.
- **Suite:** [cases/staging.md](../cases/staging.md) TC-STG-059 s.d. TC-STG-072.
