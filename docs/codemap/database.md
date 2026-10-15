# Codemap — database (Prisma)

> Pohon `apps/api/prisma/` (skema per modul, daftar migrasi, seed), dipindah utuh dari `CODEMAP.md` §2 pada 2026-10-13. Aturan: [PROMPT §6](../PROMPT.md#6-konvensi-database--prisma), skill `hris-db-schema`. Migrasi baru: tambahkan barisnya di sini.

```
apps/api/
├── prisma/
│   ├── schema/                       [wip] Skema Prisma multi-file; model ditambahkan per fase (file modul yang belum ada = `[planned]`)
│   │   ├── _base.prisma              [done] generator (prisma-client, runtime bun, output src/generated/prisma) + datasource (10 skema Postgres)
│   │   ├── iam.prisma               [done] accounts (enum `Role`, D-028), permission_grants, account_companies (D-040), dashboard_layouts (D-065)
│   │   ├── organization.prisma      [done] companies (D-039), departments, positions, employment_statuses (+ enum `EmploymentCategory` 7 nilai, D-035/D-038), grades, work_locations (ERD, D-026)
│   │   ├── employee.prisma          [done] employees (+ `exit_reason`), employee_personal, employee_bank_accounts, family_members, educations, trainings, employment_histories + enum (ERD D-026, D-035)
│   │   ├── attendance.prisma        [wip] Fase 5 (2026-10-13, dari branch Mat): holidays, time_settings, shifts, roster_patterns, crews, crew_members, roster_days, roster_change_requests, attendance_days, attendance_punches, attendance_periods, attendance_statements, attendance_corrections
│   │   ├── leave.prisma             [wip] Fase 6 (2026-10-13): leave_types, leave_years, leave_ledger (buku besar saldo), leave_requests
│   │   ├── approval.prisma          [wip] Fase 5 (2026-10-13): approval_requests, approval_steps (paralel/tunggal, override)
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
│   │   ├── 20261001092853_add_org_unit_type_and_position_level/  [done] D-050: enum `OrgUnitType` + `departments.unit_type` (default DEPARTMENT), enum `PositionLevel` + `positions.level?` (hanya menambah)
│   │   ├── 20261002030000_add_onboarding_batches_and_invitations/  [done] D-045 a: enum `OnboardingStatus`/`OnboardingInvitationStatus`, `employees.{onboarding_status (default APPROVED), completion_required, personal_email (unik), onboarding_batch_id}`, `onboarding_batches`, `onboarding_invitations`, `onboarding_events` (hanya menambah; dibuat lewat `migrate diff` karena `migrate dev` interaktif untuk unique baru)
│   │   ├── 20261002060000_add_onboarding_wizard_documents/  [done] D-045 b: `employee_personal.{npwp,bpjs_employment,bpjs_health}_absent`, enum `EmployeeDocumentType` + `employee_documents`, `work_experiences`, `employees.completion_submitted_at` (hanya menambah)
│   │   ├── 20261002090000_add_onboarding_reviews/  [done] D-045 c1/D-047: nilai enum `Permission` `employee.onboarding.review`, enum `OnboardingDecision` + `onboarding_reviews` (hanya menambah)
│   │   ├── 20261002120000_add_login_email_and_password_reset_attempts/  [done] D-048 c2: `iam.accounts.login_email` (unik, nullable), `iam.password_reset_attempts` (hash masukan) (hanya menambah)
│   │   ├── 20261009080319_dashboard_layouts/  [done] D-065: `iam.dashboard_layouts` (satu baris per akun, jsonb `layout`, FK cascade ke `accounts`) (hanya menambah)
│   │   ├── 20261008085810_add_form_v2_address_emergency2_relation/  [done] D-061: `employee_personal` + rincian alamat domisili/KTP (kelurahan, kecamatan, kab/kota, provinsi; teks) + kontak darurat ke-2 (nama, hubungan, HP, alamat); `family_members.relation_detail`; UPDATE data: jenis dokumen `SIM` tanpa masa berlaku (hanya menambah)
│   │   ├── 20261008031553_add_import_job_attachments/  [done] D-060: enum `ImportAttachmentStatus`, tabel `import_job_attachments` (FK job/employee cascade, document set null; CHECK 1–10 ID Drive, attempts ≥ 0, sha256 hex)
│   │   ├── 20261007102154_add_form_family_education_training_fields/  [done] D-059: `family_members` + gender, birth_place, education, occupation, age_at_entry (CHECK 0–130), work_address; `educations` + entry_year (CHECK ≤ graduation_year); `trainings` + certificate_number; `employee_personal` + driving_license_numbers (jsonb), emergency_contact_address
│   │   ├── 20261007100618_add_employee_personal_form_fields/  [done] D-059: `employee_personal` + `nickname`, `nationality`, `ethnicity`, `blood_type` (CHECK A/B/AB/O±), `driving_license_types` (enum[] `DrivingLicenseType`), `driving_license_number` — diisi lewat Import dari Sheet respons Google Form
│   │   ├── 20261005091041_add_data_change_requests/  [done] D-054 Arsip 1c: enum `DataChangeSection`/`DataChangeStatus`, nilai enum `Permission` `employee.changes.review`, tabel `data_change_requests` (payload/previous JSONB, `document_id` → `employee_documents`), index unik parsial satu PENDING per karyawan per bagian (kecuali DOCUMENT), CHECK pemeriksa tercatat (hanya menambah)
│   │   ├── 20261013095006_add_asset_module/  [done] ARS-D1–D6 (Arsip 2a): skema `asset`, enum AssetCondition/AssetStatus/AssignmentOutcome, nilai `Permission` `asset.manage`, tabel `asset_categories`, `assets`, `asset_assignments` (index unik parsial satu pemegang aktif + CHECK tanggal & hasil), `ppe_types`, `ppe_issues` (CHECK jumlah 1–100, masa ganti 1–120); FK ke employee & organization saja
│   │   └── 20261015071500_add_discipline_module/  [done] D-057, ARS-D7–D13 (Arsip 2b): skema `discipline`, enum WarningLevel/WarningLetterStatus, nilai `Permission` `employee.discipline.read`/`.write`, tabel `violation_types` (+ 5 jenis awal), `warning_letters` (nomor unik + unik per PT/tahun/urut, CHECK draft/terbit/cabut/tanggal), `warning_letter_alpha_days`, `discipline_settings` (satu baris, 6 bulan, CHECK 1–24); FK ke employee & organization saja
│   └── seed/                         [done] Idempoten (upsert), menolak NODE_ENV=production · `org-chart.ts` (D-051: replika bentuk bagan ACP 18 unit + Corporate Function, 71 pos/86 slot, pemegang `DMY-` nama fiktif; bagan kecil CD2)
│       ├── index.ts                  Runner: organization → employee
│       ├── organization.ts           5 departemen, 12 jabatan, 7 status berkategori (D-038: Karyawan Tetap, Karyawan Percobaan, PKWT, Pekerja Harian, Magang, Outsourcing, Vendor; nama lama "Pegawai Tetap/Tetap/Kontrak (PKWT)/Internship/Daily Worker" diganti, "Masa Percobaan" dihidupkan lagi sebagai Karyawan Percobaan), 5 grade, 2 lokasi
│       └── employee.ts               23 karyawan dummy (5 manajer, 2 nonaktif; + Nadia Putri Percobaan & Yusuf Hidayat Vendor, D-038) + data pribadi/rekening/keluarga/pendidikan/pelatihan fiktif + riwayat HIRED/DEACTIVATED; `work_email` dari SEED_EMAIL_BASE
```
