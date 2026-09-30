# Rencana Uji — Seragam Halaman Administrasi & Akun Saya, prefix Storage, SMTP di test (2026-09-30)

- **Ruang lingkup (permintaan pemilik projek):** (1) path foto memakai `STORAGE_PATH_PREFIX` (PLAN §3.3); (2) test api tidak memakai SMTP sungguhan dari `.env`; (3) halaman Akun, Grant izin, Audit log, Profil, Notifikasi memakai gaya/komponen Personal Management (`PageHeader`, `DataTable`, `TablePagination`, `EmptyState`) tanpa mengubah logika, API, atau akses.
- **Aturan yang diuji:** PLAN §3.3, §4.3 (akses per role tetap), D-025, D-037, PROMPT §7 (konvensi frontend).
- **Di luar lingkup:** Fase 3 (ditahan), memindahkan 2 foto lama tanpa prefix di bucket staging, uji Windows, staging.
- **Lingkungan:** lokal Linux — PostgreSQL 17 (Docker), API :3000 + web :5173 (`bun run dev`), login Supabase staging sungguhan (SA/HR/MGR/EMP); Playwright Chromium 1440×900 & 390×844.
- **Kriteria lulus:** semua P1 & P2 LULUS; typecheck, lint, boundaries, `db:check`, seluruh test (tanpa mengosongkan `SMTP_*`) hijau; konsol bersih.
- **Suite:** [cases/administrasi.md](../cases/administrasi.md) TC-ADM-001 s.d. TC-ADM-010; [cases/employee.md](../cases/employee.md) TC-EMP-054 s.d. TC-EMP-055.
