# Rencana Uji — Laporan batch 1, lokal (ARS-D16/D17, 2026-10-16)

- **Ruang lingkup:** fitur [arsip](../../features/arsip/README.md) gelombang 3 batch 1 — menu Personal Management › Laporan: headcount & turnover, dokumen kedaluwarsa, kelengkapan data, SP aktif; filter PT (bilah atas) / unit / tahun; ekspor Excel.
- **Aturan yang diuji:** ARS-D16 (akses SA + HR PT; daftar sensitif ber-grant; layar + Excel), ARS-D17 (definisi angka), D-058 (aturan ekspor), PROMPT §3.7 (nilai sensitif tidak tampil), aturan emas #3 (agregat lewat index.ts modul pemilik).
- **Di luar lingkup:** batch 2 (6 laporan lain), kontrak PKWT (Fase 7), staging (belum dirilis), dokumen wajib berlingkup SITE (belum ada penanda site).
- **Lingkungan:** lokal develop `c49668a` + perubahan gel. 3 (belum di-commit saat uji), API :3000 + web :5173 + PostgreSQL 17 Docker (`hris`), login Supabase Auth staging akun uji. Playwright headless (playwright-core 1.63 + chrome-headless-shell 1243).
- **Data uji:** data lokal yang ada (88 karyawan aktif, SP uji Rizky, dokumen uji) + data integration test terkontrol (PT uji `R<RUN>`).
- **Kriteria lulus:** semua P1 & P2 LULUS; 0 error JS/5xx.
- **Suite:** [cases/employee.md](../cases/employee.md) TC-EMP-239 s.d. TC-EMP-249 + test otomatis (shared `report.test.ts`, api `report.policy.test.ts`, `tests/integration/report/reports.test.ts`, web `tests/reports.test.tsx`).
