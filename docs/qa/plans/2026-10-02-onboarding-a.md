# Rencana Uji — Onboarding bagian a: Penerimaan & Undangan (D-045, 2026-10-02)

- **Ruang lingkup:** impor calon dari file portal (diurai di browser), pemilihan calon lolos, data kerja + nomor induk otomatis, konfirmasi undangan, antrean undangan bertahap (batas per jam, cron cadangan), kirim ulang, undang karyawan existing, login pertama → "Mengisi data", penyembunyian calon dari fitur karyawan & import.
- **Aturan yang diuji:** D-045 (poin 1–5, 8 sebagian, 9), D-040 (cakupan PT), PLAN §4.3 baris "Penerimaan karyawan baru", PROMPT §3.7 (tanpa email/nama di audit & pesan error).
- **Di luar lingkup:** wizard isi data & dokumen (b), review & login NIK (c), retensi (d), email sungguhan (stub Supabase), staging.
- **Lingkungan:** lokal Linux — PostgreSQL 17 (DB `hris`), bun test + Vitest. Browser belum.
- **Kriteria lulus:** semua P1 & P2 otomatis LULUS; typecheck, lint, boundaries, `db:check`, seluruh test, build hijau.
- **Suite:** [cases/employee.md](../cases/employee.md) TC-EMP-096 s.d. TC-EMP-103.
- **Tambahan bagian b (2026-10-02):** wizard isi data (draf, validasi, kelengkapan), dokumen (bucket private, path berprefix, ganti versi), kirim, kunci akses calon (API + web), mode lengkapi karyawan existing (hanya field kosong, tidak dikunci). Suite: TC-EMP-104 s.d. TC-EMP-108.
