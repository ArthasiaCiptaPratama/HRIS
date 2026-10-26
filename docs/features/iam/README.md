# IAM — akun, role, grant, audit, notifikasi

> **Kode prefix:** `IAM` · **Fase:** 2 · **PIC:** Oatse · **Branch:** `HRIS/Oatse/Linux-Windows` (develop) · **Saklar `FEATURES`:** –
> **Status:** Review — fitur selesai & teruji di staging; sisa: captcha Turnstile ditunda, OD-5

Login Supabase Auth, role tetap satu akun satu role (D-028), grant berbatas waktu, Super Admin Utama, cakupan PT per akun (D-040), audit log, notifikasi in-app + email SMTP.

Dokumen fitur ini: **README** (status, checklist, keputusan) · [log.md](log.md). Induk: [PROGRESS](../../PROGRESS.md).

## Checklist

Legenda: `[ ]` belum · `[~]` sedang · `[x]` selesai · `[-]` dibatalkan/ditunda. Langkah baru: sub-item `(tambahan YYYY-MM-DD) alasan`.

### Fase 2 — IAM
- [x] Skema `iam`, `audit`, `notification` + migrasi — `20260928065300_add_iam_and_audit` + `20260928085157_add_notification` (notifications dengan `dedupe_key`, email_outbox)
- [x] `core/auth`: verifikasi JWT Supabase (JWKS) + verifier pengganti untuk test — `src/core/auth/` (ES256, cek iss/aud/role/sub) + `tests/helpers/auth.ts` (`testVerifier`, `createAuthFixture().loginAs`); 12 unit test. Token asli staging ✔ (uji E2E 2026-09-28: login `admin.arthasia@gmail.com` → `/me` 200, token dirusak 401)
- [x] `core/access`: muat role, grant (cek kedaluwarsa), tim; `requireRole`/`requireGrant` — role & grant aktif dimuat per request, `requireRole`/`requirePermission`, `isSelf`/`isInTeam` (tim = `manager_id` target, tanpa query); 20 test TDD
- [x] Test matriks akses (TDD) untuk aksi IAM — `iam.policy.test.ts` 60 baris (akun, undang, role, nonaktif, Utama, grant, audit); mutasi aturan HR terbukti tertangkap
- [x] `GET /me` — modul `iam` (routes/policy/service/repository/schema/index), 8 integration test (401 ×4, 200, last_login_at, pencabutan grant langsung berlaku, OpenAPI)
- [x] Kelola role HR_ADMIN/MANAGER; aturan Super Admin Utama (4 hak eksklusif, tidak boleh 0 SUPER_ADMIN) — `PATCH /accounts/:id/role`, serah-terima Utama (D-033), cek SUPER_ADMIN aktif ≥ 1, grant tak berlaku dicabut otomatis (D-034)
  - [x] Kelola akun: `GET /accounts`, `GET /accounts/:id`, `POST /accounts/invite`, `POST /accounts/:id/deactivate|reactivate` (ban Supabase satu transaksi) (tambahan 2026-09-28: baris matriks "Undang akun karyawan, nonaktifkan akun")
- [x] Grant: beri, cabut, kedaluwarsa, audit — `GET|POST /grants`, `POST /grants/:id/revoke`, kedaluwarsa dicek per request, audit, notifikasi diberikan/dicabut/akan kedaluwarsa (cron `grant-expiry`)
- [x] Audit log (core) + halaman audit untuk SUPER_ADMIN — tabel + `writeAudit()` + `GET /audit-logs` (SA, filter) ✔; halaman web `features/iam/pages/audit-logs-page.tsx` ✔ (dikonfirmasi audit 2026-09-30)
- [x] Notifikasi in-app + pengiriman email via SMTP (migrasi `notification` di staging ✔ 2026-09-29; audit 2026-09-30: kode, staging & uji SMTP selesai — akun pengirim produksi dilacak di item OD-5 di bawah) (lokal: dicatat ke log; staging/produksi: Google Workspace) + `email_outbox` — modul `notification` (notify, outbox + retry, endpoint), pemicu IAM, cron `grant-expiry` & `email-retry` (`CRON_SECRET`), 8 integration test dengan pengirim palsu ✔; pengirim SMTP (nodemailer) **teruji ke Gmail sungguhan** 2026-09-29 09:02 WIB (login STARTTLS ✔, 1 email `createSmtpSender` → `oatse2458@gmail.com` diterima `smtp.gmail.com`; App Password diisi pemilik projek di `.env` lokal)
  - [x] Test tidak pernah mengirim email sungguhan: `selectEmailSender()` di `app.ts` → `NODE_ENV=test` selalu pengirim log walau `SMTP_*` terisi (tambahan 2026-09-30: dari Backlog, `grants-audit.test.ts` timeout bila SMTP terisi) — 2 test APP, suite api 271 hijau dengan SMTP terisi
- [~] Keputusan OD-5 (akun pengirim Workspace + App Password) sebelum uji undangan — staging bisa uji undangan dengan akun D-032; akun final menunggu OD-5
- [x] Script `bootstrap-super-admin` dan `recover-primary-admin` — `bootstrap-super-admin` ✔ (jalan nyata 2026-09-28: Utama `admin.arthasia@gmail.com` di DB lokal **dan DB staging**, satu user Auth staging, idempoten teruji); `recover-primary-admin` ✔ (script + service teruji di DB kosong, dry-run ✔)
- [x] Helper test `tests/helpers/auth.ts` (`testVerifier`, `createAuthFixture().loginAs`) (tambahan 2026-09-28)
- [x] Uji login end-to-end: token asli Auth staging → `GET /me` lokal 200, token dirusak 401, logout mencabut sesi (tambahan 2026-09-28)
- [x] Web: halaman login, sesi, route guard per role, menu per role, manajemen akun & grant — login/lupa/callback/atur password, guard & menu per role, halaman Akun (undang, ubah role, nonaktif, serah-terima Utama), Grant, Audit log, Notifikasi, Profil; 17 test Vitest; build ✔; dicoba di browser oleh pemilik projek (2026-09-28) dan diuji Playwright login sungguhan 4 role di staging (UI 31/31, `docs/qa/runs/2026-09-29-staging.md`) (koreksi audit 2026-09-30)
  - [x] Seragamkan halaman Akun, Grant izin, Audit log, Profil, Notifikasi dengan gaya Personal Management: `PageHeader` (h1 + breadcrumb; Profil kini punya h1), `DataTable` + `TablePagination` (pilihan baris), `EmptyState`, `ListPanel`/`SearchField` bersama; logika/API/akses tidak berubah (tambahan 2026-09-30: permintaan pemilik projek) — web 72 test (+8 `admin-pages.test.tsx`), Playwright login sungguhan 31/31 (`docs/qa/runs/2026-09-30-seragam-admin.md`)
  - [x] Akun uji per role untuk verifikasi tampilan (DB lokal + Auth staging): `hr.arthasia@gmail.com` (HR_ADMIN ↔ Siti Rahmawati), `mgr.arthasia@gmail.com` (MANAGER ↔ Andi Wijaya), `emp.arthasia@gmail.com` (EMPLOYEE ↔ Rizky Ramadhan); password dipegang pemilik projek (tidak dicatat di repo) (tambahan 2026-09-28)
- [x] **Role HR Kepegawaian (IAM-D1)** (tambahan 2026-10-23: permintaan pemilik projek): enum `Role.HR_PERSONNEL` (migrasi `role_hr_personnel`, lokal saja), cakupan PT dari `account_companies`, employee policy lihat data kerja saja (detail tanpa kontak darurat/pendidikan/pelatihan/riwayat kerja/dokumen), Arsip & modul lain tertutup; web: menu Personal Management (aktif/tidak aktif/struktur), tab Kepegawaian + Riwayat, Atur PT, label role; test sweep seluruh endpoint OpenAPI (`tests/integration/iam/hr-personnel.test.ts`) — branch `HRIS/Mat/Mac`, belum develop
  - [ ] Captcha **Turnstile (Cloudflare)** di halaman login: widget + `captchaToken` pada login/reset, lalu aktifkan *Attack Protection → Captcha* di Supabase dengan *secret key* dari Cloudflare (tambahan 2026-09-28: sempat hendak diaktifkan di dashboard staging dengan secret buatan sendiri; ditunda karena akan memblokir semua login)
  - [ ] Ganti password Super Admin lewat halaman **Profil → Ganti password** (sudah tersedia) (tambahan 2026-09-28: password tertulis di percakapan) — dilakukan pemilik projek

## Keputusan

Isi lengkap di [decisions.md](../../decisions.md).

- [D-006](../../decisions.md#d-006) Akun dari undangan, tanpa self sign-up
- [D-007](../../decisions.md#d-007) Role tetap SA/HR/MGR/EMP (sebagian diganti D-028)
- [D-008](../../decisions.md#d-008) Role & grant dicek dari DB tiap request
- [D-009](../../decisions.md#d-009) Tim MANAGER = bawahan langsung
- [D-021](../../decisions.md#d-021) Notifikasi in-app + email tanpa data sensitif
- [D-024](../../decisions.md#d-024) Email lewat Resend (diganti D-025)
- [D-025](../../decisions.md#d-025) Email lewat SMTP Google Workspace
- [D-028](../../decisions.md#d-028) Satu akun satu role
- [D-031](../../decisions.md#d-031) Pengirim email sementara (diganti D-032)
- [D-032](../../decisions.md#d-032) Pengirim email staging admin.arthasia
- [D-033](../../decisions.md#d-033) Konfirmasi password serah-terima Utama
- [D-034](../../decisions.md#d-034) Aturan kelola akun
- [D-040](../../decisions.md#d-040) Akses per perusahaan (account_companies)

**Keputusan baru** (prefix `IAM-D1`, `IAM-D2`, …; tulis lengkap di sini, lalu daftarkan di indeks [PLAN §8](../../PLAN.md#8-keputusan-adr-ringkas) saat digabung ke develop):

| ID | Keputusan | Alasan / sumber |
|---|---|---|
| IAM-D1 | **Role kelima `HR_PERSONNEL` ("HR Kepegawaian")**, mengubah PLAN §4.1 (role tetap 4). Role ini hanya **melihat data kerja (kepegawaian)** karyawan di PT yang ditugaskan (`account_companies`, sama dengan HR_ADMIN; ikut dipertahankan saat ganti role HR_ADMIN ⇄ HR_PERSONNEL). Yang terlihat: Data Karyawan Aktif & Tidak Aktif, detail tab **Kepegawaian** + **Riwayat**, struktur organisasi. **Tanpa** data pribadi, rekening, dokumen, kontak darurat, pendidikan, pelatihan, riwayat kerja; izin sensitif **tidak bisa di-grant** ke role ini. **Tanpa aksi**: tambah, ubah, import, ubah status, pengaktifan, print. Modul lain **tertutup secara bawaan**: aset (termasuk lihat), Time Management, cuti, approval, SP, laporan, dashboard agregat/analitik, Administrasi, payroll. Layanan diri akun yang tertaut karyawan tetap ada (absen & cuti pribadi, aset & SP milik sendiri). | Pemilik projek 2026-10-23 ("lihat data pribadi hanya kepegawaian … asset hingga laporan tidak bisa"; "tidak boleh, cuman boleh data kepegawaian dia doang"; lihat saja). |

## Keputusan terbuka

- [OD-5](../../decisions.md#od-5) Akun pengirim email produksi
- [OD-10](../../decisions.md#d-028) Bentuk role akun (terjawab D-028)

OD baru: `IAM-OD1`, … (tulis di sini + ringkasan di [PROGRESS](../../PROGRESS.md#keputusan-terbuka)).

## Kode

Detail modul: [iam](../../codemap/iam.md) · [audit](../../codemap/audit.md) · [notification](../../codemap/notification.md).

## QA

- [plans/2026-09-30-seragam-admin.md](../../qa/plans/2026-09-30-seragam-admin.md)
- [runs/2026-09-30-seragam-admin.md](../../qa/runs/2026-09-30-seragam-admin.md)
- [cases/administrasi.md](../../qa/cases/administrasi.md)

Aturan & templat QA: skill `hris-qa-docs` ([docs/qa/README.md](../../qa/README.md)).
