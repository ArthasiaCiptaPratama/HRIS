# Rencana Uji — Laporan batch 2, lokal (ARS-D21, 2026-10-20)

- **Ruang lingkup:** fitur [arsip](../../features/arsip/README.md) gelombang 3 batch 2 — Personal Management › Laporan: masa kerja + jubilee, demografi, mutasi & promosi, ulang tahun, aset, pengajuan perubahan data; filter PT (bilah atas) / unit / tahun / bulan; ekspor Excel.
- **Aturan yang diuji:** ARS-D21 (definisi & akses batch 2), ARS-D16 (menu SA + HR PT), ARS-D3 (harga aset terbatas), D-058 (aturan ekspor), PROMPT §3.7 (nilai sensitif tidak tampil), aturan emas #3 (data lewat index.ts modul pemilik).
- **Di luar lingkup:** kontrak PKWT (Fase 7), staging (belum dirilis), snapshot historis unit/status (ARS-D18).
- **Lingkungan:** lokal `HRIS/Oatse/Linux-Windows` @ `b414d6d` + perubahan batch 2 (belum di-commit saat uji), API :3000 + web :5173 + PostgreSQL Docker (`hris`), Auth Supabase staging. Playwright headless (playwright-core + chrome-headless-shell 1243), sesi akun HR uji dari browser pemilik projek (hanya access token, tidak dicetak).
- **Data uji:** data lokal yang ada (86 karyawan aktif, aset QA) + data integration terkontrol (PT uji `S<RUN>`/`T<RUN>`).
- **Kriteria lulus:** semua P1 & P2 LULUS; 0 error JS/5xx.
- **Suite:** [cases/employee.md](../cases/employee.md) TC-EMP-250 s.d. TC-EMP-257 + test otomatis (shared `report-batch2.test.ts`, api `report.policy.test.ts`, `tests/integration/report/reports-batch2.test.ts`, web `tests/reports.test.tsx`).
