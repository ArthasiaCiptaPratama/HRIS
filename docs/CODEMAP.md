# CODEMAP — HRIS

> **Fungsi file ini:** peta **di mana** setiap hal berada: struktur folder, modul, tabel, endpoint, izin, env var, dan script.
> Baca bagian yang relevan **sebelum** membuat atau mencari file. **Wajib diperbarui** setiap kali ada folder, modul, tabel, endpoint, izin, atau env var baru (lihat §10).

**Status:** `[planned]` belum dibuat · `[wip]` sedang dikerjakan · `[done]` selesai & teruji

| Metadata        | Nilai                                                        |
| --------------- | ------------------------------------------------------------ |
| Terakhir diubah | 2026-09-28                                                   |
| Kondisi repo    | Fase 1 berjalan: monorepo, kerangka api/web/shared, Prisma, CI, Docker |

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
│   ├── erd/hris.dbml                 [done] Diagram ERD (DBML, buka di dbdiagram.io); cermin skema Prisma, disetujui pemilik projek 2026-09-28 (+ D-035: category, exit_reason, employment_histories)
│   └── qa/                           [wip] Dokumentasi QA (skill hris-qa-docs): README (indeks), plans/, cases/, runs/, bugs/
├── .github/workflows/ci.yml          [done] Job `quality` (typecheck, biome ci, boundaries, test shared & web, build) + job `api-db` (service Postgres 17: db:deploy dari DB kosong, db:check drift, test api). Hijau di GitHub
├── .github/workflows/deploy-staging.yml [done] D-030: push ke `HRIS/debug/fe-be` → `db:deploy` + `db:check` ke Supabase staging (secret `STAGING_DIRECT_URL`), lalu job `vercel-api` → `vercel-web` (D-036: Vercel CLI `pull/build/deploy --prebuilt --prod`; urutan dijamin `needs`, 2026-09-29). Migrasi pertama sukses 2026-09-28 (run #36385730691); deploy Vercel pertama yang berfungsi 2026-09-29 (run #36531510460)
├── .claude/skills/                    Skill Claude Code projek (dimuat otomatis)
│   ├── hris-workflow/                [done] Aturan alur kerja & laporan untuk setiap tugas (hasil grill 2026-09-28)
│   ├── hris-db-schema/               [done] Alur skema Prisma, ERD → Prisma, batas Supabase MCP
│   ├── hris-e2e-playwright/          [done] Konvensi & templat Playwright (setup e2e/ saat pertama dipakai)
│   ├── hris-flow-testing/            [done] Test flow API & matriks akses (TDD)
│   ├── hris-qa-docs/                 [done] Templat docs/qa/: plan, case, run, bug
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
│   ├── schema/                       [wip] Skema Prisma multi-file (belum ada model; model ditambahkan per fase)
│   │   ├── _base.prisma              [done] generator (prisma-client, runtime bun, output src/generated/prisma) + datasource (10 skema Postgres)
│   │   ├── iam.prisma                # [planned] untuk semua file modul di bawah
│   │   ├── organization.prisma      [done] departments, positions, employment_statuses (+ enum `EmploymentCategory`, D-035), grades, work_locations (ERD, D-026)
│   │   ├── employee.prisma          [done] employees (+ `exit_reason`), employee_personal, employee_bank_accounts, family_members, educations, trainings, employment_histories + enum (ERD D-026, D-035)
│   │   ├── attendance.prisma
│   │   ├── leave.prisma
│   │   ├── approval.prisma
│   │   ├── contract.prisma
│   │   ├── payroll.prisma
│   │   ├── notification.prisma      [done] notifications (dedupe_key), email_outbox + enum status
│   │   └── audit.prisma
│   ├── migrations/                   [wip] Hasil `prisma migrate dev` (di-commit, tidak pernah diedit setelah di-merge)
│   │   ├── 20260928032354_init_module_schemas/  [done] SQL mentah: CREATE SCHEMA untuk 10 skema modul
│   │   ├── 20260928035758_add_organization_and_employee_master/  [done] Tabel ERD organization & employee
│   │   ├── 20260928061939_enable_rls_on_prisma_migrations/  [done] RLS pada `public._prisma_migrations` (advisor Supabase; bersyarat, portabel)
│   │   ├── 20260928062734_add_departments_parent_id_index/  [done] Index FK `departments.parent_id` (advisor performa)
│   │   ├── 20260928065300_add_iam_and_audit/  [done] iam.accounts, iam.permission_grants, audit.audit_logs + index unik parsial Utama + 2 CHECK
│   │   ├── 20260928085157_add_notification/  [done] notification.notifications, notification.email_outbox
│   │   └── 20260929020000_employee_categories_and_histories/  [done] D-035: enum kategori + `employment_statuses.category` (unik), `employees.exit_reason` + CHECK (hanya saat nonaktif), `employment_histories`, index daftar `(employment_status_id, is_active)` & `(is_active, full_name)`
│   └── seed/                         [done] Idempoten (upsert), menolak NODE_ENV=production
│       ├── index.ts                  Runner: organization → employee
│       ├── organization.ts           5 departemen, 12 jabatan, 5 status berkategori (D-035; nama lama "Tetap/Kontrak (PKWT)/Magang" diganti, "Masa Percobaan" di-soft delete), 5 grade, 2 lokasi
│       └── employee.ts               21 karyawan dummy (5 manajer, 2 nonaktif) + data pribadi/rekening/keluarga/pendidikan/pelatihan fiktif + riwayat HIRED/DEACTIVATED; `work_email` dari SEED_EMAIL_BASE
├── prisma.config.ts                  [done] Memuat `.env` root (dotenv), skema folder, `datasource.url = DIRECT_URL` (dipakai CLI migrate)
├── src/
│   ├── index.ts                      [done] Entry: `export default app` (Vercel & Bun; Bun membaca PORT, default 3000)
│   ├── app.ts                        [done] `createApp(deps?)`: request-id → logger → secure headers → CORS → OpenAPI/health → route modul (dilindungi `protect` = authenticate + loadActor); deps bisa diganti di test (`tokenVerifier`, `actorLoader`); `defaultHook` Zod → 400; `onError`/`notFound` → envelope error; semua respons `/api/*` diberi `Cache-Control: private, no-store` (data per akun/PII tidak di-cache browser/proxy)
│   ├── env.ts                        [done] Validasi env dengan Zod (`getEnv()` lazy, `parseEnv()`); `SUPABASE_URL` wajib kecuali NODE_ENV=test; pesan error tanpa nilai env
│   ├── generated/                    # Client Prisma hasil generate (TIDAK di-commit, tidak diedit; dibuat oleh postinstall)
│   ├── core/                         [wip] Hal lintas modul (bukan logika bisnis domain)
│   │   ├── db.ts                     [done] `getPrisma()` (PrismaPg, pool max 5), `disconnectPrisma()`, `pingDatabase()`
│   │   ├── health.ts                 [done] `GET /api/v1/health` (200 ok / 503 degraded bila DB tidak terjangkau; tetap envelope `data`)
│   │   ├── auth/                     [done] `TokenVerifier`, `createSupabaseVerifier` (JWKS ES256; cek iss, aud=authenticated, role, sub UUID), middleware `authenticate()` → 401
│   │   ├── access/                   [done] `Actor`, `hasRole`, `hasPermission` (grant hanya untuk role penerima sah), `isGrantActive`, `isSelf`, `isInTeam` (tim = manager_id target = employee aktor, murni tanpa query), middleware `loadActor(loader)` (tanpa akun aktif → 401), `requireRole`, `requirePermission` (→ 403)
│   │   ├── errors.ts                 [done] AppError + ValidationError/UnauthenticatedError/ForbiddenError/NotFoundError/ConflictError/BusinessRuleError
│   │   ├── response.ts               [done] `ok()`, `paginated()`, `dataEnvelope()`, `paginatedEnvelope()`, `ERROR_RESPONSES` (OpenAPI)
│   │   ├── email.ts                  [done] `EmailSender`: `createSmtpSender` (nodemailer, 587 STARTTLS/465 TLS) & `createLogSender` (lokal, hanya penerima+subjek, D-025)
│   │   ├── logger.ts                 [done] Log JSON satu baris ke stdout, `redact()` field sensitif (jaring pengaman), `requestLogger()` (tanpa query string)
│   │   ├── audit.ts                  [done] `writeAudit(entry, client?)`: bisa ikut transaksi; before/after diredaksi (jaring pengaman); `listAuditLogs(filter)`
│   │   ├── storage.ts                [planned] signed upload/download URL Supabase Storage
│   │   ├── storage.ts                [done] D-037: antarmuka `StorageAdmin` (signed upload URL, signed URL baca, info objek, hapus, `ensurePrivateBucket`) + `createSupabaseStorage()` (service role) + `UNCONFIGURED_STORAGE`; konstanta bucket `employee-photos` (2 MB, jpeg/png/webp). Test memakai `tests/helpers/storage.ts` (palsu); `NODE_ENV=test` tidak pernah memakai Storage sungguhan
│   │   ├── supabase-admin.ts         [done] antarmuka `AuthAdmin` (`findUserByEmail`, `inviteUser`, `createConfirmedUser`, `setBanned`) + `createSupabaseAdmin()` (service role; server/script saja) + `UNCONFIGURED_AUTH_ADMIN` (kunci kosong → 422 jelas)
│   │   ├── openapi.ts                [done] Skema keamanan Bearer, `/api/v1/openapi.json` (OAS 3.1), `/api/v1/docs` (Swagger UI)
│   │   └── __tests__/                [done] Unit test app core, env, logger
│   ├── modules/
│   │   ├── iam/                      [wip] 12 endpoint + fungsi publik untuk employee (`getAccountLinksForEmployees`, `getAccountSummaries`, `listManagerEmployeeIds`, `deactivateAccountOfEmployee`) (akun, role, nonaktif, serah-terima Utama, grant, audit log, `/me`); policy matriks IAM (60 test); `loadActor`; `bootstrapPrimarySuperAdmin`, `recoverPrimarySuperAdmin`. Bagian B/C (notifikasi, web) menyusul
│   │   ├── organization/             [wip] D-035: `GET /master-data` (departemen, jabatan, status+kategori, grade, lokasi aktif; semua role); `getMasterLookup()` + helper kategori/departemen untuk modul lain. CRUD master data menyusul Fase 3
│   │   ├── employee/                 [wip] D-035: `GET /employees` (paginasi, filter kategori/departemen/lokasi/aktif, `q`, sort whitelist; SA/HR semua, MANAGER tim), `GET /employees/summary`, `GET /employees/manager-options`, `GET /org-structure`, `GET /employees/:id?view=work|full` (sensitif hanya bila berhak & view=full → audit `employee.sensitive.read`), `POST /employees`, `PATCH /employees/:id`, `POST /employees/:id/{status-change,deactivate,reactivate}` (riwayat + audit; nonaktif ikut menonaktifkan akun via iam). Policy 45 test
│   │   ├── notification/             [done] `notify()` (in-app + email, tidak pernah melempar, gagal → outbox), `retryEmailOutbox()`, `GET /notifications`, `POST /notifications/:id/read`, `POST /notifications/read-all`; `configureNotification()` dipanggil app
│   │   └── <modul>/                  # lihat §4 untuk struktur standar
│   └── jobs/cron.ts                  [done] `GET /api/cron/grant-expiry`, `GET /api/cron/email-retry`; `Authorization: Bearer ${CRON_SECRET}` (timing-safe; secret kosong → selalu 401)
├── scripts/
│   ├── setup-storage.ts              [done] `bun run storage:setup`: buat/selaraskan bucket private (idempoten) di project Supabase dari `.env`; staging dijalankan 2026-09-29 (D-037)
│   ├── bootstrap-super-admin.ts      [wip] `--email <e> [--dry-run]`: cari/buat user Auth (password diketik tersembunyi), lalu `bootstrapPrimarySuperAdmin` di DB target. Jalan nyata ✔ (Utama `admin.arthasia@gmail.com` di DB lokal)
│   ├── create-dev-account.ts         [done] Akun UJI (bukan produksi): `DEV_ACCOUNT_PASSWORD=... --email --role HR_ADMIN|MANAGER|EMPLOYEE [--employee-number]` → user Auth terkonfirmasi + akun HRIS tertaut karyawan dummy (`provisionAccount`, audit, idempoten)
│   └── recover-primary-admin.ts      [done] `--to-email <e> --reason "..." [--dry-run]`: pindahkan status Utama ke SUPER_ADMIN aktif + audit (PLAN §4.4)
├── tests/
│   ├── helpers/auth.ts               [done] `testVerifier` (token `test-token:<uuid>[:stale]`, `passwordAuthAt`), `bearer()`, `createAuthFixture(run)` → `loginAs(role, {grants, employeeId, isActive, primary})` → `{account, headers, staleHeaders}` + `cleanup()`
│   ├── helpers/auth-admin.ts         [done] `createFakeAuthAdmin()`: AuthAdmin palsu (mencatat undangan/ban, bisa disetel gagal)
│   ├── helpers/email.ts              [done] `createFakeEmailSender()`: EmailSender palsu (menyimpan pesan, bisa disetel gagal)
│   └── integration/                  [wip] Test → PostgreSQL lokal: `health.test.ts`, `schemas.test.ts` (10 skema ada), `employee-schema.test.ts` (constraint ERD); `tests/seed.test.ts` (generator NIK/email seed); `iam-schema.test.ts`, `audit.test.ts`, `iam/{me,bootstrap,accounts,grants-audit,recover}.test.ts`, `notification.test.ts` (notify, dedupe, outbox & retry, endpoint, pemicu grant, cron), `employee/employees.test.ts` (20 test: daftar/ringkasan/detail/view=work/tulis/status/nonaktif+akun/aktif kembali/struktur/master data; akses 401/403/404, field sensitif hilang, audit) (test yang butuh DB tanpa Utama otomatis dilewati di DB developer; penuh di CI)
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
│   │   ├── feature-flags.ts          [done] `FEATURES`: saklar halaman web; `false` = rute & menu tampil Maintenance ("Segera"), kode halaman tetap disimpan. Saat ini menu b–e (Ubah Status, Pengaktifan, Pegawai Tidak Aktif, Struktur Organisasi) = `false` (permintaan pemilik projek 2026-09-29); API tidak terpengaruh
│   │   ├── route-preload.ts          [done] Loader `lazy` per halaman (code splitting) + `preloadRoute()` saat hover menu
│   │   ├── router.tsx                [done] Publik: `/login`, `/lupa-password`, `/auth/callback`, `/auth/atur-password`; terlindungi (`RequireAuth`): `/` (Dashboard), `/personal/*` (`RequireAccessRoute` personalMenu; ubah-status, pengaktifan, pegawai-tidak-aktif, arsip/:section, laporan → manageEmployees), `/akun`, `/grant`, `/audit` (`RequireAccess`), `/notifikasi`, `/profil`
│   │   ├── providers.tsx             [done] TanStack Query (401 → `signOut` global; tanpa retry untuk 401/403/404) + `AuthProvider` + Toaster (sonner)
│   │   └── layout/
│   │       ├── app-layout.tsx        [done] Top bar (brand, tab kelompok besar + garis aktif, tombol cari Ctrl+K, lonceng, menu akun), sidebar kontekstual (bisa diciutkan, disimpan di localStorage), drawer mobile, bilah progres navigasi, skip link
│   │       ├── sidebar.tsx           [done] Seksi & item per kelompok, anak "Data Pegawai Aktif" bisa dilipat, badge jumlah dari `/employees/summary`, prefetch kode + data halaman pertama saat hover, status sistem (`/health`)
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
│   │   ├── xlsx-template.ts          [done] `fillXlsxTemplate()`: isi sel template .xlsx langsung di XML lembar (fflate + DOMParser; gaya, merge, logo, pengaturan cetak utuh; teks = inline string; tepat satu deklarasi XML), `downloadFile()` (2026-09-29)
│   │   └── utils.ts                  [done] `cn()` (clsx + tailwind-merge) untuk shadcn/ui
│   ├── components/ui/                [done] shadcn/ui: button (+ varian `brand`, efek tekan), card, badge (+ brand/success/warning/muted), input, label, dialog, dropdown-menu, table, select, alert, separator, textarea, popover, sonner, sheet, tabs (gaya garis bawah), tooltip, skeleton (import `cn` diarahkan ke `@/lib/utils`; sonner tanpa next-themes)
│   ├── components/pagination.tsx     [done] Paginasi server-side sederhana (halaman IAM)
│   ├── components/table-pagination.tsx [done] Paginasi server-side bernomor + pilihan baris/halaman (maks 100)
│   ├── components/data-table.tsx     [done] DataTable bersama (TanStack Table v9 headless; sort & paginasi di server; kerangka loading, state kosong, garis progres saat refetch, baris bisa diklik/keyboard)
│   ├── components/{page-header,empty-state,form-select,brand-logo}.tsx [done] Judul + breadcrumb otomatis; state kosong; Select dengan pilihan kosong
│   ├── hooks/use-debounced-value.ts  [done]
│   └── features/
│       ├── system/                   [done] Dashboard (sapaan, kosong — D-035), Maintenance (ilustrasi SVG karakter beranimasi, untuk Arsip & Laporan), 404, error boundary; `useHealth`
│       ├── employee/                 [wip] D-035 Personal Management: `api.ts` (hook + strategi cache: master data 5 mnt, daftar 30 dtk + keepPreviousData, detail `view=work`/`full` terpisah, invalidasi per mutasi), `schemas.ts`, `labels.ts`; komponen: daftar (filter/cari/sort/paginasi tersimpan di URL), panel detail **layar penuh** (`?pegawai=`; tombol "← Kembali" di kiri atas menggantikan X; avatar besar di tengah atas, satu area gulir + baris tab sticky; tab sensitif memuat `view=full` saat dibuka; tab Riwayat menampilkan "diubah oleh" nama · role · lokasi kerja), foto profil (`employee-photo-control.tsx`: avatar + tombol kamera → unggah/ganti/hapus dengan konfirmasi; hook `useUploadPhoto`/`useDeletePhoto`: upload-url → `uploadToSignedUrl` → konfirmasi; avatar menampilkan foto di daftar, detail, pemilih, palet Ctrl+K dengan inisial sebagai cadangan; D-037), tombol **Print data** (`print-employee-button.tsx` → `fetchEmployeeForPrint` `view=print` → `print.ts`: pemetaan data → sel template + foto JPEG di bingkai B9:J25 (`insertImage` di `xlsx-template.ts`), nama file aman; SA/HR, 2026-09-29), form tambah/ubah (RHF + Zod), pemilih pegawai, kartu pilihan, dialog aktifkan kembali; halaman: Data Pegawai Aktif (per kategori), Ubah Status (kategori/nonaktifkan), Pengaktifan, Pegawai Tidak Aktif, Struktur Organisasi (per departemen + bagan atasan)
│       ├── auth/                     [done] `AuthProvider`/`useAuth`, `useMe`, guard `RequireAuth`/`RequireAccess`, halaman login, lupa password (pesan selalu sama), callback tautan, atur password; `safeNext()` cegah open redirect
│       ├── iam/                      [done] Hook akun/role/nonaktif/serah-terima (login ulang, D-033)/grant/audit; halaman Akun, Grant izin, Audit log, Profil (foto profil sendiri bila tertaut pegawai — D-037, izin aktif, ganti password)
│       ├── notification/             [done] Lonceng (unread, 5 terbaru, 60 dtk), halaman Notifikasi, tandai baca
│       └── <modul>/                  # per modul: pages/, components/, api.ts (hook TanStack Query), schemas.ts (subset respons API)
├── tests/                            [done] Vitest + Testing Library (jsdom): api-client, `access.test.ts`, `auth-routing.test.tsx` (guard, top nav & sidebar per role, 401 → keluar, login, lupa password, open redirect), `personal-management.test.tsx` (navigasi per role, breadcrumb, daftar per kategori → query API, pencarian → `?q=`, Maintenance, akses ditolak MANAGER/EMPLOYEE, slug tak dikenal); `employee-detail.test.tsx` (panel layar penuh, riwayat pengubah, Print data → unduhan, MANAGER tanpa tombol); `employee-print.test.ts` (pemetaan sel + template asli: nilai, gaya, merge, file lain identik, deklarasi XML); `supabase-mock.ts` (mock terpisah, cegah deadlock vi.mock), `helpers.tsx`
├── components.json                   [done] Konfigurasi shadcn CLI (`bunx --bun shadcn@4.21.0 add <komponen>`)
├── index.html                        [done] lang="id", favicon = logo Arthasia
├── public/logo/logo-vertical.webp   [done] Logo resmi **vertikal** (ikon + "arthasia" + tagline "energy for the future", WebP transparan 358×360, 32 KB; dioptimasi dari `logo-arthasia-ori.png`) — top bar (h-12), menu mobile (h-16), halaman auth (h-32) lewat `components/brand-logo.tsx` (2026-09-29)
├── public/logo/logo-horizontal.svg   [done] Logo horizontal lama (1028×216) — tidak dipakai lagi sejak 2026-09-29, disimpan bila ingin kembali
├── public/logo/logo-arthasia.png     [done] Ikon logo Arthasia (PNG transparan 286×176) — favicon
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
│   ├── permissions.ts                # PERMISSIONS (PLAN §4.2), PERMISSION_GRANTABLE_TO, isPermissionGrantableTo()
│   ├── enums.ts                      # status/mode/jenis approval, jenis cuti, status periode absensi & payroll
│   └── schemas/
│       ├── common.ts                 # ERROR_CODES, errorBodySchema, paginationQuerySchema, paginationMetaSchema
│       └── <modul>.ts                # [planned] skema Zod DTO yang dipakai FE & BE
└── tests/permissions.test.ts         # bun test
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
| `iam`          | `iam`          | `/me`, `/accounts`, `/accounts/:id`, `/accounts/invite`, `/accounts/:id/{role,deactivate,reactivate}`, `/accounts/primary-super-admin/transfer`, `/grants`, `/grants/:id/revoke`, `/audit-logs` | employee | employee, notification | 2 | `[wip]` |
| `audit` (core) | `audit`        | `/audit-logs`                                                                    | –                       | –                                    | 2    | `[wip]` (tabel + `writeAudit`) |
| `organization` | `organization` | `/master-data` ✔ (D-035); rencana: `/company`, `/settings`, `/departments`, `/positions`, `/employment-statuses`, `/grades`, `/work-locations`, `/holidays` | –           | –                                    | 3    | `[wip]` (baca saja) |
| `employee`     | `employee`     | ✔ `/employees`, `/employees/summary`, `/employees/manager-options`, `/employees/:id` (`?view=work\|full\|print`), `/employees/:id/photo` (POST/DELETE) + `/employees/:id/photo/upload-url` (D-037), `/employees/:id/{status-change,deactivate,reactivate}`, `/org-structure` (D-035); rencana: `/employees/:id/*` (tulis data pribadi, rekening, keluarga, pendidikan, pelatihan, dokumen), `/employees/import` | organization            | iam, organization                    | 4    | `[wip]` |
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

Endpoint: `GET /me` · `GET /accounts` (SA, HR; filter role/isActive/q) · `GET /accounts/:id` (SA, HR, sendiri) · `POST /accounts/invite` (SA; HR hanya EMPLOYEE; SUPER_ADMIN hanya Utama) · `PATCH /accounts/:id/role` (SA; SUPER_ADMIN hanya Utama) · `POST /accounts/:id/deactivate|reactivate` (SA; HR hanya EMPLOYEE/MANAGER; ban Supabase) · `POST /accounts/primary-super-admin/transfer` (Utama, login ulang ≤ 5 menit, D-033) · `GET|POST /grants`, `POST /grants/:id/revoke` (SA) · `GET /audit-logs` (SA). Aturan lengkap: D-034.

### 6.2 `audit` (core)
| Tabel | Isi penting |
|---|---|
| `audit_logs` | `actor_account_id`, `action`, `entity_type`, `entity_id`, `before`/`after` (JSON, **tanpa** nilai sensitif mentah), `reason?`, `request_id`, `ip`, `occurred_at` |

### 6.3 `organization`
Status: tabel ERD **[done]**; baca master data lewat `GET /master-data` **[done]** (D-035). CRUD master data, `company_profile`, `system_settings`, `holidays` **[planned]**.

| Tabel | Isi penting |
|---|---|
| `company_profile` | [planned] Satu baris: nama, NPWP perusahaan, alamat, logo |
| `system_settings` | [planned] Key-value terketik: zona waktu (`Asia/Jakarta`), toleransi telat, dll. |
| `departments` | `name` (unik), `parent_id?` (hierarki, ber-index), `deleted_at?` |
| `positions` | `name`, `department_id` (FK, ERD) — unik per departemen, `deleted_at?` |
| `employment_statuses` | ERD `employment_status`: `name` (unik), `category?` (enum `EmploymentCategory` unik: PERMANENT, PKWT, INTERNSHIP, DAILY_WORKER, OUTSOURCING — D-035), `deleted_at?` |
| `grades` | ERD `grade` (menggantikan rencana `job_levels`): `name` (unik), `deleted_at?` |
| `work_locations` | `name` (unik), `city?`, `address?`, `latitude?`, `longitude?` Decimal(9,6), `radius_m?` (geofence wajib di Fase 5), `deleted_at?` |
| `holidays` | [planned] `date`, `name`, `is_collective_leave` |

FK dari `employees` ke master data memakai `ON DELETE RESTRICT`: master yang dipakai tidak bisa dihapus (pakai `deleted_at`).

### 6.4 `employee`
Status: tabel ERD **[done]**; endpoint daftar/detail/tambah/ubah/ubah status/nonaktif/aktif kembali/struktur **[done]** (D-035). Detail: riwayat membawa `changedBy` {nama pegawai pengubah atau email akun, role, lokasi kerja} lewat `iam` `getAccountSummaries()`; Foto profil (D-037): `photo_path` + `photoUrl` bertanda tangan 10 menit di daftar/detail; `POST /employees/:id/photo/upload-url`, `POST|DELETE /employees/:id/photo` (`canChangePhoto`: SA/HR + diri sendiri; audit `employee.photo.update|delete`). `view=print` (SA/HR, `canPrintEmployee`) = bahan formulir .xlsx: data pribadi & keluarga bila berhak, rekening tidak dibaca, audit `employee.printed` {format, sections} (2026-09-29). Tulis data sensitif, dokumen, import **[planned]**. Pemetaan lengkap ERD → tabel: `.claude/skills/hris-db-schema/ERD.md`.

| Tabel | Isi penting |
|---|---|
| `employees` | `employee_number` (ERD `nik` = Nomor Induk Karyawan, unik), `full_name`, `work_email?` (unik), `phone_number?`, `emergency_phone?`, `gender?` (enum), `join_date`, `end_date?`, `employment_status_id`, `position_id` (departemen lewat posisi), `work_location_id?`, `grade_id?`, `manager_id?` (self FK), `is_active`, `exit_reason?` (enum `EmployeeExitReason`, CHECK hanya saat nonaktif — D-035), `photo_path?` (path objek bucket `employee-photos`, D-037) |
| `employee_personal` | **Sensitif** (1:1, PK = `employee_id`): `ktp_number` (NIK KTP, unik), `npwp_number`, `kk_number`, `birth_place`, `birth_date`, `ktp_address`, `domicile_address`, `marital_status` (enum), `religion` (enum) |
| `employee_bank_accounts` | **Sensitif** (1:1): `bank_name`, `account_number`, `account_holder?` |
| `family_members` | ERD `family`, **sensitif** (data pribadi pihak ketiga): `name`, `relationship` (enum), `address?`, `birth_date?` (ERD `age`), `phone_number?` |
| `educations` | `school_name`, `major?`, `graduation_year?` |
| `trainings` | `training_field`, `organizer?`, `duration?`, `training_year?` |
| `employee_documents` | [planned] `type`, `storage_path`, `uploaded_by` |
| `employment_histories` | [done] D-035: `change_type` (HIRED, STATUS_CHANGED, POSITION_CHANGED, DEACTIVATED, REACTIVATED), `effective_date`, `from/to_status_id`, `from/to_position_id` (FK organization), `exit_reason?`, `note?`, `changed_by` (akun, tanpa FK) |
| `import_jobs` | [planned] Status & hasil import CSV/Excel |

Enum (skema `employee`): `Gender`, `MaritalStatus`, `Religion` (6 agama resmi + `OTHER`), `FamilyRelationship`. Tabel anak memakai `ON DELETE CASCADE` ke `employees` (karyawan sendiri tidak dihapus, hanya `is_active = false`). Data sensitif dipisah ke tabel sendiri supaya kontrol akses (grant) jelas di level repository. Rencana `emergency_contacts` digantikan `employees.emergency_phone` + `family_members` (ERD).

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
| `STORAGE_PATH_PREFIX` | api | Lokal: `dev/<nama-developer>/`; staging/produksi: kosong |
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
