# Rencana Uji — Lampiran Google Drive di Import (D-060, 2026-10-08)

- **Ruang lingkup:** kolom unggahan Google Form (foto, KTP, KK, ijazah, NPWP, sertifikat, buku rekening) di Import Data Karyawan: pemetaan, pratinjau, antrean saat simpan, pemrosesan lewat service account (unduh → kompres/gabung PDF → foto/dokumen), sidik jari impor ulang, hak akses dokumen sensitif, antrean tertunda & coba ulang, Drive belum dikonfigurasi. Item PROGRESS Fase 4 "Pendataan karyawan existing lewat Google Form" › File di Drive.
- **Aturan yang diuji:** D-060, D-055 (jenis dokumen, versi, dokumen sensitif butuh grant, buku tabungan), D-037 (foto profil), D-042 (pratinjau/simpan, profil pemetaan), PLAN §4.2 (bukti tanpa data asli).
- **Di luar lingkup:** staging (env Vercel belum diisi), HEIC/WebP (dilewati by design), folder Drive bersama (shared drive).
- **Lingkungan:** lokal Linux — PostgreSQL 17 (migrasi `20261008031553_add_import_job_attachments`), API :3000 + web :5173, login Supabase staging (SA), Supabase Storage staging prefix `dev/oatse/`, service account `hris-data@arthasia-hris.iam.gserviceaccount.com`; Playwright Chromium.
- **Data uji:** CSV dummy 138 judul pertanyaan Form; NIP karyawan seed `ACP-2021-0005` + NIP tak dikenal; tautan = file unggahan respons contoh pemilik projek (isi asal; foto wajah disamarkan di bukti). Test otomatis memakai Drive & Storage palsu.
- **Kriteria lulus:** semua P1 & P2 LULUS; typecheck, lint, boundaries, `db:check`, seluruh test hijau; data uji & objek Storage dibersihkan.
- **Suite:** [cases/employee.md](../cases/employee.md) TC-EMP-178–183.
