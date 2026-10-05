# CODEMAP — HRIS

> **Fungsi file ini:** peta **di mana** setiap hal berada: struktur folder, modul, tabel, endpoint, izin, env var, dan script.
> Baca bagian yang relevan **sebelum** membuat atau mencari file. **Wajib diperbarui** setiap kali ada folder, modul, tabel, endpoint, izin, atau env var baru (lihat §10).

**Status:** `[planned]` belum dibuat · `[wip]` sedang dikerjakan · `[done]` selesai & teruji

| Metadata        | Nilai                                                        |
| --------------- | ------------------------------------------------------------ |
| Terakhir diubah | 2026-10-02 (D-050: unit organisasi berjenjang & level jabatan) |
| Kondisi repo    | Fase 1 hampir selesai (sisa uji Windows); Fase 2 IAM review; Fase 3–4 berjalan (modul `organization` baca, `employee` + foto profil + print). Staging live (D-036) |

---

## 1. Struktur Root

```
HRIS/
├── apps/
│   ├── api/                          [wip] Backend Bun + Hono + Prisma (Vercel project "api")
│   └── web/                          [wip] Frontend React + Vite (Vercel project "web")
├── packages/
│   └── shared/                       [done] @hris/shared: skema Zod DTO, enum, kode role & izin
├── docker-compose.yml                [done] PostgreSQL 17 lokal untuk development & test (D-023); TZ=UTC, port hanya 127.0.0.1. Versi major dicocokkan ulang saat project staging dibuat
├── e2e/                              [planned] Test Playwright
├── docs/
│   ├── PLAN.md                       [done] Apa & kenapa
│   ├── CODEMAP.md                    [done] Di mana (file ini)
│   ├── PROGRESS.md                   [done] Sampai mana
│   ├── PROMPT.md                     [done] Bagaimana bekerja
│   ├── design/import-karyawan.md     [done] D-042 (lokal, §10 penyempurnaan): desain import CSV/Excel (profil file kantor, mesin deteksi, API, data, UI, test)
│   ├── erd/hris.dbml                 [done] Diagram ERD (DBML, buka di dbdiagram.io); cermin skema Prisma, disetujui pemilik projek 2026-09-28 (+ D-035: category, exit_reason, employment_histories)
│   └── qa/                           [wip] Dokumentasi QA (skill hris-qa-docs): README (indeks), plans/, cases/, runs/, bugs/
├── .github/workflows/ci.yml          [done] Job `quality` (typecheck, biome ci, boundaries, test shared & web, build) + job `api-db` (service Postgres 17: db:deploy dari DB kosong, db:check drift, test api). Hijau di GitHub
├── .github/workflows/deploy-staging.yml [done] D-030: push ke `HRIS/debug/fe-be` → `db:deploy` + `db:check` ke Supabase staging (secret `STAGING_DIRECT_URL`), lalu job `vercel-api` → `vercel-web` (D-036: Vercel CLI `pull/build/deploy --prebuilt --prod`; urutan dijamin `needs`, 2026-09-29). Migrasi pertama sukses 2026-09-28 (run #36385730691); deploy Vercel pertama yang berfungsi 2026-09-29 (run #36531510460)
├── .claude/skills/                    Skill Claude Code projek (dimuat otomatis)
│   ├── hris-workflow/                [done] Aturan alur kerja & laporan untuk setiap tugas (hasil grill 2026-09-28)
│   ├── hris-db-schema/               [done] Alur skema Prisma, ERD → Prisma, batas Supabase MCP
│   ├── hris-e2e-playwright/          [done] Konvensi & templat Playwright (setup e2e/ saat pertama dipakai)
│   ├── hris-flow-testing/            [done] Test flow API & matriks akses (TDD)
│   ├── hris-qa-docs/                 [done] Templat docs/qa/: plan, case, run, bug + arsip QA fitur LEGIT ke Google Drive (`rclone sync` ke remote `hris-qa:`, satu folder per fitur; 2026-09-30)
│   ├── supabase/                     [done] Skill resmi Supabase (npx skills add supabase/agent-skills); bagian skemanya dikalahkan hris-db-schema
│   └── supabase-postgres-best-practices/ [done] Skill resmi Supabase
├── .mcp.json                         [done] MCP Supabase (HTTP, OAuth; project_ref iwgzuwcxsxnbjibhbqgh). Tanpa rahasia
├── skills-lock.json                  [done] Lock skill dari `npx skills` (sumber & hash)
├── CLAUDE.md                         [done] Penunjuk ke docs/PROMPT.md untuk AI agent
├── README.md                         [done] Ringkasan + tautan ke docs
├── package.json                      [done] Bun workspaces + script global (packageManager bun@1.4.2)
├── bun.lock                          [done] Lockfile (di-commit; CI memakai --frozen-lockfile)
├── biome.json                        [done] Lint & format (spasi 2, LF, lebar 100; noExplicitAny & noConsole = error)
├── .dependency-cruiser.cjs           [done] Aturan batas modul, layer modul, batas workspace, no-circular, dev-dep
├── tsconfig.depcruise.json           [done] Hanya untuk dependency-cruiser (resolusi alias `@/*` web)
├── tsconfig.base.json                [done] Konfigurasi TS bersama (strict, noUncheckedIndexedAccess, bundler resolution)
├── .editorconfig                     [done]
├── .gitattributes                    [done] Paksa LF (dual boot Linux/Windows)
├── .gitignore                        [done]
├── .dockerignore                     [done] Konteks build `apps/api/Dockerfile`
└── .env.example                      [done] Daftar env var tanpa nilai rahasia (disalin ke `.env` di root)
```

---

## 2. `apps/api`

```
apps/api/
├── prisma/
│   ├── schema/                       [wip] Skema Prisma multi-file; model ditambahkan per fase (file modul yang belum ada = `[planned]`)
│   │   ├── _base.prisma              [done] generator (prisma-client, runtime bun, output src/generated/prisma) + datasource (10 skema Postgres)
│   │   ├── iam.prisma               [done] accounts (enum `Role`, D-028), permission_grants, account_companies (D-040)
│   │   ├── organization.prisma      [done] companies (D-039), departments, positions, employment_statuses (+ enum `EmploymentCategory` 7 nilai, D-035/D-038), grades, work_locations (ERD, D-026)
│   │   ├── employee.prisma          [done] employees (+ `exit_reason`), employee_personal, employee_bank_accounts, family_members, educations, trainings, employment_histories + enum (ERD D-026, D-035)
│   │   ├── attendance.prisma        [planned] Fase 5
│   │   ├── leave.prisma             [planned] Fase 6
│   │   ├── approval.prisma          [planned] Fase 5
│   │   ├── contract.prisma          [planned] Fase 7
│   │   ├── payroll.prisma           [planned] Fase 8
│   │   ├── notification.prisma      [done] notifications (dedupe_key), email_outbox + enum status
│   │   └── audit.prisma             [done] audit_logs
│   ├── migrations/                   [wip] Hasil `prisma migrate dev` (di-commit, tidak pernah diedit setelah di-merge)
│   │   ├── 20260928032354_init_module_schemas/  [done] SQL mentah: CREATE SCHEMA untuk 10 skema modul
│   │   ├── 20260928035758_add_organization_and_employee_master/  [done] Tabel ERD organization & employee
│   │   ├── 20260928061939_enable_rls_on_prisma_migrations/  [done] RLS pada `public._prisma_migrations` (advisor Supabase; bersyarat, portabel)
│   │   ├── 20260928062734_add_departments_parent_id_index/  [done] Index FK `departments.parent_id` (advisor performa)
│   │   ├── 20260928065300_add_iam_and_audit/  [done] iam.accounts, iam.permission_grants, audit.audit_logs + index unik parsial Utama + 2 CHECK
│   │   ├── 20260928085157_add_notification/  [done] notification.notifications, notification.email_outbox
│   │   ├── 20260929020000_employee_categories_and_histories/  [done] D-035: enum kategori + `employment_statuses.category` (unik), `employees.exit_reason` + CHECK (hanya saat nonaktif), `employment_histories`, index daftar `(employment_status_id, is_active)` & `(is_active, full_name)`
│   │   ├── 20260929100000_add_employee_photo/  [done] D-037: `employees.photo_path varchar(255)`
│   │   ├── 20260930035548_add_probation_and_vendor_categories/  [done] D-038: `ALTER TYPE EmploymentCategory ADD VALUE 'PROBATION', 'VENDOR'`
│   │   ├── 20260930102336_add_import_and_employee_details/  [done] D-041/D-042 (migrasi rilis 2026-09-30, menggantikan `20260930090116` lokal): kolom tambahan karyawan, enum PTKP/jenjang, `import_jobs` (tanpa `company_id`), `import_job_issues`, `import_mappings`
│   │   ├── 20261001100000_add_companies_and_account_scope/  [done] D-039/D-040 (dipindah dari `20260930061627` agar setelah migrasi rilis, D-043; + `import_jobs.company_id`): `organization.companies` (+ baris ACP), `employees.company_id` (expand → backfill ACP → NOT NULL), riwayat `from/to_company_id` + enum `COMPANY_CHANGED`, `iam.account_companies` (+ akun HR_ADMIN yang ada → ACP)
│   │   └── 20261001092853_add_org_unit_type_and_position_level/  [done] D-050: enum `OrgUnitType` + `departments.unit_type` (default DEPARTMENT), enum `PositionLevel` + `positions.level?` (hanya menambah)
│   └── seed/                         [done] Idempoten (upsert), menolak NODE_ENV=production
│       ├── index.ts                  Runner: organization → employee
│       ├── organization.ts           5 departemen, 12 jabatan, 7 status berkategori (D-038: Karyawan Tetap, Karyawan Percobaan, PKWT, Pekerja Harian, Magang, Outsourcing, Vendor; nama lama "Pegawai Tetap/Tetap/Kontrak (PKWT)/Internship/Daily Worker" diganti, "Masa Percobaan" dihidupkan lagi sebagai Karyawan Percobaan), 5 grade, 2 lokasi
│       └── employee.ts               23 karyawan dummy (5 manajer, 2 nonaktif; + Nadia Putri Percobaan & Yusuf Hidayat Vendor, D-038) + data pribadi/rekening/keluarga/pendidikan/pelatihan fiktif + riwayat HIRED/DEACTIVATED; `work_email` dari SEED_EMAIL_BASE
├── prisma.config.ts                  [done] Memuat `.env` root (dotenv), skema folder, `datasource.url = DIRECT_URL` (dipakai CLI migrate)
├── src/
│   ├── index.ts                      [done] Entry: `export default app` (Vercel & Bun; Bun membaca PORT, default 3000)
│   ├── app.ts                        [done] `createApp(deps?)`: request-id → logger → secure headers → CORS → OpenAPI/health → route modul (dilindungi `protect` = authenticate + loadActor); deps bisa diganti di test (`tokenVerifier`, `actorLoader`); `defaultHook` Zod → 400; `onError`/`notFound` → envelope error; semua respons `/api/*` diberi `Cache-Control: private, no-store` (data per akun/PII tidak di-cache browser/proxy); `selectEmailSender(env, logger)` (NODE_ENV=test selalu log; SMTP hanya bila lengkap); `storagePathPrefix` dari `STORAGE_PATH_PREFIX` diteruskan ke modul employee; D-040: `actorLoader` = iam `loadActor` + employee `withEmployeeCompanyScope`, `configureIam({ employeeScope })`; CORS mengizinkan PUT
│   ├── env.ts                        [done] Validasi env dengan Zod (`getEnv()` lazy, `parseEnv()`); `SUPABASE_URL` wajib kecuali NODE_ENV=test; pesan error tanpa nilai env
│   ├── generated/                    # Client Prisma hasil generate (TIDAK di-commit, tidak diedit; dibuat oleh postinstall)
│   ├── core/                         [wip] Hal lintas modul (bukan logika bisnis domain)
│   │   ├── db.ts                     [done] `getPrisma()` (PrismaPg, pool max 5), `disconnectPrisma()`, `pingDatabase()`
│   │   ├── health.ts                 [done] `GET /api/v1/health` (200 ok / 503 degraded bila DB tidak terjangkau; tetap envelope `data`)
│   │   ├── auth/                     [done] `TokenVerifier`, `createSupabaseVerifier` (JWKS ES256; cek iss, aud=authenticated, role, sub UUID), middleware `authenticate()` → 401
│   │   ├── access/                   [done] `Actor` (+ `companyIds`: null = semua PT, D-040), `isInCompanyScope`, `hasRole`, `hasPermission` (grant hanya untuk role penerima sah), `isGrantActive`, `isSelf`, `isInTeam` (tim = manager_id target = employee aktor, murni tanpa query), middleware `loadActor(loader)` (tanpa akun aktif → 401), `requireRole`, `requirePermission` (→ 403)
│   │   ├── errors.ts                 [done] AppError + ValidationError/UnauthenticatedError/ForbiddenError/NotFoundError/ConflictError/BusinessRuleError
│   │   ├── response.ts               [done] `ok()`, `paginated()`, `dataEnvelope()`, `paginatedEnvelope()`, `ERROR_RESPONSES` (OpenAPI)
│   │   ├── email.ts                  [done] `EmailSender`: `createSmtpSender` (nodemailer, 587 STARTTLS/465 TLS) & `createLogSender` (lokal, hanya penerima+subjek, D-025)
│   │   ├── logger.ts                 [done] Log JSON satu baris ke stdout, `redact()` field sensitif (jaring pengaman), `requestLogger()` (tanpa query string)
│   │   ├── audit.ts                  [done] `writeAudit(entry, client?)`: bisa ikut transaksi; before/after diredaksi (jaring pengaman); `listAuditLogs(filter)`
│   │   ├── storage.ts                [done] D-037: antarmuka `StorageAdmin` (signed upload URL, signed URL baca, info objek, hapus, `ensurePrivateBucket`) + `createSupabaseStorage()` (service role) + `UNCONFIGURED_STORAGE`; konstanta bucket `employee-photos` (2 MB, jpeg/png/webp). Test memakai `tests/helpers/storage.ts` (palsu); `NODE_ENV=test` tidak pernah memakai Storage sungguhan
│   │   ├── supabase-admin.ts         [done] antarmuka `AuthAdmin` (`findUserByEmail`, `inviteUser`, `createConfirmedUser`, `setBanned`) + `createSupabaseAdmin()` (service role; server/script saja) + `UNCONFIGURED_AUTH_ADMIN` (kunci kosong → 422 jelas)
│   │   ├── openapi.ts                [done] Skema keamanan Bearer, `/api/v1/openapi.json` (OAS 3.1), `/api/v1/docs` (Swagger UI)
│   │   └── __tests__/                [done] Unit test app core, env, logger
│   ├── modules/
│   │   ├── iam/                      [done] 13 endpoint (+ `PUT /accounts/:id/companies` D-040: penugasan PT HR, SA saja, audit + notifikasi; HR hanya akun karyawan PT-nya + akun belum tertaut; ganti role dari HR mencabut penugasan; `configureIam`) + fungsi publik untuk employee (`getAccountLinksForEmployees`, `getAccountSummaries`, `listManagerEmployeeIds`, `deactivateAccountOfEmployee`) (akun, role, nonaktif, serah-terima Utama, grant, audit log + `actorEmail`/`entityLabel` lewat `employeeScope.employeeLabels`, `/me`); policy matriks IAM (60 test); `loadActor`; `bootstrapPrimarySuperAdmin`, `recoverPrimarySuperAdmin`, `provisionAccount` (akun uji); notifikasi & web selesai (Fase 2 Review)
│   │   ├── organization/             [done] D-049: `organization-admin.{schema,service,routes}.ts` — kelola 6 master data (daftar admin SA/HR + jumlah karyawan; tambah/ubah/arsip/pulihkan/hapus (FK → 409)/gabungkan; audit; `configureOrganization({ employeeSupport })` dari app.ts), `archivedMasterIndex()` untuk import. D-042: `masterIndex`/`missingMasterData`/`createMissingMasterData` (import; audit `organization.<entity>.create` {source: import}). D-035: `GET /master-data` (perusahaan sesuai cakupan PT — D-040, departemen, jabatan, status+kategori, grade, lokasi aktif; semua role); `getMasterLookup()` + helper `statusIdsForCategories()` (D-038) / departemen untuk modul lain. CRUD master data menyusul Fase 3
│   │   ├── employee/                 [wip] D-035: `GET /employees` (paginasi, filter kategori / grup `?group=` (D-038) / departemen / lokasi / aktif, `q`, sort whitelist; SA/HR semua, MANAGER tim), `GET /employees/summary`, `GET /employees/manager-options`, `GET /org-structure`, `GET /employees/:id?view=work|full|print` (sensitif hanya bila berhak & view=full → audit `employee.sensitive.read`; `print` SA/HR → audit `employee.printed`), `POST /employees`, `PATCH /employees/:id`, `POST /employees/:id/{status-change,deactivate,reactivate}` (riwayat + audit; nonaktif ikut menonaktifkan akun via iam), `POST /employees/:id/photo/upload-url`, `POST|DELETE /employees/:id/photo` (D-037). 13 endpoint, policy 62 test. **Import (D-042, 2026-09-30):** `employee-import.{schema,repository,service,routes}.ts` → `POST /employee-imports/preview` (tanpa menulis), `POST /employee-imports` (201, satu transaksi 120 dtk, `previewHash` basi → 409), `GET /employee-imports[/:id]`, `GET|PUT /employee-imports/mappings/:signature`; policy `canImportEmployees`, `canWriteSensitiveViaImport` (grant `employee.personal.write`/`bank.write`); master data baru lewat `organization` `createMissingMasterData`; `employeeLabels()` untuk label audit log iam
│   │   ├── notification/             [done] `notify()` (in-app + email, tidak pernah melempar, gagal → outbox), `retryEmailOutbox()`, `GET /notifications`, `POST /notifications/:id/read`, `POST /notifications/read-all`; `configureNotification()` dipanggil app
│   │   └── <modul>/                  # lihat §4 untuk struktur standar
│   └── jobs/cron.ts                  [done] `GET /api/cron/grant-expiry`, `GET /api/cron/email-retry`; `Authorization: Bearer ${CRON_SECRET}` (timing-safe; secret kosong → selalu 401)
├── scripts/
│   ├── setup-storage.ts              [done] `bun run storage:setup`: buat/selaraskan bucket private (idempoten) di project Supabase dari `.env`; staging dijalankan 2026-09-29 (D-037)
│   ├── bootstrap-super-admin.ts      [done] `--email <e> [--dry-run]`: cari/buat user Auth (password diketik tersembunyi), lalu `bootstrapPrimarySuperAdmin` di DB target. Jalan nyata ✔ (Utama `admin.arthasia@gmail.com` di DB lokal & DB staging)
│   ├── create-dev-account.ts         [done] Akun UJI (bukan produksi): `DEV_ACCOUNT_PASSWORD=... --email --role HR_ADMIN|MANAGER|EMPLOYEE [--employee-number]` → user Auth terkonfirmasi + akun HRIS tertaut karyawan dummy (`provisionAccount`, audit, idempoten)
│   └── recover-primary-admin.ts      [done] `--to-email <e> --reason "..." [--dry-run]`: pindahkan status Utama ke SUPER_ADMIN aktif + audit (PLAN §4.4)
├── tests/
│   ├── helpers/auth.ts               [done] `testVerifier` (token `test-token:<uuid>[:stale]`, `passwordAuthAt`), `bearer()`, `createAuthFixture(run)` → `loginAs(role, {grants, employeeId, isActive, primary})` → `{account, headers, staleHeaders}` + `cleanup()`
│   ├── helpers/auth-admin.ts         [done] `createFakeAuthAdmin()`: AuthAdmin palsu (mencatat undangan/ban, bisa disetel gagal)
│   ├── helpers/email.ts              [done] `createFakeEmailSender()`: EmailSender palsu (menyimpan pesan, bisa disetel gagal)
│   ├── helpers/storage.ts            [done] `StorageAdmin` palsu untuk test foto (D-037)
│   ├── helpers/company.ts            [done] D-039: `acpCompanyId()` (ACP dari migrasi), `createTestCompany()`
│   └── integration/                  [wip] Test → PostgreSQL lokal: `health.test.ts`, `schemas.test.ts` (10 skema ada), `employee-schema.test.ts` (constraint ERD); `tests/seed.test.ts` (generator NIK/email seed); `iam-schema.test.ts`, `audit.test.ts`, `iam/{me,bootstrap,accounts,grants-audit,recover,provision}.test.ts`, `notification.test.ts` (notify, dedupe, outbox & retry, endpoint, pemicu grant, cron), `organization/master-data.test.ts` (17, D-049: akses SA/HR, validasi, nama unik, arsip/pulihkan/hapus FK → 409, gabungkan jabatan & departemen, siklus induk, status berkategori, aturan perusahaan, dampak ke ubah karyawan & import), `employee/dashboard.test.ts` (agregat + cakupan PT D-040), `iam/companies.test.ts` (D-040), `employee/import.test.ts` (11: preview/commit, CREATE_ONLY vs UPSERT, sel kosong, resign → nonaktif, master data baru, sensitif dilewati tanpa grant, PT wajib, 401/403/400/409; D-042), `employee/photo.test.ts` (upload-url, konfirmasi, hapus, akses, audit; D-037), `employee/employees.test.ts` (20 test: daftar/ringkasan/detail/view=work/tulis/status/nonaktif+akun/aktif kembali/struktur/master data; akses 401/403/404, field sensitif hilang, audit) (test yang butuh DB tanpa Utama otomatis dilewati di DB developer; penuh di CI)
├── Dockerfile                        [done] Multi-stage `oven/bun:1.4.2-alpine`, bundle `bun build`, user non-root, HEALTHCHECK. Build dari root: `docker build -f apps/api/Dockerfile .`
├── vercel.json                       [done] framework `hono`, bunVersion 1.x, region sin1, install dari root (`--frozen-lockfile`), build = prisma generate + **bundel `bun build` → `dist/index.js` dengan `hono` external** (`outputDirectory: dist`; builder Hono mencari entry yang meng-import `hono` di `dist/`), `crons`: grant-expiry 01:00 UTC & email-retry 02:00 UTC (harian; batas Hobby). Project `hris-staging-api` (D-036)
├── tsconfig.json                     [done]
└── package.json                      # name: @hris/api
```

## 3. `apps/web`

```
apps/web/
├── src/
│   ├── main.tsx                      [done] Entry (StrictMode + Providers + RouterProvider dari `react-router/dom`) + font Geist/Geist Mono (@fontsource-variable, di-bundle, tanpa CDN)
│   ├── index.css                     [done] Tailwind v4; tema D-035: netral zinc + aksen teal `--brand` (+ `--success`/`--warning`); cincin fokus `--ring` abu netral (zinc-400/500, permintaan pemilik projek 2026-09-29); autofill browser dinetralkan (`:autofill`), animasi transform/opacity (`animate-fade-up` kaskade `--i`, `skeleton` kilau, float/swing/blink), `prefers-reduced-motion` mematikan animasi
│   ├── app/
│   │   ├── navigation.ts             [done] D-035: SATU sumber menu — kelompok besar (top nav) → seksi (kelompok kecil) → item/anak; `visibleGroups(me)`, `activeTrail()` (breadcrumb/penanda aktif), `flattenNav()` (pencarian cepat), `CATEGORY_SLUGS`
│   │   ├── feature-flags.ts          [done] `FEATURES`: saklar halaman web; `false` = rute & menu tampil Maintenance ("Segera"), kode halaman tetap disimpan. Menu b–e (Ubah Status, Pengaktifan, Karyawan Tidak Aktif, Struktur Organisasi). **Nilai berbeda per jalur (D-043):** develop bebas diubah untuk pengecekan (umumnya semua `true`); rilis/staging saat ini hanya `changeStatus` `true`. API tidak terpengaruh
│   │   ├── route-preload.ts          [done] Loader `lazy` per halaman (code splitting) + `preloadRoute()` saat hover menu
│   │   ├── router.tsx                [done] Publik: `/login`, `/lupa-password`, `/auth/callback`, `/auth/atur-password`; terlindungi (`RequireAuth`): `/` (Dashboard), `/personal/*` (`RequireAccessRoute` personalMenu; ubah-status, import (D-042), pengaktifan, pegawai-tidak-aktif, arsip/:section, laporan → manageEmployees), `/akun`, `/grant`, `/audit` (`RequireAccess`), `/notifikasi`, `/profil`
│   │   ├── providers.tsx             [done] TanStack Query (401 → `signOut` global; tanpa retry untuk 401/403/404) + `AuthProvider` + Toaster (sonner)
│   │   └── layout/
│   │       ├── app-layout.tsx        [done] Top bar (brand, tab kelompok besar + garis aktif, tombol cari Ctrl+K, lonceng, menu akun), sidebar kontekstual (lebar 18.5rem sejak D-038 agar label terpanjang muat; bisa diciutkan, disimpan di localStorage), drawer mobile, bilah progres navigasi, skip link
│   │       ├── sidebar.tsx           [done] Seksi & item per kelompok, seksi "Data Karyawan Aktif" (D-038): Semua Karyawan Aktif + grup Internal/Magang/Eksternal berlipat, badge jumlah dari `/employees/summary` (gabungan grup dijumlahkan), label bertooltip `title`, prefetch kode + data halaman pertama saat hover, status sistem (`/health`)
│   │       └── command-palette.tsx   [done] Pencarian cepat: menu yang boleh diakses + pegawai (≥ 2 huruf, hanya bila berhak), navigasi keyboard
│   ├── lib/
│   │   ├── env.ts                    [done] Validasi `import.meta.env` (VITE_*); `VITE_SUPABASE_URL` & `VITE_SUPABASE_ANON_KEY` wajib
│   │   ├── supabase.ts               [done] supabase-js (sesi persist, auto refresh, `detectSessionInUrl` untuk link undangan/reset)
│   │   ├── api-client.ts             [done] `createApiClient()`: fetch + Bearer + parsing envelope → `ApiError`
│   │   ├── api.ts                    [done] Instance api client (token dari sesi Supabase)
│   │   ├── access.ts                 [done] Helper akses UI sejalan dengan `iam.policy.ts` (bukan pengganti cek API)
│   │   ├── errors.ts                 [done] `errorMessage()` (pesan API bahasa Indonesia)
│   │   ├── format.ts                 [done] `formatDate`/`formatDateTime` (`dd MMM yyyy`, Asia/Jakarta)
│   │   ├── image.ts                  [done] D-037: `prepareProfilePhoto()` (potong tengah 3:4, maks 600×800, WebP/JPEG, orientasi EXIF), `imageUrlToJpeg()` (untuk Excel), `centerCrop`/`fitWithin`
│   │   ├── xlsx-write.ts             [done] D-042: `buildXlsx()` .xlsx minimal satu sheet (fflate; header tebal, tanggal) + `downloadBytes()` — unduhan "baris bermasalah"
│   │   ├── xlsx-template.ts          [done] `fillXlsxTemplate()`: isi sel template .xlsx langsung di XML lembar (fflate + DOMParser; gaya, merge, logo, pengaturan cetak utuh; teks = inline string; tepat satu deklarasi XML), `downloadFile()` (2026-09-29)
│   │   └── utils.ts                  [done] `cn()` (clsx + tailwind-merge) untuk shadcn/ui
│   ├── components/ui/                [done] shadcn/ui: button (+ varian `brand`, efek tekan), card, badge (+ brand/success/warning/muted), input, label, dialog, dropdown-menu, table, select, alert, separator, textarea, popover, sonner, sheet, tabs (gaya garis bawah), tooltip, skeleton (import `cn` diarahkan ke `@/lib/utils`; sonner tanpa next-themes); 2026-09-30: `DialogContent` `*:min-w-0` & `SelectTrigger` `min-w-0` + nilai terpotong (cegah dialog melebar), tombol tutup "Tutup"; token `--warning-soft-foreground`/`--success-soft-foreground` (kontras AA) di `index.css` untuk badge
│   ├── components/table-pagination.tsx [done] Paginasi server-side bernomor + pilihan baris/halaman (maks 100)
│   ├── components/data-table.tsx     [done] DataTable bersama (TanStack Table v9 headless; sort & paginasi di server; kerangka loading, state kosong, garis progres saat refetch, baris bisa diklik/keyboard; `skeletonAvatar` untuk kerangka baris non-orang)
│   ├── components/{page-header,empty-state,form-select,brand-logo}.tsx [done] Judul + breadcrumb otomatis (seksi bernama sama dengan kelompok tidak diulang); state kosong; Select dengan pilihan kosong
│   ├── components/{list-panel,search-field}.tsx [done] Kartu daftar bersama (bilah filter + isi + footer paginasi) & kotak cari berikon — dipakai halaman Administrasi/Akun Saya (2026-09-30)
│   ├── hooks/use-debounced-value.ts  [done]
│   └── features/
│       ├── system/                   [done] Dashboard: SA/HR → `dashboard-charts.tsx` (lazy; ECharts lewat `components/evilcharts/` — kode vendor rekan tim, override biome) kartu ringkas, distribusi kategori/pendidikan/lokasi/departemen/jabatan/tahun masuk, menu cepat dari `NAV_GROUPS`; angka sesuai cakupan PT aktor (D-040, 2026-10-01); MANAGER/EMPLOYEE → sapaan (2026-09-30). Maintenance (ilustrasi SVG karakter beranimasi, untuk Arsip & Laporan), 404, error boundary; `useHealth`
│       ├── employee/                 [wip] D-035 Personal Management: `company-scope.ts` (D-040: PT terpilih di top bar, localStorage), `components/company-switcher.tsx` (tampil bila > 1 PT), `useCompanyScope()` di `api.ts` (daftar/ringkasan/prefetch membawa `companyId`; kolom & field Perusahaan), `active-views.ts` (D-038: slug ↔ filter `category`/`group`, grup & tampilan "Semua …", chip saudara, `activeCount()` dari summary, slug lama dialihkan), `api.ts` (hook + strategi cache: master data 5 mnt, daftar 30 dtk + keepPreviousData, detail `view=work`/`full` terpisah, invalidasi per mutasi), `schemas.ts`, `labels.ts`; komponen: daftar (filter/cari/sort/paginasi tersimpan di URL), panel detail **layar penuh** (`?pegawai=`; tombol "← Kembali" di kiri atas menggantikan X; avatar besar di tengah atas, satu area gulir + baris tab sticky; tab sensitif memuat `view=full` saat dibuka; tab Riwayat menampilkan "diubah oleh" nama · role · lokasi kerja), foto profil (`employee-photo-control.tsx`: avatar + tombol kamera → unggah/ganti/hapus dengan konfirmasi; hook `useUploadPhoto`/`useDeletePhoto`: upload-url → `uploadToSignedUrl` → konfirmasi; avatar menampilkan foto di daftar, detail, pemilih, palet Ctrl+K dengan inisial sebagai cadangan; D-037), tombol **Print data** (`print-employee-button.tsx` → `fetchEmployeeForPrint` `view=print` → `print.ts`: pemetaan data → sel template + foto JPEG di bingkai B9:J25 (`insertImage` di `xlsx-template.ts`), nama file aman; SA/HR, 2026-09-29), form tambah/ubah (RHF + Zod), pemilih pegawai, kartu pilihan, dialog aktifkan kembali; **`import/` (D-042)**: `parse-file.ts` (xlsx `read-excel-file/browser` & csv `papaparse` di-lazy-load, UTF-8/Windows-1252, sha256, tolak .xls/> 5 MB), `api.ts` (preview/commit/profil pemetaan; commit menyegarkan daftar, badge & master data), `labels.ts` (label field, samaran sensitif, teks masalah + letak kolom), `mapping-step.tsx`, `preview-step.tsx` (ringkasan, kolom sensitif dilewati, pemetaan master data baru, saring per aksi), `import-page.tsx` (`/personal/import`: Unggah → Pemetaan → Pratinjau → Selesai; mode, PT bawaan, 409 → pratinjau ulang, unduh baris bermasalah); tombol **Import** di header Data Karyawan Aktif (`?dari=`); halaman: Data Pegawai Aktif (per kategori), Ubah Status (kategori/nonaktifkan), Pengaktifan, Pegawai Tidak Aktif, Struktur Organisasi (per departemen + bagan atasan)
│       ├── auth/                     [done] `AuthProvider`/`useAuth`, `useMe`, guard `RequireAuth`/`RequireAccess`, halaman login, lupa password (pesan selalu sama), callback tautan, atur password; `safeNext()` cegah open redirect
│       ├── organization/             [done] D-049: `config.ts` (slug ↔ jenis, label, ikon), `schemas.ts`, `api.ts` (hook daftar admin, simpan, arsip/pulihkan/hapus, gabungkan; invalidasi `organization`, `master-data`, `employees`), `pages/master-data-page.tsx` (tabel + filter + menu aksi + dialog form/konfirmasi/gabungkan; HR lihat saja), `components/geofence-picker.tsx` (cari tempat Nominatim saat tombol ditekan, "Pakai lokasi saya", peta lazy) + `components/geofence-map.tsx` (Leaflet 1.9.4 + react-leaflet 5.0.0, tile OSM, pin CSS bisa digeser, lingkaran radius; chunk terpisah ±45 kB gzip) — rute `/master-data/:kind`, seksi Administrasi › Master Data
│       ├── iam/                      [done] Hook akun/role/nonaktif/serah-terima (login ulang, D-033)/grant/audit; halaman Akun, Grant izin, Audit log, Profil (foto profil sendiri bila tertaut pegawai — D-037, izin aktif, ganti password) — 2026-09-30: halaman Akun, Grant izin, Audit log, Profil diseragamkan (`PageHeader`, `DataTable` + `TablePagination`, `EmptyState`, `ListPanel`); hook menerima `pageSize`; audit UI 2026-09-30 (Paket A): `audit-labels.ts` (nama aksi & entitas bahasa Indonesia), Audit log menampilkan email pelaku & label entitas (`actorEmail`, `entityLabel` dari API), Profil menampilkan "Perusahaan yang dikelola" (HR) / semua PT (SA), dialog grant memakai `FormSelect` + tombol Batal
│       ├── notification/             [done] Lonceng (unread, 5 terbaru, 60 dtk), halaman Notifikasi, tandai baca (gaya seragam 2026-09-30: `PageHeader`, `ListPanel`, `EmptyState`, `TablePagination`)
│       └── <modul>/                  # per modul: pages/, components/, api.ts (hook TanStack Query), schemas.ts (subset respons API)
├── tests/                            [done] Vitest + Testing Library (jsdom): api-client, `access.test.ts`, `auth-routing.test.tsx` (guard, top nav & sidebar per role, 401 → keluar, login, lupa password, open redirect), `personal-management.test.tsx` (navigasi per role, breadcrumb, daftar per kategori → query API, pencarian → `?q=`, Maintenance, akses ditolak MANAGER/EMPLOYEE, slug tak dikenal); `employee-detail.test.tsx` (panel layar penuh, riwayat pengubah, Print data → unduhan, MANAGER tanpa tombol); `router-hydration.test.tsx` (BUG-001: tanpa warning `HydrateFallback`); `employee-print.test.ts` (pemetaan sel + template asli: nilai, gaya, merge, file lain identik, deklarasi XML); `employee-import.test.tsx` (D-042: unggah CSV → pemetaan otomatis → pratinjau → simpan, 409 → pratinjau ulang, .xls ditolak, tanpa nomor induk, PT bawaan SA, tombol Import & EMPLOYEE ditolak); `admin-pages.test.tsx` (Akun, Grant, Audit, Profil, Notifikasi: header, tabel, paginasi, EmptyState); `master-data.test.tsx` (D-049: SA/HR/MANAGER, form + geofence, tempel koordinat, peta (Leaflet di-mock) + cari tempat, arsip lewat menu); `company-scope.test.tsx` (D-040); `setup.ts` (polyfill pointer/scroll untuk Radix Select); `supabase-mock.ts` (mock terpisah, cegah deadlock vi.mock), `helpers.tsx`
├── components.json                   [done] Konfigurasi shadcn CLI (`bunx --bun shadcn@4.21.0 add <komponen>`)
├── index.html                        [done] lang="id", favicon = logo Arthasia
├── public/logo/logo-vertical.webp   [done] Logo resmi **vertikal** (ikon + "arthasia" + tagline "energy for the future", WebP transparan 358×360, 32 KB; dioptimasi dari `logo-arthasia-ori.png`) — top bar (h-12), menu mobile (h-16), halaman auth (h-32) lewat `components/brand-logo.tsx` (2026-09-29)
├── public/logo/logo-horizontal.svg   [done] Logo horizontal lama (1028×216) — tidak dipakai lagi sejak 2026-09-29, disimpan bila ingin kembali
├── public/logo/logo-arthasia.png     [done] Ikon logo Arthasia (PNG transparan 286×176) — favicon
├── scripts/generate-import-template.ts [done] Pembuat template import dummy (D-042 Tahap 0; `bun run --filter @hris/web template:import`)
├── public/template/Template-import-karyawan.xlsx [done] D-042 Tahap 0: template import **dummy** (struktur = file master data kantor: judul, baris Control, header baris 5, formula, baris RESIGN tersembunyi, variasi penulisan); dibuat ulang `bun run --filter @hris/web template:import` (`scripts/generate-import-template.ts`, fflate). File asli TIDAK di repo
├── public/template/Template-excel.xlsx [done] Template formulir "Daftar Isian Peserta" (1 lembar `Sheet3` = `xl/worksheets/sheet1.xml`, A4) untuk **Print data** pegawai; alamat sel dipetakan di `features/employee/print.ts` — bila tata letak template diubah, perbarui pemetaan & test `employee-print.test.ts` (2026-09-29)
├── vite.config.ts                    [done] React + Tailwind, alias `@` → src, envDir = root, port 5173, konfigurasi Vitest
├── vercel.json                       [done] Rewrite SPA, install dari root (`--frozen-lockfile`). Project `hris-staging-web` (D-036)
└── package.json                      # name: @hris/web
```

`packages/shared/` [done] (paket sumber TS, diekspor langsung dari `src/index.ts` tanpa build; di Vercel ikut dibundel ke `apps/api/dist/index.js`, D-036):
```
├── src/
│   ├── index.ts
│   ├── roles.ts                      # ROLES, roleSchema, ROLE, ROLE_LABELS
│   ├── employee.ts                   # D-035/D-038: EMPLOYMENT_CATEGORIES (7) + label, EMPLOYMENT_CATEGORY_GROUPS / CATEGORIES_BY_GROUP / label grup, EXIT_REASONS, EMPLOYMENT_CHANGE_TYPES (+ skema Zod & label Indonesia); D-041: PTKP_STATUSES, EDUCATION_LEVELS (+ label)
│   ├── organization.ts               # D-049/D-050: skema input master data (kode PT, NPWP badan, unit organisasi + `ORG_UNIT_TYPES`/`canBeChildOf`, jabatan + `POSITION_LEVELS`, status/grade, lokasi + geofence lengkap-atau-kosong), `MASTER_DATA_KINDS`/label, `MERGEABLE_MASTER_DATA`, `geofenceIncomplete`
│   ├── import/                       # D-042 mesin import (murni, dipakai web & api): `fields.ts` (IMPORT_FIELDS: label, seksi, sinonim; DERIVED_HEADERS; `fieldPermission`; batas 2.000 baris/5 MB), `normalize.ts` (tanggal ID/serial Excel, NIK 16 digit, NPWP, BPJS, telepon, gender, agama, PTKP, pendidikan, status → kategori, penanda resign), `row.ts` (`normalizeImportRow`, `isBlankImportRow`, IMPORT_ISSUE_MESSAGES), `detect.ts` (header & baris data, `pickSheet`, `suggestMapping`: sinonim + kemiripan + isi kolom, `buildRawRows`, `headerSignatureSource`)
│   ├── permissions.ts                # PERMISSIONS (PLAN §4.2), PERMISSION_GRANTABLE_TO, isPermissionGrantableTo()
│   ├── enums.ts                      # status/mode/jenis approval, jenis cuti, status periode absensi & payroll
│   └── schemas/
│       ├── common.ts                 # ERROR_CODES, errorBodySchema, paginationQuerySchema, paginationMetaSchema
│       └── <modul>.ts                # [planned] skema Zod DTO yang dipakai FE & BE
└── tests/{permissions,import}.test.ts # bun test (import: deteksi header/pemetaan/normalizer, 53 kasus)
```

---

## 4. Struktur Standar Modul (`apps/api/src/modules/<modul>/`)

```
<modul>/
├── index.ts                  # ⭐ INTERFACE PUBLIK: satu-satunya file yang boleh di-import modul lain
├── <modul>.routes.ts         # route @hono/zod-openapi: validasi → cek akses → panggil service
├── <modul>.service.ts        # logika bisnis; tidak tahu Hono, tidak menulis query langsung
├── <modul>.repository.ts     # satu-satunya tempat query Prisma ke tabel modul ini
├── <modul>.policy.ts         # aturan akses: (aktor, aksi, target) → boleh/tidak
├── <modul>.schema.ts         # skema Zod request/response (re-export dari @hris/shared bila dipakai FE)
└── __tests__/                # unit test service & policy
```

### Alur request

```
Request ─▶ core: request-id → logger → auth (verifikasi JWT) → muat konteks akses (role, grant, tim)
        ─▶ <modul>.routes.ts      validasi params/query/body (Zod)
        ─▶ <modul>.policy.ts      boleh? kalau tidak → 403 FORBIDDEN
        ─▶ <modul>.service.ts     aturan bisnis; panggil modul lain HANYA via index.ts-nya; tulis audit
        ─▶ <modul>.repository.ts  Prisma ke skema milik modul ini
        ─▶ core/response.ts       envelope { data, meta }
```

**Aturan dependency:** `routes → policy/service → repository`. Tidak boleh lompat atau berbalik arah. Modul lain hanya lewat `index.ts`.

**Ditegakkan oleh `.dependency-cruiser.cjs`** (`bun run check:boundaries`, CI):

| Aturan | Melarang |
|---|---|
| `module-only-via-index` | Modul A meng-import file modul B selain `index.ts` |
| `outside-only-via-index` | Kode api di luar `modules/` (core, `app.ts`, jobs, scripts, tests) meng-import file modul selain `index.ts`. Karena itu route modul dipasang di `app.ts` lewat fungsi yang diekspor `index.ts` modul |
| `core-not-into-modules-internals` | `core/` bergantung pada detail modul |
| `routes-no-repository` | routes → repository / `core/db.ts` / client Prisma |
| `policy-is-pure` | policy → repository / service / routes / `core/db.ts` / client Prisma |
| `service-no-http` | service → routes atau paket `hono`/`@hono/*` |
| `repository-is-lowest` | repository → service / routes / policy |
| `web-not-to-api`, `api-not-to-web`, `shared-is-leaf` | Import lintas workspace (web ↔ api, shared → apps) |
| `web-no-server-secrets` | web → `@prisma/*`, `prisma`, `pg`, `dotenv` |
| `no-circular`, `not-to-unresolvable`, `not-to-dev-dep` | Siklus, import yang tidak ter-resolve, kode produksi memakai devDependency |

---

## 5. Peta Modul

| Modul          | Skema DB       | Prefix route (`/api/v1`)                                                         | Boleh FK ke             | Memakai (via `index.ts`)             | Fase | Status      |
| -------------- | -------------- | -------------------------------------------------------------------------------- | ----------------------- | ------------------------------------ | ---- | ----------- |
| `iam`          | `iam`          | `/me`, `/accounts`, `/accounts/:id`, `/accounts/invite`, `/accounts/:id/companies` (PUT, D-040), `/accounts/:id/{role,deactivate,reactivate}`, `/accounts/primary-super-admin/transfer`, `/grants`, `/grants/:id/revoke`, `/audit-logs` | employee | employee, notification | 2 | `[done]` (Fase 2 Review) |
| `audit` (core) | `audit`        | `/audit-logs`                                                                    | –                       | –                                    | 2    | `[done]` (tabel + `writeAudit` + halaman web) |
| `organization` | `organization` | `/master-data` ✔ (D-035); ✔ D-049 `/companies`, `/departments`, `/positions`, `/employment-statuses`, `/grades`, `/work-locations` (+ `/:id` PATCH/DELETE, `/:id/{archive,restore,merge}`); rencana: `/settings`, `/holidays` (Fase 5) | –           | employee (disuntik lewat `configureOrganization`, tanpa import) | 3    | `[done]` CRUD master data |
| `employee`     | `employee`     | ✔ `/employees`, `/employees/summary`, `/employees/manager-options`, `/employees/:id` (`?view=work\|full\|print`), `/employees/:id/photo` (POST/DELETE) + `/employees/:id/photo/upload-url` (D-037), `/employees/:id/{status-change,deactivate,reactivate}`, `/org-structure` (D-035), `/employee-imports` (+ `/preview`, `/:id`, `/mappings/:signature`; D-042); `/dashboard` (SA/HR, agregat tanpa data per orang, cakupan PT aktor D-040); rencana: `/employees/:id/*` (tulis data pribadi, rekening, keluarga, pendidikan, pelatihan, dokumen) | organization            | iam, organization                    | 4    | `[wip]` |
| `approval`     | `approval`     | `/approvals` (inbox keputusan)                                                   | employee                | iam, employee, notification          | 5    | `[planned]` |
| `attendance`   | `attendance`   | `/attendance`, `/shifts`, `/schedules`, `/attendance-corrections`, `/overtime`, `/attendance-periods` | employee, organization | approval, organization, employee | 5 | `[planned]` |
| `leave`        | `leave`        | `/leave-types`, `/leave-balances`, `/leave-requests`                             | employee                | approval, attendance, organization   | 6    | `[planned]` |
| `contract`     | `contract`     | `/contract-types`, `/contracts`                                                  | employee                | employee, notification               | 7    | `[planned]` |
| `payroll`      | `payroll`      | `/payroll/*`, `/payslips`                                                        | employee                | employee, attendance, leave, contract | 8   | `[planned]` |
| `notification` | `notification` | `/notifications`, `/notifications/:id/read`, `/notifications/read-all`          | –                       | –                                    | 2    | `[done]`    |

Endpoint non-modul: `GET /api/v1/health`, `GET /api/v1/openapi.json`, `GET /api/v1/docs`, `/api/cron/*` (khusus Vercel Cron).

---

## 6. Detail Modul (Rencana)

Nama tabel **snake_case jamak** (`@@map`), model Prisma **PascalCase tunggal**. Kolom standar (`id`, `created_at`, `updated_at`) tidak ditulis ulang di bawah.

### 6.1 `iam`
| Tabel | Isi penting |
|---|---|
| `accounts` | ERD `user_account`: `auth_user_id` (UUID Supabase, unik), `employee_id` (nullable, unik), `email`, `role` (enum `Role`, **satu per akun**, D-028), `is_active`, `last_login_at`, `is_primary_super_admin`. **Tanpa** `password_hash` (password di Supabase Auth, D-005) |
| `permission_grants` | `account_id`, `permission`, `expires_at?`, `reason?`, `granted_by`, `revoked_at?`, `revoked_by?` |
| `account_companies` | [done] D-040: `account_id`, `company_id` (FK ke `organization.companies`, modul inti — PLAN §3.2) — cakupan PT akun HR_ADMIN |

Endpoint: `GET /me` · `GET /accounts` (SA, HR; filter role/isActive/q) · `GET /accounts/:id` (SA, HR, sendiri) · `POST /accounts/invite` (SA; HR hanya EMPLOYEE; SUPER_ADMIN hanya Utama) · `PATCH /accounts/:id/role` (SA; SUPER_ADMIN hanya Utama) · `POST /accounts/:id/deactivate|reactivate` (SA; HR hanya EMPLOYEE/MANAGER; ban Supabase) · `POST /accounts/primary-super-admin/transfer` (Utama, login ulang ≤ 5 menit, D-033) · `GET|POST /grants`, `POST /grants/:id/revoke` (SA) · `GET /audit-logs` (SA). Aturan lengkap: D-034.

### 6.2 `audit` (core)
| Tabel | Isi penting |
|---|---|
| `audit_logs` | `actor_account_id`, `action`, `entity_type`, `entity_id`, `before`/`after` (JSON, **tanpa** nilai sensitif mentah), `reason?`, `request_id`, `ip`, `occurred_at` |

### 6.3 `organization`
Status: tabel ERD **[done]**; baca master data lewat `GET /master-data` **[done]** (D-035); **CRUD 6 master data [done]** (D-049: arsip = `deleted_at`, hapus permanen hanya bila belum dirujuk, gabungkan, geofence angka). `system_settings`, `holidays` **[planned]** Fase 5.

| Tabel | Isi penting |
|---|---|
| `companies` | [done] D-039: perusahaan dalam grup — `code` (unik, mis. ACP), `name`, `npwp?`, `address?`, `is_active`, `deleted_at?`; dikelola SA; FK wajib dari `employees.company_id` |
| `company_profile` | [planned] *(digantikan `companies`, D-039)* |
| `system_settings` | [planned] Key-value terketik: zona waktu (`Asia/Jakarta`), toleransi telat, dll. |
| `departments` | **D-050: semua unit organisasi** — `name` (unik), `unit_type` (enum `OrgUnitType`: DIRECTORATE, DIVISION, DEPARTMENT, SECTION; default DEPARTMENT), `parent_id?` (hierarki, ber-index; induk sah dijaga service + `canBeChildOf` di shared), `deleted_at?` |
| `positions` | `name`, `department_id` (FK ke unit jenis apa pun, ERD) — unik per unit, `level?` (enum `PositionLevel`: DIRECTOR … NON_STAFF, D-050; beda dari grade), `deleted_at?` |
| `employment_statuses` | ERD `employment_status`: `name` (unik), `category?` (enum `EmploymentCategory` unik: PERMANENT, PROBATION, PKWT, DAILY_WORKER, INTERNSHIP, OUTSOURCING, VENDOR — D-035/D-038), `deleted_at?` |
| `grades` | ERD `grade` (menggantikan rencana `job_levels`): `name` (unik), `deleted_at?` |
| `work_locations` | `name` (unik), `city?`, `address?`, `latitude?`, `longitude?` Decimal(9,6), `radius_m?` (geofence wajib di Fase 5), `deleted_at?` |
| `holidays` | [planned] `date`, `name`, `is_collective_leave` |

FK dari `employees` ke master data memakai `ON DELETE RESTRICT`: master yang dipakai tidak bisa dihapus (pakai `deleted_at`).

### 6.4 `employee`
Status: tabel ERD **[done]**; endpoint daftar/detail/tambah/ubah/ubah status/nonaktif/aktif kembali/struktur **[done]** (D-035). Detail: riwayat membawa `changedBy` {nama pegawai pengubah atau email akun, role, lokasi kerja} lewat `iam` `getAccountSummaries()`; Foto profil (D-037): `photo_path` + `photoUrl` bertanda tangan 10 menit di daftar/detail; `POST /employees/:id/photo/upload-url`, `POST|DELETE /employees/:id/photo` (`canChangePhoto`: SA/HR + diri sendiri; audit `employee.photo.update|delete`). `view=print` (SA/HR, `canPrintEmployee`) = bahan formulir .xlsx: data pribadi & keluarga bila berhak, rekening tidak dibaca, audit `employee.printed` {format, sections} (2026-09-29). Import **[done] lokal** (D-042, lihat §5 modul employee). Tulis data sensitif lewat form, dokumen **[planned]**. Pemetaan lengkap ERD → tabel: `.claude/skills/hris-db-schema/ERD.md`.

| Tabel | Isi penting |
|---|---|
| `employees` | `employee_number` (ERD `nik` = Nomor Induk Karyawan, unik), `full_name`, `work_email?` (unik), `phone_number?`, `emergency_phone?`, `gender?` (enum), `join_date`, `end_date?`, `employment_status_id`, `position_id` (departemen lewat posisi), `work_location_id?`, `grade_id?`, `manager_id?` (self FK), `is_active`, `exit_reason?` (enum `EmployeeExitReason`, CHECK hanya saat nonaktif — D-035), `photo_path?` (path objek bucket `employee-photos`, D-037; di lokal diawali `STORAGE_PATH_PREFIX`, PLAN §3.3) |
| `employee_personal` | **Sensitif** (1:1, PK = `employee_id`): `ktp_number` (NIK KTP, unik), `npwp_number`, `kk_number`, `birth_place`, `birth_date`, `ktp_address`, `domicile_address`, `marital_status` (enum), `religion` (enum) |
| `employee_bank_accounts` | **Sensitif** (1:1): `bank_name`, `account_number`, `account_holder?` |
| `family_members` | ERD `family`, **sensitif** (data pribadi pihak ketiga): `name`, `relationship` (enum), `address?`, `birth_date?` (ERD `age`), `phone_number?` |
| `educations` | `school_name`, `major?`, `graduation_year?` |
| `trainings` | `training_field`, `organizer?`, `duration?`, `training_year?` |
| `employee_documents` | [planned] `type`, `storage_path`, `uploaded_by` |
| `employment_histories` | [done] D-035: `change_type` (HIRED, STATUS_CHANGED, POSITION_CHANGED, DEACTIVATED, REACTIVATED), `effective_date`, `from/to_status_id`, `from/to_position_id` (FK organization), `exit_reason?`, `note?`, `changed_by` (akun, tanpa FK) |
| `import_jobs` | [done] D-042: `actor_account_id`, `company_id?` (FK organization), `file_name`, `file_sha256`, `mode` (enum `ImportMode`), `total_rows`, jumlah dibuat/diperbarui/dilewati/error, `skipped_fields` text[] — dibuat hanya saat commit berhasil |
| `import_job_issues` | [done] D-042: `job_id`, `source_row`, `source_column`, `field`, `code`, `severity` (enum `ImportIssueSeverity`) — **tanpa nilai** |
| `import_mappings` | [done] D-042: `signature` (SHA-256 header ternormalisasi) unik → `mapping` jsonb, `updated_by` |
| *(kolom baru)* | [done] D-039 `employees.company_id` (wajib) + `employment_histories.from/to_company_id`; [done] D-041 (migrasi `20260930102336_add_import_and_employee_details`) `employees.emergency_contact_name?`, `emergency_contact_relationship?`; `employee_personal.bpjs_employment_number?`, `bpjs_health_number?`, `ptkp_status?`, `origin_city?` (sensitif); `educations.level?` (enum `EducationLevel`); enum `PtkpStatus` TK0…K3 |

Enum (skema `employee`): `Gender`, `MaritalStatus`, `Religion` (6 agama resmi + `OTHER`), `FamilyRelationship`. Tabel anak memakai `ON DELETE CASCADE` ke `employees` (karyawan sendiri tidak dihapus, hanya `is_active = false`). Data sensitif dipisah ke tabel sendiri supaya kontrol akses (grant) jelas di level repository. Rencana `emergency_contacts` digantikan `employees.emergency_phone` + `family_members` (ERD).

**Rencana onboarding (D-045–D-048, [design/onboarding-karyawan.md](./design/onboarding-karyawan.md)) [planned]:** kolom `employees.onboarding_status` (enum `OnboardingStatus`), `completion_required`, `personal_email`, `onboarding_batch_id`; `employee_personal.{npwp,bpjs_employment,bpjs_health}_absent`; tabel `onboarding_batches`, `onboarding_invitations`, `onboarding_reviews`, `onboarding_events`, `employee_documents` (bucket private `employee-documents`), `work_experiences`; `iam.accounts.login_identifier`, `iam.password_reset_attempts`. Endpoint `/onboarding-batches*`, `/onboarding-invitations/process`, `/onboarding*`, `/onboarding/me/*`, `iam` `POST /auth/password-reset`; cron `onboarding-maintenance`; env `LOGIN_EMAIL_DOMAIN` / `VITE_LOGIN_EMAIL_DOMAIN`, `ONBOARDING_INVITES_PER_HOUR`. Web: `features/onboarding/` (menu Administrasi › Penerimaan Karyawan Baru, wizard `/onboarding`, review), `/ess` placeholder, login "NIK atau email".

### 6.5 `approval`
| Tabel | Isi penting |
|---|---|
| `approval_requests` | `subject_type` (`LEAVE`, `PERMIT`, `ATTENDANCE_CORRECTION`, `OVERTIME`), `subject_id`, `requester_id`, `mode` (`PARALLEL`/`SINGLE`), `status` |
| `approval_steps` | `request_id`, `step` (`MANAGER`/`HR`), `assignee_id?`, `decision`, `decided_by?`, `decided_at?`, `note?`, `is_override` |

Modul pemilik subjek (leave/attendance) dipanggil kembali lewat interface-nya saat status final berubah.

### 6.6 `attendance`
| Tabel | Isi penting |
|---|---|
| `shift_templates` | Jam masuk/pulang, toleransi (policy SUPER_ADMIN) |
| `work_schedules` | Penugasan shift ke karyawan per tanggal/pola |
| `attendance_records` | `employee_id`, `date`, `clock_in_at`, `clock_out_at` (waktu server), koordinat, `is_outside_geofence`, `selfie_in_path`, `selfie_out_path`, `selfie_purged_at?`, status (tepat/telat/pulang cepat/izin/cuti/alpha) |
| `attendance_corrections` | Koreksi + referensi approval |
| `overtime_requests` | Lembur + referensi approval |
| `attendance_periods` | `period` (YYYY-MM), `status` (`OPEN`/`CLOSED`), `closed_by`, `closed_at` |

### 6.7 `leave`
| Tabel | Isi penting |
|---|---|
| `leave_types` | `kind` (`ANNUAL`/`PERMIT`), `name`, `quota_days?`, `requires_document`, `is_paid`, aturan akrual/carry-over |
| `leave_balances` | `employee_id`, `year`, `entitled`, `used`, `held`, `adjusted` |
| `leave_balance_adjustments` | Penyesuaian manual + alasan |
| `leave_requests` | `employee_id`, `leave_type_id`, `start_date`, `end_date`, `working_days`, `document_path?`, `status`, referensi approval |

### 6.8 `contract`
| Tabel | Isi penting |
|---|---|
| `contract_types` | PKWT, PKWTT, probation, magang |
| `contracts` | `employee_id`, `contract_type_id`, `start_date`, `end_date?`, `status`, `previous_contract_id?`, `terminated_at?`, `termination_reason?` |

### 6.9 `payroll`
| Tabel | Isi penting |
|---|---|
| `tax_ter_rates`, `ptkp_values`, `bpjs_rates` | Konfigurasi tarif berlaku per tanggal (policy SUPER_ADMIN) |
| `salary_components` | `code`, `name`, `type` (earning/deduction), `is_fixed`, `is_taxable`, rumus |
| `employee_salary_structures` | Struktur gaji per karyawan, berlaku per tanggal |
| `employee_salary_items` | Nominal komponen per struktur |
| `payroll_periods` | `period`, `status` (`DRAFT`/`CALCULATED`/`LOCKED`/`PUBLISHED`) |
| `payroll_runs` | Eksekusi perhitungan + input snapshot |
| `payslips`, `payslip_items` | Hasil per karyawan + rincian komponen, BPJS, PPh 21 |

### 6.10 `notification`
| Tabel | Isi penting |
|---|---|
| `notifications` | `recipient_account_id` (tanpa FK), `type`, `title`, `body?`, `link?`, `dedupe_key?` (unik per penerima), `read_at?` |
| `email_outbox` | Email gagal kirim: `to_email`, `subject`, `text_body`, `status` (PENDING/SENT/FAILED), `attempts` (maks 5), `last_error`, `next_attempt_at` (30 menit, lalu +1 jam × percobaan) |

Pemicu (PLAN §5.6), dari modul `iam` setelah transaksi commit: grant diberikan/dicabut (ke penerima), grant akan kedaluwarsa ≤ 3 hari (cron, `dedupe_key`), perubahan SUPER_ADMIN/Utama (undangan SA, ubah role SA, nonaktif/aktif SA, serah-terima & pemulihan Utama → semua SUPER_ADMIN aktif). Email lokal hanya log (D-025).

---

## 7. Tugas Terjadwal (Vercel Cron → `/api/cron/*`)

| Job | Jadwal | Fungsi | Fase |
|---|---|---|---|
| `purge-selfies` | Harian | Hapus file selfie > 12 bulan, isi `selfie_purged_at` | 5 |
| `contract-expiry` | Harian | Notifikasi kontrak habis ≤ 30 hari | 7 |
| `grant-expiry` | Harian 01:00 UTC | Notifikasi grant akan kedaluwarsa ≤ 3 hari, sekali per grant (`dedupe_key`); grant kedaluwarsa sendiri dicek saat request | 2 `[done]` |
| `leave-accrual` | Harian | Akrual/reset saldo cuti sesuai aturan | 6 |
| `email-retry` | Harian 02:00 UTC | Kirim ulang `email_outbox` yang jatuh tempo (maks 50/jalan; FAILED setelah 5 percobaan) | 2 `[done]` |

Semua endpoint cron memeriksa header `Authorization: Bearer ${CRON_SECRET}`. Di lokal, Vercel Cron tidak berjalan: job dipicu manual dengan request ke endpoint yang sama.

---

## 8. Environment Variables

Daftar lengkap disimpan di `.env.example`. **Satu file `.env` di root** dipakai semua workspace: api lewat `bun --env-file=../../.env`, Prisma CLI lewat `dotenv` di `prisma.config.ts`, web lewat `envDir` Vite. Di CI/Vercel env diisi langsung (file tidak ada).

**Env Vercel staging (D-036, target *production* project staging; nilai rahasia hanya di Vercel):** `hris-staging-api`: `DATABASE_URL` (transaction pooler 6543), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CORS_ORIGINS`=`APP_URL`=`https://hris-staging-web.vercel.app`, `CRON_SECRET`, `SMTP_*`, `EMAIL_FROM`, `LOG_LEVEL`. `NODE_ENV` sengaja tidak diisi (Vercel mengisinya sendiri; `production` saat build membuat `bun install` melewati devDependencies seperti `prisma`). `hris-staging-web`: `VITE_API_BASE_URL`=`https://hris-staging-api.vercel.app/api/v1`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.

Validasi: api di `apps/api/src/env.ts`, web di `apps/web/src/lib/env.ts`. Variabel Supabase/SMTP/cron masih **opsional** di Fase 1 dan dijadikan wajib di fase yang memakainya.

| Variabel | Dipakai | Keterangan |
|---|---|---|
| `NODE_ENV` | api | `development` (default) · `test` · `production` |
| `PORT` | api | Port HTTP lokal, default `3000` |
| `LOG_LEVEL` | api | `debug` · `info` (default) · `warn` · `error` |
| `DATABASE_URL` | api (runtime) | Lokal: PostgreSQL Docker (`localhost:5432`). Staging/produksi: **transaction pooler** (port 6543; staging: `aws-0-ap-northeast-2.pooler.supabase.com:6543`, user `postgres.iwgzuwcxsxnbjibhbqgh`) |
| `DIRECT_URL` | api (migrasi) | Lokal: sama dengan `DATABASE_URL`. Staging/produksi: koneksi direct/session (port 5432) untuk `prisma migrate` |
| `SUPABASE_URL` | api | URL project Supabase (JWKS & Admin API). **Wajib** kecuali `NODE_ENV=test`. Lokal: project **staging** `https://iwgzuwcxsxnbjibhbqgh.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | api | **Rahasia**. Hanya di server/script (`bootstrap:super-admin`), tidak pernah ke frontend |
| `CORS_ORIGINS` | api | Origin web yang diizinkan |
| `CRON_SECRET` | api | **Rahasia** untuk endpoint `/api/cron/*` (Vercel Cron mengirimnya otomatis sebagai Bearer). Kosong → endpoint cron selalu 401 |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | api | SMTP Google Workspace (D-025): `smtp.gmail.com`, port `587`, user = alamat akun pengirim, password = **App Password** (**rahasia**). Kosong di lokal → email aplikasi hanya dicatat ke log |
| `EMAIL_FROM` | api | Alamat pengirim = akun Workspace pengirim (OD-5), mis. `HRIS Arthasia <hris@<domain-kantor>>`. **Staging (D-032):** `HRIS Arthasia (Staging) <admin.arthasia@gmail.com>`, `SMTP_USER=admin.arthasia@gmail.com`; `SMTP_PASS` diisi di env Vercel (bukan repo). Lokal tetap kosong (email hanya ke log) |
| `APP_URL` | api | URL web untuk link di email. Lokal: `http://localhost:5173` |
| `VITE_API_BASE_URL` | web | mis. `http://localhost:3000/api/v1` |
| `VITE_SUPABASE_URL` | web | **Wajib.** URL project Supabase. Lokal: project **staging** `https://iwgzuwcxsxnbjibhbqgh.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | web | **Wajib.** Kunci publik Supabase (staging: publishable key `sb_publishable_…`, diambil via MCP) |
| `STORAGE_PATH_PREFIX` | api | Lokal: `dev/<nama-developer>/` (pemilik projek: `dev/oatse/`); staging/produksi: kosong. Format divalidasi `env.ts` (segmen huruf kecil diakhiri `/`); dipakai path foto `${prefix}employees/<id>/…` (2026-09-30) |
| `SEED_EMAIL_BASE` | seed | Email developer untuk plus-addressing `work_email` karyawan dummy (`nama@gmail.com` → `nama+dev-budi-0001@gmail.com`). Kosong → `work_email` kosong |

**Secret GitHub Actions** (Settings → Secrets and variables → Actions → *Repository secrets*; bukan env aplikasi):

| Secret | Dipakai | Keterangan |
|---|---|---|
| `STAGING_DIRECT_URL` | `deploy-staging.yml` | Connection string **session pooler** Supabase staging: `postgresql://postgres.iwgzuwcxsxnbjibhbqgh:<password>@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres` (port **5432**, bukan 6543; host direct hanya IPv6). **Rahasia**, sudah diisi 2026-09-28 |
| `VERCEL_TOKEN` | `deploy-staging.yml` | **Rahasia**. Token akun Vercel `oatse` untuk CLI (D-036) |
| `VERCEL_ORG_ID` | `deploy-staging.yml` | `team_LT9rBNwfha3zcvHfBB85LEXk` (scope akun `oatse`) |
| `VERCEL_PROJECT_ID_API`, `VERCEL_PROJECT_ID_WEB` | `deploy-staging.yml` | `prj_YikNSEXpoKlOMC6Jli7a0MPjk0vu` (`hris-staging-api`), `prj_YZVG4UA4Ug5vhAPkbZBaA4e1tm7W` (`hris-staging-web`) |

Port lokal: api `3000`, web `5173`, PostgreSQL `5432`. Auth & Storage lokal memakai Supabase staging (tidak ada port lokal).

---

## 9. Script Root

| Perintah | Fungsi |
|---|---|
| `bun install` | Install semua workspace; `postinstall` menjalankan `db:generate` (client Prisma) |
| `bun run db:up` / `db:down` | Menjalankan (menunggu *healthy*) / menghentikan PostgreSQL lokal (`docker compose`) |
| `bun run dev` | api (`bun --watch`, port 3000) + web (Vite, port 5173) paralel |
| `bun run dev:api` / `dev:web` | Salah satu saja |
| `bun run typecheck` | `tsc --noEmit` semua workspace (TypeScript 6.0.3) |
| `bun run lint` / `format` | Biome `check` / `check --write`. CI memakai `biome ci .` |
| `bun run check:boundaries` | dependency-cruiser (aturan di §4) |
| `bun run test` | `test:shared` → `test:api` → `test:web` |
| `bun run test:shared` / `test:api` / `test:web` | bun test / bun test (butuh `db:up`; integration memakai PostgreSQL lokal) / Vitest |
| `bun run test:e2e` | [planned] Playwright (Fase 9) |
| `bun run db:generate` | `prisma generate` |
| `bun run db:migrate` | `prisma migrate dev` (lokal); nama migrasi: `bun run db:migrate -- --name <deskripsi_snake_case>` |
| `bun run db:deploy` | `prisma migrate deploy` (CI dari DB kosong; staging otomatis via `deploy-staging.yml`, D-030) |
| `bun run db:check` | `prisma migrate diff --exit-code`: gagal jika skema Prisma berbeda dari DB hasil migrasi (migrasi lupa dibuat) |
| `bun run db:reset` | Reset DB lokal + seed. Prisma menolak perintah ini bila dijalankan AI agent tanpa persetujuan eksplisit pengguna |
| `bun run db:seed` | Seed data dummy (idempoten; aman diulang) |
| `bun run storage:setup` (di `apps/api`) | Buat/selaraskan bucket Supabase Storage (D-037) memakai `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` dari `.env`; aman diulang; wajib dijalankan sekali per project (staging ✔, produksi saat Rilis 1) |
| `DEV_ACCOUNT_PASSWORD='...' bun run dev:account -- --email <e> --role <ROLE> [--employee-number <no>]` | Buat akun UJI per role (staging Auth + DB lokal), tautkan ke karyawan dummy; tidak untuk produksi; user Auth yang sudah ada tidak diubah password-nya |
| `bun run recover:primary-admin -- --to-email <e> --reason "..." [--dry-run]` | Pindahkan status Utama ke SUPER_ADMIN aktif (pemulihan manual, PLAN §4.4) + audit |
| `bun run bootstrap:super-admin -- --email <e> [--dry-run]` | Buat/promosikan SUPER_ADMIN Utama di DB target; idempoten; butuh `SUPABASE_SERVICE_ROLE_KEY` (kecuali dry-run). Memakai `bun run --cwd apps/api` (bukan `--filter`) agar input password tersembunyi mendapat TTY |
| `bun run build` | Build api (`bun build` → `apps/api/dist`) & web (`vite build` → `apps/web/dist`) |

Docker image api (jalan keluar dari Vercel): `docker build -f apps/api/Dockerfile -t hris-api .` dari root.

---

## 10. Cara Memperbarui CODEMAP

1. Folder/file penting baru → tambahkan di §1–§3 dengan status. Ubah status `[planned]` → `[wip]` → `[done]` sesuai kondisi.
2. Tabel/endpoint/izin baru → perbarui §5–§6. Izin baru juga wajib ditambahkan ke PLAN §4.2 dan `packages/shared/src/permissions.ts`.
3. Tabel/kolom/relasi berubah → perbarui juga `docs/erd/hris.dbml`. Cron baru → §7. Env var baru → §8 **dan** `.env.example`. Script baru → §9.
4. Jika implementasi menyimpang dari rencana di file ini, **perbarui file ini** agar sesuai dengan kode (CODEMAP menggambarkan kondisi nyata, PLAN menggambarkan keputusan).
5. Perbarui tanggal "Terakhir diubah".
