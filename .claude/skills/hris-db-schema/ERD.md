# ERD → Prisma (D-026)

Sumber: ERD dbdiagram.io dari pemilik projek (2026-09-28), target minggu ini = employee management. Auth tetap Supabase Auth.

| ERD | Prisma / tabel | Catatan |
|---|---|---|
| `department` | `Department` → `organization.departments` | + `parent_id?` (hierarki, CODEMAP) |
| `position` (department_id) | `Position` → `organization.positions` | unik (department_id, name) |
| `employment_status` | `EmploymentStatus` → `organization.employment_statuses` | tabel, diatur SUPER_ADMIN |
| `grade` | `Grade` → `organization.grades` | menggantikan rencana `job_levels` |
| `work_location` | `WorkLocation` → `organization.work_locations` | + `latitude`, `longitude`, `radius_m` nullable (geofence Fase 5) |
| `employee.nik` | `employees.employee_number` | Nomor Induk Karyawan (bukan NIK KTP) |
| `employee.*` data kerja | `employees` | + `work_email`, `manager_id`, `is_active` (PLAN); department lewat position |
| `ktp_number`, `npwp_number`, lahir, alamat KTP/domisili, `marital_status`, `religion` | `employee.employee_personal` (1:1) | SENSITIF; + `kk_number` |
| `bank_name`, `bank_account_number` | `employee.employee_bank_accounts` (1:1) | SENSITIF; + `account_holder` |
| `family` | `employee.family_members` | `age` → `birth_date`; diperlakukan sensitif |
| `education`, `training` | `employee.educations`, `employee.trainings` | |
| `user_account`, `role` | Fase 2: `iam.accounts` + kolom enum `role` | tanpa `password_hash` (Supabase Auth); satu akun satu role (D-028) |

Pola umum: PK `int` → UUID; `string` → `VarChar(n)` bila panjang wajar diketahui, `String` (text) untuk alamat; `date` → `@db.Date`; `datetime` → `Timestamptz(6)`; string berkategori tetap → enum.
