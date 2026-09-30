# Rencana Uji — Rilis Import Data Karyawan + Dashboard SA/HR (2026-09-30)

- **Ruang lingkup:** kolom D-041; import D-042 (mesin `@hris/shared/import`, API `/employee-imports`, halaman `/personal/import` dari tombol **Import** di Data Karyawan Aktif) **tanpa multi-perusahaan**; dashboard SA/HR (`GET /dashboard`, grafik lazy) yang memperbaiki commit dashboard `5211a25` di `HRIS/debug/fe-be`.
- **Aturan yang diuji:** D-042 poin 1–8 (kecuali cakupan PT), PLAN §4.2 (grant tulis sensitif), §4.3 (baris "Import karyawan" & "Dashboard agregat"), §4.5 (audit).
- **Di luar lingkup:** multi-perusahaan (D-039/D-040: TC-EMP-085, 088 BELUM), audit UI Paket A, menu c–e (tetap `FEATURES` false), CRUD master data.
- **Lingkungan:** lokal Linux — git worktree `HRIS/Oatse/rilis-import`, PostgreSQL 17 DB `hris_release` (migrasi + seed + akun uji disalin), API :3000 + web :5173, login Supabase staging sungguhan (SA/HR/EMP); Playwright Chromium 1440×900 & 390×844. Setelah rilis: staging.
- **Kriteria lulus:** semua P1 & P2 dalam lingkup LULUS; typecheck, lint, boundaries, `db:check`, seluruh test, build hijau; konsol bersih.
- **Suite:** [cases/employee.md](../cases/employee.md) TC-EMP-079 s.d. TC-EMP-092.
