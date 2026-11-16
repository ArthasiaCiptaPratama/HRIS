# Onboarding karyawan baru

> **Kode prefix:** `ONB` · **Fase:** 4 · **PIC:** Oatse · **Branch:** `HRIS/Oatse/Linux-Windows` (develop) · **Saklar `FEATURES`:** `onboarding`
> **Status:** ✔ aktif di staging (rilis gel. 5, 2026-10-12); QA LEGIT · ubah email & batalkan undangan (ONB-D1) ✔ develop `fdeb71b` 2026-11-16 (CI ✔), belum dirilis · akun wajib tertaut karyawan (ONB-D2) ✔ develop `7396aec` 2026-11-16 (CI ✔)

Impor calon → undangan → wizard isi data & dokumen → review HR (D-047) → disetujui; login dengan NIP (D-048), template email bermerek.

Dokumen fitur ini: **README** (status, checklist, keputusan) · [design.md](design.md) · [log.md](log.md). Induk: [PROGRESS](../../PROGRESS.md).

## Checklist

Legenda: `[ ]` belum · `[~]` sedang · `[x]` selesai · `[-]` dibatalkan/ditunda. Langkah baru: sub-item `(tambahan YYYY-MM-DD) alasan`.

### Fase 4 — Employee (bagian Onboarding)
- [-] Undangan akun dari data karyawan (satuan & massal dari hasil import; Tahap 5) — digantikan "Onboarding karyawan baru" di bawah (D-045, 2026-10-01)
- [x] **Onboarding karyawan baru** (a–d ✔ lokal; aktif di staging 2026-10-12, QA LEGIT + arsip Drive; template email terpasang) (D-045–D-048, desain `docs/features/onboarding/design.md`; setelah Tahap 3) (tambahan 2026-10-01: permintaan pemilik projek, hasil grill)
    - [x] (tambahan 2026-11-03: audit keamanan 6/R2 bagian C) Konfirmasi dokumen menolak traversal dan path dokumen yang sudah terdaftar (termasuk soft-deleted); kandidat hanya dapat menghapus/mengganti unggahannya sendiri, selaras dengan `removable`. Regresi cleanup, benturan saat konfirmasi, dan alur normal; test API 1109/1109 pada DB lokal terisolasi, typecheck/Biome/boundaries lulus; belum dirilis.
    - [x] c1. (✔ lokal 2026-10-02, antrean #12) Review (grant `employee.onboarding.review`), setujui (+PTKP, koreksi data kerja, riwayat HIRED) / minta revisi per bagian / batalkan (+nonaktif & ban) + email & notifikasi, halaman `/ess` kosong
    - [x] c2. (✔ lokal 2026-10-02, antrean #13) **Login NIK** (`iam.accounts.login_email`, alamat turunan per lingkungan, lupa password via API, script migrasi akun existing — **belum dijalankan**). `.invalid` terverifikasi 2026-10-02; env lokal diisi (`dev-oatse.login.akselerasi.invalid`); sisa: env staging saat rilis.
  - [x] Template email Supabase Auth bernama Akselerasi Arthasia — `docs/email-templates/` gaya surat resmi + logo dari Supabase Storage bucket publik `public-assets`; **Invite user & Reset Password terpasang** oleh pemilik projek di Dashboard Supabase (2026-10-12; berlaku lokal & staging karena Auth sama). Produksi: pasang ulang + URL logo produksi saat Rilis 1
  - [x] Env login NIP staging (tambahan 2026-10-12): `LOGIN_EMAIL_DOMAIN` (`hris-staging-api`) & `VITE_LOGIN_EMAIL_DOMAIN` (`hris-staging-web`) = `stg.login.akselerasi.invalid`, target production — berlaku pada deploy berikutnya
  - [x] Grant `employee.onboarding.review` untuk HR uji staging (tambahan 2026-10-12; lewat API sebagai SA, tanpa masa berlaku, tercatat audit)
  - [x] BUG-004 sapaan Dashboard pakai nama karyawan (tambahan 2026-10-12; `/me.employeeName`, commit `7e6517b`; api 600 · web 208 ✔)
  - [x] **UI/UX onboarding lebih profesional** (tambahan 2026-10-12: masukan pemilik projek dari uji manual) — wizard: panel langkah vertikal + status (lengkap / perlu dilengkapi / perlu diperbaiki) + progres, kartu konten per langkah (judul, penjelasan, tanda `*` wajib), kartu dokumen (Wajib/Opsional, terunggah/belum, penghitung), ringkasan kekurangan dikelompokkan per bagian + tombol Buka; review admin: kartu profil (foto, NIP, status, fakta kunci), data pribadi dikelompokkan, dokumen sebagai daftar + dokumen wajib yang belum ada, riwayat review sebagai linimasa; impor calon: **seret-lepas berfungsi** (sebelumnya tidak ada handler) + tata letak 2 kolom dengan panel Format file; form atur password (undangan/reset/profil): tombol tampilkan password, indikator kekuatan, syarat langsung tercentang, penanda kecocokan ulangi password — web 233 ✔ (saklar onboarding lokal menyala), tanpa scroll mendatar di HP (390 px)
  - [x] **Ubah email & batalkan undangan akun belum login + perbaikan antrean (ONB-D1)** (tambahan 2026-11-16: kutipan pengguna "kerjakan A, B, C" — undangan ke email salah tidak bisa diperbaiki & tautannya tetap berlaku; kirim ulang ditandai SENT padahal email tidak sampai) — API + web Penerimaan (menu ⋯ per baris) + test; uji tautan lama di Supabase Auth lokal ✔; develop `fdeb71b` (CI #43794724243 ✔), belum dirilis
  - [x] **Akun Karyawan/Manager wajib tertaut ke data karyawan (ONB-D2)** (tambahan 2026-11-16: bug staging akun Seifal "Akun belum terhubung ke data karyawan" — Akun › Undang akun tidak menautkan karyawan) — undang wajib pilih karyawan, Tautkan ke karyawan + saran email, badge & filter Belum tertaut, ganti role dijaga; develop `7396aec` (CI #43796971466 ✔), belum dirilis
  - [x] Saklar `onboarding` true di jalur rilis (`790973c`) → rilis gel. 5 (PR #45/#46, Deploy #38230471120) → uji staging alur onboarding LULUS (HR ber-grant review, revisi & setujui, login NIP) → arsip QA Drive `2026-10-12-onboarding-e2e` (2026-10-12)

## Keputusan

Isi lengkap di [decisions.md](../../decisions.md).

- [D-045](../../decisions.md#d-045) Onboarding karyawan baru
- [D-046](../../decisions.md#d-046) Pengecualian OD-6 saat onboarding
- [D-047](../../decisions.md#d-047) Grant employee.onboarding.review
- [D-048](../../decisions.md#d-048) Login dengan nomor induk (NIP)

**Keputusan baru** (prefix `ONB-D1`, `ONB-D2`, …; tulis lengkap di sini, lalu daftarkan di indeks [PLAN §8](../../PLAN.md#8-keputusan-adr-ringkas) saat digabung ke develop):

| ID | Keputusan | Alasan / sumber |
|---|---|---|
| <a id="onb-d1"></a>ONB-D1 | **Ubah email & batalkan undangan akun (2026-11-16):** hanya untuk akun yang **belum pernah login** (`lastLoginAt` null, role EMPLOYEE) pada calon Diundang atau karyawan existing yang diundang melengkapi data; sudah login → 422, tetap hanya Nonaktifkan. **Batalkan** (`DELETE /onboarding/{employeeId}/invitation`, `cancelOnboardingInvitation`): baris `iam.accounts` dihapus (token lama langsung 401 di API), antrean terbuka → `FAILED`/`CANCELLED`, calon kembali Belum diundang / karyawan existing `completionRequired=false` (data tidak disentuh, bisa diundang ulang lewat "Undang Karyawan Terdaftar"). **Ubah email** (`PUT /onboarding/{employeeId}/invitation-email`, `changeOnboardingInvitationEmail`): sama seperti batalkan, lalu email baru masuk antrean (batas per jam berlaku; antrean lama `EMAIL_CHANGED`); email pribadi ikut diganti bila sama dengan email undangan lama atau kosong; email dipakai akun/karyawan lain → 409. **User Auth:** yang dibuat undangan ini (audit `iam.account.invite` `emailSent=true`) di-ban + email anonim (pola purge D-045 d) sehingga tautan undangan/atur password lama mati; user Auth yang sudah ada sebelumnya (dipakai bersama lingkungan lain, D-023) **tidak disentuh**. **Antrean:** tautan atur password (kirim ulang) hanya dikirim & ditandai SENT bila email antrean = email user Auth akun, selain itu `FAILED`/`EMAIL_MISMATCH`; kirim ulang menolak lebih awal (409); undangan yang dibatalkan di tengah proses tidak ditimpa SENT; cek akun milik karyawan didahulukan dari cek email (dulu kirim ulang selalu gagal `EMAIL_HAS_ACCOUNT`). Akses: SA semua PT, HR_ADMIN PT-nya (`canOnboardInCompany`), di luar cakupan 404. Audit `employee.onboarding.invite_cancelled` / `invite_email_changed` (before/after email). Tanpa migrasi. | Kutipan pengguna 2026-11-16 09:35 WIB "kerjakan A, B, C" (lewat supervisor); rencana disetujui supervisor atas nama pengguna + penyempurnaan (user Auth bersama tidak di-ban, uji tautan nyata). Uji Auth lokal GoTrue v2.197.0: tautan undangan & atur password lama ditolak setelah ban+anonim; kontrol tetap sah. |
| <a id="onb-d2"></a>ONB-D2 | **Akun Karyawan/Manager wajib tertaut ke data karyawan (2026-11-16):** akar kasus staging "Akun belum terhubung ke data karyawan" (Akun › Undang akun membuat akun tanpa `employee_id`). (1) `POST /accounts/invite` role Karyawan/Manager wajib `employeeId` (tanpa itu 422). Role **Karyawan** = jalur "Undang Karyawan Terdaftar" (D-045 poin 9): antrean, lengkapi data, review HR, login NIP (D-048) → respons **202** `{ employeeId, queued }`. Role **Manager** dibuat & ditautkan satu transaksi (201). HR/HR Kepegawaian/SA: `employeeId` opsional. Karyawan harus aktif & disetujui (422), belum berakun (409), dalam cakupan PT HR (404). (2) `PATCH /accounts/{id}/role` ke Karyawan/Manager untuk akun tak tertaut → 422. (3) **Tautkan ke karyawan** `PUT /accounts/{id}/employee` (`linkAccountEmployee`): SA akun mana pun (SA lain: Utama), HR hanya akun Karyawan/Manager + karyawan di PT-nya; audit `iam.account.link_employee`; **login tidak diubah** (pemindahan ke NIP lewat `auth:migrate-login-nik` per lingkungan, kata pengguna). Saran `GET /accounts/{id}/link-suggestions` (`listAccountLinkSuggestions`): karyawan dalam cakupan yang email pribadi/kerjanya sama dengan email akun. Lepas tautan tidak ada (Backlog). (4) Daftar Akun: `needsEmployeeLink` + badge "Belum tertaut", filter `?unlinked=true` ("Belum tertaut karyawan"), tombol Tautkan. (5) ONB-D1 mengenali audit `invitationEmailSent` (Akun › Undang akun) selain `emailSent`. Tanpa migrasi. | Kutipan pengguna ±10:00 WIB 2026-11-16 "pastikan masalah ini terselesaikan … tidak ada kendala issue yang sama nanti di akun/karyawan lainnya juga" (lewat supervisor). Q1a/Q2a/Q3a dipilih supervisor atas nama pengguna sesuai rekomendasi. |

## Keputusan terbuka

Tidak ada.

OD baru: `ONB-OD1`, … (tulis di sini + ringkasan di [PROGRESS](../../PROGRESS.md#keputusan-terbuka)).

## Kode

Detail modul: [employee](../../codemap/employee.md) · [iam](../../codemap/iam.md).

## QA

- [plans/2026-10-02-onboarding-a.md](../../qa/plans/2026-10-02-onboarding-a.md)
- [runs/2026-10-02-onboarding-a.md](../../qa/runs/2026-10-02-onboarding-a.md)
- [runs/2026-10-02-onboarding-ui.md](../../qa/runs/2026-10-02-onboarding-ui.md)
- [plans/2026-10-12-onboarding-e2e.md](../../qa/plans/2026-10-12-onboarding-e2e.md)
- [runs/2026-10-12-onboarding-e2e.md](../../qa/runs/2026-10-12-onboarding-e2e.md)
- [plans/2026-10-12-email-template.md](../../qa/plans/2026-10-12-email-template.md)
- [runs/2026-10-12-email-template.md](../../qa/runs/2026-10-12-email-template.md)

Aturan & templat QA: skill `hris-qa-docs` ([docs/qa/README.md](../../qa/README.md)).
