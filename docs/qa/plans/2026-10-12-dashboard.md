# Rencana Uji — Dashboard yang bisa diatur (D-065) + ringkasan SA/HR (2026-10-12)

- **Ruang lingkup:** Dashboard SA/HR: ringkasan kepegawaian (D-035), widget per akun (tambah template, buat grafik pivot sendiri, hapus, reset, tersimpan), dimensi data pribadi ber-grant, akses MANAGER/EMPLOYEE. Item PROGRESS Fase 4 "Dashboard bisa diatur (D-065)" + dashboard ringkasan rilis import (2026-09-30).
- **Aturan yang diuji:** D-065, PLAN §4.2 (data pribadi butuh grant `employee.personal.read`; grant kedaluwarsa tidak berlaku), PLAN §4.3 (dashboard agregat SA & HR saja), D-040 (cakupan PT).
- **Di luar lingkup:** geser-urutkan widget dengan seret (dnd-kit; diuji WEB), ukuran widget, ekspor gambar grafik, Windows.
- **Lingkungan:** lokal (test otomatis) + staging `hris-staging-web` / `hris-staging-api` (rilis gel. 4: rilis `6b5bae5`, `Deploy staging` #38205386868), Supabase staging · akun uji SA/HR/MGR/EMP · Playwright Chromium 1.56 (`/mnt/winD/WORK/Magang/QA/2026-10-12-staging-gel4/`).
- **Data uji:** akun HR uji (belum punya susunan; grant `employee.personal.read` **kedaluwarsa** 2026-10-08) — di-Reset ke susunan bawaan di akhir; susunan SA tidak disentuh.
- **Kriteria lulus:** semua P1 & P2 LULUS; susunan akun uji kembali bawaan.
- **Suite:** [cases/employee.md](../cases/employee.md) TC-EMP-091, TC-EMP-092, TC-EMP-209–213.
