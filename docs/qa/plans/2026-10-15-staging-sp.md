# Rencana Uji — Surat Peringatan & header detail karyawan di staging (rilis gel. 8, 2026-10-15)

- **Ruang lingkup:** rilis gel. 8 (D-043): Arsip gel. 2b Surat Peringatan tampil (`FEATURES.discipline = true`), tampilan header detail karyawan, Time Management + lokasi absen (TM-D1) terpasang tetapi tetap tersembunyi (`FEATURES.timeManagement = false`).
- **Aturan yang diuji:** ARS-D7–D15, PLAN §4.2/§4.3 (grant `employee.discipline.*`), PROMPT §3.5/§3.7/§3.11, D-043.
- **Di luar lingkup:** bukti hari ALPHA (butuh Time Management; diuji lokal TC-EMP-228); cron `discipline-daily` berjalan nyata (diuji integration; endpoint dicek 401); pendaftaran cron di dashboard Vercel (MCP Vercel tidak punya akses scope tim).
- **Lingkungan:** staging `https://hris-staging-web.vercel.app` + `https://hris-staging-api.vercel.app` (rilis `905649a` → PR #51 / #52 → `Deploy staging` #38718943479), Supabase staging, akun uji SA / HR (Siti, diberi grant `employee.discipline.write`, dipertahankan) / MGR (Andi) / EMP (Rizky, bawahan Andi).
- **Kriteria lulus:** semua P1 & P2 LULUS; tidak ada bug P1/P2 terbuka; 0 error JS/5xx → LEGIT → arsip Drive.
- **Suite:** [cases/staging.md](../cases/staging.md) TC-STG-088 s.d. TC-STG-102.
