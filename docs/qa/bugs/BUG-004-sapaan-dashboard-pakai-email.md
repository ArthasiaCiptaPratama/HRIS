# BUG-004: Sapaan Dashboard memakai email akun, bukan nama karyawan
- **Prioritas:** P3 · **Status:** DITUTUP 2026-10-12 (commit `7e6517b`; staging rilis gel. 5: login NIP calon → sapaan "…, Calon"; kartu akun HR menampilkan "Siti Rahmawati") · **Case:** TC-EMP-118 (ditemukan saat uji onboarding ujung ke ujung, lokal 2026-10-12)
- **Langkah reproduksi:** 1. Selesaikan onboarding calon "Calon Uji Oatse" (email pribadi `oatse2458@gmail.com`) sampai disetujui. 2. Login dengan NIP. 3. Lihat Dashboard.
- **Diharapkan:** "Selamat sore, Calon" / nama karyawan.
- **Terjadi:** "Selamat sore, Oatse2458" — diambil dari bagian depan email akun (`iam.accounts.email`). Pojok kanan atas juga menampilkan email pribadi, bukan nama.
- **Dugaan akar masalah:** sapaan & kartu akun memakai email akun bila `/me` tidak menyertakan nama karyawan (atau web tidak memakainya).
- **Usulan perbaikan:** pakai `fullName` karyawan dari `/me` bila akun terhubung ke karyawan; email hanya cadangan. Tambah test web.
- **Perbaikan:** `GET /me` menyertakan `employeeName` (nama karyawan tertaut; null bila tanpa karyawan). Web: sapaan memakai nama depan karyawan, kartu akun memakai nama lengkap (email di bawahnya), inisial dari nama; email tetap cadangan.
- **Test pencegah:** api `tests/integration/iam/me-employee-name.test.ts` (2) · web `tests/greeting.test.tsx` (2) — merah sebelum, hijau sesudah.
