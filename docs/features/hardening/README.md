# Hardening

> **Kode prefix:** `HRD` · **Fase:** 9 · **PIC:** – · **Branch:** – · **Saklar `FEATURES`:** –
> **Status:** Berjalan — perbaikan audit keamanan 2026-11-02 (A–D) ✔ develop 2026-11-03 `eb82348`, belum rilis

E2E Playwright alur utama, review keamanan, uji performa, runbook.

Dokumen fitur ini: **README** (status, checklist, keputusan) · [log.md](log.md). Induk: [PROGRESS](../../PROGRESS.md).

## Checklist

Legenda: `[ ]` belum · `[~]` sedang · `[x]` selesai · `[-]` dibatalkan/ditunda. Langkah baru: sub-item `(tambahan YYYY-MM-DD) alasan`.

### Fase 9 — Hardening
- [ ] E2E Playwright: login, cuti paralel, absen + selfie, payroll
- [~] Review keamanan (akses, PII di log, bucket, CORS, rahasia) — audit 2026-11-02 (`.handoff/2026-11-02-audit-keamanan-HRIS.md`), rencana A–D disetujui
  - [x] (tambahan 2026-11-03) **A** `fix/keamanan-email-pribadi` — temuan 1 (HIGH): HR_ADMIN tidak bisa mengganti email pribadi akun SA/HR lewat import/edit profil (`canChangeLoginContact`); lupa password akun SA/HR/HR_PERSONNEL hanya ke email akun (HRD-D1). Temuan 5: email pribadi di Arsip › Kontak + ekspor hanya untuk `canReadPersonal`. Commit `f9fffbb`, `ce904a3`
  - [x] (tambahan 2026-11-03) **B** `fix/keamanan-absen-dan-diri-sendiri` — temuan 3: GET `/attendance/days` tanpa marking Alpha global (hanya `employeeId` dalam scope; EMPLOYEE → 403). Temuan 4: HR_ADMIN ditolak mengubah SP, saldo cuti (adjust/import), lokasi absen, roster langsung tanpa crew, dan data kepegawaian miliknya sendiri; SA dikecualikan (HRD-D2). Commit `365f31c`, `db330e1`
  - [x] (tambahan 2026-11-03) **C** `fix/keamanan-dokumen-karyawan` — temuan 6: path yang sudah dirujuk dokumen (termasuk terhapus) ditolak sebelum cleanup, P2002 `storagePath` tidak menghapus objek, calon hanya hapus/ganti unggahan sendiri. R2: `assertOwnedPath` (prefix + nama UUID) di 6 titik, kode & pesan error lama dipertahankan. Commit `8d16fa4`, `225aaa8`
  - [x] (tambahan 2026-11-03) **D** `chore/keamanan-dependency-env-header` — temuan 2: `NODE_ENV` default `production`, route dev hanya development + peer loopback, server dev bind 127.0.0.1, guard akun uji layanan lokal. Temuan 7: header keamanan web + CSP Report-Only (HRD-D3). R1: escape formula CSV rekap absen. Temuan 8: zod 4.6.7, nodemailer 10.3.1
  - [ ] Validasi header/CSP aktual di staging setelah rilis; evaluasi pelanggaran CSP sebelum enforce
  - [-] Ditunda (gelombang E, butuh keputusan terpisah): R3 lokasi istirahat per PT, R4 rate limit per IP/akun, R5 Swagger di balik auth, R7 pin SHA action + `--ignore-scripts`, R8 sisanya, sesi web di localStorage; Q4 grant `employee.personal.write` untuk import email pribadi → Backlog
- [ ] Uji performa dasar
- [ ] Runbook: deploy, rollback, pemulihan Super Admin Utama

## Keputusan

Belum ada keputusan khusus fitur.

**Keputusan baru** (prefix `HRD-D1`, `HRD-D2`, …; tulis lengkap di sini, lalu daftarkan di indeks [PLAN §8](../../PLAN.md#8-keputusan-adr-ringkas) saat digabung ke develop):

| ID | Keputusan | Alasan / sumber |
|---|---|---|
| HRD-D1 | Lupa password akun SUPER_ADMIN/HR_ADMIN/HR_PERSONNEL hanya dikirim ke email akun (bukan email pribadi karyawan); akun tanpa email akun nyata (email = alamat login NIK) → tidak dikirim | Q2, keputusan pengguna 2026-11-02 14:58 WIB: pertahanan berlapis terhadap ambil alih lewat email pribadi |
| HRD-D2 | Larangan mengubah data diri sendiri lewat jalur HR berlaku untuk HR_ADMIN; SUPER_ADMIN dikecualikan | Q1, keputusan pengguna 2026-11-02 14:58 WIB |
| HRD-D3 | CSP web dimulai `Content-Security-Policy-Report-Only`, enforce setelah dicek di staging | Q3, keputusan pengguna 2026-11-02 |

## Keputusan terbuka

Tidak ada.

OD baru: `HRD-OD1`, … (tulis di sini + ringkasan di [PROGRESS](../../PROGRESS.md#keputusan-terbuka)).

## QA

Belum ada dokumen QA.

Aturan & templat QA: skill `hris-qa-docs` ([docs/qa/README.md](../../qa/README.md)).
