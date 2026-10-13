# Onboarding karyawan baru

> **Kode prefix:** `ONB` · **Fase:** 4 · **PIC:** Oatse · **Branch:** `HRIS/Oatse/Linux-Windows` (develop) · **Saklar `FEATURES`:** `onboarding`
> **Status:** ✔ aktif di staging (rilis gel. 5, 2026-10-12); QA LEGIT

Impor calon → undangan → wizard isi data & dokumen → review HR (D-047) → disetujui; login dengan NIP (D-048), template email bermerek.

Dokumen fitur ini: **README** (status, checklist, keputusan) · [design.md](design.md) · [log.md](log.md). Induk: [PROGRESS](../../PROGRESS.md).

## Checklist

Legenda: `[ ]` belum · `[~]` sedang · `[x]` selesai · `[-]` dibatalkan/ditunda. Langkah baru: sub-item `(tambahan YYYY-MM-DD) alasan`.

### Fase 4 — Employee (bagian Onboarding)
- [-] Undangan akun dari data karyawan (satuan & massal dari hasil import; Tahap 5) — digantikan "Onboarding karyawan baru" di bawah (D-045, 2026-10-01)
- [x] **Onboarding karyawan baru** (a–d ✔ lokal; aktif di staging 2026-10-12, QA LEGIT + arsip Drive; template email terpasang) (D-045–D-048, desain `docs/features/onboarding/design.md`; setelah Tahap 3) (tambahan 2026-10-01: permintaan pemilik projek, hasil grill)
    - [x] c1. (✔ lokal 2026-10-02, antrean #12) Review (grant `employee.onboarding.review`), setujui (+PTKP, koreksi data kerja, riwayat HIRED) / minta revisi per bagian / batalkan (+nonaktif & ban) + email & notifikasi, halaman `/ess` kosong
    - [x] c2. (✔ lokal 2026-10-02, antrean #13) **Login NIK** (`iam.accounts.login_email`, alamat turunan per lingkungan, lupa password via API, script migrasi akun existing — **belum dijalankan**). `.invalid` terverifikasi 2026-10-02; env lokal diisi (`dev-oatse.login.akselerasi.invalid`); sisa: env staging saat rilis.
  - [x] Template email Supabase Auth bernama Akselerasi Arthasia — `docs/email-templates/` gaya surat resmi + logo dari Supabase Storage bucket publik `public-assets`; **Invite user & Reset Password terpasang** oleh pemilik projek di Dashboard Supabase (2026-10-12; berlaku lokal & staging karena Auth sama). Produksi: pasang ulang + URL logo produksi saat Rilis 1
  - [x] Env login NIP staging (tambahan 2026-10-12): `LOGIN_EMAIL_DOMAIN` (`hris-staging-api`) & `VITE_LOGIN_EMAIL_DOMAIN` (`hris-staging-web`) = `stg.login.akselerasi.invalid`, target production — berlaku pada deploy berikutnya
  - [x] Grant `employee.onboarding.review` untuk HR uji staging (tambahan 2026-10-12; lewat API sebagai SA, tanpa masa berlaku, tercatat audit)
  - [x] BUG-004 sapaan Dashboard pakai nama karyawan (tambahan 2026-10-12; `/me.employeeName`, commit `7e6517b`; api 600 · web 208 ✔)
  - [x] **UI/UX onboarding lebih profesional** (tambahan 2026-10-12: masukan pemilik projek dari uji manual) — wizard: panel langkah vertikal + status (lengkap / perlu dilengkapi / perlu diperbaiki) + progres, kartu konten per langkah (judul, penjelasan, tanda `*` wajib), kartu dokumen (Wajib/Opsional, terunggah/belum, penghitung), ringkasan kekurangan dikelompokkan per bagian + tombol Buka; review admin: kartu profil (foto, NIP, status, fakta kunci), data pribadi dikelompokkan, dokumen sebagai daftar + dokumen wajib yang belum ada, riwayat review sebagai linimasa; impor calon: **seret-lepas berfungsi** (sebelumnya tidak ada handler) + tata letak 2 kolom dengan panel Format file; form atur password (undangan/reset/profil): tombol tampilkan password, indikator kekuatan, syarat langsung tercentang, penanda kecocokan ulangi password — web 233 ✔ (saklar onboarding lokal menyala), tanpa scroll mendatar di HP (390 px)
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
| – | – | – |

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
