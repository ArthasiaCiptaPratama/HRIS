# Rencana Uji — Import Data Karyawan (D-041/D-042, 2026-09-30)

- **Ruang lingkup:** kolom baru D-041 (BPJS TK/Kesehatan, PTKP, kota asal, kontak darurat, jenjang pendidikan); mesin deteksi & normalisasi `@hris/shared/import`; API `/employee-imports` (pratinjau, simpan, riwayat, profil pemetaan); halaman `/personal/import` yang dibuka dari tombol **Import** di Data Karyawan Aktif.
- **Aturan yang diuji:** D-042 poin 1–8, D-040 (cakupan PT), PLAN §4.2 (grant tulis sensitif), §4.3 (baris "Import karyawan"), §4.5 (audit), penyempurnaan design §10.
- **Di luar lingkup:** CRUD master data (Tahap 3), undangan akun dari hasil import (Tahap 5), import saldo cuti/kontrak, file `.xls`, staging (belum dirilis), file data asli (hanya uji kering lokal, angka saja).
- **Lingkungan:** lokal Linux — PostgreSQL 17 (migrasi `20260930090116_add_import_and_employee_details`), API :3000 + web :5173, login Supabase staging sungguhan (SA/HR tanpa grant/EMP); Playwright Chromium 1440×900 & 390×844. Data hasil import dibersihkan di akhir skrip. **Tambahan 2026-10-05: staging** (rilis gelombang 1, login sungguhan 4 role) — lihat run "Sesi staging".
- **Kriteria lulus:** semua P1 & P2 LULUS; typecheck, lint, boundaries, `db:check`, seluruh test, build hijau; konsol bersih.
- **Suite:** [cases/employee.md](../cases/employee.md) TC-EMP-079 s.d. TC-EMP-090.
