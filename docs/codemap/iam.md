# Codemap — `iam`

> Detail modul `iam`, dipindah utuh dari `CODEMAP.md` §2/§3/§6 pada 2026-10-13. Struktur standar modul: [CODEMAP §4](../CODEMAP.md#4-struktur-standar-modul-appsapisrcmodulesmodul) · peta modul: [CODEMAP §5](../CODEMAP.md#5-peta-modul). Fitur pemakai: [iam](../features/iam/README.md) · [onboarding](../features/onboarding/README.md) · [dashboard](../features/dashboard/README.md).

## API (`apps/api/src/modules/`)

```
│   │   ├── iam/                      [done] 15 endpoint (`/me` + `employeeName` nama karyawan tertaut, BUG-004 2026-10-12; + `employeeCompanyId` untuk app mobile M3 2026-10-26; + `isSupervisor` ORG-D9 2026-11-17; + `PUT /accounts/:id/companies` D-040: penugasan PT HR, SA saja, audit + notifikasi; HR hanya akun karyawan PT-nya + akun belum tertaut; ganti role dari HR mencabut penugasan; `configureIam`) + fungsi publik untuk employee (`getAccountLinksForEmployees`, `getAccountSummaries`, `employeesWithActiveAccount` (ORG-D9, menggantikan `listManagerEmployeeIds`), `deactivateAccountOfEmployee`) (akun, role, nonaktif, serah-terima Utama, grant, audit log + `actorEmail`/`entityLabel` lewat `employeeScope.employeeLabels`, `/me`); policy matriks IAM (60 test); `loadActor`; `bootstrapPrimarySuperAdmin`, `recoverPrimarySuperAdmin`, `provisionAccount` (akun uji); notifikasi & web selesai (Fase 2 Review)
```

**ONB-D2 (2026-11-16):** `iam.service.ts` `inviteAccount` (Karyawan/Manager wajib `employeeId`; Karyawan → `IamEmployeeScope.inviteExisting` → `{ kind: "queued" }` 202; lainnya buat + `linkEmployee` bila diisi), `assertLinkableEmployee`, `linkAccountEmployee`, `listLinkSuggestions`, `changeRole` menolak Karyawan/Manager tak tertaut, `toAccountDto.needsEmployeeLink`; `IamEmployeeScope` + `linkCandidates`/`employeesByEmail`/`inviteExisting` (tipe `EmployeeLinkCandidate`, `AccountLinkSuggestion`); `iam.policy.ts` `canLinkEmployee`, `canPickEmployeeOfCompany`; `iam.repository.ts` filter `unlinked`; `iam.schema.ts` `employeeId` di body undang, `accountInviteQueuedSchema`, `linkEmployeeBodySchema`, `linkSuggestionSchema`, `needsEmployeeLink`; route `PUT /accounts/{id}/employee` (`linkAccountEmployee`), `GET /accounts/{id}/link-suggestions` (`listAccountLinkSuggestions`). Shared `roles.ts` `EMPLOYEE_LINKED_ROLES`/`requiresEmployeeLink`. Web `features/iam/` (`api.ts` `useLinkEmployee`/`useLinkSuggestions`, `schemas.ts`, `pages/accounts-page.tsx` `InviteDialog` + `LinkEmployeeDialog`), `lib/access.ts` `linkEmployee`. Test: api `integration/iam/companies.test.ts`, web `tests/accounts-link.test.tsx`.

**ONB-D1 (2026-11-16):** `iam.service.ts` `retireUnusedEmployeeAccount` (akun belum login & role EMPLOYEE: hapus baris; user Auth buatan undangan di-ban + email anonim, user Auth bersama D-023 tidak disentuh), `inviteEmployeeAccount` mengecek akun milik karyawan sebelum email, `EmployeeAccountState.authEmail` (`loginEmail ?? email`); `iam.repository.ts` `authUserCreatedByInvite` (audit `iam.account.invite` `emailSent`), `findAccountsForEmployees` + `loginEmail`. Diekspor lewat `index.ts`.

## Web (`apps/web/src/features/`)

```
│       ├── auth/                     [done] `AuthProvider`/`useAuth`, `useMe`, guard `RequireAuth`/`RequireAccess`, halaman login, lupa password (pesan selalu sama), callback tautan, atur password; `safeNext()` cegah open redirect
│       ├── iam/                      [done] Hook akun/role/nonaktif/serah-terima (login ulang, D-033)/grant/audit; halaman Akun, Grant izin, Audit log, Profil (foto profil sendiri bila tertaut pegawai — D-037, izin aktif, ganti password) — 2026-09-30: halaman Akun, Grant izin, Audit log, Profil diseragamkan (`PageHeader`, `DataTable` + `TablePagination`, `EmptyState`, `ListPanel`); hook menerima `pageSize`; audit UI 2026-09-30 (Paket A): `audit-labels.ts` (nama aksi & entitas bahasa Indonesia), Audit log menampilkan email pelaku & label entitas (`actorEmail`, `entityLabel` dari API), Profil menampilkan "Perusahaan yang dikelola" (HR) / semua PT (SA), dialog grant memakai `FormSelect` + tombol Batal; 2026-11-27 IAM-D2: `components/grant-batch-dialog.tsx` (grant banyak akun × izin, pratinjau `dryRun`, hasil per baris) + centang & "Cabut terpilih" di halaman Grant izin
```

## Tabel & rincian

### `iam`
**2026-11-23 — EMP-D8 (audit PM T6/T8):** `setAccountActive` menolak Aktifkan (422) bila karyawan tertaut nonaktif (`employeeScope.linkCandidates`); `setAccountActive(false)` & `deactivateAccountOfEmployee` memanggil `notification.forgetPushDevices` di transaksi yang sama.

| Tabel | Isi penting |
|---|---|
| `accounts` | ERD `user_account`: `auth_user_id` (UUID Supabase, unik), `employee_id` (nullable, unik), `email`, `role` (enum `Role`, **satu per akun**, D-028), `is_active`, `last_login_at`, `is_primary_super_admin`. **Tanpa** `password_hash` (password di Supabase Auth, D-005) |
| `permission_grants` | `account_id`, `permission`, `expires_at?`, `reason?`, `granted_by`, `revoked_at?`, `revoked_by?` |
| `account_companies` | [done] D-040: `account_id`, `company_id` (FK ke `organization.companies`, modul inti — PLAN §3.2) — cakupan PT akun HR_ADMIN & HR_PERSONNEL (IAM-D1; `usesAssignedCompanies`) |
| `dashboard_layouts` | [done] D-065: `account_id` (unik, FK cascade), `layout` (jsonb, divalidasi `dashboardLayoutSchema` @hris/shared) — susunan widget Dashboard per akun SA/HR |

Endpoint: `GET /me` · `GET /accounts` (SA, HR; filter role/isActive/q) · `GET /accounts/:id` (SA, HR, sendiri) · `POST /accounts/invite` (SA; HR hanya EMPLOYEE; SUPER_ADMIN hanya Utama) · `PATCH /accounts/:id/role` (SA; SUPER_ADMIN hanya Utama) · `POST /accounts/:id/deactivate|reactivate` (SA; HR hanya EMPLOYEE/MANAGER; ban Supabase) · `POST /accounts/primary-super-admin/transfer` (Utama, login ulang ≤ 5 menit, D-033) · `PUT /accounts/:id/companies` (+ `restrictHeadOffice`, IAM-D3; mengosongkan semua PT yang ada butuh `allowEmpty: true` — 422 bila tidak; dimatikan saat role berganti ke non-HR) · `GET|POST /grants` (filter `accountIds`/`permissions` dipisah koma), `POST /grants/batch` (akun × izin, `dryRun`, IAM-D2), `POST /grants/revoke-batch`, `POST /grants/:id/revoke` (SA) · `GET /audit-logs` (SA). Aturan lengkap: D-034.

**Audit keamanan A (HRD-D1, 2026-11-03, `fix/keamanan-email-pribadi`):** `login.service.ts` `requestPasswordReset` — akun SUPER_ADMIN/HR_ADMIN/HR_PERSONNEL hanya dikirim ke `Account.email` (tidak ke email pribadi; email = `loginEmail` → `no_contact`, respons publik tetap generik); `iam.repository.ts` `findAccountForReset` menyertakan `role`. Test: `tests/integration/iam/login-nik.test.ts`.

**IAM-D3 (2026-11-27) — "Tanpa akses karyawan Head Office":** kolom `iam.accounts.restrict_head_office` + `organization.work_locations.is_head_office` (migrasi `20261127033900_iam_d3_head_office_restriction`). `loadActor` mengisi `Actor.hiddenEmployeeIds` (karyawan berlokasi HO saat ini, kecuali karyawan milik akun sendiri) lewat `employeeScopeForIam.headOfficeEmployeeIds`. Penegakan di `core/access/rules.ts`: `isInCompanyScope(actor, { companyId, employeeId })` (employeeId wajib; null = tingkat PT), `isHiddenEmployee`, `hiddenFilter(actor, field)` (penyaring Prisma `notIn`), `visibleEmployeeIds`, `isHeadOfficeRestricted` (tutup periode ditolak). Penerima notifikasi HR per PT (`find*Hrs` + `list*Recipients/Reviewers/Managers/Writers`) menerima `headOfficeSubject` → akun dibatasi dikecualikan. Test: `tests/integration/iam/head-office-restriction.test.ts`.
