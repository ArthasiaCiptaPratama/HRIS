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
│   └── PROMPT.md                     [done] Bagaimana bekerja
├── .github/workflows/ci.yml          [wip] Job `quality` (typecheck, biome ci, boundaries, test shared & web, build) + job `api-db` (service Postgres 17: db:deploy dari DB kosong, db:check drift, test api). Belum dijalankan di GitHub
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
│   │   ├── organization.prisma
│   │   ├── employee.prisma
│   │   ├── attendance.prisma
│   │   ├── leave.prisma
│   │   ├── approval.prisma
│   │   ├── contract.prisma
│   │   ├── payroll.prisma
│   │   ├── notification.prisma
│   │   └── audit.prisma
│   ├── migrations/                   [wip] Hasil `prisma migrate dev` (di-commit, tidak pernah diedit setelah di-merge)
│   │   └── 20260928032354_init_module_schemas/  [done] SQL mentah: CREATE SCHEMA untuk 10 skema modul
│   └── seed/
│       └── index.ts                  [wip] Runner seed (daftar seeder masih kosong; diisi mulai Fase 3/4)
├── prisma.config.ts                  [done] Memuat `.env` root (dotenv), skema folder, `datasource.url = DIRECT_URL` (dipakai CLI migrate)
├── src/
│   ├── index.ts                      [done] Entry: `export default app` (Vercel & Bun; Bun membaca PORT, default 3000)
│   ├── app.ts                        [done] `createApp(deps?)`: request-id → logger → secure headers → CORS → OpenAPI/health; `defaultHook` Zod → 400; `onError`/`notFound` → envelope error
│   ├── env.ts                        [done] Validasi env dengan Zod (`getEnv()` lazy, `parseEnv()`); pesan error tanpa nilai env
│   ├── generated/                    # Client Prisma hasil generate (TIDAK di-commit, tidak diedit; dibuat oleh postinstall)
│   ├── core/                         [wip] Hal lintas modul (bukan logika bisnis domain)
│   │   ├── db.ts                     [done] `getPrisma()` (PrismaPg, pool max 5), `disconnectPrisma()`, `pingDatabase()`
│   │   ├── health.ts                 [done] `GET /api/v1/health` (200 ok / 503 degraded bila DB tidak terjangkau; tetap envelope `data`)
│   │   ├── auth/                     [planned] verifikasi JWT Supabase (JWKS), verifier bisa diganti saat test
│   │   ├── access/                   [planned] konteks akses: role, grant, tim; helper requireRole/requireGrant
│   │   ├── errors.ts                 [done] AppError + ValidationError/UnauthenticatedError/ForbiddenError/NotFoundError/ConflictError/BusinessRuleError
│   │   ├── response.ts               [done] `ok()`, `paginated()`, `dataEnvelope()`, `paginatedEnvelope()`, `ERROR_RESPONSES` (OpenAPI)
│   │   ├── logger.ts                 [done] Log JSON satu baris ke stdout, `redact()` field sensitif (jaring pengaman), `requestLogger()` (tanpa query string)
│   │   ├── audit.ts                  [planned] tulis audit log (dipakai semua modul)
│   │   ├── storage.ts                [planned] signed upload/download URL Supabase Storage
│   │   ├── supabase-admin.ts         [planned] client admin (service role): undangan, nonaktif akun
│   │   ├── openapi.ts                [done] Skema keamanan Bearer, `/api/v1/openapi.json` (OAS 3.1), `/api/v1/docs` (Swagger UI)
│   │   └── __tests__/                [done] Unit test app core, env, logger
│   ├── modules/
│   │   └── <modul>/                  # lihat §4 untuk struktur standar (belum ada modul)
│   └── jobs/                         [planned] Handler Vercel Cron (dilindungi CRON_SECRET)
├── scripts/
│   ├── bootstrap-super-admin.ts      [planned] Membuat akun SUPER_ADMIN Utama pertama (cari/buat user Auth berdasarkan email, lalu buat akun di DB target)
│   └── recover-primary-admin.ts      [planned] Pemulihan status Utama (manual, lihat PLAN §4.4)
├── tests/
│   ├── helpers/                      [planned] Factory data, login-as(role, grants)
│   └── integration/                  [wip] Test → PostgreSQL lokal: `health.test.ts`, `schemas.test.ts` (10 skema ada)
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
| `iam`          | `iam`          | `/me`, `/accounts`, `/roles`, `/grants`                                          | employee                | employee, notification               | 2    | `[planned]` |
| `audit` (core) | `audit`        | `/audit-logs`                                                                    | –                       | –                                    | 2    | `[planned]` |
| `organization` | `organization` | `/company`, `/settings`, `/departments`, `/positions`, `/job-levels`, `/work-locations`, `/holidays` | –           | –                                    | 3    | `[planned]` |
| `employee`     | `employee`     | `/employees`, `/employees/:id/*`, `/employees/import`                            | organization            | iam, organization                    | 4    | `[planned]` |
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
| `accounts` | `auth_user_id` (UUID Supabase, unik), `employee_id` (nullable), `email`, `is_active`, `is_primary_super_admin` |
| `account_roles` | `account_id`, `role` |
| `permission_grants` | `account_id`, `permission`, `expires_at?`, `reason?`, `granted_by`, `revoked_at?`, `revoked_by?` |

Endpoint utama: `GET /me` (profil + role + grant + tim) · `POST /accounts/:id/roles` · `DELETE /accounts/:id/roles/:role` · `POST /accounts/:id/deactivate` · `POST /accounts/primary-super-admin/transfer` · `GET|POST /grants` · `POST /grants/:id/revoke`

### 6.2 `audit` (core)
| Tabel | Isi penting |
|---|---|
| `audit_logs` | `actor_account_id`, `action`, `entity_type`, `entity_id`, `before`/`after` (JSON, **tanpa** nilai sensitif mentah), `reason?`, `request_id`, `ip`, `occurred_at` |

### 6.3 `organization`
| Tabel | Isi penting |
|---|---|
| `company_profile` | Satu baris: nama, NPWP perusahaan, alamat, logo |
| `system_settings` | Key-value terketik: zona waktu (`Asia/Jakarta`), toleransi telat, dll. |
| `departments` | `name`, `parent_id?` |
| `positions`, `job_levels` | Master jabatan & level |
| `work_locations` | `name`, `latitude`, `longitude`, `radius_m` |
| `holidays` | `date`, `name`, `is_collective_leave` |

### 6.4 `employee`
| Tabel | Isi penting |
|---|---|
| `employees` | `employee_number`, `full_name`, `work_email`, `phone`, `department_id`, `position_id`, `job_level_id`, `work_location_id`, `manager_id` (self FK), `join_date`, `employment_status`, `allow_remote_attendance`, `is_active` |
| `employee_personal` | **Sensitif**: `nik`, `npwp`, `kk_number`, `birth_date`, `birth_place`, `address`, `marital_status`, `dependents`, `ptkp_status` |
| `employee_bank_accounts` | **Sensitif**: `bank_name`, `account_number`, `account_holder` |
| `emergency_contacts` | Nama, hubungan, telepon |
| `employee_documents` | `type`, `storage_path`, `uploaded_by` |
| `employment_histories` | Riwayat jabatan/departemen/atasan |
| `import_jobs` | Status & hasil import CSV/Excel |

Data sensitif dipisah ke tabel sendiri supaya kontrol akses (grant) jelas di level repository.

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
| `DATABASE_URL` | api (runtime) | Lokal: PostgreSQL Docker (`localhost:5432`). Staging/produksi: **transaction pooler** (port 6543) |
| `DIRECT_URL` | api (migrasi) | Lokal: sama dengan `DATABASE_URL`. Staging/produksi: koneksi direct/session (port 5432) untuk `prisma migrate` |
| `SUPABASE_URL` | api | URL project Supabase (JWKS & Admin API). Lokal: project **staging** |
| `SUPABASE_SERVICE_ROLE_KEY` | api | **Rahasia**. Hanya di server, tidak pernah ke frontend |
| `CORS_ORIGINS` | api | Origin web yang diizinkan |
| `CRON_SECRET` | api | Rahasia untuk endpoint cron |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | api | SMTP Google Workspace (D-025): `smtp.gmail.com`, port `587`, user = alamat akun pengirim, password = **App Password** (**rahasia**). Kosong di lokal → email aplikasi hanya dicatat ke log |
| `EMAIL_FROM` | api | Alamat pengirim = akun Workspace pengirim (OD-5), mis. `HRIS Arthasia <hris@<domain-kantor>>` |
| `APP_URL` | api | URL web untuk link di email. Lokal: `http://localhost:5173` |
| `VITE_API_BASE_URL` | web | mis. `http://localhost:3000/api/v1` |
| `VITE_SUPABASE_URL` | web | URL project Supabase. Lokal: project **staging** |
| `VITE_SUPABASE_ANON_KEY` | web | Kunci publik (anon/publishable) Supabase |
| `STORAGE_PATH_PREFIX` | api | Lokal: `dev/<nama-developer>/`; staging/produksi: kosong |

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
| `bun run db:deploy` | `prisma migrate deploy` (CI dari DB kosong; staging/produksi menunggu OD-7) |
| `bun run db:check` | `prisma migrate diff --exit-code`: gagal jika skema Prisma berbeda dari DB hasil migrasi (migrasi lupa dibuat) |
| `bun run db:reset` | Reset DB lokal + seed. Prisma menolak perintah ini bila dijalankan AI agent tanpa persetujuan eksplisit pengguna |
| `bun run db:seed` | Seed data dummy |
| `bun run bootstrap:super-admin` | [planned] Buat SUPER_ADMIN Utama pertama (Fase 2) |
| `bun run build` | Build api (`bun build` → `apps/api/dist`) & web (`vite build` → `apps/web/dist`) |

Docker image api (jalan keluar dari Vercel): `docker build -f apps/api/Dockerfile -t hris-api .` dari root.

---

## 10. Cara Memperbarui CODEMAP

1. Folder/file penting baru → tambahkan di §1–§3 dengan status. Ubah status `[planned]` → `[wip]` → `[done]` sesuai kondisi.
2. Tabel/endpoint/izin baru → perbarui §5–§6. Izin baru juga wajib ditambahkan ke PLAN §4.2 dan `packages/shared/src/permissions.ts`.
3. Cron baru → §7. Env var baru → §8 **dan** `.env.example`. Script baru → §9.
4. Jika implementasi menyimpang dari rencana di file ini, **perbarui file ini** agar sesuai dengan kode (CODEMAP menggambarkan kondisi nyata, PLAN menggambarkan keputusan).
5. Perbarui tanggal "Terakhir diubah".
