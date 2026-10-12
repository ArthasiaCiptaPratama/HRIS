# Hasil Uji — Alur onboarding ujung ke ujung (D-045–D-048, 2026-10-12)

- **Lingkungan:** lokal develop `9a73503` + Supabase Auth staging · Playwright Chromium headless · bukti `/mnt/winD/WORK/Magang/QA/2026-10-12-onboarding-lokal/` (script `admin-1.ts`, `calon-*.ts`, `step1–7.ts`, `review-*.ts`, `login-nip.ts`).
- **Persiapan:** akun `oatse2458@gmail.com` dihapus (user Supabase Auth yang **ter-ban sampai 2126** dari uji lama + akun EMPLOYEE staging tanpa data karyawan); saklar `onboarding` lokal dinyalakan sementara.

| Langkah | Hasil | Bukti / catatan |
|---|---|---|
| 1 Impor calon: unggah CSV 1 baris → pemetaan otomatis (nama, email, HP, jenis kelamin) | LULUS | `o-01-unggah.png`, `o-02-setelah-unggah.png` |
| 2 Pilih yang lolos (centang) → Data kerja: PT ACP, Karyawan Percobaan, HR & GA Site (ACP), Administrasi | LULUS | `o-03-pilih-lolos.png`, `o-04-data-kerja.png` |
| 3 Pratinjau & isi NIP → NIP otomatis `12.10.ACP.024` | LULUS | `o-05-pratinjau-nip.png` |
| 4 Konfirmasi → "Simpan & kirim 1 undangan" → calon INVITED, undangan SENT (Supabase Auth, 08:14 UTC) | LULUS | `o-06-konfirmasi.png`, `o-07-pengiriman.png` |
| 5 Tautan undangan → `/auth/atur-password` → simpan password (≥ 12 karakter) → `/onboarding` | LULUS | `c-01-atur-password.png`, `c-02-wizard-awal.png` |
| 6 Akses terkunci: membuka `/` kembali ke `/onboarding` | LULUS | log `calon-2.ts` |
| 7 Wizard 7 langkah: foto 3:4, data pribadi, kontak darurat, keluarga, rekening, pendidikan, 4 dokumen wajib (JPG ≤ 5 MB) → "Semua data wajib sudah lengkap" | LULUS | `c-03`–`c-10` |
| 8 Pernyataan + "Kirim untuk diperiksa HR" → SUBMITTED; foto & 4 dokumen tersimpan | LULUS | `c-11-terkirim.png` |
| 9 Review SA: semua isian & dokumen tampil; Minta revisi bagian Kontak darurat + catatan → REVISION_REQUESTED | LULUS | `r-01-review.png`, `r-02-dialog-revisi.png` |
| 10 Calon: banner "HR meminta perbaikan pada: Kontak darurat" + catatan; **hanya** bagian itu yang tampil/bisa diubah → perbaiki → kirim ulang → SUBMITTED, layar "Data Anda sudah dikirim" | LULUS | `c-12-catatan-revisi.png`, `c-13-kirim-ulang.png` |
| 11 Riwayat review mencatat revisi; Setujui + PTKP TK/0 → APPROVED, karyawan aktif, akun EMPLOYEE aktif | LULUS | `r-04-dialog-setujui.png`, `r-05-disetujui.png` |
| 12 Email Auth berubah ke alamat turunan NIP (`12.10.acp.024@dev-oatse.login.akselerasi.invalid`) | LULUS | `auth.users` (MCP) |
| 13 Notifikasi & email keputusan ke email pribadi: "Data Anda perlu diperbaiki", "Data Anda diterima" (SMTP langsung; `email_outbox` kosong = tidak ada kegagalan) | LULUS | `notification.notifications` |
| 14 Login dengan NIP `12.10.ACP.024` + password → Dashboard karyawan | LULUS | `l-01-login-nip.png`, `l-02-setelah-login.png` |
| 15 Login dengan email pribadi → ditolak "NIP/email atau password salah" | LULUS | `l-03-login-email-ditolak.png` |

| Case | Hasil |
|---|---|
| TC-EMP-097, 099, 101, 102 | LULUS (langkah 3, 4, 5) |
| TC-EMP-104, 105, 106, 107 | LULUS (langkah 6–8) |
| TC-EMP-110, 111 | LULUS (langkah 9–11) |
| TC-EMP-116, 118 | LULUS (langkah 12, 14, 15) |

**Temuan:**
- [BUG-004](../bugs/BUG-004-sapaan-dashboard-pakai-email.md) (P3, terbuka): sapaan Dashboard karyawan baru "Selamat sore, Oatse2458" diambil dari email akun, bukan nama karyawan.
- Email undangan memakai **template bawaan Supabase** (belum bermerek Akselerasi Arthasia) — item PROGRESS "Template email Supabase Auth" masih terbuka.
- Notifikasi "Data onboarding menunggu review" juga dikirim ke akun sisa test otomatis di DB lokal (`auth-…@example.test`) — kebersihan data lokal, bukan bug aplikasi.
- Isi email di kotak masuk `oatse2458@gmail.com` (undangan, perlu diperbaiki, diterima) **belum dilihat langsung** — dicek pemilik projek.

**Kesimpulan:** alur onboarding admin → calon → review → login NIP **LULUS lokal**. Belum LEGIT (staging belum diuji; menunggu template email, env login NIP staging, grant review HR, lalu saklar `onboarding`). **Bug terbuka:** BUG-004 (P3).

**Data uji:** karyawan "Calon Uji Oatse" (`12.10.ACP.024`, aktif) + user Auth `12.10.acp.024@dev-oatse.login.akselerasi.invalid` dibiarkan untuk dicoba pemilik projek (password di `QA/2026-10-12-onboarding-lokal/calon.env`, izin 600).
