# BUG-004: Sapaan Dashboard memakai email akun, bukan nama karyawan
- **Prioritas:** P3 · **Status:** TERBUKA · **Case:** TC-EMP-118 (ditemukan saat uji onboarding ujung ke ujung, lokal 2026-10-12)
- **Langkah reproduksi:** 1. Selesaikan onboarding calon "Calon Uji Oatse" (email pribadi `oatse2458@gmail.com`) sampai disetujui. 2. Login dengan NIP. 3. Lihat Dashboard.
- **Diharapkan:** "Selamat sore, Calon" / nama karyawan.
- **Terjadi:** "Selamat sore, Oatse2458" — diambil dari bagian depan email akun (`iam.accounts.email`). Pojok kanan atas juga menampilkan email pribadi, bukan nama.
- **Dugaan akar masalah:** sapaan & kartu akun memakai email akun bila `/me` tidak menyertakan nama karyawan (atau web tidak memakainya).
- **Usulan perbaikan:** pakai `fullName` karyawan dari `/me` bila akun terhubung ke karyawan; email hanya cadangan. Tambah test web.
