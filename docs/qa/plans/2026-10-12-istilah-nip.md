# Rencana Uji — Istilah NIP di seluruh tampilan (039b42b, 2026-10-12)

- **Ruang lingkup:** istilah "NIP" (nomor induk pegawai) menggantikan istilah lama di daftar, pencarian, detail, dan form karyawan; penanda/filter "NIP belum ada" (D-063).
- **Aturan yang diuji:** keputusan istilah NIP (2026-10-07), D-063.
- **Di luar lingkup:** login dengan NIP (D-048, disembunyikan saklar `onboarding`).
- **Lingkungan:** lokal (test web) + staging `hris-staging-web` / `hris-staging-api` (rilis gel. 4: rilis `6b5bae5`, `Deploy staging` #38205386868), Supabase staging · akun uji SA/HR/MGR/EMP · Playwright Chromium 1.56 (`/mnt/winD/WORK/Magang/QA/2026-10-12-staging-gel4/`).
- **Data uji:** karyawan dummy "QA G4 Satu" (NIP `QA-G4-A01`) & "QA G4 Dua" (tanpa NIP) dari uji import — dihapus sesudahnya.
- **Kriteria lulus:** TC-EMP-214 LULUS.
- **Suite:** [cases/employee.md](../cases/employee.md) TC-EMP-214.
