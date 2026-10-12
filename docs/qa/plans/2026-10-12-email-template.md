# Rencana Uji — Template email bermerek & alur atur password (2026-10-12)

- **Ruang lingkup:** template Supabase Auth **Invite user** & **Reset Password** gaya surat resmi dengan logo Arthasia (`docs/email-templates/`, dipasang pemilik projek di Dashboard Supabase 2026-10-12) dan halaman atur password yang dituju tautannya (form baru: tampilkan password, syarat ≥ 12 karakter, kecocokan).
- **Aturan yang diuji:** D-045 (undangan aktivasi), D-048 (lupa password), keputusan pemilik projek 2026-10-12 (hanya "minimal 12 karakter" wajib).
- **Di luar lingkup:** isi email selain kedua template (Confirm signup, Magic link, Change email tidak dipakai); email onboarding lewat SMTP aplikasi (notifikasi) — sudah di run `2026-10-12-onboarding-e2e`.
- **Lingkungan:** render lokal (Chromium) + staging `hris-staging-web` (rilis gel. 5: rilis `790973c`, `Deploy staging` #38230471120), Supabase Auth staging (SMTP `admin.arthasia@gmail.com`) · Playwright 1.56 · bukti `/mnt/winD/WORK/Magang/QA/2026-10-12-email-template/`.
- **Data uji:** pengguna Auth sementara ber-alamat plus-addressing `oatse2458+qa-email-…@gmail.com` (tanpa akun HRIS); pengguna alur dihapus otomatis, dua pengguna penerima email dihapus setelah pemilik projek memeriksa kotak masuk.
- **Kriteria lulus:** TC-ADM-053…057 LULUS; TC-ADM-054 butuh konfirmasi visual pemilik projek di kotak masuk.
- **Suite:** [cases/administrasi.md](../cases/administrasi.md) TC-ADM-053…057.
