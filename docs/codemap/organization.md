# Codemap — `organization`

> Detail modul `organization`, dipindah utuh dari `CODEMAP.md` §2/§3/§6 pada 2026-10-13. Struktur standar modul: [CODEMAP §4](../CODEMAP.md#4-struktur-standar-modul-appsapisrcmodulesmodul) · peta modul: [CODEMAP §5](../CODEMAP.md#5-peta-modul). Fitur pemakai: [organisasi](../features/organisasi/README.md).

## API (`apps/api/src/modules/`)

```
│   │   ├── organization/             [done] D-049: `organization-admin.{schema,service,routes}.ts` — kelola 6 master data (daftar admin SA/HR + jumlah karyawan; tambah/ubah/arsip/pulihkan/hapus (FK → 409)/gabungkan; audit; `configureOrganization({ employeeSupport })` dari app.ts), `archivedMasterIndex()` untuk import. D-042: `masterIndex`/`missingMasterData`/`createMissingMasterData` (import; audit `organization.<entity>.create` {source: import}). D-035: `GET /master-data` (perusahaan sesuai cakupan PT — D-040, departemen, jabatan, status+kategori, grade, lokasi aktif; semua role); `getMasterLookup()` + helper `statusIdsForCategories()` (D-038) / departemen untuk modul lain. CRUD master data menyusul Fase 3
│   │   │                             [done] D-051/D-052: `org-post.{schema,service,routes}.ts` (`/org-posts` CRUD + arsip + `sync-managers`; aturan PT/siklus/slot), `organization-support.ts` (hook ke employee: jumlah pemegang, PT pemegang, sinkron atasan — organization tidak membaca tabel employee), `listOrgPosts` di `index.ts`; unit `company_id` di CRUD departments
│   │   │                             [done] ORG-D2: `org-chart-edit.service.ts` (`withOrgChartEdit` cek izin + kunci/naikkan revisi, `createChartPosition` jabatan baru di batch, audit batch), `org-post.service.ts` jalur `create/update/archivePostInTransaction` dipakai endpoint lama & batch, `organization.policy.ts` `canManageOrgStructure`/`canManageOrgPost` (HR ber-izin per PT; korporat & Direksi L6/L7 hanya SA); `/org-posts` tulis menaikkan revisi
│   │   │                             [done] ORG-D5: `departments.zone` di `organization.schema.ts`/`organization-admin.schema.ts` (+ `canEditZone`), `updateUnitZone` (`organization-admin.service.ts`) + rute `PUT /departments/{id}/zone` (`organization-admin.routes.ts`), policy `canManageUnitZone`
│   │   │                             [done] 2026-10-21: `directory.service.ts` (baca-saja untuk modul lain lewat `index.ts`: `getWorkLocationBriefs` termasuk lokasi diarsip, `listGeofencedWorkLocations`, `companyExists`; query di `organization.repository.ts`) — pengganti query langsung di `attendance/directory.ts`
```

## Web (`apps/web/src/features/`)

```
│       ├── organization/             [done] D-049: `config.ts` (slug ↔ jenis, label, ikon), `schemas.ts`, `api.ts` (hook daftar admin, simpan, arsip/pulihkan/hapus, gabungkan; invalidasi `organization`, `master-data`, `employees`), `pages/master-data-page.tsx` (tabel + filter + menu aksi + dialog form/konfirmasi/gabungkan; HR lihat saja), `components/geofence-picker.tsx` (cari tempat Nominatim saat tombol ditekan, "Pakai lokasi saya", peta lazy) + `components/geofence-map.tsx` (Leaflet 1.9.4 + react-leaflet 5.0.0, tile OSM, pin CSS bisa digeser, lingkaran radius; chunk terpisah ±45 kB gzip) — rute `/master-data/:kind`, seksi Administrasi › Master Data
│       │                         [done] D-051/D-052: `pages/org-posts-page.tsx` (Master Data › Pos jabatan `/master-data/pos-jabatan`, sinkron atasan), kolom & pilihan PT di Unit organisasi; hook `useOrgPosts`/`useSaveOrgPost`/`useOrgPostAction`/`useSyncPostManagers`
```

## Tabel & rincian

### `organization`
Status: tabel ERD **[done]**; baca master data lewat `GET /master-data` **[done]** (D-035); **CRUD 6 master data [done]** (D-049: arsip = `deleted_at`, hapus permanen hanya bila belum dirujuk, gabungkan, geofence angka). `system_settings`, `holidays` **[planned]** Fase 5.

| Tabel | Isi penting |
|---|---|
| `companies` | [done] D-039: perusahaan dalam grup — `code` (unik, mis. ACP), `name`, `npwp?`, `address?`, `is_active`, `deleted_at?`; dikelola SA; FK wajib dari `employees.company_id` |
| `company_profile` | [planned] *(digantikan `companies`, D-039)* |
| `system_settings` | [planned] Key-value terketik: zona waktu (`Asia/Jakarta`), toleransi telat, dll. |
| `departments` | **D-050: semua unit organisasi** — `name` (unik), `unit_type` (enum `OrgUnitType`: DIRECTORATE, DIVISION, DEPARTMENT, SECTION; default DEPARTMENT), `parent_id?` (hierarki, ber-index; induk sah dijaga service + `canBeChildOf` di shared), `deleted_at?`; **D-052** `company_id?` (PT pemilik; kosong = fungsi korporat grup); **ORG-D5** `zone?` (enum `OrgZone` HEAD_OFFICE/SITE; kosong = ikut induk, akar kosong = HO) |
| `positions` | `name`, `department_id` (FK ke unit jenis apa pun, ERD) — unik per unit, `level?` (enum `PositionLevel`: L7 Direktur Utama … L1B Helper, L0 Magang, ORG-D1 mengubah D-050 (4); migrasi `20261110040000_position_level_numbered`; beda dari grade), `deleted_at?` |
| `employment_statuses` | ERD `employment_status`: `name` (unik), `category?` (enum `EmploymentCategory` unik: PERMANENT, PROBATION, PKWT, DAILY_WORKER, INTERNSHIP, OUTSOURCING, VENDOR — D-035/D-038), `deleted_at?` |
| `grades` | ERD `grade` (menggantikan rencana `job_levels`): `name` (unik), `deleted_at?` |
| `work_locations` | `name` (unik), `city?`, `address?`, `latitude?`, `longitude?` Decimal(9,6), `radius_m?` (geofence wajib di Fase 5), `deleted_at?` |
| `homebases` | [done] EMP-D6: master Homebase / Point of Hire — `name` (unik), `city?`, `province?`, `note?`, `deleted_at?`; kind master data `homebases` (SA tulis; arsip/pulihkan/hapus/gabung — gabung memindah `employees.homebase_id` + `employee_homebases`, `MasterRefKind` `homebase`), `MasterLookup.homebases`, `/master-data.homebases`, `createMissingMasterData` (import) |
| `org_chart_state` | [done] ORG-D2: satu baris `revision` (konkurensi optimistis bagan, 409); migrasi `20261110050000_org_chart_edit` (+ izin `org.structure.manage`) |
| `org_posts` | [done] D-051: pos jabatan (kursi bagan) — `code?` (unik), `position_id`, `reports_to_id?` (garis tegas), `functional_reports_to_id?` (garis putus-putus), `headcount` 1–50 (CHECK), `sort_order`, `deleted_at?`; aturan PT/siklus/slot di service (`@hris/shared/org-chart.ts`) |
| `holidays` | [planned] `date`, `name`, `is_collective_leave` |

FK dari `employees` ke master data memakai `ON DELETE RESTRICT`: master yang dipakai tidak bisa dihapus (pakai `deleted_at`).

**Direktori untuk Time Management/analitik (merge Mat 2026-10-21):** `directory.service.ts` — `listActiveWorkLocations` (TM-D7), `listActiveGrades` + `GradeBrief` (TM-D6), `getEmploymentStatusCategories` (DSB-D1); repository `findActiveWorkLocations`, `findActiveGrades`, `findEmploymentStatusCategories`.
