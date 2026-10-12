# Rencana Uji — Import data Form asli: NIP opsional, unit organisasi, status bawaan, Lengkapi data (D-062–D-064, 2026-10-12)

- **Ruang lingkup:** Import Data Karyawan setelah D-062 (status kepegawaian bawaan & per baris, pemetaan tanpa lag), D-063 (NIP boleh kosong, pencocokan lewat NIK KTP) dan D-064 (pencocokan unit organisasi: persis/saran/pilihan/unit baru per PT, normalisasi isian Form, PT di Lengkapi data), langkah **Lengkapi data**, Pratinjau ringkas, panduan "?". Item PROGRESS Fase 4 "Import data Form asli…" & "Import: status kepegawaian bawaan…".
- **Aturan yang diuji:** D-062, D-063, D-064, D-042 (pratinjau → simpan satu transaksi), D-040 (cakupan PT), PLAN §4.3 (HR boleh import, EMPLOYEE tidak).
- **Di luar lingkup:** file Form asli berisi data pribadi (sudah diuji pemilik projek di browser lokal 2026-10-09, tanpa bukti tersimpan); Windows; browser selain Chromium.
- **Lingkungan:** lokal Linux (2026-10-09, DB `hris`) + staging `hris-staging-web` / `hris-staging-api` (rilis gel. 4: rilis `6b5bae5`, `Deploy staging` #38205386868), Supabase staging · akun uji SA/HR/MGR/EMP · Playwright Chromium 1.56 (`/mnt/winD/WORK/Magang/QA/2026-10-12-staging-gel4/`).
- **Data uji:** `g4-lengkapi.csv` — 4 baris dummy "QA G4 …": NIP terisi/kosong, NIK fiktif 16 digit & 15 digit, placeholder `_`, gol. darah `0`, Departemen "Engineering" (mirip unit), "HRGA Site" (singkatan), "Unit Baru QA G4" (baru), tanpa kolom status. Dihapus setelah uji (karyawan, riwayat import, audit, unit baru, profil pemetaan).
- **Kriteria lulus:** semua P1 & P2 LULUS di lokal & staging; tidak ada bug P1/P2 terbuka; data uji dibersihkan.
- **Suite:** [cases/employee.md](../cases/employee.md) TC-EMP-193–206.
