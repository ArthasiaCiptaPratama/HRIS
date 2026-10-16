# CODEMAP — HRIS

> **Fungsi file ini:** peta **di mana** setiap hal berada: struktur folder, modul, tabel, endpoint, izin, env var, dan script.
> Baca bagian yang relevan **sebelum** membuat atau mencari file. **Wajib diperbarui** setiap kali ada folder, modul, tabel, endpoint, izin, atau env var baru (lihat §10).

**Status:** `[planned]` belum dibuat · `[wip]` sedang dikerjakan · `[done]` selesai & teruji

| Metadata        | Nilai                                                        |
| --------------- | ------------------------------------------------------------ |
| Terakhir diubah | 2026-10-09 (gabung `HRIS/Mat/windows`: dashboard D-065, tukar DB lokal ⇄ Supabase, `db:migrate` dijaga DB lokal; D-063 NIP boleh kosong + pencocokan NIK KTP; D-064 cocokkan unit organisasi, normalisasi isian Form, almarhum, PT di Pratinjau; D-062 status bawaan & per baris di Import, pemetaan kolom tanpa lag); 2026-10-08 (rilis gel. 2 + saklar `onboarding`/`archive`/`selfService`; D-061 Import Form 171 kolom; D-060 lampiran Google Drive di Import; Arsip 1d ekspor & cetak) |
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
├── docs/                           Peta baca: docs/README.md (induk → anak, 2026-10-13)
│   ├── README.md                     [done] Peta baca + daftar fitur & kode prefix keputusan
│   ├── PROMPT.md                     [done] Bagaimana bekerja (aturan emas, protokol, konvensi)
│   ├── PROGRESS.md                   [done] Induk: status per fitur, fokus, blocker, OD, backlog, log ringkas
│   ├── PLAN.md                       [done] Apa & kenapa (§8 = indeks keputusan)
│   ├── CODEMAP.md                    [done] Di mana (file ini; detail per modul di codemap/)
│   ├── RELEASE.md                    [done] Jalur develop/rilis, antrean push/rilis, saklar FEATURES, riwayat rilis, wajib pra-produksi
│   ├── decisions.md                  [done] Isi lengkap D-001–D-073 & OD-1–OD-15 (dibekukan)
│   ├── features/<fitur>/             [done] README (status, checklist, keputusan berprefix) · design.md · log.md — 12 fitur
│   ├── codemap/<modul>.md            [done] Pohon file api & web + tabel per modul; database.md = skema/migrasi/seed
│   ├── archive/                      [done] Log sesi lama per bulan + snapshot PROGRESS lama (tidak diubah)
│   ├── email-templates/                  [done] Template email Supabase Auth bermerek (invite, recovery) — dipasang manual di Dashboard Supabase (2026-10-12)
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
│   ├── schema/ · migrations/ · seed/  → rincian per file: docs/codemap/database.md
├── prisma.config.ts                  [done] Memuat `.env` root (dotenv), skema folder, `datasource.url = DIRECT_URL` (dipakai CLI migrate)
├── src/
│   ├── index.ts                      [done] Entry: `export default app` (Vercel; function Hono)
│   ├── server.ts                     [done] Entry Bun.serve lokal (`dev`/`start`) & Docker: `port` dari env, `idleTimeout` 60 dtk (Bun default 10 dtk memutus request lambat seperti lampiran Drive; 2026-10-12)
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
│   │   ├── brand-logo.ts             [done] Logo Arthasia PNG base64 (sama dengan email) untuk kop PDF server: BAST aset & surat peringatan (dipindah dari `asset/bast-logo.ts`, 2026-10-15)
│   │   ├── storage.ts                [done] D-037: antarmuka `StorageAdmin` (signed upload URL, signed URL baca, info objek, hapus, `ensurePrivateBucket`) + `createSupabaseStorage()` (service role) + `UNCONFIGURED_STORAGE`; konstanta bucket `employee-photos` (2 MB, jpeg/png/webp). Test memakai `tests/helpers/storage.ts` (palsu); `NODE_ENV=test` tidak pernah memakai Storage sungguhan
│   │   ├── supabase-admin.ts         [done] antarmuka `AuthAdmin` (`findUserByEmail`, `inviteUser`, `createConfirmedUser`, `setBanned`) + `createSupabaseAdmin()` (service role; server/script saja) + `UNCONFIGURED_AUTH_ADMIN` (kunci kosong → 422 jelas)
│   │   ├── openapi.ts                [done] Skema keamanan Bearer, `/api/v1/openapi.json` (OAS 3.1), `/api/v1/docs` (Swagger UI)
│   │   └── __tests__/                [done] Unit test app core, env, logger
│   ├── modules/
│   │   ├── iam/                      → docs/codemap/iam.md
│   │   ├── organization/             → docs/codemap/organization.md
│   │   ├── employee/                 → docs/codemap/employee.md
│   │   ├── notification/             → docs/codemap/notification.md
│   │   ├── approval/                 → docs/codemap/approval.md (Time Management, 2026-10-13)
│   │   ├── attendance/               → docs/codemap/attendance.md
│   │   ├── leave/                    → docs/codemap/leave.md
│   │   ├── asset/                    → docs/codemap/asset.md (Arsip 2a, 2026-10-13)
│   │   ├── discipline/               → docs/codemap/discipline.md (Arsip 2b Surat Peringatan, 2026-10-15)
│   │   └── <modul>/                  # lihat §4 untuk struktur standar
│   └── jobs/cron.ts                  [done] `GET /api/cron/grant-expiry`, `GET /api/cron/email-retry`, `GET /api/cron/document-expiry` (D-055: pengingat dokumen kedaluwarsa), `GET /api/cron/onboarding-maintenance` (D-045 d: hapus calon batal > 30 hari, pengingat undangan > 14 hari, sisa antrean undangan; dirakit di app.ts lewat `extraJobs`); `Authorization: Bearer ${CRON_SECRET}` (timing-safe; secret kosong → selalu 401)
├── scripts/
│   ├── setup-storage.ts              [done] `bun run storage:setup`: buat/selaraskan bucket private (idempoten) di project Supabase dari `.env`; staging dijalankan 2026-09-29 (D-037)
│   ├── migrate-login-nik.ts          [done] D-048: `bun run auth:migrate-login-nik` — pindahkan akun tertaut karyawan APPROVED ke login NIK; dry-run default, `--apply --domain=<LOGIN_EMAIL_DOMAIN>` (+ `--only=`). **Belum pernah dijalankan** (Auth staging dipakai bersama — izin per lingkungan)
│   ├── import-org-local.ts           [done] D-051: `bun run org:import-local -- --file=<JSON di luar repo> [--apply]` — isi bagan dengan nama asli di DB lokal, atau staging dengan `--remote=<ref staging>` (D-066), karyawan `ASLI-<kode>-<n>`, hapus dummy `DMY-` di pos yang sama; seed ulang mengembalikan dummy · **D-066:** juga staging dengan `--remote=<ref staging>` (penjaga `realDataTarget` di `db-target.ts`; project lain ditolak), transaksi `timeout` 120 dtk
│   ├── bootstrap-super-admin.ts      [done] `--email <e> [--dry-run]`: cari/buat user Auth (password diketik tersembunyi), lalu `bootstrapPrimarySuperAdmin` di DB target. Jalan nyata ✔ (Utama `admin.arthasia@gmail.com` di DB lokal & DB staging)
│   ├── create-dev-account.ts         [done] Akun UJI (bukan produksi): `DEV_ACCOUNT_PASSWORD=... --email --role HR_ADMIN|MANAGER|EMPLOYEE [--employee-number]` → user Auth terkonfirmasi + akun HRIS tertaut karyawan dummy (`provisionAccount`, audit, idempoten)
│   └── recover-primary-admin.ts      [done] `--to-email <e> --reason "..." [--dry-run]`: pindahkan status Utama ke SUPER_ADMIN aktif + audit (PLAN §4.4)
├── tests/
│   ├── helpers/auth.ts               [done] `testVerifier` (token `test-token:<uuid>[:stale]`, `passwordAuthAt`), `bearer()`, `createAuthFixture(run)` → `loginAs(role, {grants, employeeId, isActive, primary})` → `{account, headers, staleHeaders}` + `cleanup()`
│   ├── helpers/auth-admin.ts         [done] `createFakeAuthAdmin()`: AuthAdmin palsu (mencatat undangan/ban, bisa disetel gagal)
│   ├── helpers/email.ts              [done] `createFakeEmailSender()`: EmailSender palsu (menyimpan pesan, bisa disetel gagal)
│   ├── helpers/storage.ts            [done] `StorageAdmin` palsu untuk test foto (D-037)
│   ├── helpers/company.ts            [done] D-039: `acpCompanyId()` (ACP dari migrasi), `createTestCompany()`
│   └── integration/                  [wip] Test → PostgreSQL lokal: `health.test.ts`, `schemas.test.ts` (10 skema ada), `employee-schema.test.ts` (constraint ERD); `tests/seed.test.ts` (generator NIK/email seed); `iam-schema.test.ts`, `audit.test.ts`, `iam/{me,bootstrap,accounts,grants-audit,recover,provision}.test.ts`, `notification.test.ts` (notify, dedupe, outbox & retry, endpoint, pemicu grant, cron), `organization/master-data.test.ts` (17, D-049: akses SA/HR, validasi, nama unik, arsip/pulihkan/hapus FK → 409, gabungkan jabatan & departemen, siklus induk, status berkategori, aturan perusahaan, dampak ke ubah karyawan & import), `employee/dashboard.test.ts` (agregat + cakupan PT D-040), `employee/dashboard-pivot.test.ts` (D-065: akses, 400, jenjang tertinggi, filter, divisi induk, cakupan PT, dimensi pribadi ber-grant), `iam/dashboard-layout.test.ts` (D-065: simpan/baca/reset per akun, validasi, isi lama → bawaan), `iam/companies.test.ts` (D-040), `iam/login-nik.test.ts` (D-048), `iam/me-employee-name.test.ts` (BUG-004: `/me.employeeName`), `employee/onboarding{,-wizard,-review,-maintenance}.test.ts` (D-045–D-047), `employee/{archive,documents,data-changes,import-attachments}.test.ts` (Arsip 1a–1c, D-060), `organization/org-chart.test.ts` (D-051–D-053), `employee/import.test.ts` (11: preview/commit, CREATE_ONLY vs UPSERT, sel kosong, resign → nonaktif, master data baru, sensitif dilewati tanpa grant, PT wajib, 401/403/400/409; D-042), `employee/photo.test.ts` (upload-url, konfirmasi, hapus, akses, audit; D-037), `employee/employees.test.ts` (20 test: daftar/ringkasan/detail/view=work/tulis/status/nonaktif+akun/aktif kembali/struktur/master data; akses 401/403/404, field sensitif hilang, audit) (test yang butuh DB tanpa Utama otomatis dilewati di DB developer; penuh di CI)
├── Dockerfile                        [done] Multi-stage `oven/bun:1.4.2-alpine`, bundle `bun build src/server.ts` → `dist/server.js`, user non-root, HEALTHCHECK. Build dari root: `docker build -f apps/api/Dockerfile .`
├── vercel.json                       [done] framework `hono`, bunVersion 1.x, region sin1, install dari root (`--frozen-lockfile`), build = prisma generate + **bundel `bun build` → `dist/index.js` dengan `hono` external** (`outputDirectory: dist`; builder Hono mencari entry yang meng-import `hono` di `dist/`), `crons`: grant-expiry 01:00 UTC, email-retry 02:00 UTC, onboarding-maintenance 03:00 UTC, document-expiry 00:00 UTC (harian; batas Hobby). Project `hris-staging-api` (D-036)
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
│   │   ├── feature-flags.ts          [done] `FEATURES`: saklar halaman web; `false` = rute & menu tampil Maintenance ("Segera"), kode halaman tetap disimpan. Menu b–e (Ubah Status, Pengaktifan, Karyawan Tidak Aktif, Struktur Organisasi). **Nilai berbeda per jalur (D-043):** develop bebas diubah untuk pengecekan (umumnya semua `true`); rilis/staging sejak 2026-10-05 semua `true` (b–e). API tidak terpengaruh · **2026-10-08 (D-043 rilis bertahap):** `onboarding` (Penerimaan), `archive` (menu Arsip, Master Data › Jenis dokumen, kelola Arsip di detail), `selfService` (Layanan Mandiri, Pengajuan Perubahan Data) — develop `true`, rilis `false`; suite test fitur tersebut `describe.skipIf(!FEATURES.x)` · **2026-10-12:** rilis `onboarding` = `true` (rilis gel. 5); `archive`, `selfService` tetap `false`
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
│   ├── components/lazy-select.tsx    [done] D-062: pemilih ringan (Popover, cari, panah) untuk tabel berisi banyak dropdown — daftar pilihan baru dipasang saat dibuka (Radix Select memasang semua item walau tertutup); dipakai pemetaan kolom & status per baris Import
│   ├── hooks/use-debounced-value.ts  [done]
│   └── features/
│       ├── dashboard/                → docs/codemap/employee.md
│       ├── system/                   [done] Dashboard: SA/HR → `features/dashboard` (D-065; angka sesuai cakupan PT aktor, D-040); MANAGER/EMPLOYEE → sapaan + widget pribadi Time Management (`features/time-management/components/personal-dashboard.tsx`, 2026-10-13). `components/evilcharts/` (vendor rekan tim) tidak dipakai lagi sejak D-065. Maintenance (ilustrasi SVG karakter beranimasi, untuk Arsip & Laporan), 404, error boundary; `useHealth`
│       ├── time-management/          → docs/codemap/attendance.md
│       ├── employee/                 → docs/codemap/employee.md
│       ├── auth/                     → docs/codemap/iam.md
│       ├── organization/             → docs/codemap/organization.md
│       ├── iam/                      → docs/codemap/iam.md
│       ├── notification/             → docs/codemap/notification.md
│       └── <modul>/                  # per modul: pages/, components/, api.ts (hook TanStack Query), schemas.ts (subset respons API)
├── tests/                            [done] Vitest + Testing Library (jsdom): api-client, `access.test.ts`, `auth-routing.test.tsx` (guard, top nav & sidebar per role, 401 → keluar, login, lupa password, open redirect), `personal-management.test.tsx` (navigasi per role, breadcrumb, daftar per kategori → query API, pencarian → `?q=`, Maintenance, akses ditolak MANAGER/EMPLOYEE, slug tak dikenal); `employee-detail.test.tsx` (panel layar penuh, riwayat pengubah, Print data → unduhan, MANAGER tanpa tombol); `router-hydration.test.tsx` (BUG-001: tanpa warning `HydrateFallback`); `employee-print.test.ts` (pemetaan sel + template asli: nilai, gaya, merge, file lain identik, deklarasi XML); `employee-import.test.tsx` (D-042: unggah CSV → pemetaan otomatis → pratinjau → simpan, 409 → pratinjau ulang, .xls ditolak, tanpa nomor induk, PT bawaan SA, tombol Import & EMPLOYEE ditolak); `admin-pages.test.tsx` (Akun, Grant, Audit, Profil, Notifikasi: header, tabel, paginasi, EmptyState); `master-data.test.tsx` (D-049: SA/HR/MANAGER, form + geofence, tempel koordinat, peta (Leaflet di-mock) + cari tempat, arsip lewat menu); `company-scope.test.tsx` (D-040); `setup.ts` (polyfill pointer/scroll untuk Radix Select); `supabase-mock.ts` (mock terpisah, cegah deadlock vi.mock), `helpers.tsx` · lainnya (2026-10-02 s.d. 10-12): `dashboard.test.tsx`, `dashboard-pivot-data.test.ts` (D-065), `documents.test.tsx` (D-055), `archive.test.tsx`, `data-changes.test.tsx` (Arsip 1a–1c), `employee-status-actions.test.tsx`, `geofence-map.test.tsx`, `navigation.test.ts`, `org-chart-layout.test.ts`, `org-chart-page.test.tsx`, `org-posts.test.tsx` (D-051–D-053), `onboarding.test.tsx` (impor calon + seret-lepas), `onboarding-wizard.test.tsx`, `onboarding-review.test.tsx` (D-045–D-047), `import-attachments.test.tsx`, `import-unit-matching.test.ts`, `greeting.test.tsx` (BUG-004), `set-password.test.tsx` (tampilkan password, syarat ≥ 12, kecocokan)
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
│   ├── import/                       # D-042 mesin import (murni, dipakai web & api): `fields.ts` (IMPORT_FIELDS: label, seksi, sinonim; DERIVED_HEADERS; `fieldPermission`; batas 2.000 baris/5 MB), `normalize.ts` (tanggal ID/serial Excel, NIK 16 digit, NPWP, BPJS, telepon, gender, agama, PTKP, pendidikan, status → kategori, penanda resign), `row.ts` (`normalizeImportRow`, `isBlankImportRow`, IMPORT_ISSUE_MESSAGES), `detect.ts` (header & baris data, `pickSheet`, `suggestMapping`: sinonim + kemiripan + isi kolom, `buildRawRows`, `headerSignatureSource`) · **D-061:** `formTitle()` (judul pertanyaan Form: baris pertama, tanpa akhiran kembar), `DetectedSheet.titles`, kelompok rincian alamat / kontak darurat 2 / status saudara / pekerjaan anak, kolom kembar versi lama & baru → field sama (nilai pertama terisi), field `divisionName`, lampiran `attachSimA/C`
│   ├── permissions.ts                # PERMISSIONS (PLAN §4.2), PERMISSION_GRANTABLE_TO, isPermissionGrantableTo()
│   ├── enums.ts                      # status/mode/jenis approval, jenis cuti, status periode absensi & payroll
│   └── schemas/
│       ├── common.ts                 # ERROR_CODES, errorBodySchema, paginationQuerySchema, paginationMetaSchema
│       └── <modul>.ts                # [planned] skema Zod DTO yang dipakai FE & BE
└── tests/{permissions,import}.test.ts # bun test (import: deteksi header/pemetaan/normalizer, 53 kasus); `import-form-v2.test.ts` + `fixtures/form-sheet-headers-v2.ts` (D-061: 171 judul Form asli, responden versi lama/baru, kasus terburuk)
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
| `organization` | `organization` | `/master-data` ✔ (D-035); ✔ D-051 `/org-posts` (+ `/sync-managers`); ✔ D-049 `/companies`, `/departments`, `/positions`, `/employment-statuses`, `/grades`, `/work-locations` (+ `/:id` PATCH/DELETE, `/:id/{archive,restore,merge}`); rencana: `/settings`, `/holidays` (Fase 5) | –           | employee (disuntik lewat `configureOrganization`, tanpa import) | 3    | `[done]` CRUD master data |
| `employee`     | `employee`     | ✔ `/employees`, `/employees/summary`, `/employees/manager-options`, `/employees/:id` (`?view=work\|full\|print`), `/employees/:id/photo` (POST/DELETE) + `/employees/:id/photo/upload-url` (D-037), `/employees/:id/{status-change,deactivate,reactivate}`, `/org-structure` (D-035), `/employee-imports` (+ `/preview`, `/:id`, `/mappings/:signature`; D-042; D-060: `/:id/attachments` (+ `/process`, `/retry`), `/attachments/open`); `/dashboard` (SA/HR, agregat tanpa data per orang, cakupan PT aktor D-040); ✔ D-054 Arsip 1c (lokal, belum diverifikasi ulang): `/self/employee-data`, `/self/documents/upload-url`, `/self/data-changes`, `/data-changes` (POST ajukan, GET antrean), `/data-changes/{id}` (+ `/cancel`, `/decision`), `/archive/{families,bank-accounts}`; D-058 (1d): `/archive/{category}/export`; rencana: tulis langsung data pribadi/rekening/keluarga oleh HR | organization            | iam, organization                    | 4    | `[wip]` |
| `asset`        | `asset`        | ✔ `/asset-categories`, `/ppe-types`, `/assets` (+ `next-code`, `{id}/status`, `{id}/assign`), `/asset-assignments/{id}/{return,lost,bast,bast-pdf}`, `/asset-holdings/{employeeId}`, `/asset-returns/pending`, `/ppe-issues` (+ `{id}/{return,bast,bast-pdf}`), `/self/assets`, `/self/{asset-assignments,ppe-issues}/{id}/acknowledge` | employee, organization | employee, iam, notification, organization | 4 | `[done]` API 2026-10-13 · web 2026-10-14 · QA lokal 12/12 |
| `discipline`   | `discipline`   | ✔ `/violation-types` (+ `{id}`), `/discipline-settings`, `/warning-letters` (+ `{id}`, `suggestion/{employeeId}`, `alpha-days/{employeeId}`, `employee/{employeeId}`, `{id}/{issue,revoke,deliver,scan,pdf}`), `/self/warning-letters` (+ `{id}/acknowledge`) | employee, organization | attendance, employee, iam, notification, organization | 4 | `[done]` API & web 2026-10-15 · QA lokal 12/12 |
| `approval`     | `approval`     | ✔ `/approvals` (inbox, `/{id}`, `/{id}/decision`, `/decisions` massal)          | employee                | iam, employee, notification          | 5    | `[wip]` 2026-10-13 |
| `attendance`   | `attendance`   | ✔ `/holidays`, `/time-settings`, `/shifts`, `/roster-patterns`, `/crews`, `/roster`, `/roster-changes`, `/attendance/*` (absen PWA, hari absen, koreksi, absen manual, periode, surat pernyataan) | employee, organization | approval, leave; data karyawan/PT/lokasi sementara lewat adapter baca `directory.ts` (⚠ aturan emas #3, Backlog) | 5 | `[wip]` 2026-10-13 |
| `leave`        | `leave`        | ✔ `/leave-types`, `/leave-years`, `/leave`, `/leave-requests`, `/leave-balances`, `/leave-jobs` | employee                | approval, attendance                 | 6    | `[wip]` 2026-10-13 |
| `contract`     | `contract`     | `/contract-types`, `/contracts`                                                  | employee                | employee, notification               | 7    | `[planned]` |
| `payroll`      | `payroll`      | `/payroll/*`, `/payslips`                                                        | employee                | employee, attendance, leave, contract | 8   | `[planned]` |
| `notification` | `notification` | `/notifications`, `/notifications/:id/read`, `/notifications/read-all`          | –                       | –                                    | 2    | `[done]`    |

Endpoint non-modul: `GET /api/v1/health`, `GET /api/v1/openapi.json`, `GET /api/v1/docs`, `/api/cron/*` (khusus Vercel Cron).

---

## 6. Detail Modul

Nama tabel **snake_case jamak** (`@@map`), model Prisma **PascalCase tunggal**. Kolom standar (`id`, `created_at`, `updated_at`) tidak ditulis ulang di bawah.

Rincian per modul (pohon file api & web, tabel, catatan) ada di **`docs/codemap/`** — buka hanya modul yang disentuh:

| Modul | Detail | Fitur |
|---|---|---|
| `iam` | [codemap/iam.md](codemap/iam.md) | [iam](features/iam/README.md), [onboarding](features/onboarding/README.md), [dashboard](features/dashboard/README.md) |
| `audit` | [codemap/audit.md](codemap/audit.md) | [iam](features/iam/README.md) |
| `notification` | [codemap/notification.md](codemap/notification.md) | [iam](features/iam/README.md) |
| `organization` | [codemap/organization.md](codemap/organization.md) | [organisasi](features/organisasi/README.md) |
| `employee` | [codemap/employee.md](codemap/employee.md) | [karyawan](features/karyawan/README.md), [import-karyawan](features/import-karyawan/README.md), [onboarding](features/onboarding/README.md), [arsip](features/arsip/README.md), [dashboard](features/dashboard/README.md) |
| `approval` | [codemap/approval.md](codemap/approval.md) | [time-management](features/time-management/README.md) |
| `attendance` | [codemap/attendance.md](codemap/attendance.md) | [time-management](features/time-management/README.md) |
| `leave` | [codemap/leave.md](codemap/leave.md) | [time-management](features/time-management/README.md) |
| `contract` | [codemap/contract.md](codemap/contract.md) | [kontrak](features/kontrak/README.md) |
| `payroll` | [codemap/payroll.md](codemap/payroll.md) | [payroll](features/payroll/README.md) |
| `asset` | [codemap/asset.md](codemap/asset.md) | [arsip](features/arsip/README.md) |
| `discipline` | [codemap/discipline.md](codemap/discipline.md) | [arsip](features/arsip/README.md) |
| Prisma (skema, migrasi, seed) | [codemap/database.md](codemap/database.md) | semua |

---

## 7. Tugas Terjadwal (Vercel Cron → `/api/cron/*`)

| Job | Jadwal | Fungsi | Fase |
|---|---|---|---|
| `purge-selfies` | Harian | Hapus file selfie > 12 bulan, isi `selfie_purged_at` | 5 |
| `contract-expiry` | Harian | Notifikasi kontrak habis ≤ 30 hari | 7 |
| `grant-expiry` | Harian 01:00 UTC | Notifikasi grant akan kedaluwarsa ≤ 3 hari, sekali per grant (`dedupe_key`); grant kedaluwarsa sendiri dicek saat request | 2 `[done]` |
| `leave-accrual` | Harian | Akrual/reset saldo cuti sesuai aturan (digantikan `leave-daily`) | 6 |
| `asset-daily` | Harian 00:30 UTC (07:30 WIB) | ARS-D5/D6: pinjaman aset lewat tanggal kembali (pengelola + pemegang), APD jatuh tempo ganti (pengelola), aset & APD wajib kembali milik karyawan nonaktif (pengelola); dedupe per transaksi. Terdaftar di `apps/api/vercel.json` | 4 `[done]` |
| `discipline-daily` | Harian 00:45 UTC (07:45 WIB) | ARS-D8/D9: SP terbit lewat berlaku s/d → Kedaluwarsa (riwayat tetap, audit sistem); pengingat konfirmasi in-app (tanpa email) ke atasan "Sudah disampaikan" (tanpa atasan → penulis SP PT itu) dan karyawan "Sudah menerima" bila belum ≥ 2 hari setelah terbit; dedupe per SP. Terdaftar di `apps/api/vercel.json` | 4 `[done]` |
| `roster-extend` · `attendance-daily` · `leave-daily` | Harian | Terdaftar di `registerCronRoutes` (2026-10-13, Time Management): perpanjang hari roster dari pola · tugas harian absensi (batas approval, selfie) · jatah/hangus/hutang cuti. **Belum ada di `vercel.json`** (Backlog) | 5–6 `[wip]` |
| `document-expiry` | Harian 00:00 UTC (07:00 WIB) | D-055: pengingat dokumen versi aktif yang akan kedaluwarsa (ambang per jenis, bawaan 60/30/7 hari) & sudah kedaluwarsa ≤ 30 hari — ke karyawan (akun aktif) + HR PT terkait (jenis sensitif: HR ber-grant baca; tanpa HR → SA); dedupe per dokumen + ambang | 4 `[done]` |
| `email-retry` | Harian 02:00 UTC | Kirim ulang `email_outbox` yang jatuh tempo (maks 50/jalan; FAILED setelah 5 percobaan) | 2 `[done]` |
| `onboarding-maintenance` | Harian 03:00 UTC | D-045 d (menggantikan `onboarding-invitations`): (1) hapus permanen calon Dibatalkan > 30 hari (data, akun, notifikasi, file; user Auth di-ban + email anonim), (2) pengingat sekali per calon Diundang > 14 hari ke SA & HR ber-grant, (3) sisa antrean undangan (≤ 10 per jalan, batas `ONBOARDING_INVITES_PER_HOUR`; utama = halaman progres HR) | 4 `[done]` |

Semua endpoint cron memeriksa header `Authorization: Bearer ${CRON_SECRET}`. Di lokal, Vercel Cron tidak berjalan: job dipicu manual dengan request ke endpoint yang sama.

---

## 8. Environment Variables

Daftar lengkap disimpan di `.env.example`. **Satu file `.env` di root** dipakai semua workspace: api lewat `bun --env-file=../../.env`, Prisma CLI lewat `dotenv` di `prisma.config.ts`, web lewat `envDir` Vite. Di CI/Vercel env diisi langsung (file tidak ada).

**Dua database dapat ditukar lewat perintah (lokal ⇄ Supabase).** `DATABASE_URL`/`DIRECT_URL`/`STORAGE_PATH_PREFIX` = **profil aktif**; isi profil `LOCAL_*`/`SUPABASE_*` sekali, tukar dengan `bun run db:use local|supabase`, cek `bun run db:which`. Pilihan per-developer hidup di `.env` (gitignored) → aman-merge. Guard menolak `db:reset`/`db:seed`/test ke DB non-lokal (`HRIS_ALLOW_REMOTE_DB=1` untuk override). Panduan & konvensi: skill `.claude/skills/hris-db-switch`.

**Env Vercel staging (D-036, target *production* project staging; nilai rahasia hanya di Vercel):** `hris-staging-api`: `DATABASE_URL` (transaction pooler 6543), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CORS_ORIGINS`=`APP_URL`=`https://hris-staging-web.vercel.app`, `CRON_SECRET`, `SMTP_*`, `EMAIL_FROM`, `LOG_LEVEL`. `NODE_ENV` sengaja tidak diisi (Vercel mengisinya sendiri; `production` saat build membuat `bun install` melewati devDependencies seperti `prisma`). `hris-staging-web`: `VITE_API_BASE_URL`=`https://hris-staging-api.vercel.app/api/v1`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.

Validasi: api di `apps/api/src/env.ts`, web di `apps/web/src/lib/env.ts`. Variabel Supabase/SMTP/cron masih **opsional** di Fase 1 dan dijadikan wajib di fase yang memakainya.

| Variabel | Dipakai | Keterangan |
|---|---|---|
| `NODE_ENV` | api | `development` (default) · `test` · `production` |
| `PORT` | api | Port HTTP lokal, default `3000` |
| `LOG_LEVEL` | api | `debug` · `info` (default) · `warn` · `error` |
| `DATABASE_URL` | api (runtime) | **Profil aktif** (ditulis `db:use`). Lokal: PostgreSQL Docker (`localhost:5432`). Staging/produksi: **transaction pooler** (port 6543; staging: `aws-0-ap-northeast-2.pooler.supabase.com:6543`, user `postgres.iwgzuwcxsxnbjibhbqgh`) |
| `DIRECT_URL` | api (migrasi) | **Profil aktif** (ditulis `db:use`). Lokal: sama dengan `DATABASE_URL`. Staging/produksi: koneksi direct/session (port 5432) untuk `prisma migrate` |
| `LOCAL_*`, `SUPABASE_*` (`_DATABASE_URL`/`_DIRECT_URL`/`_STORAGE_PATH_PREFIX`) | `db:use` | Profil DB untuk `bun run db:use local|supabase`. `LOCAL_*` non-rahasia (Docker); `SUPABASE_*` **rahasia** (password di URL pooler; `SUPABASE_DATABASE_URL` ≠ `SUPABASE_URL` Auth) |
| `HRIS_ALLOW_REMOTE_DB` | `db:reset`/`db:seed`/test | Opsional. `1`/`true` → lewati guard yang menolak DB non-lokal pada perintah destruktif & test |
| `SUPABASE_URL` | api | URL project Supabase (JWKS & Admin API). **Wajib** kecuali `NODE_ENV=test`. Lokal: project **staging** `https://iwgzuwcxsxnbjibhbqgh.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | api | **Rahasia**. Hanya di server/script (`bootstrap:super-admin`), tidak pernah ke frontend |
| `CORS_ORIGINS` | api | Origin web yang diizinkan |
| `CRON_SECRET` | api | **Rahasia** untuk endpoint `/api/cron/*` (Vercel Cron mengirimnya otomatis sebagai Bearer). Kosong → endpoint cron selalu 401 |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | api | SMTP Google Workspace (D-025): `smtp.gmail.com`, port `587`, user = alamat akun pengirim, password = **App Password** (**rahasia**). Kosong di lokal → email aplikasi hanya dicatat ke log |
| `EMAIL_FROM` | api | Alamat pengirim = akun Workspace pengirim (OD-5), mis. `HRIS Arthasia <hris@<domain-kantor>>`. **Staging (D-032):** `HRIS Arthasia (Staging) <admin.arthasia@gmail.com>`, `SMTP_USER=admin.arthasia@gmail.com`; `SMTP_PASS` diisi di env Vercel (bukan repo). Lokal tetap kosong (email hanya ke log) |
| `ONBOARDING_INVITES_PER_HOUR` | api | D-045: batas undangan aktivasi per jam seluruh sistem (kosong = 25; di bawah limit email Supabase Auth ± 30/jam) |
| `APP_URL` | api | URL web untuk link di email. Lokal: `http://localhost:5173` |
| `VITE_API_BASE_URL` | web | mis. `http://localhost:3000/api/v1` |
| `VITE_SUPABASE_URL` | web | **Wajib.** URL project Supabase. Lokal: project **staging** `https://iwgzuwcxsxnbjibhbqgh.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | web | **Wajib.** Kunci publik Supabase (staging: publishable key `sb_publishable_…`, diambil via MCP) |
| `STORAGE_PATH_PREFIX` | api | Lokal: `dev/<nama-developer>/` (pemilik projek: `dev/oatse/`); staging/produksi: kosong. Format divalidasi `env.ts` (segmen huruf kecil diakhiri `/`); dipakai path foto `${prefix}employees/<id>/…` (2026-09-30) |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | api | D-060: isi file kunci service account Google (JSON satu baris; lokal diapit kutip tunggal di `.env`) untuk lampiran Google Drive di Import (`drive.readonly`). **Rahasia.** Kosong = lampiran tercatat di antrean, proses ditolak 422. Folder unggahan Form dibagikan ke email service account (Viewer) (2026-10-08) |
| `SEED_EMAIL_BASE` | seed | Email developer untuk plus-addressing `work_email` karyawan dummy (`nama@gmail.com` → `nama+dev-budi-0001@gmail.com`). Kosong → `work_email` kosong |

**Secret GitHub Actions** (Settings → Secrets and variables → Actions → *Repository secrets*; bukan env aplikasi):

| Secret | Dipakai | Keterangan |
|---|---|---|
| `STAGING_DIRECT_URL` | `deploy-staging.yml` | Connection string **session pooler** Supabase staging: `postgresql://postgres.iwgzuwcxsxnbjibhbqgh:<password>@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres` (port **5432**, bukan 6543; host direct hanya IPv6). **Rahasia**, sudah diisi 2026-09-28 |
| `VERCEL_TOKEN` | `deploy-staging.yml` | **Rahasia**. Token akun Vercel `oatse` untuk CLI (D-036) |
| `VERCEL_ORG_ID` | `deploy-staging.yml` | `team_xDA1pGujNeVtv8qdSzzYoTqJ` (team Pro "Arthasia Akselerasi", FND-D1; sebelum 2026-10-16: `team_LT9rBNwfha3zcvHfBB85LEXk` akun `oatse`) |
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
| `bun run db:use <local\|supabase>` | Tukar target DB aktif di `.env` (menulis ulang `DATABASE_URL`/`DIRECT_URL`/`STORAGE_PATH_PREFIX` dari profil `LOCAL_*`/`SUPABASE_*`). Tanpa argumen = tampilkan target aktif. Host saja (tanpa password). Skill `hris-db-switch` |
| `bun run db:which` | Tampilkan target DB aktif (host `DATABASE_URL`/`DIRECT_URL` + `STORAGE_PATH_PREFIX`) |
| `bun run db:reset` | Reset DB lokal + seed. **Ditolak bila target non-lokal** (`scripts/guard-local-db.ts`; lewati `HRIS_ALLOW_REMOTE_DB=1`). Prisma juga menolak bila dijalankan AI agent tanpa persetujuan eksplisit pengguna |
| `bun run db:seed` | Seed data dummy (idempoten; aman diulang). **Ditolak bila target non-lokal** (lihat `db:reset`) |
| `bun run storage:setup` (di `apps/api`) | Buat/selaraskan bucket Supabase Storage (D-037) memakai `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` dari `.env`; aman diulang; wajib dijalankan sekali per project (staging ✔, produksi saat Rilis 1) |
| `DEV_ACCOUNT_PASSWORD='...' bun run dev:account -- --email <e> --role <ROLE> [--employee-number <no>]` | Buat akun UJI per role (staging Auth + DB lokal), tautkan ke karyawan dummy; tidak untuk produksi; user Auth yang sudah ada tidak diubah password-nya |
| `bun run recover:primary-admin -- --to-email <e> --reason "..." [--dry-run]` | Pindahkan status Utama ke SUPER_ADMIN aktif (pemulihan manual, PLAN §4.4) + audit |
| `bun run bootstrap:super-admin -- --email <e> [--dry-run]` | Buat/promosikan SUPER_ADMIN Utama di DB target; idempoten; butuh `SUPABASE_SERVICE_ROLE_KEY` (kecuali dry-run). Memakai `bun run --cwd apps/api` (bukan `--filter`) agar input password tersembunyi mendapat TTY |
| `bun run build` | Build api (`bun build` → `apps/api/dist`) & web (`vite build` → `apps/web/dist`) |

Docker image api (jalan keluar dari Vercel): `docker build -f apps/api/Dockerfile -t hris-api .` dari root.

---

## 10. Cara Memperbarui CODEMAP

1. Folder/file **lintas modul** baru (root, `core/`, `lib/`, komponen bersama) → §1–§3 dengan status `[planned]` → `[wip]` → `[done]`. File **di dalam modul/fitur** → `docs/codemap/<modul>.md` (pohon file api & web + tabel); migrasi baru → `docs/codemap/database.md`.
2. Tabel/endpoint/izin baru → perbarui §5 (peta modul, satu baris) dan `docs/codemap/<modul>.md`. Izin baru juga wajib ditambahkan ke PLAN §4.2 dan `packages/shared/src/permissions.ts`. Rekan tim (mis. Mat) cukup mencatat file baru di README/log fiturnya; `codemap/` diperbarui saat branch-nya digabung ke develop (PROMPT §8). Izin baru juga wajib ditambahkan ke PLAN §4.2 dan `packages/shared/src/permissions.ts`.
3. Tabel/kolom/relasi berubah → perbarui juga `docs/erd/hris.dbml`. Cron baru → §7. Env var baru → §8 **dan** `.env.example`. Script baru → §9.
4. Jika implementasi menyimpang dari rencana di file ini, **perbarui file ini** agar sesuai dengan kode (CODEMAP menggambarkan kondisi nyata, PLAN menggambarkan keputusan).
5. Perbarui tanggal "Terakhir diubah".
