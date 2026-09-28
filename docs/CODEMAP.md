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
│   └── erd/hris.dbml                 [done] Diagram ERD (DBML, buka di dbdiagram.io); cermin skema Prisma, disetujui pemilik projek 2026-09-28
├── .github/workflows/ci.yml          [done] Job `quality` (typecheck, biome ci, boundaries, test shared & web, build) + job `api-db` (service Postgres 17: db:deploy dari DB kosong, db:check drift, test api). Hijau di GitHub
├── .github/workflows/deploy-staging.yml [done] D-030: push ke `HRIS/debug/fe-be` → `db:deploy` + `db:check` ke Supabase staging (secret `STAGING_DIRECT_URL`), lalu Deploy Hook Vercel opsional. Pertama sukses 2026-09-28 (run #36385730691)
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
│   │   ├── organization.prisma      [done] departments, positions, employment_statuses, grades, work_locations (ERD, D-026)
│   │   ├── employee.prisma          [done] employees, employee_personal, employee_bank_accounts, family_members, educations, trainings + enum (ERD, D-026)
│   │   ├── attendance.prisma
│   │   ├── leave.prisma
│   │   ├── approval.prisma
│   │   ├── contract.prisma
│   │   ├── payroll.prisma
│   │   ├── notification.prisma
│   │   └── audit.prisma
│   ├── migrations/                   [wip] Hasil `prisma migrate dev` (di-commit, tidak pernah diedit setelah di-merge)
│   │   ├── 20260928032354_init_module_schemas/  [done] SQL mentah: CREATE SCHEMA untuk 10 skema modul
│   │   ├── 20260928035758_add_organization_and_employee_master/  [done] Tabel ERD organization & employee
│   │   ├── 20260928061939_enable_rls_on_prisma_migrations/  [done] RLS pada `public._prisma_migrations` (advisor Supabase; bersyarat, portabel)
│   │   └── 20260928062734_add_departments_parent_id_index/  [done] Index FK `departments.parent_id` (advisor performa)
│   └── seed/                         [done] Idempoten (upsert), menolak NODE_ENV=production
│       ├── index.ts                  Runner: organization → employee
│       ├── organization.ts           5 departemen, 12 jabatan, 4 status, 5 grade, 2 lokasi (Jakarta, Bandung)
│       └── employee.ts               15 karyawan dummy (5 manajer) + data pribadi/rekening/keluarga/pendidikan/pelatihan fiktif; `work_email` dari SEED_EMAIL_BASE
├── prisma.config.ts                  [done] Memuat `.env` root (dotenv), skema folder, `datasource.url = DIRECT_URL` (dipakai CLI migrate)
├── src/
│   ├── index.ts                      [done] Entry: `export default app` (Vercel & Bun; Bun membaca PORT, default 3000)
│   ├── app.ts                        [done] `createApp(deps?)`: request-id → logger → secure headers → CORS → OpenAPI/health → route modul (dilindungi `protect` = authenticate + loadActor); deps bisa diganti di test (`tokenVerifier`, `actorLoader`); `defaultHook` Zod → 400; `onError`/`notFound` → envelope error
│   ├── env.ts                        [done] Validasi env dengan Zod (`getEnv()` lazy, `parseEnv()`); `SUPABASE_URL` wajib kecuali NODE_ENV=test; pesan error tanpa nilai env
│   ├── generated/                    # Client Prisma hasil generate (TIDAK di-commit, tidak diedit; dibuat oleh postinstall)
│   ├── core/                         [wip] Hal lintas modul (bukan logika bisnis domain)
│   │   ├── db.ts                     [done] `getPrisma()` (PrismaPg, pool max 5), `disconnectPrisma()`, `pingDatabase()`
│   │   ├── health.ts                 [done] `GET /api/v1/health` (200 ok / 503 degraded bila DB tidak terjangkau; tetap envelope `data`)
│   │   ├── auth/                     [done] `TokenVerifier`, `createSupabaseVerifier` (JWKS ES256; cek iss, aud=authenticated, role, sub UUID), middleware `authenticate()` → 401
│   │   ├── access/                   [wip] `Actor`, `hasRole`, `hasPermission` (grant hanya untuk role penerima sah), `isGrantActive`, middleware `loadActor(loader)` (tanpa akun aktif → 401), `requireRole`, `requirePermission` (→ 403). Tim MANAGER belum (menunggu modul employee)
│   │   ├── errors.ts                 [done] AppError + ValidationError/UnauthenticatedError/ForbiddenError/NotFoundError/ConflictError/BusinessRuleError
│   │   ├── response.ts               [done] `ok()`, `paginated()`, `dataEnvelope()`, `paginatedEnvelope()`, `ERROR_RESPONSES` (OpenAPI)
│   │   ├── logger.ts                 [done] Log JSON satu baris ke stdout, `redact()` field sensitif (jaring pengaman), `requestLogger()` (tanpa query string)
│   │   ├── audit.ts                  [done] `writeAudit(entry, client?)`: bisa ikut transaksi; before/after diredaksi (jaring pengaman)
│   │   ├── storage.ts                [planned] signed upload/download URL Supabase Storage
│   │   ├── supabase-admin.ts         [wip] `createSupabaseAdmin()`: `findUserByEmail`, `createConfirmedUser` (service role; server/script saja). Undangan & nonaktif akun menyusul
│   │   ├── openapi.ts                [done] Skema keamanan Bearer, `/api/v1/openapi.json` (OAS 3.1), `/api/v1/docs` (Swagger UI)
│   │   └── __tests__/                [done] Unit test app core, env, logger
│   ├── modules/
│   │   ├── iam/                      [wip] `GET /me`; `loadActor` (pemuat aktor untuk core/access); `bootstrapPrimarySuperAdmin` (transaksi + audit); policy `canReadOwnAccount`
│   │   └── <modul>/                  # lihat §4 untuk struktur standar
│   └── jobs/                         [planned] Handler Vercel Cron (dilindungi CRON_SECRET)
├── scripts/
│   ├── bootstrap-super-admin.ts      [wip] `--email <e> [--dry-run]`: cari/buat user Auth (password diketik tersembunyi), lalu `bootstrapPrimarySuperAdmin` di DB target. Jalan nyata ✔ (Utama `admin.arthasia@gmail.com` di DB lokal)
│   └── recover-primary-admin.ts      [planned] Pemulihan status Utama (manual, lihat PLAN §4.4)
├── tests/
│   ├── helpers/auth.ts               [done] `testVerifier` (token `test-token:<uuid>`), `bearer()`, `createAuthFixture(run)` → `loginAs(role, {grants, employeeId, isActive, primary})` + `cleanup()`
│   └── integration/                  [wip] Test → PostgreSQL lokal: `health.test.ts`, `schemas.test.ts` (10 skema ada), `employee-schema.test.ts` (constraint ERD); `tests/seed.test.ts` (generator NIK/email seed); `iam-schema.test.ts`, `audit.test.ts`, `iam/me.test.ts`, `iam/bootstrap.test.ts`
├── Dockerfile                        [done] Multi-stage `oven/bun:1.4.2-alpine`, bundle `bun build`, user non-root, HEALTHCHECK. Build dari root: `docker build -f apps/api/Dockerfile .`
├── vercel.json                       [wip] bunVersion 1.x, region sin1, install dari root, build = prisma generate (cron ditambahkan per fase). Belum diuji di Vercel
├── tsconfig.json                     [done]
└── package.json                      # name: @hris/api
```

## 3. `apps/web`

```
apps/web/
├── src/
│   ├── main.tsx                      [done] Entry (StrictMode + Providers + RouterProvider dari `react-router/dom`)
│   ├── index.css                     [done] Tailwind v4 + tema shadcn/ui (token terang/gelap)
│   ├── app/
│   │   ├── router.tsx                [wip] `routes` + `createRouter()` (React Router 8, data mode); guard per role di Fase 2
│   │   ├── providers.tsx             [wip] TanStack Query (`createQueryClient`); auth & theme di Fase 2
│   │   └── layout/app-layout.tsx     [wip] Shell: sidebar (menu statis "Beranda"), header, <Outlet/>; menu per role di Fase 2
│   ├── lib/
│   │   ├── env.ts                    [done] Validasi `import.meta.env` (VITE_*) dengan Zod
│   │   ├── api-client.ts             [done] `createApiClient()`: fetch + Bearer (opsional) + parsing envelope → `ApiError`
│   │   ├── api.ts                    [done] Instance api client aplikasi
│   │   ├── utils.ts                  [done] `cn()` (clsx + tailwind-merge) untuk shadcn/ui
│   │   ├── supabase.ts               [planned] supabase-js (login, sesi) — Fase 2
│   │   └── access.ts                 [planned] helper can(role/grant) untuk UI (bukan pengganti cek di API) — Fase 2
│   ├── components/ui/                [wip] shadcn/ui: button, card, badge (import `cn` diarahkan ke `@/lib/utils`)
│   ├── components/                   [planned] komponen bersama (DataTable, FormField, ConfirmDialog, ...)
│   └── features/
│       ├── system/                   [done] Halaman beranda (status API/DB via `useHealth`), 404, error boundary
│       └── <modul>/                  # per modul: pages/, components/, api.ts (hook TanStack Query), schemas.ts
├── tests/                            [done] Vitest + Testing Library (jsdom): api-client, layout & router
├── components.json                   [done] Konfigurasi shadcn CLI (`bunx --bun shadcn@4.21.0 add <komponen>`)
├── index.html                        [done] lang="id"
├── vite.config.ts                    [done] React + Tailwind, alias `@` → src, envDir = root, port 5173, konfigurasi Vitest
├── vercel.json                       [wip] Rewrite SPA, install dari root. Belum diuji di Vercel
└── package.json                      # name: @hris/web
```

`packages/shared/` [done] (paket sumber TS, diekspor langsung dari `src/index.ts` tanpa build):
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
| `iam`          | `iam`          | `/me` ✔, `/accounts`, `/roles`, `/grants`                                        | employee                | employee, notification               | 2    | `[wip]`     |
| `audit` (core) | `audit`        | `/audit-logs`                                                                    | –                       | –                                    | 2    | `[wip]` (tabel + `writeAudit`) |
| `organization` | `organization` | `/company`, `/settings`, `/departments`, `/positions`, `/employment-statuses`, `/grades`, `/work-locations`, `/holidays` | –           | –                                    | 3    | `[planned]` |
| `employee`     | `employee`     | `/employees`, `/employees/:id/*` (personal, bank-account, family-members, educations, trainings), `/employees/import`                            | organization            | iam, organization                    | 4    | `[planned]` |
| `approval`     | `approval`     | `/approvals` (inbox keputusan)                                                   | employee                | iam, employee, notification          | 5    | `[planned]` |
| `attendance`   | `attendance`   | `/attendance`, `/shifts`, `/schedules`, `/attendance-corrections`, `/overtime`, `/attendance-periods` | employee, organization | approval, organization, employee | 5 | `[planned]` |
| `leave`        | `leave`        | `/leave-types`, `/leave-balances`, `/leave-requests`                             | employee                | approval, attendance, organization   | 6    | `[planned]` |
| `contract`     | `contract`     | `/contract-types`, `/contracts`                                                  | employee                | employee, notification               | 7    | `[planned]` |
| `payroll`      | `payroll`      | `/payroll/*`, `/payslips`                                                        | employee                | employee, attendance, leave, contract | 8   | `[planned]` |
| `notification` | `notification` | `/notifications`                                                                 | –                       | –                                    | 2    | `[planned]` |

Endpoint non-modul: `GET /api/v1/health`, `GET /api/v1/openapi.json`, `GET /api/v1/docs`, `/api/cron/*` (khusus Vercel Cron).

---

## 6. Detail Modul (Rencana)

Nama tabel **snake_case jamak** (`@@map`), model Prisma **PascalCase tunggal**. Kolom standar (`id`, `created_at`, `updated_at`) tidak ditulis ulang di bawah.

### 6.1 `iam`
| Tabel | Isi penting |
|---|---|
| `accounts` | ERD `user_account`: `auth_user_id` (UUID Supabase, unik), `employee_id` (nullable, unik), `email`, `role` (enum `Role`, **satu per akun**, D-028), `is_active`, `last_login_at`, `is_primary_super_admin`. **Tanpa** `password_hash` (password di Supabase Auth, D-005) |
| `permission_grants` | `account_id`, `permission`, `expires_at?`, `reason?`, `granted_by`, `revoked_at?`, `revoked_by?` |

Endpoint utama: `GET /me` (profil + role + grant + tim) · `PATCH /accounts/:id/role` · `POST /accounts/:id/deactivate` · `POST /accounts/primary-super-admin/transfer` · `GET|POST /grants` · `POST /grants/:id/revoke`

### 6.2 `audit` (core)
| Tabel | Isi penting |
|---|---|
| `audit_logs` | `actor_account_id`, `action`, `entity_type`, `entity_id`, `before`/`after` (JSON, **tanpa** nilai sensitif mentah), `reason?`, `request_id`, `ip`, `occurred_at` |

### 6.3 `organization`
Status: tabel ERD **[done]** (skema + migrasi, belum ada endpoint). `company_profile`, `system_settings`, `holidays` **[planned]**.

| Tabel | Isi penting |
|---|---|
| `company_profile` | [planned] Satu baris: nama, NPWP perusahaan, alamat, logo |
| `system_settings` | [planned] Key-value terketik: zona waktu (`Asia/Jakarta`), toleransi telat, dll. |
| `departments` | `name` (unik), `parent_id?` (hierarki, ber-index), `deleted_at?` |
| `positions` | `name`, `department_id` (FK, ERD) — unik per departemen, `deleted_at?` |
| `employment_statuses` | ERD `employment_status`: `name` (unik; mis. Tetap, Kontrak, Probation, Magang), `deleted_at?` |
| `grades` | ERD `grade` (menggantikan rencana `job_levels`): `name` (unik), `deleted_at?` |
| `work_locations` | `name` (unik), `city?`, `address?`, `latitude?`, `longitude?` Decimal(9,6), `radius_m?` (geofence wajib di Fase 5), `deleted_at?` |
| `holidays` | [planned] `date`, `name`, `is_collective_leave` |

FK dari `employees` ke master data memakai `ON DELETE RESTRICT`: master yang dipakai tidak bisa dihapus (pakai `deleted_at`).

### 6.4 `employee`
Status: tabel ERD **[done]** (skema + migrasi, belum ada endpoint). Pemetaan lengkap ERD → tabel: `.claude/skills/hris-db-schema/ERD.md`.

| Tabel | Isi penting |
|---|---|
| `employees` | `employee_number` (ERD `nik` = Nomor Induk Karyawan, unik), `full_name`, `work_email?` (unik), `phone_number?`, `emergency_phone?`, `gender?` (enum), `join_date`, `end_date?`, `employment_status_id`, `position_id` (departemen lewat posisi), `work_location_id?`, `grade_id?`, `manager_id?` (self FK), `is_active` |
| `employee_personal` | **Sensitif** (1:1, PK = `employee_id`): `ktp_number` (NIK KTP, unik), `npwp_number`, `kk_number`, `birth_place`, `birth_date`, `ktp_address`, `domicile_address`, `marital_status` (enum), `religion` (enum) |
| `employee_bank_accounts` | **Sensitif** (1:1): `bank_name`, `account_number`, `account_holder?` |
| `family_members` | ERD `family`, **sensitif** (data pribadi pihak ketiga): `name`, `relationship` (enum), `address?`, `birth_date?` (ERD `age`), `phone_number?` |
| `educations` | `school_name`, `major?`, `graduation_year?` |
| `trainings` | `training_field`, `organizer?`, `duration?`, `training_year?` |
| `employee_documents` | [planned] `type`, `storage_path`, `uploaded_by` |
| `employment_histories` | [planned] Riwayat jabatan/departemen/atasan |
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
| `notifications` | `recipient_account_id`, `type`, `title`, `link`, `read_at?` |
| `email_outbox` | Email gagal kirim untuk dicoba ulang oleh cron |

---

## 7. Tugas Terjadwal (Vercel Cron → `/api/cron/*`)

| Job | Jadwal | Fungsi | Fase |
|---|---|---|---|
| `purge-selfies` | Harian | Hapus file selfie > 12 bulan, isi `selfie_purged_at` | 5 |
| `contract-expiry` | Harian | Notifikasi kontrak habis ≤ 30 hari | 7 |
| `grant-expiry` | Harian | Notifikasi grant akan kedaluwarsa (grant kedaluwarsa sendiri dicek saat request) | 2 |
| `leave-accrual` | Harian | Akrual/reset saldo cuti sesuai aturan | 6 |
| `email-retry` | Harian | Kirim ulang isi `email_outbox` | 2 |

Semua endpoint cron memeriksa header `Authorization: Bearer ${CRON_SECRET}`. Di lokal, Vercel Cron tidak berjalan: job dipicu manual dengan request ke endpoint yang sama.

---

## 8. Environment Variables

Daftar lengkap disimpan di `.env.example`. **Satu file `.env` di root** dipakai semua workspace: api lewat `bun --env-file=../../.env`, Prisma CLI lewat `dotenv` di `prisma.config.ts`, web lewat `envDir` Vite. Di CI/Vercel env diisi langsung (file tidak ada).

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
| `CRON_SECRET` | api | Rahasia untuk endpoint cron |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | api | SMTP Google Workspace (D-025): `smtp.gmail.com`, port `587`, user = alamat akun pengirim, password = **App Password** (**rahasia**). Kosong di lokal → email aplikasi hanya dicatat ke log |
| `EMAIL_FROM` | api | Alamat pengirim = akun Workspace pengirim (OD-5), mis. `HRIS Arthasia <hris@<domain-kantor>>`. **Staging (D-032):** `HRIS Arthasia (Staging) <admin.arthasia@gmail.com>`, `SMTP_USER=admin.arthasia@gmail.com`; `SMTP_PASS` diisi di env Vercel (bukan repo). Lokal tetap kosong (email hanya ke log) |
| `APP_URL` | api | URL web untuk link di email. Lokal: `http://localhost:5173` |
| `VITE_API_BASE_URL` | web | mis. `http://localhost:3000/api/v1` |
| `VITE_SUPABASE_URL` | web | URL project Supabase. Lokal: project **staging** |
| `VITE_SUPABASE_ANON_KEY` | web | Kunci publik (anon/publishable) Supabase |
| `STORAGE_PATH_PREFIX` | api | Lokal: `dev/<nama-developer>/`; staging/produksi: kosong |
| `SEED_EMAIL_BASE` | seed | Email developer untuk plus-addressing `work_email` karyawan dummy (`nama@gmail.com` → `nama+dev-budi-0001@gmail.com`). Kosong → `work_email` kosong |

**Secret GitHub Actions** (Settings → Secrets and variables → Actions → *Repository secrets*; bukan env aplikasi):

| Secret | Dipakai | Keterangan |
|---|---|---|
| `STAGING_DIRECT_URL` | `deploy-staging.yml` | Connection string **session pooler** Supabase staging: `postgresql://postgres.iwgzuwcxsxnbjibhbqgh:<password>@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres` (port **5432**, bukan 6543; host direct hanya IPv6). **Rahasia**, sudah diisi 2026-09-28 |
| `VERCEL_DEPLOY_HOOK_API_STAGING`, `VERCEL_DEPLOY_HOOK_WEB_STAGING` | `deploy-staging.yml` | Opsional; URL Deploy Hook project Vercel untuk branch `HRIS/debug/fe-be` (setelah project Vercel dibuat) |

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
