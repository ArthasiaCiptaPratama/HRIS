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

**Staging (2026-10-12, rilis gel. 5 — saklar `onboarding` aktif, rilis `790973c`, PR #45/#46, `Deploy staging` #38230471120):** Playwright `QA/2026-10-12-staging-onboarding/stg-onboarding.ts` (SA impor, **HR uji ber-grant `employee.onboarding.review`** me-review, env login NIP staging aktif). Calon dummy plus-address pemilik projek (`oatse2458+stg…@gmail.com`), NIK/KK fiktif; semua data, user Auth, & 11 objek Storage dihapus sesudahnya (staging 66 karyawan, 4 akun, 0 batch).

| ID | Hasil | Bukti / catatan |
|---|---|---|
| S-01 | LULUS | SA impor CSV (pemetaan, pilih lolos, data kerja) → NIP otomatis `12.10.ACP.010` — `staging-s-01-data-kerja.png` |
| S-02 | LULUS | Simpan & kirim 1 undangan → 1/1 terkirim — `staging-s-02-terkirim.png` |
| C-01 | LULUS | Tautan undangan → atur password (tampilkan, kekuatan, "Password cocok") → dikunci ke `/onboarding` — `staging-c-01-atur-password.png` |
| C-02 | LULUS | Wizard 7 langkah + foto + 4 dokumen wajib → "4 dari 4 dokumen wajib terunggah", "Semua data wajib sudah lengkap" — `staging-c-02a…c` |
| C-03 | LULUS | Kirim → "Data Anda sudah dikirim" — `staging-c-03-terkirim.png` |
| H-01 | LULUS (kriteria dikoreksi) | HR membuka review lewat tombol Periksa (kartu profil, data berkelompok, dokumen) → Minta revisi Rekening → kembali ke daftar, status **Perlu revisi**. Run 1 gagal karena skrip mengklik nama (aksi ada di tombol Periksa); run 3 gagal hanya di pengecekan teks setelah halaman kembali ke daftar — `staging-h-01-review.png`, `staging-h-01b-perlu-revisi.png` |
| C-04 | LULUS (run 3) | Catatan HR tampil, hanya Rekening terbuka ("Perlu diperbaiki") → perbaiki → kirim ulang — `staging-c-04-revisi.png` |
| H-02 | LULUS | HR Setujui + PTKP TK/0 → karyawan aktif |
| L-01 | LULUS | Login NIP + password → Dashboard "…, Calon" (BUG-004 tertutup di staging) — `staging-l-01-login-nip.png` |
| L-02 | LULUS | Login email pribadi → ditolak |

Run 2 (calon kedua) berhenti di Data pribadi karena **NIK sama** dengan calon pertama yang sudah disetujui → server menolak (NIK unik, perilaku benar); run 3 memakai NIK fiktif lain.

**Kesimpulan:** alur onboarding admin → calon → review (revisi & setujui) → login NIP **LULUS lokal + staging — LEGIT**. **Bug terbuka:** tidak ada (BUG-004 ditutup). Catatan: email undangan masih template bawaan Supabase sampai template bermerek (`docs/email-templates/`) dipasang di Dashboard.

**Data uji:** karyawan "Calon Uji Oatse" (`12.10.ACP.024`, aktif) + user Auth `12.10.acp.024@dev-oatse.login.akselerasi.invalid` dibiarkan untuk dicoba pemilik projek (password di `QA/2026-10-12-onboarding-lokal/calon.env`, izin 600).

**Arsip Drive:** `hris-qa:2026-10-12-onboarding-e2e` — 64 file (plan, run, cases, BUG-004, screenshot lokal, lokal-ui & staging), 2026-10-12.
