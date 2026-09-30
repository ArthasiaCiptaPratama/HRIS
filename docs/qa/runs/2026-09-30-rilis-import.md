# Hasil Uji — Rilis Import Data Karyawan + Dashboard SA/HR (2026-09-30)

- **Commit:** working tree branch `HRIS/Oatse/rilis-import` di atas `bcf092d` (merge `origin/HRIS/debug/fe-be` `5211a25`) · **Env:** lokal Linux, DB `hris_release` · **Bun/PG:** 1.4.2 / PostgreSQL 17
- **Perintah & ringkasan:**
  - Migrasi `20260930102336_add_import_and_employee_details` (hanya tambah) diterapkan; "Already in sync"; `db:check` ✔.
  - `bun run typecheck` ✔ · `bunx biome ci .` ✔ · `bun run check:boundaries` ✔ (216 modul) · `bun run test` ✔ (shared 63 · api 301 · web 93 + 1 dilewati) · `bun run build` ✔ (grafik ECharts di chunk lazy `dashboard-charts`, hanya untuk SA/HR).
  - Playwright login sungguhan: `e2e.ts` → **15/15 LULUS**; data hasil import dibersihkan.

| ID | Hasil | Bukti / catatan |
|---|---|---|
| TC-EMP-079 | LULUS | SHR; UI I-02 (header baris 5 · 9 baris · 31 kolom) |
| TC-EMP-080 | LULUS | SHR |
| TC-EMP-081 | LULUS | IMP; UI I-03 (8 dibuat, 1 error: status kosong) |
| TC-EMP-082 | LULUS | IMP; UI I-05, I-07 (6 aktif + 2 resign nonaktif), I-08 (audit & job) |
| TC-EMP-083 | LULUS | IMP; UI I-09 (import ulang: 0 dibuat, 8 dilewati) |
| TC-EMP-084 | LULUS | IMP; WIMP; UI I-03, I-07 (KTP 0, rekening 0 untuk HR tanpa grant), I-12 (SA: tidak dilewati) |
| TC-EMP-085, TC-EMP-088 | BELUM | Menunggu rilis multi-perusahaan; IMP memastikan kolom perusahaan diabaikan tanpa error |
| TC-EMP-086 | LULUS | IMP; WIMP; UI I-13 |
| TC-EMP-087 | LULUS | IMP; WIMP |
| TC-EMP-089 | LULUS | WIMP; UI I-01, I-05, I-06 (badge 21 → 27), I-09 |
| TC-EMP-090 | LULUS | WIMP; UI I-04 (`baris-bermasalah.xlsx`), I-11 (mobile tanpa scroll horizontal) |
| TC-EMP-091 | LULUS | DSH (SA/HR 200, MGR/EMP 403, tanpa token 401); WDSH; UI I-14, I-15 |
| TC-EMP-092 | LULUS | DSH (agregat & tanpa data per orang); UI `sa-dashboard-desktop.png` |
| Regresi TC-EMP-001…071 | LULUS | suite penuh |

**Temuan & perbaikan selama rilis:** commit dashboard `5211a25` (rekan tim) membuat CI & deploy web `fe-be` gagal — dependency `echarts`/`motion` tidak ditambahkan, `useDashboard` & endpoint tidak ada, ±40 error TypeScript/lint. Dilengkapi: endpoint + hook + akses SA/HR, dependency, perbaikan tipe, grafik lazy, warna donut (nama variabel CSS berspasi → abu-abu; kini di-escape), palet 8 warna, satuan kartu ("lokasi"/"entry" → karyawan). Test web BUG-001 sempat melewati batas waktu karena ECharts dimuat langsung — selesai dengan lazy-load.

**Bukti:** `/mnt/winD/WORK/Magang/QA/2026-09-30-rilis-import/` (screenshot desktop & mobile, `baris-bermasalah.xlsx`, `e2e-results.json`). Semua data dummy.

**Kesimpulan:** memenuhi kriteria rencana di lokal. **Bug terbuka:** tidak ada. **Belum diverifikasi:** staging (menunggu rilis), browser selain Chromium, Windows.
