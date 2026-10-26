# Codemap — `iam`

> Detail modul `iam`, dipindah utuh dari `CODEMAP.md` §2/§3/§6 pada 2026-10-13. Struktur standar modul: [CODEMAP §4](../CODEMAP.md#4-struktur-standar-modul-appsapisrcmodulesmodul) · peta modul: [CODEMAP §5](../CODEMAP.md#5-peta-modul). Fitur pemakai: [iam](../features/iam/README.md) · [onboarding](../features/onboarding/README.md) · [dashboard](../features/dashboard/README.md).

## API (`apps/api/src/modules/`)

```
│   │   ├── iam/                      [done] 13 endpoint (`/me` + `employeeName` nama karyawan tertaut, BUG-004 2026-10-12; + `employeeCompanyId` untuk app mobile M3 2026-10-26; + `PUT /accounts/:id/companies` D-040: penugasan PT HR, SA saja, audit + notifikasi; HR hanya akun karyawan PT-nya + akun belum tertaut; ganti role dari HR mencabut penugasan; `configureIam`) + fungsi publik untuk employee (`getAccountLinksForEmployees`, `getAccountSummaries`, `listManagerEmployeeIds`, `deactivateAccountOfEmployee`) (akun, role, nonaktif, serah-terima Utama, grant, audit log + `actorEmail`/`entityLabel` lewat `employeeScope.employeeLabels`, `/me`); policy matriks IAM (60 test); `loadActor`; `bootstrapPrimarySuperAdmin`, `recoverPrimarySuperAdmin`, `provisionAccount` (akun uji); notifikasi & web selesai (Fase 2 Review)
```

## Web (`apps/web/src/features/`)

```
│       ├── auth/                     [done] `AuthProvider`/`useAuth`, `useMe`, guard `RequireAuth`/`RequireAccess`, halaman login, lupa password (pesan selalu sama), callback tautan, atur password; `safeNext()` cegah open redirect
│       ├── iam/                      [done] Hook akun/role/nonaktif/serah-terima (login ulang, D-033)/grant/audit; halaman Akun, Grant izin, Audit log, Profil (foto profil sendiri bila tertaut pegawai — D-037, izin aktif, ganti password) — 2026-09-30: halaman Akun, Grant izin, Audit log, Profil diseragamkan (`PageHeader`, `DataTable` + `TablePagination`, `EmptyState`, `ListPanel`); hook menerima `pageSize`; audit UI 2026-09-30 (Paket A): `audit-labels.ts` (nama aksi & entitas bahasa Indonesia), Audit log menampilkan email pelaku & label entitas (`actorEmail`, `entityLabel` dari API), Profil menampilkan "Perusahaan yang dikelola" (HR) / semua PT (SA), dialog grant memakai `FormSelect` + tombol Batal
```

## Tabel & rincian

### `iam`
| Tabel | Isi penting |
|---|---|
| `accounts` | ERD `user_account`: `auth_user_id` (UUID Supabase, unik), `employee_id` (nullable, unik), `email`, `role` (enum `Role`, **satu per akun**, D-028), `is_active`, `last_login_at`, `is_primary_super_admin`. **Tanpa** `password_hash` (password di Supabase Auth, D-005) |
| `permission_grants` | `account_id`, `permission`, `expires_at?`, `reason?`, `granted_by`, `revoked_at?`, `revoked_by?` |
| `account_companies` | [done] D-040: `account_id`, `company_id` (FK ke `organization.companies`, modul inti — PLAN §3.2) — cakupan PT akun HR_ADMIN & HR_PERSONNEL (IAM-D1; `usesAssignedCompanies`) |
| `dashboard_layouts` | [done] D-065: `account_id` (unik, FK cascade), `layout` (jsonb, divalidasi `dashboardLayoutSchema` @hris/shared) — susunan widget Dashboard per akun SA/HR |

Endpoint: `GET /me` · `GET /accounts` (SA, HR; filter role/isActive/q) · `GET /accounts/:id` (SA, HR, sendiri) · `POST /accounts/invite` (SA; HR hanya EMPLOYEE; SUPER_ADMIN hanya Utama) · `PATCH /accounts/:id/role` (SA; SUPER_ADMIN hanya Utama) · `POST /accounts/:id/deactivate|reactivate` (SA; HR hanya EMPLOYEE/MANAGER; ban Supabase) · `POST /accounts/primary-super-admin/transfer` (Utama, login ulang ≤ 5 menit, D-033) · `GET|POST /grants`, `POST /grants/:id/revoke` (SA) · `GET /audit-logs` (SA). Aturan lengkap: D-034.
