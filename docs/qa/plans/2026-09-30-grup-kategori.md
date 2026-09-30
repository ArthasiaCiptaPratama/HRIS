# Rencana Uji — Pengelompokan Kategori Karyawan di Sidebar (D-038, 2026-09-30)

- **Ruang lingkup (permintaan pemilik projek):** sidebar Personal Management dikelompokkan ulang: Semua Karyawan Aktif · **Karyawan Internal** (Karyawan Tetap, Karyawan Percobaan, PKWT, Pekerja Harian, Semua Karyawan Internal) · **Program Magang** (Magang) · **Tenaga Kerja Eksternal** (Outsourcing, Vendor, Semua Tenaga Kerja Eksternal); kategori baru `PROBATION` & `VENDOR` (migrasi enum), filter API `?group=`, istilah "Pegawai" → "Karyawan" di Personal Management.
- **Aturan yang diuji:** D-038 (mengganti D-035 poin 3), D-035 poin 2 (MANAGER hanya tim), PLAN §4.3 (EMPLOYEE tanpa menu ini), PROMPT §5 (validasi query).
- **Di luar lingkup:** aturan bisnis masa percobaan (durasi, pengingat), CRUD master data (Fase 3, ditahan), menu b–e (masih Maintenance), staging (menunggu rilis & seed ulang staging).
- **Lingkungan:** lokal Linux — PostgreSQL 17 (Docker, seed ulang), API :3000 + web :5173 (`bun run dev`), login Supabase staging sungguhan (SA/HR/MGR/EMP); Playwright Chromium 1440×900 & 390×844.
- **Kriteria lulus:** semua P1 & P2 LULUS; typecheck, lint, boundaries, `db:check`, seluruh test hijau; konsol bersih; tidak ada label sidebar terpotong di 1440 px.
- **Suite:** [cases/employee.md](../cases/employee.md) TC-EMP-056 s.d. TC-EMP-066 (+ regresi TC-EMP-003, TC-EMP-029).
