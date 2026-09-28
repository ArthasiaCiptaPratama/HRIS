# CODEMAP — HRIS

> **Fungsi file ini:** peta **di mana** setiap hal berada: struktur folder, modul, tabel, endpoint, izin, env var, dan script.
> Baca bagian yang relevan **sebelum** membuat atau mencari file. **Wajib diperbarui** setiap kali ada folder, modul, tabel, endpoint, izin, atau env var baru (lihat §10).

**Status:** `[planned]` belum dibuat · `[wip]` sedang dikerjakan · `[done]` selesai & teruji

| Metadata        | Nilai                                                        |
| --------------- | ------------------------------------------------------------ |
| Terakhir diubah | 2026-09-28                                                   |
| Kondisi repo    | Fase 0: hanya `README.md`, `CLAUDE.md`, dan `docs/`          |

---

## 1. Struktur Root

```
HRIS/
├── apps/
│   ├── api/                          [planned] Backend Bun + Hono + Prisma (Vercel project "api")
│   └── web/                          [planned] Frontend React + Vite (Vercel project "web")
├── packages/
│   └── shared/                       [planned] @hris/shared: skema Zod DTO, enum, kode role & izin
├── docker-compose.yml                [planned] PostgreSQL lokal untuk development & test (D-023); versi = Supabase, TZ=UTC
├── e2e/                              [planned] Test Playwright
├── docs/
│   ├── PLAN.md                       [done] Apa & kenapa
│   ├── CODEMAP.md                    [done] Di mana (file ini)
│   ├── PROGRESS.md                   [done] Sampai mana
│   └── PROMPT.md                     [done] Bagaimana bekerja
├── .github/workflows/ci.yml          [planned] Typecheck, lint, batas modul, migrasi dari DB kosong + test (service container Postgres), build
├── CLAUDE.md                         [done] Penunjuk ke docs/PROMPT.md untuk AI agent
├── README.md                         [done] Ringkasan + tautan ke docs
├── package.json                      [planned] Bun workspaces + script global
├── biome.json                        [planned] Lint & format
├── .dependency-cruiser.cjs           [planned] Aturan batas modul
├── tsconfig.base.json                [planned] Konfigurasi TS bersama
├── .editorconfig                     [planned]
├── .gitattributes                    [planned] Paksa LF (dual boot Linux/Windows)
├── .gitignore                        [planned]
└── .env.example                      [planned] Daftar env var tanpa nilai rahasia
```

---

## 2. `apps/api`

```
apps/api/
├── prisma/
│   ├── schema/                       [planned] Skema Prisma multi-file
│   │   ├── _base.prisma              # generator (prisma-client, runtime bun) + datasource (daftar skema Postgres)
│   │   ├── iam.prisma
│   │   ├── organization.prisma
│   │   ├── employee.prisma
│   │   ├── attendance.prisma
│   │   ├── leave.prisma
│   │   ├── approval.prisma
│   │   ├── contract.prisma
│   │   ├── payroll.prisma
│   │   ├── notification.prisma
│   │   └── audit.prisma
│   ├── migrations/                   [planned] Hasil `prisma migrate dev` (di-commit, tidak pernah diedit setelah di-merge)
│   └── seed/                         [planned] Seed data dummy per modul
├── prisma.config.ts                  [planned]
├── src/
│   ├── index.ts                      [planned] Entry: export app untuk Bun/Vercel
│   ├── app.ts                        [planned] Merakit middleware + route semua modul di /api/v1
│   ├── env.ts                        [planned] Validasi env dengan Zod (gagal cepat)
│   ├── generated/                    # Client Prisma hasil generate (TIDAK di-commit, tidak diedit)
│   ├── core/                         [planned] Hal lintas modul (bukan logika bisnis domain)
│   │   ├── db.ts                     # instance PrismaClient + driver adapter
│   │   ├── auth/                     # verifikasi JWT Supabase (JWKS), verifier bisa diganti saat test
│   │   ├── access/                   # konteks akses: role, grant, tim; helper requireRole/requireGrant
│   │   ├── errors.ts                 # AppError + turunannya → envelope error
│   │   ├── response.ts               # helper envelope sukses + paginasi
│   │   ├── logger.ts                 # log JSON terstruktur (tanpa PII) + request id
│   │   ├── audit.ts                  # tulis audit log (dipakai semua modul)
│   │   ├── storage.ts                # signed upload/download URL Supabase Storage
│   │   ├── supabase-admin.ts         # client admin (service role): undangan, nonaktif akun
│   │   └── openapi.ts                # konfigurasi dokumen OpenAPI
│   ├── modules/
│   │   └── <modul>/                  # lihat §4 untuk struktur standar
│   └── jobs/                         [planned] Handler Vercel Cron (dilindungi CRON_SECRET)
├── scripts/
│   ├── bootstrap-super-admin.ts      [planned] Membuat akun SUPER_ADMIN Utama pertama (cari/buat user Auth berdasarkan email, lalu buat akun di DB target)
│   └── recover-primary-admin.ts      [planned] Pemulihan status Utama (manual, lihat PLAN §4.4)
├── tests/
│   ├── helpers/                      [planned] Factory data, login-as(role, grants)
│   └── integration/                  [planned] Test HTTP → PostgreSQL lokal (auth via verifier pengganti)
├── Dockerfile                        [planned] Jalan keluar dari Vercel (tidak dipakai di deploy saat ini)
├── vercel.json                       [planned] bunVersion, region sin1, cron
├── tsconfig.json
└── package.json                      # name: @hris/api
```

## 3. `apps/web`

```
apps/web/
├── src/
│   ├── main.tsx                      [planned] Entry
│   ├── app/
│   │   ├── router.tsx                # React Router + guard per role
│   │   ├── providers.tsx             # TanStack Query, auth, theme
│   │   └── layout/                   # shell: sidebar menu per role, header, notifikasi
│   ├── lib/
│   │   ├── supabase.ts               # supabase-js (login, sesi)
│   │   ├── api-client.ts             # fetch ke API + Bearer token + parsing envelope
│   │   └── access.ts                 # helper can(role/grant) untuk UI (bukan pengganti cek di API)
│   ├── components/ui/                # komponen shadcn/ui
│   ├── components/                   # komponen bersama (DataTable, FormField, ConfirmDialog, ...)
│   └── features/
│       └── <modul>/                  # per modul: pages/, components/, api.ts (hook TanStack Query), schemas.ts
├── tests/                            [planned] Vitest + Testing Library
├── index.html
├── vite.config.ts
├── vercel.json                       # rewrite SPA
└── package.json                      # name: @hris/web
```

`packages/shared/src/` [planned]:
```
├── index.ts
├── roles.ts                          # ROLE: SUPER_ADMIN, HR_ADMIN, MANAGER, EMPLOYEE
├── permissions.ts                    # daftar kode grant (PLAN §4.2)
├── enums.ts                          # status approval, jenis cuti/izin, dll.
└── schemas/<modul>.ts                # skema Zod DTO yang dipakai FE & BE
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

Daftar lengkap disimpan di `.env.example`.

| Variabel | Dipakai | Keterangan |
|---|---|---|
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

## 9. Script Root (Rencana)

| Perintah | Fungsi |
|---|---|
| `bun install` | Install semua workspace |
| `bun run db:up` / `db:down` | Menjalankan / menghentikan PostgreSQL lokal (`docker compose`) |
| `bun run dev` | api + web mode watch |
| `bun run dev:api` / `dev:web` | Salah satu saja |
| `bun run typecheck` | `tsc --noEmit` semua workspace |
| `bun run lint` / `format` | Biome |
| `bun run check:boundaries` | dependency-cruiser |
| `bun run test` / `test:api` / `test:web` / `test:e2e` | Test |
| `bun run db:generate` | `prisma generate` |
| `bun run db:migrate` | `prisma migrate dev` (lokal) |
| `bun run db:deploy` | `prisma migrate deploy` (staging/produksi) |
| `bun run db:reset` | Reset DB lokal + seed |
| `bun run db:seed` | Seed data dummy |
| `bun run bootstrap:super-admin` | Buat SUPER_ADMIN Utama pertama |
| `bun run build` | Build web & api |

---

## 10. Cara Memperbarui CODEMAP

1. Folder/file penting baru → tambahkan di §1–§3 dengan status. Ubah status `[planned]` → `[wip]` → `[done]` sesuai kondisi.
2. Tabel/endpoint/izin baru → perbarui §5–§6. Izin baru juga wajib ditambahkan ke PLAN §4.2 dan `packages/shared/src/permissions.ts`.
3. Cron baru → §7. Env var baru → §8 **dan** `.env.example`. Script baru → §9.
4. Jika implementasi menyimpang dari rencana di file ini, **perbarui file ini** agar sesuai dengan kode (CODEMAP menggambarkan kondisi nyata, PLAN menggambarkan keputusan).
5. Perbarui tanggal "Terakhir diubah".
