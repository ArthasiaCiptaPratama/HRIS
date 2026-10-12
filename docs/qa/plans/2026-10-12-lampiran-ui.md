# Rencana Uji — Tampilan proses lampiran Drive & ketahanan koneksi (TC-EMP-207/208, 2026-10-12)

- **Ruang lingkup:** panel lampiran Google Drive (status, persen, kartu, "Sedang diproses", tabel "Perlu dicek" tanpa kolom Baris + gulir mendatar), langkah Selesai dua kolom & status jujur, konfirmasi jeda sebelum import file lain, kartu antrean tertunda + lembar samping, coba ulang otomatis saat koneksi putus/menggantung. Commit `5b0fc5b`, `928c38e` (+ perbaikan BUG-003).
- **Aturan yang diuji:** D-060 (antrean lampiran, pemrosesan bertahap dari browser), PLAN D-060 ±8 dtk per panggilan.
- **Di luar lingkup:** file Drive sungguhan (sudah diuji gel. 2, arsip `2026-10-08-lampiran-drive`); pekerja latar belakang (Backlog).
- **Lingkungan:** lokal (test + Playwright ke dev server) + staging `hris-staging-web` / `hris-staging-api` (rilis gel. 4: rilis `6b5bae5`, `Deploy staging` #38205386868), Supabase staging · akun uji SA/HR/MGR/EMP · Playwright Chromium 1.56 (`/mnt/winD/WORK/Magang/QA/2026-10-12-staging-gel4/`).
- **Data uji:** `g4-lampiran.csv` — 25 karyawan dummy "QA G4 Lampiran NN" + 150 tautan Drive **palsu** (semua gagal dengan alasan jelas → cukup untuk menguji tampilan & alur). Gangguan koneksi disimulasikan dengan intersepsi request Playwright (diputus seketika / ditahan tanpa jawaban). Dihapus setelah uji.
- **Kriteria lulus:** TC-EMP-207, 208, 182 LULUS di lokal & staging; BUG-003 tertutup.
- **Suite:** [cases/employee.md](../cases/employee.md) TC-EMP-182, TC-EMP-207, TC-EMP-208 · bug [BUG-003](../bugs/BUG-003-lampiran-macet-koneksi-menggantung.md).
