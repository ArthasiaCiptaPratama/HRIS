# PROGRESS — HRIS

> **Fungsi file ini:** mencatat **sudah sampai mana**: status fase, fokus saat ini, checklist, blocker, backlog, dan log setiap sesi kerja.
> Baca **§2 Fokus Saat Ini** di awal setiap sesi. Perbarui file ini di **akhir setiap sesi** (lihat PROMPT §2).

**Legenda:** `[ ]` belum · `[~]` sedang dikerjakan · `[x]` selesai · `[-]` dibatalkan/ditunda (beri alasan)

---

## 1. Ringkasan Status

| Fase | Nama             | Status       |
| ---- | ---------------- | ------------ |
| 0    | Instruksi Projek | Selesai      |
| 1    | Fondasi          | Berjalan     |
| 2    | IAM              | Review (fitur selesai & teruji di staging; sisa: captcha Turnstile ditunda, ganti password SA oleh pemilik projek, akun email produksi OD-5) |
| 3    | Organization     | Berjalan (skema ERD + baca master data & struktur, D-035) |
| 4    | Employee         | Berjalan (API + web Personal Management a–e, D-035) |
| 5    | Attendance       | Belum mulai  |
| 6    | Leave            | Belum mulai  |
| —    | **Rilis 1**      | –            |
| 7    | Contract         | Belum mulai  |
| —    | **Rilis 2**      | –            |
| 8    | Payroll          | Belum mulai  |
| 9    | Hardening        | Belum mulai  |
| —    | **Rilis 3**      | –            |

Status yang dipakai: `Belum mulai` · `Berjalan` · `Review` · `Selesai`

---

## 2. Fokus Saat Ini
- **Fase aktif:** 1 — Fondasi (sisa: uji Windows, proteksi `main`) · Fase 2 IAM **Review** · **Target minggu 2026-09-29 (D-035): web Personal Management** (Fase 3–4 lebih awal).
- **Kondisi nyata (audit langsung ke repo, CI & staging 2026-09-30):**
 - **Repo (2026-09-30, setelah rilis):** branch kerja `HRIS/Oatse/Linux-Windows` = `f5b3a3c` (+ commit dokumen rilis ini); `HRIS/debug/database` = `80f2e23` (PR #23); `HRIS/debug/fe-be` = `b7828a0` (PR #24); `main` tidak disentuh (`ebb20e5`). Satu-satunya file tak ter-track: `apps/web/public/logo/logo-arthasia-ori.png` (3,6 MB, sengaja tidak di-commit).
 - **Kualitas (lokal, Linux, 2026-09-30, setelah seragam halaman):** `bun run typecheck` ✔ · `bunx biome ci .` ✔ (208 file) · `bun run check:boundaries` ✔ (183 modul) · `db:check` ✔ · `bun run test` ✔ shared 10 · api 271 · web 72 — kini **tanpa** perlu mengosongkan `SMTP_*` (test selalu memakai pengirim log). CI terakhir: #36556849610 (`5b974a1`, api 265). Catatan: test api harus lewat `bun run test:api` (memuat `.env`), `bun test` langsung gagal validasi env.
 - **Kode api:** 4 modul (`iam` 12 endpoint, `employee` 13, `notification` 3, `organization` 1) + `/health`, `/openapi.json`, `/docs`, cron `grant-expiry` & `email-retry`; 8 migrasi; 4 script (`bootstrap-super-admin`, `recover-primary-admin`, `create-dev-account`, `storage:setup`). Modul attendance/leave/approval/contract/payroll & workspace `e2e/` belum ada (sesuai rencana).
 - **Kode web:** halaman auth (login, lupa/atur password, callback), IAM (Akun, Grant, Audit log, Profil), Notifikasi, Personal Management (Data Pegawai Aktif + detail layar penuh, foto profil, Print data .xlsx; Ubah Status, Pengaktifan, Pegawai Tidak Aktif, Struktur Organisasi — kode ada tetapi menu b–e ditutup `false` di `apps/web/src/app/feature-flags.ts`), Dashboard kosong, Maintenance untuk Arsip (f–o) & Laporan (p).
 - **Staging live (D-036):** web **https://hris-staging-web.vercel.app** · api **https://hris-staging-api.vercel.app/api/v1** (docs `/api/v1/docs`) berisi kode s.d. `b7828a0` (rilis 2026-09-30), `Deploy staging` #36661819195 ✔ (`migrate → vercel-api → vercel-web`), CI #36661819248 ✔. Dicek 2026-09-30: `/health` 200 (DB ok), web 200, `/me` tanpa token 401; MCP: 8 migrasi (terakhir `20260929100000_add_employee_photo`), 5 departemen, 21 pegawai (2 nonaktif, 0 berfoto), 23 riwayat, 4 akun; advisor security tanpa temuan baru. Bucket `employee-photos` hanya berisi `dev/oatse/…` (2 foto DB lokal pemilik projek, dipindah 2026-09-30).
 - **Fitur yang sudah naik ke staging:** Fase 2 IAM lengkap (SMTP teruji, env SMTP terisi di Vercel); D-035 Personal Management (PR #7/#8); logo vertikal & BUG-001 (PR #15–#18); detail pegawai layar penuh, riwayat "diubah oleh", Print data (`d3ec7b2`, PR #19/#20); foto profil D-037 (`346a740`, PR #21/#22). File .xlsx (dengan & tanpa foto) dicek pemilik projek di Excel; **2026-09-30** (PR #23/#24): halaman Administrasi & Akun Saya seragam, prefix Storage lokal, SMTP di test (Playwright staging 31/31).
 - **QA:** `docs/qa/` — 4 rencana, 102 kasus (TC-EMP 53 + TC-STG 49), 4 laporan hasil (semua LULUS), BUG-001 (P3, diperbaiki); bukti visual di `/mnt/winD/WORK/Magang/QA/<tanggal>-<target>/`.
- **Langkah berikutnya (menunggu persetujuan pemilik projek):**
 1. (Ditahan atas permintaan pemilik projek 2026-09-29) Fase 3: CRUD master data (departemen, jabatan, status + kategori, grade, lokasi) untuk SUPER_ADMIN.
 2. Lanjutan Fase 4: isi menu Arsip (f–o) & Laporan (p); aktifkan kembali menu b–e saat siap diuji; tulis data pribadi/rekening (butuh **OD-6**), dokumen (signed URL), undangan akun dari data karyawan, import CSV/Excel.
 3. Sisa Fase 1: uji Windows.
- **Blocker / ditunda:** OD-9 (proteksi `main`); OD-4 (akun/team Vercel & Supabase kantor untuk produksi — staging sementara di akun pribadi Hobby, D-036); OD-5 akun email produksi; OD-6 (ubah data sensitif milik sendiri).
- **Keamanan yang harus dibereskan sebelum produksi:** **password DB staging, token Vercel `oatse`, dan password keempat akun uji (SA/HR/MGR/EMP) tertulis di percakapan 2026-09-29** → reset password DB (perbarui secret `STAGING_DIRECT_URL` + env Vercel `DATABASE_URL`), cabut & buat ulang token Vercel (perbarui secret `VERCEL_TOKEN`), ganti password keempat akun uji, lalu hapus `.env.staging` lokal. **Keputusan pemilik projek 2026-09-29: rotasi ditunda** (staging hanya berisi data dummy; dianggap aman untuk sekarang) — **wajib** dilakukan sebelum ada data karyawan sungguhan / project produksi (OD-4). Juga: pastikan App Password Gmail yang pernah tertulis di percakapan sudah dicabut; ganti password Super Admin; ganti password `sudo` laptop.
---
## 3. Checklist Per Fase

### Fase 0 — Instruksi Projek
- [x] Sesi grill keputusan (D-001 s.d. D-022)
- [x] `docs/PLAN.md`
- [x] `docs/CODEMAP.md`
- [x] `docs/PROGRESS.md`
- [x] `docs/PROMPT.md`
- [x] `CLAUDE.md` + tautan di `README.md`
- [x] Review & persetujuan pemilik projek (pemilik projek meminta mulai Fase 1, 2026-09-28)
- [x] Branch `HRIS/Oatse/Linux-Windows` dibuat, di-commit & di-push

### Fase 1 — Fondasi
- [x] Root: Bun workspaces, `tsconfig.base.json`, Biome, `.editorconfig`, `.gitattributes` (LF), `.gitignore`, `.env.example`
- [~] Branch `HRIS/debug/database` dan `HRIS/debug/fe-be` dibuat dari `main` ✔; proteksi `main` ditolak GitHub (paket Free, repo private) → **OD-9**
- [x] PostgreSQL lokal: `docker-compose.yml` (image Postgres, versi = Supabase) + script `db:up`/`db:down`
- [x] Supabase project **staging** (D-029: `HRIS Project`, ref `iwgzuwcxsxnbjibhbqgh`, org `Work` Free): self sign-up nonaktif ✔, *Redirect URLs* `http://localhost:5173/**` ✔, Data API tidak mengekspos skema modul ✔ (dikonfirmasi pemilik projek); region **ap-northeast-2 (Seoul)**, diterima untuk staging (D-029; produksi wajib Singapura); pooler `aws-0-ap-northeast-2.pooler.supabase.com` (session 5432 & transaction 6543 teruji); bucket private menyusul saat Fase 4/5 butuh; `SUPABASE_URL`/`VITE_SUPABASE_URL` = `https://iwgzuwcxsxnbjibhbqgh.supabase.co`
- [x] Cocokkan versi major PostgreSQL di `docker-compose.yml` dengan project staging — Supabase 17.6, lokal & CI 17 (dicek via MCP 2026-09-28)
- [x] Custom SMTP Supabase staging (D-025) — `admin.arthasia@gmail.com` (D-032; akun final produksi tetap OD-5): login & kirim langsung ✔; SMTP di dashboard Supabase diisi pemilik projek & dimuat ulang 07:57 UTC, lalu undangan lewat Supabase Auth `POST /invite` **200** 2026-09-28 07:58 UTC ✔ (koreksi audit 2026-09-30: catatan lama "uji lewat Supabase Auth belum" sudah basi)
- [x] `packages/shared` (roles, permissions, enums)
- [x] `apps/api`: Hono + `@hono/zod-openapi`, `env.ts`, `core/` (errors, response, logger, request-id, db), `/api/v1/health`, `/openapi.json`, `/docs`
- [x] Prisma 7: `prisma.config.ts`, skema multi-file, multi-schema, driver adapter, migrasi awal (buat semua skema)
- [x] `apps/web`: Vite + React + TS, Tailwind, shadcn/ui, React Router, TanStack Query, layout kosong
- [x] dependency-cruiser + aturan batas modul
- [x] Test: `bun test` (api) & Vitest (web) dengan contoh test
- [x] GitHub Actions: typecheck, lint, boundaries, migrasi dari DB kosong + test (service container Postgres), build — run #36375129344 hijau (commit `1815b3c`)
- [x] Keputusan OD-7 ✔ (D-030), lalu `db:deploy` migrasi awal ke staging — workflow `Deploy staging` run #36385730691 sukses (2 migrasi, `db:check` tanpa selisih), diverifikasi via MCP
- [x] Vercel: project `api` (Bun runtime, region `sin1`) dan `web`; ~~preview~~ staging untuk `HRIS/debug/fe-be` (D-036) — `hris-staging-api` & `hris-staging-web` (akun `oatse`, Hobby), deploy otomatis `Deploy staging` #36531510460 ✔, health/CORS/cron teruji live 2026-09-29
  - [x] Job `vercel` di `deploy-staging.yml`: Vercel CLI `pull/build/deploy --prebuilt --prod` setelah migrasi + secret `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID_API/WEB` (tambahan 2026-09-29: repo private milik organisasi tidak bisa dihubungkan ke Vercel Hobby, D-036)
  - [x] Api dibundel sendiri untuk Vercel: `bun build src/index.ts --external hono` → `dist/index.js` + `outputDirectory: dist` (tambahan 2026-09-29: kompilasi per file oleh `@vercel/node` tidak cocok dengan monorepo paket sumber TS — (1) memilih `src/app.ts` tanpa default export sebagai entry, (2) tidak membaca `extends` tsconfig sehingga strict mati, (3) import `./x.ts` & `exports` `@hris/shared` tetap `.ts` setelah dikompilasi → `ResolveMessage` di deploy #36529746512, (4) tambalan `exports` `.js` membuat `packages/shared` tidak ikut (`BuildMessage`, deploy #36530682448). Tambalan PR #11/#12 dikembalikan; bundel diuji dari **clone bersih** + simulasi function terisolasi: health 200 ke DB staging, 401, 404, OpenAPI 200)
  - [x] Proteksi Vercel Authentication hanya untuk preview (tambahan 2026-09-29: default project baru melindungi URL `*.vercel.app` production sehingga web tidak bisa memanggil api)
  - [x] Isi data staging: seed dummy (5 departemen, 12 jabatan, 5 status, 5 grade, 2 lokasi, 21 karyawan) + akun uji HR/MGR/EMP ke DB staging, diverifikasi via MCP (tambahan 2026-09-29: D-036 poin 4)
- [x] `Dockerfile` api (build lokal berhasil)
- [x] Verifikasi `bun install && bun run dev` di **Linux**
- [ ] Verifikasi `bun install && bun run dev` di **Windows**
- [x] README "Mulai cepat" (install, env, db, dev) (tambahan 2026-09-28)
- [x] MCP Supabase di `.mcp.json` (project `iwgzuwcxsxnbjibhbqgh`) terautentikasi + skill resmi `supabase` & `supabase-postgres-best-practices` (tambahan 2026-09-28)
- [x] Skill projek: `hris-workflow`, `hris-db-schema`, `hris-flow-testing`, `hris-e2e-playwright`, `hris-qa-docs` (tambahan 2026-09-28)
- [x] Workflow `.github/workflows/deploy-staging.yml` (D-030) + secret repo `STAGING_DIRECT_URL` (session pooler `aws-0-ap-northeast-2`, port 5432) (tambahan 2026-09-28: host direct Supabase hanya IPv6)
- [x] Perbaikan advisor staging: RLS `public._prisma_migrations` (ERROR → INFO disengaja) & index `departments.parent_id` (tambahan 2026-09-28)
- [x] Uji SMTP langsung (Gmail) & undangan Supabase Auth; user uji dibersihkan dari Auth staging (tambahan 2026-09-28)

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
  - [ ] Captcha **Turnstile (Cloudflare)** di halaman login: widget + `captchaToken` pada login/reset, lalu aktifkan *Attack Protection → Captcha* di Supabase dengan *secret key* dari Cloudflare (tambahan 2026-09-28: sempat hendak diaktifkan di dashboard staging dengan secret buatan sendiri; ditunda karena akan memblokir semua login)
  - [ ] Ganti password Super Admin lewat halaman **Profil → Ganti password** (sudah tersedia) (tambahan 2026-09-28: password tertulis di percakapan) — dilakukan pemilik projek

### Fase 3 — Organization
- [~] Skema + migrasi + seed dummy — tabel ERD (departments, positions, employment_statuses, grades, work_locations) + seed dummy ✔; company_profile, system_settings, holidays belum
- [ ] Profil perusahaan, pengaturan sistem
- [~] Departemen (hierarki), jabatan, level, lokasi kerja (geofence), hari libur — baca: `GET /master-data` + struktur organisasi (D-035) ✔; CRUD & hari libur belum
 - [x] Kategori status kepegawaian (enum `EmploymentCategory` di `employment_statuses.category`) + seed 5 kategori (tambahan 2026-09-29: D-035 navigasi Data Pegawai Aktif)
- [~] Policy + test — `canReadMasterData` (5 test) ✔; policy tulis master data belum
- [ ] Web: halaman master data
 - [x] Web: Struktur Organisasi (per departemen + bagan atasan, pencarian) (tambahan 2026-09-29: D-035 menu e)

### Fase 4 — Employee
- [ ] Keputusan OD-6 (ubah data sensitif milik sendiri)
- [~] Skema + migrasi + seed dummy (NIK/NPWP fiktif berformat valid) — tabel ERD + seed dummy ✔; `employment_histories` + `exit_reason` (migrasi `20260929020000_employee_categories_and_histories`, D-035) ✔, seed 21 karyawan (2 nonaktif) + riwayat ✔; documents, import_jobs belum
- [x] CRUD karyawan + filter, pencarian, paginasi — `GET/POST/PATCH /employees`, filter kategori/departemen/lokasi/aktif, `q`, sort whitelist, paginasi ≤ 100; "hapus" = nonaktifkan (arsip, PLAN §4.5); 20 integration test (D-035)
 - [x] Ubah status kepegawaian, nonaktifkan (alasan + tanggal efektif; akun login ikut nonaktif), aktifkan kembali; riwayat + audit (tambahan 2026-09-29: D-035 menu b–d)
 - [x] `GET /employees/summary` (badge jumlah per kategori) & `GET /org-structure` (tambahan 2026-09-29: D-035)
- [x] `manager_id` + validasi (harus MANAGER/SUPER_ADMIN) — akun aktif MANAGER/SA, bukan diri sendiri, tanpa siklus; `GET /employees/manager-options`
- [~] Data sensitif & rekening dengan grant (HR: semua, MANAGER: tim) — **baca** ✔ (key dihilangkan bila tidak berhak, audit `employee.sensitive.read`, `view=work` need-to-know); tulis belum (OD-6)
- [ ] Dokumen (signed upload URL), kontak darurat, riwayat
- [ ] Karyawan ubah data diri terbatas
- [ ] Undangan akun dari data karyawan
- [ ] Import CSV/Excel (template, validasi per baris, laporan error)
- [~] Policy + test — matriks employee 45 test (TDD) ✔ untuk aksi D-035; aksi tulis sensitif/dokumen belum
- [~] Web: daftar, detail, form, import — daftar per kategori, panel detail bertab, form tambah/ubah, Ubah Status, Pengaktifan, Pegawai Tidak Aktif ✔ (D-035); import belum
 - [x] Web: shell navigasi baru (top nav kelompok besar → sidebar kelompok kecil/isi, drawer mobile, breadcrumb, Ctrl+K, lazy route + prefetch), Dashboard kosong, halaman Maintenance untuk Arsip (f–o) & Laporan (p) (tambahan 2026-09-29: D-035)
 - [x] Web: panel detail pegawai **layar penuh**, avatar besar di tengah atas, baris tab sticky, tombol "← Kembali" di kiri atas (menggantikan X) (tambahan 2026-09-29: permintaan pemilik projek)
 - [x] Riwayat kepegawaian menampilkan pengubah: nama, role, lokasi kerja (`changedBy` di `GET /employees/:id`, `iam.getAccountSummaries`) (tambahan 2026-09-29: permintaan pemilik projek)
 - [x] **Print data**: tombol di detail pegawai (SA/HR) → `GET /employees/:id?view=print` (audit `employee.printed`, data pribadi hanya bila berhak, rekening tidak dibaca) → template `public/template/Template-excel.xlsx` diisi & diunduh (.xlsx) (tambahan 2026-09-29: permintaan pemilik projek; keputusan: satu pegawai per file dari detail, periode = tgl masuk s/d tgl keluar)
 - [x] **Foto profil** (D-037): kolom `photo_path` (migrasi `20260929100000_add_employee_photo`), bucket private `employee-photos` (script `storage:setup`, staging ✔), API upload-url/konfirmasi/hapus + `photoUrl` bertanda tangan, web unggah/ganti/hapus di detail (SA/HR) & Profil (diri sendiri), foto 3:4 ikut ter-print di bingkai formulir (tambahan 2026-09-29: permintaan pemilik projek)
  - [x] Path foto memakai `STORAGE_PATH_PREFIX` (lokal `dev/<nama>/`, staging/produksi kosong; format divalidasi `env.ts`; konfirmasi menolak path lingkungan lain) (tambahan 2026-09-30: temuan audit, PLAN §3.3) — ENV 2 + FOTO 2 test; `.env` lokal pemilik projek = `dev/oatse/`
 - [ ] Isi menu Arsip: Data Kontak, Keluarga, Pendidikan, Riwayat Jabatan, Pelatihan, Riwayat Kerja, Assets, File, Bank, Riwayat Peringatan; menu Laporan (tambahan 2026-09-29: D-035, saat ini Maintenance)

### Fase 5 — Attendance (+ Approval)
- [ ] Modul `approval`: mode paralel & tunggal, override, kasus khusus (PLAN §5.2) + test
- [ ] Skema attendance + migrasi
- [ ] Template shift, jadwal & penugasan
- [ ] Absen: geofence, selfie (kamera langsung, kompres, bucket private), waktu server, penanda "boleh di luar lokasi"
- [ ] Koreksi absensi (paralel) & lembur (MANAGER)
- [ ] Rekap harian/bulanan
- [ ] Tutup periode absensi (`payroll.period.prepare`)
- [ ] Cron `purge-selfies`
- [ ] Policy + test
- [ ] Web: tombol absen + kamera, riwayat, inbox approval, rekap

### Fase 6 — Leave
- [ ] Skema + migrasi
- [ ] Jenis cuti tahunan & izin, kuota, wajib dokumen
- [ ] Saldo: akrual, hold, penyesuaian, import saldo CSV/Excel
- [ ] Pengajuan + approval paralel + pembatalan
- [ ] Hitung hari kerja (jadwal & libur); tandai absensi saat disetujui
- [ ] Cron `leave-accrual`
- [ ] Policy + test
- [ ] Web: pengajuan, saldo, inbox approval

### Rilis 1
- [ ] Keputusan OD-4 (akun & paket), OD-8 (rollback & backup)
  - [ ] Aktifkan *Prevent use of leaked passwords* (advisor `auth_leaked_password_protection`, WARN di staging; di dashboard mengarah ke pengaturan email provider, kemungkinan butuh paket berbayar) (tambahan 2026-09-28)
- [ ] Rotasi rahasia staging: password DB (+ secret `STAGING_DIRECT_URL`), App Password `admin.arthasia@gmail.com`, cabut App Password `rizqy2458@gmail.com` (tambahan 2026-09-28: tertulis di percakapan)
- [ ] Keputusan OD-5 (akun pengirim email produksi) & OD-9 (proteksi `main`) (tambahan 2026-09-28)
- [ ] Supabase produksi (**wajib region `ap-southeast-1` Singapura**, D-029) + migrasi (workflow produksi di `main`, D-030) + bootstrap SUPER_ADMIN Utama + `bun run storage:setup` (bucket foto, D-037)
- [ ] Vercel production + env
- [ ] Uji asap (smoke test) di produksi

### Fase 7 — Contract
- [ ] Skema + migrasi
- [ ] Jenis kontrak, CRUD kontrak, perpanjangan, terminasi
- [ ] Aturan 1 kontrak aktif per karyawan, cek overlap
- [ ] Cron `contract-expiry`
- [ ] Policy + test
- [ ] Web: tab kontrak, daftar kontrak akan habis

### Fase 8 — Payroll
- [ ] Keputusan OD-1 (metode pajak), OD-2 (THR), OD-3 (verifikator)
- [ ] Golden cases disusun & diverifikasi pihak luar
- [ ] Skema + migrasi
- [ ] Konfigurasi tarif BPJS, TER, PTKP
- [ ] Komponen gaji & struktur gaji per karyawan
- [ ] Perhitungan (TDD): BPJS, PPh 21 TER, perhitungan ulang masa pajak terakhir, lembur, potongan
- [ ] Periode: hitung → review → lock → terbit; snapshot
- [ ] Slip gaji (lihat & unduh)
- [ ] Policy + test
- [ ] Web: konfigurasi, struktur gaji, proses payroll, slip

### Fase 9 — Hardening
- [ ] E2E Playwright: login, cuti paralel, absen + selfie, payroll
- [ ] Review keamanan (akses, PII di log, bucket, CORS, rahasia)
- [ ] Uji performa dasar
- [ ] Runbook: deploy, rollback, pemulihan Super Admin Utama

---

## 4. Keputusan Terbuka

| ID   | Ringkasan                                   | Memblokir | Status              |
| ---- | ------------------------------------------- | --------- | ------------------- |
| OD-1 | Metode PPh 21 (gross/gross-up/net)          | Fase 8    | Menunggu keputusan  |
| OD-2 | THR dihitung sistem?                        | Fase 8    | Menunggu keputusan  |
| OD-3 | Verifikator golden cases payroll            | Fase 8    | Menunggu keputusan  |
| OD-4 | Kepemilikan akun Vercel/Supabase & paket     | Rilis 1   | Menunggu keputusan  |
| OD-5 | Email: penyedia = Google Workspace (D-025); akun pengirim final (produksi) | Rilis 1   | Sebagian: staging `admin.arthasia@gmail.com` (D-032) |
| OD-6 | Ubah data sensitif/gaji milik sendiri       | Fase 4    | Menunggu keputusan  |
| OD-7 | Cara `db:deploy` & env per environment      | Fase 1    | Terjawab → D-030 (GitHub Actions) |
| OD-8 | Rollback migrasi & backup produksi          | Rilis 1   | Menunggu keputusan  |
| OD-9 | Proteksi `main` butuh GitHub Team (repo private) | Rilis 1 | Ditunda pemilik projek (GitHub Pro pribadi tidak berlaku untuk repo organisasi) |
| OD-10 | Bentuk role akun | Fase 2 | Terjawab → D-028 (satu akun satu role) |

Detail & rekomendasi: [PLAN §9](./PLAN.md#9-keputusan-terbuka).

---

## 5. Backlog

Ide atau fitur di luar fase aktif dicatat di sini dulu, **tidak langsung dikerjakan**.

- Aktifkan *Leaked Password Protection* Supabase Auth bila tersedia di paket (advisor WARN, dari tugas deploy Vercel 2026-09-29)
- Aplikasi mobile (projek terpisah, memakai API yang sama)
- MFA untuk SUPER_ADMIN/HR_ADMIN
- Notifikasi WhatsApp
- Pencocokan wajah pada selfie absensi
- Approval berjenjang lebih dari satu atasan

---

## 6. Log Sesi

Entri terbaru di **atas**. Salin template di bagian bawah.

### 2026-09-30 — Rilis ke staging + uji foto berprefix + rapikan bucket
- **Dikerjakan (rencana disetujui):** (1) PR #23 `HRIS/Oatse/Linux-Windows → HRIS/debug/database` (CI ✔, merge `80f2e23`, CI branch #36661577846 ✔) → PR #24 `→ HRIS/debug/fe-be` (CI ✔, merge `b7828a0`) → `Deploy staging` #36661819195 ✔ (tanpa migrasi baru). (2) Playwright staging login sungguhan SA/HR/MGR/EMP desktop + SA mobile 31/31. (3) Unggah foto sungguhan dari lokal (`STORAGE_PATH_PREFIX=dev/oatse/`) untuk pegawai dummy lokal Agus Salim → objek `dev/oatse/employees/<id>/<uuid>.webp` di bucket staging (MCP), lalu dihapus lewat UI (`photo_path` NULL, objek hilang). (4) 2 foto lama tanpa prefix (Agus Pratama, Hendra Gunawan; milik DB lokal) dipindah dengan Storage `move` (service role, script sekali pakai, dihapus setelahnya) ke `dev/oatse/…`; `photo_path` DB lokal diperbarui (1 transaksi, 2 baris); keduanya tampil lagi (600×800, 470×626).
- **Keputusan:** tidak ada D-xxx. Pilihan pemilik projek: foto lama **dipindahkan**, bukan dihapus.
- **File berubah:** `docs/PROGRESS.md`, `docs/qa/runs/2026-09-30-seragam-admin.md`, `docs/qa/README.md` (tidak ada perubahan kode).
- **Verifikasi:** CI PR #23/#24 ✔; deploy ✔ (3 job); staging `/health` 200, `/me` 401, web 200; MCP migrasi 8, advisor security tanpa temuan baru (INFO `_prisma_migrations`, WARN leaked password — sudah diketahui); bucket staging akhir = 2 objek, semuanya `dev/oatse/`; screenshot audit log staging diambil ulang setelah animasi (20 baris, opacity 1) karena screenshot pertama tertangkap di tengah animasi kaskade. Bukti `/mnt/winD/WORK/Magang/QA/2026-09-30-seragam-admin-staging/` & `…/2026-09-30-seragam-admin/` (`hr-foto-berprefix.png`, `hr-foto-dipindah-*.png`).
- **Masalah / catatan:** data staging tidak berubah oleh uji (hanya baca). Audit staging memuat entri `employee.printed` 2026-09-30 09.49 WIB dari akun lain sebelum rilis (bukan dari sesi ini).
- **Berikutnya:** lihat §2.

### 2026-09-30 — Prefix Storage lokal, SMTP di test, seragam halaman Administrasi & Akun Saya
- **Dikerjakan (rencana disetujui; Fase 3 tetap ditahan):** (1) `STORAGE_PATH_PREFIX` dipakai path foto (`${prefix}employees/<id>/…`), divalidasi di `env.ts`, diteruskan lewat deps app → rute → konteks service; konfirmasi menolak path berprefix lain; `.env` lokal diisi `dev/oatse/` (izin pemilik projek). (2) `selectEmailSender()` (diekspor dari `app.ts`): `NODE_ENV=test` selalu pengirim log. (3) Halaman Akun, Grant izin, Audit log, Profil, Notifikasi memakai `PageHeader`, `DataTable` + `TablePagination`, `EmptyState`, komponen baru `ListPanel` & `SearchField`; hook IAM menerima `pageSize` (penerima grant dimuat 100); `DataTable` punya `skeletonAvatar`; breadcrumb tidak mengulang seksi yang sama dengan kelompok; `components/pagination.tsx` dihapus (tidak dipakai lagi); polyfill Radix Select di `tests/setup.ts`.
- **Keputusan:** tidak ada D-xxx (pelaksanaan PLAN §3.3 & konvensi PROMPT §7).
- **File berubah:** api `src/{env,app}.ts`, `modules/employee/{routes,service,schema}.ts`, `core/__tests__/{env,app}.test.ts`, `tests/integration/employee/photo.test.ts`; web `components/{data-table,page-header,list-panel,search-field}.tsx` (−`pagination.tsx`), `features/iam/{api.ts,pages/*}`, `features/notification/pages/notifications-page.tsx`, `tests/{admin-pages.test.tsx,setup.ts}`; docs `PROGRESS.md`, `CODEMAP.md`, `qa/*`.
- **Verifikasi:** test merah dulu (ENV, FOTO, APP, ADM) lalu hijau; `bun run typecheck` ✔ · `bunx biome ci .` ✔ (208 file) · `bun run check:boundaries` ✔ (183 modul) · `bun run db:check` ✔ · `bun run test` ✔ (shared 10, api 271, web 72) dengan `SMTP_*` terisi · `bun run build` ✔; Playwright login sungguhan SA/HR/MGR/EMP desktop + SA mobile 31/31, konsol bersih. Bukti `/mnt/winD/WORK/Magang/QA/2026-09-30-seragam-admin/`.
- **Masalah / catatan:** `pkill -f "bun --watch"` kembali mematikan shell sendiri → server dimatikan lewat PID port. Unggah foto sungguhan berprefix ke bucket staging belum dicoba (logika teruji dengan Storage palsu). Belum di staging.
- **Berikutnya:** lihat §2.

### 2026-09-30 — Audit progres nyata & koreksi dokumen
- **Dikerjakan (rencana disetujui):** audit langsung ke repo (struktur modul, 26 endpoint, 8 migrasi, script, halaman web, feature flag), CI GitHub, posisi branch, staging live, dan DB staging (MCP read-only); dokumen dicocokkan dengan hasilnya. Koreksi: PROGRESS §1 (status Fase 2), §2 ditulis ulang dari hasil audit (commit `5b974a1`, test 10/265/64, QA 4 rencana 102 kasus), checklist Fase 1 (SMTP Supabase Auth sudah teruji 200), Fase 2 (audit log & notifikasi `[x]`, web sudah diuji di browser); CODEMAP (tanggal, kondisi repo, `storage.ts` ganda, status skema Prisma/iam/script/modul, file yang belum tercatat); PLAN (metadata D-036–D-037, baris Fase 1 §7 mengikuti D-036).
- **Keputusan:** tidak ada D-xxx/OD baru.
- **File berubah:** `docs/PROGRESS.md`, `docs/CODEMAP.md`, `docs/PLAN.md`.
- **Verifikasi:** `bun run typecheck` ✔ · `bunx biome ci .` ✔ (206 file) · `bun run check:boundaries` ✔ (182 modul) · test shared 10 · api unit 175 · web 64 ✔; `bun run db:check` ✔ · `bun run test` ✔ (shared 10 · api 265 · web 64, PostgreSQL lokal setelah Docker dinyalakan pemilik projek) — sama dengan CI #36556849610 (`5b974a1`); staging `/health` 200, web 200, `/me` 401; MCP: jumlah data & migrasi staging sesuai log 2026-09-29; grep konsistensi rujukan.
- **Masalah / catatan:** temuan kode `STORAGE_PATH_PREFIX` tidak dipakai → Backlog (tidak diperbaiki di tugas dokumen ini).
- **Berikutnya:** lihat §2.

### 2026-09-29 — Foto profil + bucket Supabase + foto di formulir cetak (D-037)
- **Dikerjakan (rencana disetujui; pilihan pemilik projek: SA/HR + diri sendiri, potong 3:4, bucket dibuat di staging):** migrasi `20260929100000_add_employee_photo` (`employees.photo_path`); `core/storage.ts` (`StorageAdmin` + Supabase + palsu untuk test); script `storage:setup` (idempoten) → bucket private `employee-photos` di staging; API `POST /employees/:id/photo/upload-url`, `POST|DELETE /employees/:id/photo` (policy `canChangePhoto`, TDD; validasi tipe/ukuran/kepemilikan path; hapus foto lama; audit), `photoUrl` bertanda tangan 10 menit di daftar/detail/respons mutasi; web `lib/image.ts` (potong 3:4, kompres WebP ≤ 600×800), `EmployeePhotoControl` (detail & Profil), avatar berfoto di daftar/pemilih/Ctrl+K; print menyisipkan JPEG ke drawing template (B9:J25, jarak 3 px).
- **Keputusan:** **D-037** (PLAN §8).
- **File berubah:** api `prisma/schema/employee.prisma`, migrasi baru, `src/core/storage.ts`, `src/app.ts`, `scripts/setup-storage.ts`, `package.json`, `modules/employee/{policy,schema,repository,service,routes}.ts`, test `employee.policy.test.ts`, `tests/integration/employee/photo.test.ts`, `tests/helpers/storage.ts`; web `lib/{image,xlsx-template}.ts`, `features/employee/{api,schemas,print}.ts`, `components/{employee-avatar,employee-photo-control,employee-detail-sheet,employee-list-view,employee-picker,reactivate-dialog,print-employee-button}.tsx`, `pages/change-status-page.tsx`, `features/iam/pages/profile-page.tsx`, `app/layout/command-palette.tsx`, test `employee-{detail,print}`, `personal-management`, `supabase-mock.ts`; docs `PLAN.md`, `CODEMAP.md`, `PROGRESS.md`, `erd/hris.dbml`, `qa/*`.
- **Verifikasi:** policy merah → hijau (62); migrasi lokal + `db:check` ✔; `bun run typecheck` ✔ · `bunx biome ci .` ✔ · boundaries ✔ (182 modul) · `bun run test` ✔ (shared 10, api 265, web 64); smoke Storage staging (URL publik ditolak, anon tak bisa list, token terikat path, GIF ditolak bucket, objek uji dihapus); Playwright login sungguhan 9/9; .xlsx dicek openpyxl (foto 600×787 di (1,8)→(9,24)); advisor security tanpa temuan baru. Bukti `/mnt/winD/WORK/Magang/QA/2026-09-29-foto-profil/`.
- **Masalah / catatan:** avatar kosong saat foto dimuat → diperbaiki (inisial di bawah foto). Foto uji Agus Pratama sengaja dibiarkan (DB lokal + 1 objek bucket staging). Bucket **produksi** wajib `bun run storage:setup` saat Rilis 1. Tampilan foto di Microsoft Excel belum dicek manusia.
- **Rilis ke staging (izin pemilik projek):** commit `346a740` → PR #21 (`→ HRIS/debug/database`, CI ✔, merge `274d8b8`, CI #36556217047 ✔) → PR #22 (`→ HRIS/debug/fe-be`, merge `adbe6ca`) → `Deploy staging` #36556445220 ✔ (migrate → api → web). MCP: migrasi `20260929100000_add_employee_photo` selesai, kolom `photo_path varchar(255)` ada. Playwright staging login sungguhan 6/6 (HR unggah → foto 600×800 dari signed URL → print berfoto (JPEG 600×787) → hapus; MANAGER tanpa tombol kamera); staging dibersihkan (0 pegawai berfoto; audit 1 update + 1 delete). Bucket bersama lokal/staging (D-023) berisi 2 foto yang diunggah pemilik projek di lokal (Agus Pratama, Hendra Gunawan).
- **Berikutnya:** menunggu arahan pemilik projek (Fase 3 CRUD master data ditahan dulu atas permintaan pemilik projek).

### 2026-09-29 — Detail pegawai layar penuh, riwayat "diubah oleh", Print data (.xlsx)
- **Dikerjakan (permintaan pemilik projek):** (1) panel detail pegawai layar penuh (isi `max-w-5xl` di tengah, satu area gulir, baris tab sticky), (2) avatar ukuran baru `2xl` di tengah paling atas, (3) riwayat menampilkan pengubah — API `changedBy` {nama pegawai pengubah / email akun bila tanpa data pegawai, role, lokasi kerja}; `iam` menambah fungsi publik `getAccountSummaries`, (4) fitur **Print data**: `GET /employees/:id?view=print` (policy baru `canPrintEmployee` = SA/HR, TDD; data pribadi & keluarga (+alamat) hanya bila berhak, rekening tidak dibaca; audit `employee.printed`), web `lib/xlsx-template.ts` (fflate 0.8.3, isi XML lembar langsung) + `features/employee/print.ts` (pemetaan ke template) + tombol di detail.
- **Keputusan:** tidak ada D-xxx. Pilihan pemilik projek (sesi ini): hasil = unduhan .xlsx terisi; hanya dari detail (satu pegawai per file); periode = tanggal masuk s/d tanggal keluar; "lokasi" = lokasi kerja pengubah. Keputusan kecil: unduh hanya SA/HR (MANAGER/EMPLOYEE 403), kolom template tanpa sumber data dibiarkan kosong, pasangan dipetakan ke baris Suami/Isteri menurut jenis kelamin pegawai, saudara/lainnya tidak dicetak (tidak ada barisnya), kontak darurat = `emergency_phone` + data keluarga bila nomornya cocok.
- **File berubah:** api `employee.{policy,schema,repository,service,routes}.ts`, `employee.policy.test.ts`, `tests/integration/employee/employees.test.ts`, `iam.{repository,service}.ts`, `iam/index.ts`; web `components/ui/sheet.tsx`, `features/employee/{api,schemas,print}.ts`, `components/{employee-detail-sheet,employee-avatar,print-employee-button}.tsx`, `lib/xlsx-template.ts`, `public/template/Template-excel.xlsx`, `tests/employee-{detail,print}.test.ts(x)`, `package.json`, `bun.lock`; docs `CODEMAP.md`, `PROGRESS.md`, `qa/{README,cases/employee,plans/2026-09-29-detail-print,runs/2026-09-29-detail-print}.md`.
- **Verifikasi:** policy merah dulu lalu hijau (52 pass); `bun run typecheck` ✔ · `bunx biome ci .` ✔ (200 file) · `bun run check:boundaries` ✔ (179 modul) · `bun run db:check` ✔ · `bun run test` ✔ (shared 10, api 248, web 53; SMTP dikosongkan) · `vite build` ✔; Playwright lokal login sungguhan SA/HR/MGR desktop & mobile 23/23; file unduhan dibaca openpyxl (244 merge, judul cetak, A4 80% utuh); audit lokal SA `{sections:[personal]}`, HR `{sections:[]}`. Bukti `/mnt/winD/WORK/Magang/QA/2026-09-29-detail-print/`.
- **Masalah / catatan:** ditemukan & diperbaiki saat uji browser: deklarasi XML ganda di Chromium (file rusak; jsdom tidak memperlihatkannya → test penjaga ditambah), tab sticky menutupi tombol X di mobile, toast menutupi X (toast print dipindah ke bawah-tengah). Vite dev di NTFS kadang menyajikan modul lama setelah edit (perlu `touch`). Belum diverifikasi di Microsoft Excel sungguhan & staging.
- **Tambahan (setelah pemilik projek mengecek file & menyetujui):** tombol tutup X di kanan atas diganti **"← Kembali"** (ikon panah kiri, teks & panah hitam tebal `text-foreground font-semibold` agar mudah terlihat) di kiri atas (`SheetClose` + `hideClose`); baris tab memberi ruang kiri `pl-28` di bawah `lg`, tombol sejajar tengah baris tab saat digulir di mobile. Verifikasi: web 54 test, `biome ci` ✔, typecheck ✔, boundaries ✔, build ✔, Playwright 31/31 (bukti `*-tombol-kembali.png`).
- **Rilis ke staging (izin pemilik projek):** commit `d3ec7b2` → PR #19 (`→ HRIS/debug/database`, CI ✔, merge `85f7412`, CI branch #36550947243 ✔) → PR #20 (`→ HRIS/debug/fe-be`, merge `be5c94e`) → `Deploy staging` #36551504285 ✔ (migrasi tanpa perubahan, api, web). Staging: `/health` 200, `view=print` tanpa token 401, template 200 (36 KB); Playwright login sungguhan SA/HR/MGR 18/18 (bukti `/mnt/winD/WORK/Magang/QA/2026-09-29-detail-print-staging/`); file .xlsx staging valid (SA terisi data pribadi, HR kosong). Catatan: uji menulis 2 audit `employee.printed` di DB staging (data dummy); riwayat staging hanya data seed sehingga tampil "sistem (data awal/impor)" — tampilan nama pengubah teruji di lokal.
- **Berikutnya:** Fase 3 CRUD master data.

### 2026-09-29 — Penutup sesi: status staging & keputusan rotasi rahasia
- **Dikerjakan:** §2 Fokus diperbarui (staging `3afbd3f`, logo vertikal, BUG-001 diperbaiki, urutan deploy); status BUG-001 dilengkapi commit & bukti staging.
- **Keputusan:** pemilik projek **menunda rotasi rahasia** yang tertulis di percakapan (password DB staging, token Vercel, password 4 akun uji) karena staging hanya berisi data dummy; tetap wajib sebelum data asli/produksi (§2 Keamanan). `.env.staging` tetap di laptop (gitignored).
- **File berubah:** `docs/PROGRESS.md`, `docs/qa/bugs/BUG-001-hydratefallback-warning.md`.
- **Verifikasi:** perubahan dokumen saja; konsistensi rujukan (commit, run, PR) dicek dengan grep.
- **Berikutnya:** Fase 3 CRUD master data.

### 2026-09-29 — Urutan deploy api → web, BUG-001, tampilan mobile daftar pegawai
- **Dikerjakan:** (1) `deploy-staging.yml`: job matrix `vercel` dipecah menjadi `vercel-api` (needs `migrate`) → `vercel-web` (needs `vercel-api`) karena matrix + `max-parallel: 1` tidak menjamin urutan (run #36536174711: web selesai sebelum api). (2) BUG-001: `HydrateFallback` di route akar `RequireAuth`. (3) Daftar pegawai mobile: filter departemen/lokasi ditumpuk satu kolom di bawah `sm`, input cari `pr-9 sm:pr-16`, placeholder "Cari nama, nomor induk, email…"; logo baru juga sudah di staging (PR #15/#16, `Deploy staging` #36536174711).
- **Keputusan:** tidak ada D-xxx.
- **File berubah:** `.github/workflows/deploy-staging.yml`, `apps/web/src/app/router.tsx`, `apps/web/src/features/auth/components/guards.tsx`, `apps/web/src/features/employee/components/employee-list-view.tsx`, `apps/web/tests/router-hydration.test.tsx`, `docs/qa/bugs/BUG-001-hydratefallback-warning.md`, `docs/qa/README.md`, `docs/CODEMAP.md`.
- **Verifikasi:** test BUG-001 merah dulu (warning tertangkap) lalu hijau; `bun run typecheck` ✔ · `bunx biome ci .` ✔ · boundaries ✔ (175 modul) · test shared 10 · api 237 (SMTP dikosongkan) · web 33 · `bun run build` ✔; YAML diparse: `migrate → vercel-api → vercel-web`; Playwright lokal 390 px & 1440 px (login HR): placeholder muat (230/258 px), filter lebar penuh, konsol bersih setelah reload ke route lazy — bukti `/mnt/winD/WORK/Magang/QA/2026-09-29-bug001-mobile/`. Workflow baru belum dijalankan di GitHub (butuh push ke `HRIS/debug/fe-be`).
- **Berikutnya:** naikkan ke staging & pastikan urutan job; rotasi rahasia; Fase 3 CRUD master data.

### 2026-09-29 — Web: logo vertikal Arthasia
- **Dikerjakan:** logo di top bar, menu mobile, dan halaman login/auth diganti logo resmi vertikal (ikon + "arthasia" + "energy for the future") sesuai permintaan pemilik projek; pilihan pemilik projek: logo vertikal lengkap di semua tempat (tagline di top bar sangat kecil, diterima).
- **Keputusan:** tidak ada D-xxx (tampilan). Aset `public/logo/logo-vertical.webp` (358×360, 32 KB) dibuat dari `logo-arthasia-ori.png` (5800×6400, 3,6 MB, dipotong ke area logo); tinggi header tetap `h-14`.
- **File berubah:** `apps/web/src/components/brand-logo.tsx`, `apps/web/src/app/layout/app-layout.tsx`, `apps/web/src/features/auth/pages/login-page.tsx`, `apps/web/public/logo/logo-vertical.webp`, `docs/CODEMAP.md`.
- **Verifikasi:** `bun run --filter @hris/web typecheck` ✔ · `bunx biome ci .` ✔ · `bun run check:boundaries` ✔ (175 modul) · `bun run test:web` 32 pass · `vite build` ✔; Playwright lokal (login SA sungguhan): logo login 128 px, top bar 48 px (header 57 px), drawer mobile 64 px, 0 error konsol — bukti `/mnt/winD/WORK/Magang/QA/2026-09-29-logo-vertikal/`.
- **Masalah / catatan:** file sumber `logo-arthasia-ori.png` (3,6 MB) masih di `public/logo/` sehingga ikut ter-deploy bila di-commit; favicon tetap `logo-arthasia.png`. Belum di staging (butuh commit + PR).

### 2026-09-29 — QA staging Vercel (D-036)
- **Dikerjakan:** rencana, 49 kasus (`docs/qa/cases/staging.md`, TC-STG-001…058), eksekusi di staging `43b2b69`: API (Bun + supabase-js, login password sungguhan 4 role) & UI (Playwright Chromium, login lewat form, desktop 1440×900 + mobile 390×844); hasil di `docs/qa/runs/2026-09-29-staging.md`; BUG-001.
- **Keputusan:** tidak ada D-xxx baru. Uji E2E ad-hoc (script di folder bukti), bukan workspace `e2e/` (itu Fase 9).
- **File berubah:** `docs/qa/plans/2026-09-29-staging.md`, `docs/qa/cases/staging.md`, `docs/qa/runs/2026-09-29-staging.md`, `docs/qa/bugs/BUG-001-hydratefallback-warning.md`, `docs/qa/README.md`, `docs/PROGRESS.md`.
- **Verifikasi:** `bun api.ts` → 43/43 LULUS; `bun ui.ts` → 31/31 LULUS (setelah 2 perbaikan script, bukan aplikasi); bukti `/mnt/winD/WORK/Magang/QA/2026-09-29-staging/` (66 screenshot + JSON); staging dibersihkan via SQL (pegawai uji, 4 riwayat, 5 audit) → 21 pegawai / 2 nonaktif / 23 riwayat.
- **Masalah / catatan:** BUG-001 (P3) warning `HydrateFallback`; tampilan mobile daftar pegawai (placeholder & filter terpotong); logout uji memakai scope global (sesi lain akun EMP ikut keluar); password akun uji tertulis di percakapan → rotasi.
- **Berikutnya:** BUG-001 + tampilan mobile; rotasi rahasia; Fase 3 CRUD master data.

### 2026-09-29 — Fase 1: staging Vercel + data staging (D-036)
- **Dikerjakan:** project Vercel `hris-staging-api` & `hris-staging-web` + env production; job `vercel` di `deploy-staging.yml` (CLI, setelah migrasi) + 4 secret baru; seed dummy + akun uji HR/MGR/EMP ke DB staging; kode naik ke staging lewat PR #9–#14; staging live & terverifikasi.
- **Keputusan:** D-036 (staging di akun Vercel pribadi Hobby, deployment production project staging, deploy via GitHub Actions + Vercel CLI, data staging = seed dummy). OD-4 tetap terbuka untuk produksi.
- **File berubah:** `.github/workflows/deploy-staging.yml`, `apps/api/vercel.json`, `apps/web/vercel.json`, `docs/PLAN.md`, `docs/CODEMAP.md`, `docs/PROMPT.md`, `docs/PROGRESS.md`.
- **Verifikasi:** lokal typecheck ✔, `biome ci` ✔, boundaries ✔ (175 modul), test shared 10 · api 237 · web 32; CI PR #9–#14 hijau; `Deploy staging` #36529746512, #36530682448, #36531510460 (jobs ✔); live: `/health` 200 (DB ok), `/me` 401, 404, `/openapi.json` & `/docs` 200, preflight CORS 204 hanya untuk origin web, cron 401/401/200; data staging via MCP (21 karyawan, 4 akun); advisor security tanpa temuan baru, performance 21 INFO unused index (data baru).
- **Masalah / catatan:**
  - Dua deploy pertama sukses di CI tetapi function api gagal saat dipanggil (`ResolveMessage`, lalu `BuildMessage`): builder `@vercel/node` mengompilasi TS per file dan tidak cocok dengan monorepo paket sumber TS (entry `src/app.ts` terpilih, `extends` tsconfig diabaikan, import `.ts` & `@hris/shared` tidak ter-resolve). Solusi akhir: api dibundel `bun build --external hono` → `dist/index.js` (`outputDirectory: dist`); tambalan sementara PR #9/#11 dikembalikan. Pelajaran: uji build Vercel dari **clone bersih** + simulasi function terisolasi, bukan dari working tree (build lokal pertama menyesatkan karena resolusi naik ke `node_modules` repo).
  - Project Vercel baru melindungi URL production `*.vercel.app` dengan Vercel Authentication (`all_except_custom_domains`) → diubah menjadi hanya preview.
  - `NODE_ENV` tidak diisi di env Vercel (production saat build membuat `bun install` melewati devDependencies).
  - Test api gagal (timeout 5 s di `grants-audit.test.ts`) bila `SMTP_*` terisi di `.env` lokal — sudah terjadi sebelum tugas ini; masuk Backlog.
  - Rahasia (password DB staging, token Vercel, password akun uji) tertulis di percakapan → masuk daftar rotasi §2.
- **Berikutnya:** lihat §2 (uji login di web staging, rotasi rahasia, Fase 3 CRUD master data).
### 2026-09-29 — D-035: web Personal Management + API employee/organization
- **Dikerjakan (rencana disetujui; keputusan pemilik projek: SA+HR penuh & MANAGER baca tim, 5 kategori tanpa "Masa Percobaan", menu b = ubah kategori + nonaktifkan, akun login ikut nonaktif):**
 - **Skema:** migrasi `20260929020000_employee_categories_and_histories` (enum kategori + `employment_statuses.category` unik, `employees.exit_reason` + CHECK, `employment_histories`, index daftar). Seed: 5 status berkategori (nama lama diganti, "Masa Percobaan" di-soft delete), 21 karyawan (2 nonaktif) + riwayat.
 - **API:** modul `organization` (`GET /master-data`) & `employee` (daftar/ringkasan/detail `view=work|full`/tambah/ubah/ubah status/nonaktif/aktif kembali/pilihan atasan/struktur); `iam` menambah fungsi publik (tautan akun, atasan sah, nonaktifkan akun pegawai dalam transaksi pemanggil); `Cache-Control: private, no-store` untuk `/api/*`.
 - **Web:** navigasi `navigation.ts` (satu sumber menu), top nav + sidebar kontekstual (lipat, badge jumlah, prefetch), drawer mobile, pencarian cepat Ctrl+K (menu + pegawai), route lazy + preload, tema zinc + aksen teal + Geist; halaman a–e, Dashboard kosong, Maintenance (ilustrasi SVG) untuk f–p; DataTable TanStack Table v9 (sort/paginasi server, state di URL).
 - **QA:** `docs/qa/` (README, plan, 32 kasus, run).
- **Keputusan:** **D-035** (PLAN §8).
- **Verifikasi:** `bun run typecheck` ✔ · `bunx biome ci .` ✔ (192 file) · `bun run check:boundaries` ✔ (173 modul, 0 pelanggaran) · `bun run db:check` ✔ · `bun run test` ✔ (shared 10, api 237, web 27) · seed 2× idempoten ✔ · tanpa sisa data test ✔ · `bun run build` web ✔ (halaman ter-chunk terpisah) · Playwright Chromium: 24 layar (desktop, mobile, SA & MANAGER) 0 error konsol + alur UI penuh tambah → ubah status → nonaktif → aktif kembali (4 audit), data uji dihapus.
- **Masalah / catatan:** `prisma migrate dev` menolak berjalan non-interaktif → SQL migrasi dibuat dengan `prisma migrate diff` lalu `migrate deploy` (hasil sama; `db:check` tanpa selisih). Enum `POSITION_CHANGED` ditambahkan ke migrasi yang **belum di-commit** setelah sempat diterapkan lokal (dibatalkan manual di DB lokal lalu diterapkan ulang). `@tanstack/react-table` terpasang v9 (API `useTable` + `tableFeatures`). Verifikasi visual memakai harness di scratchpad (API lokal + verifier token uji, request Supabase diblokir) karena tidak ada browser/penanda sesi asli; login Supabase sungguhan di web baru **belum diverifikasi**. Membaca tab Pribadi/Rekening sebagai SA saat verifikasi menulis audit `employee.sensitive.read` di DB lokal (disengaja, catatan sah).
- **Tambahan (permintaan pemilik projek):** uji akun HR_ADMIN 18/18 lulus (bukti `/mnt/winD/WORK/Magang/QA/2026-09-29-hr-account/`); aturan lokasi bukti QA (`/mnt/winD/WORK/Magang/QA/<tanggal>-<target>/`) dicatat di skill `hris-qa-docs` & `hris-e2e-playwright` (+ `outputDir` templat Playwright).
- **Logo (permintaan pemilik projek):** monogram SVG sementara diganti logo resmi `apps/web/public/logo/logo-arthasia.png` (nama file asli `logo-arthasia(1)(1)(1).png` diganti supaya aman di URL) di top bar, menu mobile, halaman auth (login, lupa/atur password, callback), dan favicon (`favicon.svg` lama dihapus). Bukti: `/mnt/winD/WORK/Magang/QA/2026-09-29-logo/`. Kemudian (permintaan berikutnya) logo + teks "Arthasia HRIS / PT Arthasia Cipta Pratama" diganti **logo horizontal saja** `public/logo/logo-horizontal.svg` (nama asli `Logo-horizontal.svg` → huruf kecil; ditambah `<title>` untuk lint a11y) lewat komponen `BrandLogo`; ikon PNG tetap untuk favicon. Bukti: `/mnt/winD/WORK/Magang/QA/2026-09-29-logo-horizontal/`.
- **Warna fokus input (permintaan pemilik projek):** `--ring` dari teal (mirip hijau matcha) → abu netral `oklch(0.705 0.015 286)` terang / `oklch(0.552 0.016 286)` gelap; status error tetap merah. Bukti: `/mnt/winD/WORK/Magang/QA/2026-09-29-focus-ring-abu/`. Autofill browser (Chromium latar biru, Firefox filter kekuningan/kehijauan) dinetralkan di `index.css` (`:autofill`/`:-webkit-autofill`: `filter:none`, bayangan inset `--card`, teks `--foreground`); percobaan pertama di `@layer base` kalah oleh `shadow-xs` (@layer utilities) → latar zaitun Firefox/Zen masih tampak (dilaporkan pemilik projek); aturan dipindah **ke luar layer**. Terverifikasi: aturan tanpa layer di CSS, simulasi latar `#707000 !important` + `shadow-xs` tertutup putih (bukti `/mnt/winD/WORK/Magang/QA/2026-09-29-autofill-netral/`); autofill sungguhan menunggu konfirmasi pemilik projek.
- **Judul tanpa angka (permintaan pemilik projek):** angka jumlah di samping judul dihapus di Data Pegawai Aktif (semua kategori) & Data Pegawai Tidak Aktif; angka di chip kategori & badge sidebar tetap. Regresi browser 44 halaman × role (SA 18, HR 16, MGR 10): tanpa error JS, tanpa request API gagal, judul tanpa angka; bukti `/mnt/winD/WORK/Magang/QA/2026-09-29-judul-tanpa-angka/`. Temuan lama (bukan regresi): halaman Profil tidak punya `<h1>` (a11y) → masuk usulan penyeragaman halaman Administrasi/Akun Saya.
- **Uji SMTP (izin pemilik projek, App Password diisi pemilik projek di `.env` lokal):** env tervalidasi `getEnv()` (host `smtp.gmail.com`, port 587, user & from `admin.arthasia@gmail.com`, password 16 karakter — tidak ditampilkan); `verify()` login STARTTLS+AUTH ✔; satu email lewat `createSmtpSender` ke `oatse2458@gmail.com` (subjek "[HRIS Arthasia] Uji email notifikasi dari HR Admin", tanpa data sensitif) diterima server 02:02:38 UTC; **pemilik projek mengonfirmasi email diterima di kotak masuk** (2026-09-29). Catatan: server dev yang berjalan dimulai sebelum `.env` diisi → masih memakai pengirim log sampai di-restart.
- **Menu b–e ditutup sementara (permintaan pemilik projek):** Ubah Status, Pengaktifan, Pegawai Tidak Aktif, Struktur Organisasi → halaman Maintenance + label "Segera" lewat saklar `apps/web/src/app/feature-flags.ts` (kode halaman & API tetap; aktifkan lagi dengan `true`). Tombol "Ubah status/Nonaktifkan/Aktifkan kembali" di panel detail ikut disembunyikan. Test web 32 ✔ (+5 baru; 1 test badge lama disesuaikan), regresi browser 44 halaman × role + panel detail + sidebar ✔ (bukti `/mnt/winD/WORK/Magang/QA/2026-09-29-menu-b-e-maintenance/`).
- **Naik ke staging (atas permintaan pemilik projek):** commit `a53b2bc` → CI #36506292655 ✔ → PR #7 ke `HRIS/debug/database` (merge `b8dcdc5`, CI #36506530439 ✔) → PR #8 ke `HRIS/debug/fe-be` (merge `1df018e`, CI #36506844833 ✔) → `Deploy staging` #36506844786 ✔: `20260928085157_add_notification` & `20260929020000_employee_categories_and_histories` diterapkan, `db:check` tanpa selisih; langkah Vercel dilewati (Deploy Hook belum ada). **MCP (read-only):** 7 migrasi, tabel/kolom/CHECK baru ada, skema tidak terbuka ke `anon`/`authenticated`; advisor security tetap INFO `_prisma_migrations` (disengaja) + WARN leaked password (sudah di Rilis 1), performance hanya INFO `unused_index` (DB kosong). `main` tidak disentuh.
- **Persetujuan:** pemilik projek meninjau tampilan & menyatakan "semuanya oke", lalu meminta commit & push ke `HRIS/Oatse/Linux-Windows` (2026-09-29).
- **Commit & push (atas permintaan pemilik projek):** `a53b2bc` (UI), `a2b25f5` (docs staging), `e097470` (menu b–e maintenance + uji SMTP; CI #36511942894 ✔) ke `HRIS/Oatse/Linux-Windows`.
- **Berikutnya:** lihat §2.

### 2026-09-28 — Akun uji per role + verifikasi tampilan
- **Dikerjakan (disetujui pemilik projek):** pemilik projek mencoba web: login/logout & semua fitur Super Admin bisa diklik. Sebelumnya `VITE_SUPABASE_URL` di `.env` kosong (tertimpa tab editor lama) → layar kosong; diisi ulang. Script baru `create-dev-account` + service `provisionAccount` (idempoten, audit, menolak mengubah SUPER_ADMIN; 2 test). Dibuat 3 akun uji di Auth staging + DB lokal, tertaut karyawan dummy: HR_ADMIN `hr.arthasia@gmail.com` (Siti Rahmawati), MANAGER `mgr.arthasia@gmail.com` (Andi Wijaya), EMPLOYEE `emp.arthasia@gmail.com` (Rizky Ramadhan).
- **Verifikasi (login sungguhan, read-only, lalu logout):** `/me` role sesuai & karyawan tertaut; HR: `/accounts` 200, `/grants` 403, `/audit-logs` 403; MANAGER & EMPLOYEE: `/accounts`/`/grants`/`/audit-logs` 403; semua `/notifications` 200 — sesuai matriks PLAN §4.3. Jalan ulang script → `unchanged`.
- **Catatan:** ejaan `hr.arthaasia` di pesan pemilik projek dianggap salah ketik → `hr.arthasia`. Pastikan ketiga Gmail milik kantor (notifikasi akan dikirim ke sana). Akun uji hanya di DB **lokal** (DB staging belum). Password tertulis di percakapan → hanya untuk data dummy.

### 2026-09-28 — Fase 2 IAM: Bagian A (API akun/role/grant/audit), B (notifikasi & email), C (web)
- **Dikerjakan (rencana disetujui; keputusan: login ulang di klien, HR hanya EMPLOYEE/MANAGER, captcha ditunda):**
  - **A:** `isSelf`/`isInTeam`; matriks policy IAM (60 test, TDD); endpoint `/accounts` (daftar, detail, undang, role, nonaktif/aktif + ban Supabase), serah-terima Utama (`amr` ≤ 5 menit), `/grants` (beri, cabut), `/audit-logs`; `AuthAdmin` + palsu; script `recover-primary-admin`.
  - **B:** skema `notification` (migrasi `20260928085157_add_notification`); `core/email` (SMTP nodemailer / log); modul `notification` (notify tidak melempar, outbox + retry, endpoint milik sendiri); pemicu grant & SUPER_ADMIN/Utama; cron `grant-expiry` & `email-retry` (`CRON_SECRET`), `vercel.json` crons harian.
  - **C:** web auth (login, lupa, callback, atur password), guard & menu per role, halaman Akun/Grant/Audit/Notifikasi/Profil, 401 global → keluar.
- **Keputusan:** **D-033** (konfirmasi Utama = login ulang, klaim `amr`), **D-034** (aturan kelola akun).
- **Verifikasi:** `bun run typecheck` ✔ · `bunx biome ci .` ✔ · `bun run check:boundaries` ✔ (123 modul) · `bun run db:check` ✔ · `bun run test` ✔ (shared 10, api 165, web 17) · suite api penuh di DB kosong sementara ✔ (test Utama berjalan, tanpa sisa data) · `bun run build` ✔ · mutasi aturan HR tertangkap test · smoke login sungguhan (read-only): `/me`, `/accounts`, `/grants`, `/audit-logs`, `/notifications` 200, cron tanpa secret 401, OpenAPI 15 path, halaman web 200, 0 error log, logout.
- **Masalah / catatan:** Prisma 7 & Biome memformat ulang file sehingga beberapa edit berbasis teks gagal aman (tidak ada perubahan setengah jadi) lalu diulang; shadcn CLI kembali menambah paket `cn` & `next-themes` (dihapus); deadlock `vi.mock` (factory meng-import app) diperbaiki dengan mock terpisah; `pkill -f` sempat mematikan shell sendiri; notifikasi sisa test (tanpa FK) dibersihkan & cleanup fixture diperbaiki.
- **Belum diverifikasi:** pengirim SMTP nodemailer ke Gmail sungguhan; UI di browser (perlu dicoba pemilik projek); migrasi `notification` belum di staging.

### 2026-09-28 — Pemulihan & pembaruan menyeluruh PROGRESS
- **Kejadian:** `docs/PROGRESS.md` di working tree tertimpa pukul 15:30:10 oleh versi pertama projek (commit `9c98778` + centang review Fase 0), kemungkinan dari tab editor lama yang disimpan. File lain utuh.
- **Dikerjakan (disetujui pemilik projek, tab lama sudah ditutup):** dipulihkan dari commit `e52a139`; tiga catatan yang belum di-commit ditulis ulang (dua entri log di bawah + sub-item captcha & leaked password); audit seluruh checklist terhadap bukti; §1 status Fase 2 → Berjalan; §2 ditulis ulang; item yang belum tercatat ditambahkan sebagai sub-item `(tambahan 2026-09-28)`; OD-9 → ditunda.
- **Verifikasi:** grep konsistensi (tanpa entri ganda; D-xxx/OD-x yang dirujuk ada di PLAN); `bunx biome ci .`.

### 2026-09-28 — Bootstrap Super Admin ke DB staging; item captcha & leaked password
- **Dikerjakan (izin pemilik projek):** `bootstrap:super-admin` dengan `DATABASE_URL` di-override ke session pooler staging (sekali jalan, `.env` tidak diubah; dry-run membuktikan override menang atas `--env-file`). User Auth `admin.arthasia@gmail.com` (`47a8155e-…`) ditemukan tanpa prompt → akun Utama staging dibuat (`f5828827-…`).
- **Verifikasi (MCP):** `iam.accounts` staging = 1 (SUPER_ADMIN, Utama, aktif, `auth_user_id` cocok dengan `auth.users`), 1 audit `iam.account.bootstrap_primary_super_admin`. DB lokal tidak berubah (tetap Utama `f73bb6a3-…`).
- **Dicatat untuk nanti (permintaan pemilik projek):** captcha **Turnstile** (sub-item Fase 2) dan *leaked password protection* (sub-item Rilis 1).
- **Catatan:** entri ini sempat hilang karena PROGRESS tertimpa; ditulis ulang dari catatan sesi.

### 2026-09-28 — Fondasi akses naik ke staging
- **Dikerjakan (izin pemilik projek; `main` tidak disentuh):** push `46e18ce`, `c75d4ae`, `e52a139` ke `HRIS/Oatse/Linux-Windows` → CI run #36396299865 ✔. PR #5 → `HRIS/debug/database` (percobaan pertama berhenti karena `gh pr checks --watch` terputus jaringan; semua check ternyata lulus; dijalankan ulang tanpa PR ganda) merge `d8ca2fc` → CI #36396711338 ✔ → PR #6 → `HRIS/debug/fe-be` merge `31b2d85` → `Deploy staging` #36396869984 ✔.
- **Verifikasi staging via MCP (read-only):** 5 migrasi tercatat (termasuk `add_departments_parent_id_index`, `add_iam_and_audit`); tabel `iam.accounts`, `iam.permission_grants`, `audit.audit_logs`; index unik parsial Utama & `departments_parent_id_idx`; 2 CHECK constraint; `anon`/`authenticated` tanpa USAGE pada `iam`/`audit`; `main` tetap `ebb20e5`.
- **Advisor security:** INFO `rls_enabled_no_policy` (`_prisma_migrations`, disengaja); **WARN** `auth_leaked_password_protection`.
- **Catatan:** entri ini sempat hilang karena PROGRESS tertimpa; ditulis ulang dari catatan sesi.

### 2026-09-28 — Uji login end-to-end (Auth staging → API lokal)
- **Dikerjakan (izin pemilik projek):** publishable key diambil via MCP (`sb_publishable_…`, publik) dan diisi ke `VITE_SUPABASE_ANON_KEY` di `.env` lokal. Script sekali pakai (`supabase-js`): `signInWithPassword` sebagai `admin.arthasia@gmail.com` → token asli → `GET /api/v1/me` di `bun run dev:api` → `signOut`. Token tidak dicetak; script dihapus setelahnya.
- **Hasil:** token ES256, `role`/`aud` = `authenticated`, `sub` = user Auth `47a8155e-…`; `/me` **200** → akun `f73bb6a3-…`, `SUPER_ADMIN`, `isPrimarySuperAdmin: true`, `lastLoginAt` terisi; token dirusak → **401**; logout ok (MCP: 0 sesi aktif, 0 refresh token hidup); log API mencatat 200 & 401.
- **Arti:** rantai `core/auth` (JWKS remote) → `core/access` (akun dari DB) → modul `iam` terbukti dengan token Supabase sungguhan.

### 2026-09-28 — Bootstrap Super Admin Utama (DB lokal + Auth staging)
- **Dikerjakan:** kunci `SUPABASE_SERVICE_ROLE_KEY` diisi pemilik projek di `.env` (dicek: JWT `role=service_role`, `ref=iwgzuwcxsxnbjibhbqgh`, isi tidak ditampilkan). Dry-run ✔ lalu jalan nyata (password dari pemilik projek, dikirim lewat pseudo-terminal, output disaring): user Auth `admin.arthasia@gmail.com` dibuat (`47a8155e-…`, terkonfirmasi), akun HRIS SUPER_ADMIN Utama dibuat di DB lokal (`f73bb6a3-…`), audit `iam.account.bootstrap_primary_super_admin`.
- **Bug diperbaiki:** script root `bootstrap:super-admin` memakai `bun run --filter`, yang mem-pipe stdio sehingga input password tersembunyi tidak pernah mendapat TTY (perintah untuk pengguna pun pasti gagal) → diganti `bun run --cwd apps/api bootstrap:super-admin`. Percobaan gagal tidak meninggalkan data (Auth 0 user, DB 0 akun/audit, dicek).
- **Verifikasi:** MCP `auth.users` = 1 (terkonfirmasi); DB lokal 1 akun Utama aktif + 1 audit; jalan ulang → `ditemukan` + `unchanged` tanpa prompt; `bun run typecheck` ✔, `bunx biome ci .` ✔, `bun run test` ✔ (shared 10, api 71, web 8; test bootstrap otomatis dilewati di DB yang sudah punya Utama, tetap berjalan penuh di CI).
- **Catatan:** password Super Admin tertulis di riwayat percakapan & tergolong lemah → ganti lewat reset password setelah halaman login ada. Akun Utama baru ada di DB **lokal**; DB staging menunggu migrasi `iam` (rantai PR) lalu bootstrap ke DB staging.

### 2026-09-28 — Fase 1: ganti pengirim SMTP staging
- **Dikerjakan:** atas permintaan pemilik projek, pengirim diganti ke `admin.arthasia@gmail.com` (App Password baru). Uji login `smtp.gmail.com:587` STARTTLS → `235 2.7.0 Accepted`. Tidak ada email dikirim; password hanya di env proses.
- **Keputusan:** **D-032** menggantikan D-031. OD-5 tetap terbuka untuk akun final produksi.
- **File berubah:** `docs/PLAN.md`, `docs/CODEMAP.md`, `docs/PROGRESS.md`.
- **Uji kirim langsung (diizinkan):** `admin.arthasia@gmail.com` → `oatse2458@gmail.com`, subjek `[HRIS Staging] Uji SMTP akun admin.arthasia`, diterima server (`refused: none`, Message-ID `<179058203763.358775.5107073056780962564@gmail.com>`).
- **SMTP dashboard Supabase:** diisi pemilik projek (log 07:18 UTC: limiter email 2/1h → 30). Dua undangan ke `oatse2458@gmail.com` (07:20 UTC) gagal `534 5.7.9 Application-specific password required` → password di dashboard bukan App Password; 0 user tertinggal. Menunggu isi ulang password & uji undangan ulang.
- **Dikonfirmasi pemilik projek:** email uji langsung dari Gmail sampai di penerima (SMTP Google aman).
- **Undangan lewat Supabase Auth ✔:** 07:55:27 masih `534` (sebelum simpan ulang); konfigurasi dimuat ulang 07:57:43; undangan 07:58:04 → **200** tanpa error SMTP. `auth.users`: 1 user `oatse2458@gmail.com` (invited, belum konfirmasi, id `cbce96f7-…`).
- **Catatan:** user uji memakai alamat utama (bukan plus-addressing PLAN §3.3); bila dipakai sebagai akun HRIS uji, pertimbangkan alamat `+stg-…`.
- **Pembersihan (atas permintaan pemilik projek):** user uji `oatse2458@gmail.com` (`cbce96f7-…`, tanpa akun HRIS) dihapus via MCP `delete … returning`; setelahnya `auth.users`, `auth.identities`, `auth.sessions`, `auth.one_time_tokens` = 0. Bootstrap Super Admin tertunda: `SUPABASE_SERVICE_ROLE_KEY` di `.env` masih kosong.
- **Catatan:** kedua App Password (lama & baru) tertulis di riwayat percakapan; App Password akun lama `rizqy2458@gmail.com` sebaiknya dicabut karena tidak dipakai lagi.

### 2026-09-28 — Fase 1: SMTP staging sementara (Gmail pribadi)
- **Dikerjakan:** uji login `smtp.gmail.com:587` STARTTLS dengan `rizqy2458@gmail.com` + App Password → `235 2.7.0 Accepted`; email uji `[HRIS Staging] Uji konfigurasi SMTP` ke `oatse2458@gmail.com` diterima server (`refused: none`, Message-ID `<179057924112.311008.4072610455888119196@gmail.com>`). Password hanya lewat env proses, tidak ditulis ke file/repo/secret.
- **Keputusan:** **D-031** (pengirim sementara staging = Gmail pribadi; ganti sebelum produksi). OD-5 tetap terbuka untuk akun final.
- **Penyesuaian rencana:** uji lewat Supabase Auth diganti uji SMTP langsung, karena SMTP dashboard belum diisi & Auth staging belum punya user (reset password hanya ke user yang ada).
- **File berubah:** `docs/PLAN.md`, `docs/CODEMAP.md`, `docs/PROGRESS.md`.
- **Belum diverifikasi:** email sampai di kotak masuk penerima (dicek pemilik projek); pengiriman lewat Supabase Auth (setelah dashboard diisi + ada user, mis. setelah bootstrap).
- **Catatan:** App Password tertulis di riwayat percakapan; cabut & buat ulang sebelum produksi. Batas Gmail pribadi ± 500 email/hari.

### 2026-09-28 — Fase 2 (sebagian): fondasi akses
- **Dikerjakan (rencana 7 poin, disetujui):** skema `iam` (accounts, permission_grants) & `audit` (audit_logs) + migrasi `20260928065300_add_iam_and_audit` (index unik parsial Utama, 2 CHECK); `core/auth` (verifier JWKS ES256 + `authenticate`); `core/access` (aturan murni + `loadActor`/`requireRole`/`requirePermission`, TDD); modul `iam` + `GET /api/v1/me`; `core/audit` (`writeAudit`); `core/supabase-admin` + script `bootstrap-super-admin` (logika di service iam); env & dokumen.
- **Keputusan (dalam rencana yang disetujui):** JWT valid tanpa akun aktif → 401 "akun tidak aktif"; `core/access` tidak meng-import modul (pemuat aktor disuntikkan app) untuk mencegah siklus; `SUPABASE_URL` wajib kecuali `NODE_ENV=test`; grant hanya berlaku bila boleh diberikan ke role pemiliknya; bootstrap membuat user Auth terkonfirmasi (tanpa email undangan, karena SMTP menunggu OD-5).
- **File berubah:** `apps/api/prisma/schema/{iam,audit,employee}.prisma`, migrasi baru, `apps/api/src/core/{auth/*,access/*,audit.ts,supabase-admin.ts}`, `apps/api/src/modules/iam/*`, `apps/api/src/{app.ts,env.ts}`, `apps/api/scripts/bootstrap-super-admin.ts`, `apps/api/tests/{helpers/auth.ts,integration/iam/*,integration/iam-schema.test.ts,integration/audit.test.ts}`, `package.json` (script), `.env.example`, `docs/erd/hris.dbml`, `docs/CODEMAP.md`, `docs/PROGRESS.md`, skill `hris-flow-testing`. Dependensi baru api: `jose` 6.2.12, `@supabase/supabase-js` 2.117.2.
- **Verifikasi:** `bun run typecheck` ✔ · `bunx biome ci .` ✔ · `bun run check:boundaries` ✔ (75 modul) · `bun run db:check` ✔ · `bun run test` ✔ (shared 10, api 71, web 8) · tidak ada sisa data test · smoke `bun run dev:api`: `/me` tanpa token 401, token ES256 bertanda tangan kunci asing 401 (verifier Supabase asli), `/me` di OpenAPI · `bootstrap:super-admin --dry-run` ✔.
- **Belum diverifikasi:** token asli Supabase staging (butuh login/halaman login); jalan nyata `bootstrap-super-admin` ke Auth staging (butuh `SUPABASE_SERVICE_ROLE_KEY` & izin); migrasi `iam`/`audit` & index `parent_id` belum di staging (butuh rantai PR).
- **Berikutnya:** izin commit/push/PR; bootstrap nyata; CRUD employee (tim MANAGER di `core/access`).

### 2026-09-28 — Skill alur kerja `hris-workflow` (grill 9 pertanyaan)
- **Dikerjakan:** sesi grill dengan pemilik projek, lalu skill `.claude/skills/hris-workflow/` (SKILL.md + TEMPLATES.md); rujukan di `CLAUDE.md` & PROMPT §2.
- **Keputusan (proses kerja):** berlaku untuk setiap tugas; laporan akhir "hasil dulu" (Ringkasan → Yang dikerjakan → Hasil verifikasi → Temuan & keputusan → Butuh dari Anda → Langkah berikutnya); status singkat per poin lalu lanjut otomatis (berhenti hanya untuk OD, aksi keluar, cek gagal); checklist PROGRESS per poin, §2 & log di akhir; langkah baru = sub-item fase aktif "(tambahan YYYY-MM-DD)", di luar fase → Backlog; verifikasi relevan per poin + penuh sebelum selesai; **rencana selalu menunggu persetujuan** (kecuali pertanyaan/penjelasan & pemeriksaan read-only); **setiap aksi keluar ditanya tepat sebelum dijalankan**; temuan di luar cakupan diusulkan, tidak langsung dikerjakan.
- **File berubah:** `.claude/skills/hris-workflow/*`, `CLAUDE.md`, `docs/PROMPT.md`, `docs/CODEMAP.md`, `docs/PROGRESS.md`.
- **Verifikasi:** dokumen saja; grep konsistensi rujukan `hris-workflow`; `bunx biome ci .`.
- **Berikutnya:** (menunggu persetujuan) commit; OD-9; rencana fondasi akses → CRUD employee.

### 2026-09-28 — Fase 1: staging bersih dari advisor ERROR; percobaan ulang proteksi `main`
- **Dikerjakan:** commit `df46af2` → CI ✔ → PR #3 ke `HRIS/debug/database` (merge `e924fa0`, CI ✔) → PR #4 ke `HRIS/debug/fe-be` (merge `d550170`) → `Deploy staging` run #36386402931 ✔. MCP: RLS `public._prisma_migrations` aktif, 3 migrasi tercatat; advisor security tinggal INFO `rls_enabled_no_policy` (disengaja). Advisor performa: FK `departments.parent_id` tanpa index → migrasi `20260928062734_add_departments_parent_id_index` (lokal ✔, `db:check` ✔; ke staging bersama rantai PR berikutnya). INFO `unused_index` wajar (DB kosong).
- **Proteksi `main`:** pemilik projek meminta proteksi (akun pribadi GitHub Pro). Dicoba ulang: tetap 403 karena repo milik organisasi berpaket Free; OD-9 tetap terbuka. `main` tidak berubah.
- **Berikutnya:** OD-9 (upgrade organisasi ke Team atau alternatif); fondasi akses → CRUD employee.

### 2026-09-28 — Fase 1: migrasi pertama ke staging & perbaikan advisor
- **Dikerjakan:** commit `c62c059` → CI hijau → PR #1 ke `HRIS/debug/database` (merge `41b6b9e`, CI hijau) → PR #2 ke `HRIS/debug/fe-be` (merge `d123237`) → workflow `Deploy staging` run #36385730691 sukses: 2 migrasi diterapkan, `db:check` tanpa selisih. `main` tidak disentuh (instruksi pemilik projek: `main` hanya atas permintaannya).
- **Verifikasi staging via MCP (read-only):** 10 skema modul; `organization` 5 tabel, `employee` 6 tabel; `_prisma_migrations` 2 baris selesai; `anon`/`authenticated` tanpa USAGE pada skema `employee`/`organization`/`iam`. Advisor security: **1 ERROR** `rls_disabled_in_public` pada `public._prisma_migrations`.
- **Perbaikan:** migrasi `20260928061939_enable_rls_on_prisma_migrations` (RLS tanpa policy, bersyarat `to_regclass`, portabel) — lokal: diterapkan, `relrowsecurity = t`, rerun "Already in sync", `db:check` ✔. Bug workflow: `bunx --cwd apps/api` dibaca Bun sebagai paket (tarball 404, tertutup `|| true`) → diganti `working-directory`; pola yang sama di skill Playwright diperbaiki.
- **Berikutnya:** alirkan perbaikan ke `HRIS/debug/fe-be`, pastikan advisor bersih; fondasi akses → CRUD employee.

### 2026-09-28 — Fase 1: koneksi staging & secret deploy
- **Dikerjakan:** host direct `db.iwgzuwcxsxnbjibhbqgh.supabase.co` terbukti **IPv6 saja** (tidak bisa dari runner GitHub). Mencari cluster pooler: tenant tidak ada di `aws-0/1-ap-southeast-2`; ditemukan di **`aws-0-ap-northeast-2`** (Seoul), cocok dengan string *Shared pooler* dari dashboard. Uji `select` read-only: port 5432 (session) ✔ & 6543 (transaction) ✔, PostgreSQL 17.6. `prisma migrate status` lewat session pooler ✔ (2 migrasi belum diterapkan, sesuai harapan). Secret repository `STAGING_DIRECT_URL` diisi (session pooler, port 5432) via `gh secret set` dari stdin.
- **Keputusan:** koreksi D-029: region staging **ap-northeast-2 (Seoul)**, bukan Sydney. Migrasi memakai port 5432 (session); port 6543 (transaction) untuk `DATABASE_URL` runtime Vercel nanti.
- **Masalah / catatan:** password DB staging tertulis di riwayat percakapan & lemah; pemilik projek memilih tetap memakainya untuk staging (data dummy saja). **Wajib diganti** (Reset database password → perbarui secret) sebelum ada data asli atau bila staging dipakai lebih luas.
- **Berikutnya:** commit; PR berantai ke `HRIS/debug/fe-be`; pantau `Deploy staging`; verifikasi via MCP.

### 2026-09-28 — Fase 1: OD-7 terjawab, workflow deploy staging
- **Dikerjakan:** `.github/workflows/deploy-staging.yml` (job `migrate`: cek secret → install → `db:deploy` → `db:check`; job `vercel`: Deploy Hook opsional setelah migrasi). Region staging dicatat di D-029 (kemudian dikoreksi menjadi Seoul).
- **Keputusan:** **D-030** (OD-7 = opsi A, GitHub Actions + repository secret + session pooler).
- **File berubah:** `.github/workflows/deploy-staging.yml`, `docs/PLAN.md`, `docs/CODEMAP.md`, `docs/PROGRESS.md`, `.claude/skills/hris-db-schema/SKILL.md`.
- **Verifikasi:** YAML kedua workflow terbaca (`Bun.YAML.parse`); simulasi langkah workflow di database kosong `hris_deploy_probe` tanpa `.env` (hanya `DIRECT_URL`): 2 migrasi diterapkan, `db:check` "No difference detected", deploy ulang "No pending migrations", DB probe dihapus. Workflow belum pernah jalan di GitHub.
- **Berikutnya:** pemilik projek mengisi secret; commit; PR berantai ke `HRIS/debug/fe-be`; verifikasi staging via MCP (read-only) + advisor.

### 2026-09-28 — Fase 1: penetapan project Supabase staging
- **Dikerjakan:** pemilik projek memeriksa dashboard (screenshot: org `Work` Free, project `HRIS Project`, branch `main` berlabel PRODUCTION bawaan) dan mengatur: sign-up mandiri mati, Redirect URL lokal, Exposed schemas hanya `public` & `graphql_public`.
- **Keputusan:** **D-029**: `HRIS Project` = staging (region diterima; lihat koreksi Seoul di entri berikutnya); produksi project terpisah di Singapura menjelang Rilis 1.
- **File berubah:** `docs/PLAN.md`, `docs/PROGRESS.md`.
- **Verifikasi:** pengaturan dashboard dikonfirmasi pemilik projek (tidak terbaca lewat MCP). Region dilaporkan ap-southeast-2 (Sydney); kemudian terbukti ap-northeast-2 (Seoul).
- **Berikutnya:** commit; OD-7 lalu `db:deploy` ke staging.

### 2026-09-28 — Supabase MCP terhubung & pemeriksaan project
- **Dikerjakan:** OAuth MCP untuk entri `.mcp.json` (URL berbeda dari entri scope user, token terpisah). Pemeriksaan read-only project `iwgzuwcxsxnbjibhbqgh` via MCP: `select version()`, daftar skema, `list_migrations`, `list_tables`, `list_extensions`, `get_advisors` (security & performance).
- **Hasil:** PostgreSQL 17.6 (cocok dengan lokal/CI 17), TZ UTC; skema bawaan Supabase saja (auth, extensions, graphql, graphql_public, pgbouncer, public, realtime, storage, vault); belum ada migrasi/tabel aplikasi; 0 user Auth; extension terpasang hanya bawaan (pgcrypto, uuid-ossp, pg_stat_statements, supabase_vault, plpgsql); advisor kosong. Tidak ada perubahan yang dibuat di project.
- **Catatan:** konfigurasi Auth (self sign-up, Redirect URLs), bucket Storage, dan *Exposed schemas* Data API tidak terbaca lewat MCP; cek manual di dashboard. Belum dikonfirmasi pemilik projek bahwa project ini adalah **staging**.
- **Berikutnya:** konfirmasi staging & pengaturan dashboard; commit; OD-7 lalu `db:deploy`; fondasi akses → CRUD employee.

### 2026-09-28 — OD-10 terjawab & seed dummy employee management
- **Dikerjakan:** keputusan role dicatat; seed dummy idempoten `apps/api/prisma/seed/{organization,employee}.ts` + unit test `tests/seed.test.ts`; env `SEED_EMAIL_BASE`.
- **Keputusan:** **D-028** (menjawab OD-10): satu akun satu role, kolom enum `iam.accounts.role`; hak layanan diri berasal dari keterhubungan akun ke data karyawan. D-007 bagian "role tambahan" ditandai diganti. PLAN §4.1, CODEMAP §6.1, `docs/erd/hris.dbml`, skill `hris-db-schema/ERD.md` diselaraskan.
- **File berubah:** `docs/PLAN.md`, `docs/CODEMAP.md`, `docs/PROGRESS.md`, `docs/erd/hris.dbml`, `.claude/skills/hris-db-schema/ERD.md`, `apps/api/prisma/seed/*`, `apps/api/tests/seed.test.ts`, `.env.example`.
- **Verifikasi:** `bun run db:seed` 3× → jumlah baris identik (5 dept, 12 jabatan, 4 status, 5 grade, 2 lokasi, 15 karyawan, 15 data pribadi, 15 rekening, 10 keluarga, 15 pendidikan, 4 pelatihan); NIK 16 digit, +40 untuk perempuan; relasi atasan terisi; plus-addressing dicoba dengan `SEED_EMAIL_BASE` lalu dikembalikan kosong. `bun run typecheck` ✔, `bunx biome ci .` ✔, `bun run check:boundaries` ✔, `bun run db:check` ✔, `bun run test` ✔ (shared 10, api 25, web 8). Belum di-commit.
- **Masalah / catatan:** MCP Supabase terhubung lewat entri scope user yang tidak dibatasi project (lihat §2).
- **Berikutnya:** commit; rapikan scope MCP & pastikan project staging; fondasi akses (`core/auth` + verifier test, `core/access` dengan satu role) → CRUD employee + policy + test; QA plan minggu ini.

### 2026-09-28 — Target mingguan: skema ERD employee management, skill projek, Supabase MCP
- **Dikerjakan:**
  - ERD dari pemilik projek diterjemahkan ke Prisma: `organization.prisma` (5 tabel) & `employee.prisma` (6 tabel + 4 enum), migrasi `20260928035758_add_organization_and_employee_master`, integration test constraint `tests/integration/employee-schema.test.ts`.
  - 4 skill projek di `.claude/skills/`: `hris-db-schema`, `hris-flow-testing`, `hris-e2e-playwright`, `hris-qa-docs`; `CLAUDE.md` menunjuk ke skill ini.
  - MCP Supabase di `.mcp.json` (URL dari pemilik projek, `project_ref=iwgzuwcxsxnbjibhbqgh`) + skill resmi `supabase` & `supabase-postgres-best-practices` (`npx skills add supabase/agent-skills`, disalin, ditinjau: hanya Markdown).
- **Keputusan:** D-026 (ERD jadi model data dengan penyesuaian), D-027 (target mingguan: skema karyawan lebih awal; endpoint tetap menunggu fondasi akses). OD baru: OD-10 (bentuk role). PLAN §4.2 `employee.personal.read` kini mencakup agama & data keluarga.
- **File berubah:** `apps/api/prisma/schema/{organization,employee}.prisma`, migrasi baru, `apps/api/tests/integration/employee-schema.test.ts`, `packages/shared/src/permissions.ts` (label), `.claude/skills/*`, `.mcp.json`, `skills-lock.json`, `CLAUDE.md`, `docs/erd/hris.dbml`, `docs/PLAN.md`, `docs/CODEMAP.md`, `docs/PROGRESS.md`.
- **Verifikasi:** `bunx prisma validate` ✔; migrasi diterapkan, rerun "Already in sync", `bun run db:check` "No difference detected"; SQL migrasi tanpa `auth.`/`storage.`/`EXTENSION`; `bun run typecheck` ✔; `bunx biome ci .` ✔; `bun run check:boundaries` ✔; `bun run test` ✔ (shared 10, api 21 termasuk 6 test constraint ERD, web 8); tidak ada sisa data test di DB; argumen `bun run db:migrate -- --create-only --name ...` terbukti diteruskan ke Prisma. Belum di-commit.
- **Masalah / catatan:**
  - Prisma 7 `migrate dev` **tidak** menjalankan `generate` otomatis; test gagal sampai `bun run db:generate` dijalankan (dicatat di skill `hris-db-schema`).
  - `PrismaPromise` bukan `Promise`: `expect(q).rejects` tanpa dibungkus & tanpa `await` bisa lolos palsu; diperbaiki dan dicatat di skill.
  - Skill resmi `supabase` menyarankan perubahan skema lewat MCP/CLI; bertentangan dengan D-003, jadi `hris-db-schema` & `CLAUDE.md` menyatakan aturan projek yang menang.
  - Autentikasi OAuth MCP Supabase belum dilakukan (butuh browser pemilik projek); belum dipastikan apakah project `iwgzuwcxsxnbjibhbqgh` adalah staging.
- **Persetujuan:** pemilik projek meninjau diagram DBML di dbdiagram.io dan menyetujuinya; disimpan di `docs/erd/hris.dbml`.
- **Berikutnya:** OAuth MCP; seed dummy organization & employee; fondasi akses (`core/auth` verifier + `core/access`, OD-10) agar CRUD employee bisa dibuat dengan policy; QA plan minggu ini di `docs/qa/`.

### 2026-09-28 — Fase 1: fondasi monorepo, api, web, Prisma, CI
- **Dikerjakan:** item Fase 1 berikut selesai & terverifikasi di Linux: root config, PostgreSQL lokal, `packages/shared`, `apps/api` (core + health + OpenAPI + docs), Prisma 7 + migrasi awal 10 skema, `apps/web` (layout kosong + status API), dependency-cruiser, test, Dockerfile, `bun run dev` di Linux. Sebagian: branch debug (proteksi `main` gagal), workflow CI (belum jalan di GitHub), `vercel.json` (project belum ada).
- **Keputusan:** Fase 0 dianggap disetujui (pemilik projek meminta mulai Fase 1). OD baru: **OD-9** (proteksi `main`). Pilihan teknis (bukan OD):
  - **TypeScript 6.0.3**, bukan 7.x: TS 7 (port Go) tidak lagi menyediakan compiler API JS yang dipakai dependency-cruiser.
  - **Prisma 7.10.0** dikunci (npm `latest` sudah 8.0.0-rc; D-003 menetapkan Prisma 7).
  - Versi paket dikunci persis (tanpa `^`); Bun 1.4.2 lewat `packageManager`.
  - Satu `.env` di root untuk semua workspace.
  - `GET /api/v1/health` mengembalikan **503** dengan envelope `data` (status `degraded`) bila DB tidak terjangkau, supaya monitor bisa membedakan API hidup vs DB putus.
  - Komponen shadcn memakai `cn` lokal (`@/lib/utils`); CLI shadcn 4.21 sempat menambah paket npm `cn`, dihapus.
- **File berubah:** root (`package.json`, `bun.lock`, `biome.json`, `.dependency-cruiser.cjs`, `tsconfig.base.json`, `tsconfig.depcruise.json`, `.editorconfig`, `.gitattributes`, `.gitignore`, `.dockerignore`, `.env.example`, `docker-compose.yml`), `.github/workflows/ci.yml`, `packages/shared/`, `apps/api/`, `apps/web/`, `docs/PLAN.md` (OD-9), `docs/CODEMAP.md`, `docs/PROGRESS.md`, `README.md` (mulai cepat).
- **Verifikasi (Linux, Bun 1.4.2, Docker 29.8, PostgreSQL 17.11):**
  - `bun run typecheck` ✔ (shared, api, web) · `bunx biome ci .` ✔ · `bun run check:boundaries` ✔ (56 modul, 0 pelanggaran)
  - `bun run test` ✔: shared 10, api 15 (termasuk integration ke PostgreSQL lokal), web 8
  - `bun run db:migrate` ✔ migrasi awal; rerun "Already in sync"; `bun run db:check` "No difference detected"
  - Uji manual: `bun run dev` → `/api/v1/health` 200, 503 saat container DB dihentikan lalu pulih 200; 404 envelope + `X-Request-Id` dipantulkan; `/openapi.json` & `/docs` 200; CORS hanya `http://localhost:5173`; web 5173 + fallback SPA 200
  - Ke-14 aturan dependency-cruiser dibuktikan dengan file yang sengaja melanggar (3 putaran); semua menangkap pelanggaran, lalu file dihapus
  - Clone bersih (hanya file yang akan di-commit) + `bun install --frozen-lockfile` → postinstall generate, typecheck, boundaries, test ✔ tanpa `.env`
  - `bun run build` (api & web) ✔; bundle api jalan mandiri tanpa `node_modules`; `docker build -f apps/api/Dockerfile .` ✔, container *healthy* sebagai user non-root
- **Masalah / catatan:**
  - Bug ditemukan test & diperbaiki: api client web menangkap `fetch` saat modul dimuat, sehingga `fetch` global yang diganti diabaikan.
  - Bug konfigurasi ditemukan & diperbaiki: `exclude: /dist/` di dependency-cruiser ikut membuang semua paket npm (`node_modules/.../dist/`), sehingga aturan yang melibatkan paket npm diam-diam tidak jalan.
  - Prisma menolak `migrate reset` yang dijalankan AI agent tanpa persetujuan eksplisit pengguna (env `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`). Setelah pemilik projek mengizinkan, `bun run db:reset` ✔ (migrasi ulang + seed, 10 skema, `db:check` tanpa selisih).
  - Bun belum di PATH fish: jalankan `fish_add_path ~/.bun/bin` (installer hanya menambahkan ke `~/.zshrc`).
  - Tidak ada lagi `baseUrl` di tsconfig web (deprecated di TS 6); alias `@/*` memakai `paths` saja.
  - Variabel Supabase/SMTP/cron masih opsional di `env.ts`; wajibkan di Fase 2.
- **CI GitHub:** setelah push, run #36375129344 hijau (job `quality` & `api-db`).
- **Berikutnya:** lihat §2 Fokus Saat Ini (Supabase staging, OD-7, Vercel, Windows, OD-9).

### 2026-09-28 — Fase 0: ganti penyedia email ke Google Workspace
- **Dikerjakan:** mengganti rencana SMTP dari Resend ke SMTP Google Workspace kantor di PLAN, CODEMAP, PROGRESS.
- **Keputusan:** D-025 menggantikan D-024. OD-5 tinggal akun pengirim & izin App Password (sebelum uji undangan Fase 2); pertanyaan kuota produksi dihapus karena batas Workspace cukup.
- **File berubah:** `docs/PLAN.md`, `docs/CODEMAP.md`, `docs/PROGRESS.md`.
- **Verifikasi:** perubahan dokumen saja; grep memastikan tidak ada rujukan Resend yang masih berlaku.
- **Berikutnya:** minta admin IT membuat akun pengirim (OD-5), jawab OD-7, review akhir → branch kerja → Fase 1.

### 2026-09-28 — Fase 0: review dokumen pasca D-023 & keputusan email
- **Dikerjakan:** review menyeluruh dokumen instruksi; menyelaraskan alur dengan database lokal (D-023): aturan portabilitas migrasi, tidak ada FK/skema `auth` lokal, Data API tidak mengekspos skema modul, bootstrap cari/buat user Auth, plus-addressing untuk akun uji, redirect URL lokal, cron manual di lokal, CI dengan service container Postgres, E2E di lokal + Auth staging.
- **Keputusan:** D-024 (Resend SMTP free plan untuk Auth & email aplikasi). OD-5 sebagian terjawab (sisa domain & kuota). OD baru: OD-7 (cara `db:deploy`), OD-8 (rollback & backup). Skema `auth` tiruan di lokal dipertimbangkan dan **tidak** dipakai (FK lokal tidak menjaga apa pun, dan skema `auth` dikelola Supabase).
- **File berubah:** `docs/PLAN.md` (v1.1), `docs/CODEMAP.md`, `docs/PROMPT.md`, `docs/PROGRESS.md`, `README.md`.
- **Verifikasi:** perubahan dokumen saja; dicek konsistensi antar-file dengan grep.
- **Berikutnya:** jawab OD-7, review akhir → buat branch kerja → Fase 1.

### 2026-09-28 — Fase 0: revisi database development
- **Dikerjakan:** mengganti Supabase CLI lokal dengan PostgreSQL 17 di container Docker; Auth & Storage saat develop memakai Supabase staging.
- **Keputusan:** D-023. Konsekuensi: tidak ada FK ke `auth.users`; develop butuh internet; project staging dibuat di Fase 1.
- **File berubah:** `docs/PLAN.md`, `docs/CODEMAP.md`, `docs/PROMPT.md`, `docs/PROGRESS.md`.
- **Verifikasi:** belum ada kode; perubahan dokumen saja.
- **Berikutnya:** review dokumen → buat branch kerja → Fase 1.

### 2026-09-25 — Fase 0: grill keputusan & file instruksi
- **Dikerjakan:** sesi grill 28 pertanyaan, lalu menulis `docs/PLAN.md`, `docs/CODEMAP.md`, `docs/PROGRESS.md`, `docs/PROMPT.md`, `CLAUDE.md`, dan memperbarui `README.md`.
- **Keputusan:** D-001 s.d. D-022 (PLAN §8). Perubahan besar dari brief awal:
  - microservice → **modular monolith**
  - Drizzle → **Prisma 7**
  - Vanilla JS → **TypeScript**
  - Docker produksi → **Vercel** (Docker hanya lokal)
  - Auth sendiri → **Supabase Auth**
- **Keputusan terbuka:** OD-1 s.d. OD-6.
- **File berubah:** `docs/*`, `CLAUDE.md`, `README.md`.
- **Verifikasi:** belum ada kode; menunggu review pemilik projek.
- **Berikutnya:** review dokumen → buat branch kerja → Fase 1.

<!--
### YYYY-MM-DD — Fase N: <judul singkat>
- **Dikerjakan:** apa yang selesai (rujuk item checklist).
- **Keputusan:** D-xxx baru atau OD yang terjawab.
- **File berubah:** file/folder utama.
- **Verifikasi:** perintah yang dijalankan (typecheck/lint/test/manual) dan hasilnya.
- **Masalah / catatan:** bug, workaround, hal yang perlu diwaspadai.
- **Berikutnya:** langkah konkret sesi selanjutnya.
-->
