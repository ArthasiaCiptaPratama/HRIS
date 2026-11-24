# Kartu: Jadwal & roster (Time Management)

- **Area:** Jadwal & roster: master shift, pola, crew, grid bulanan, import, template, Pola Kerja, tukar shift, kalender libur, pengaturan TM
- **Fitur:** time-management — [docs/features/time-management/README.md](../../../../docs/features/time-management/README.md)
- **Modul:** `apps/api/src/modules/attendance/` · `apps/web/src/features/time-management/`
- **diverifikasi:** 99bd49a 2026-11-24
- **Jalur yang dipantau:** `apps/api/src/modules/attendance/roster*` `apps/api/src/modules/attendance/work-roster*` `apps/api/src/modules/attendance/calendar*` `apps/api/src/modules/attendance/attendance.policy.ts` `packages/shared/src/time-management.ts` `packages/shared/src/overtime.ts` `packages/shared/src/work-roster.ts` `packages/shared/src/roster-template.ts` `packages/shared/src/holidays-id.ts` `apps/web/src/features/time-management/api.ts` `apps/web/src/features/time-management/work-roster-api.ts` `apps/web/src/features/time-management/roster-file.ts` `apps/web/src/features/time-management/access.ts` `apps/web/src/features/time-management/pages/roster-page.tsx` `apps/web/src/features/time-management/pages/roster-setup-page.tsx` `apps/web/src/features/time-management/pages/roster-changes-page.tsx` `apps/web/src/features/time-management/pages/work-roster-page.tsx` `apps/web/src/features/time-management/pages/calendar-settings-pages.tsx` `apps/web/src/features/time-management/components/roster-template-tab.tsx` `apps/web/src/features/time-management/components/template-assign-dialog.tsx` `apps/web/src/features/time-management/components/work-roster-assign-dialog.tsx` `apps/web/src/features/time-management/components/roster-edit-list.tsx` `apps/web/src/features/time-management/components/roster-week.tsx` `apps/web/src/features/time-management/components/display.tsx` `apps/api/tests/integration/time-management/roster*.test.ts` `apps/api/tests/integration/time-management/work-roster.test.ts`

## Ringkasan
Roster = siklus kerja-libur (di tampilan "Pola Kerja", TM-D28); Jadwal = shift/pola/crew/grid. HR PT/SA menyusun master shift, pola (langkah kode shift/OFF/TO), crew + anggota (rentang tanggal), lalu API membangkitkan `roster_days` per crew sampai horizon (cron `roster-extend`). Sel grid bisa diubah manual (kuas), diimpor Excel, diisi template, atau diganti lewat tukar shift. Perubahan untuk anggota crew wajib disetujui (TM-D24). Kalender libur & pengaturan TM dikelola SA. Pengguna: SA, HR PT, atasan (baca tim/memutus), karyawan (lihat sendiri, ajukan tukar).

## Keputusan aktif
- `D-069` — roster tambang: shift, pola, crew, grid bulanan, import (semua-atau-tidak).
- `TM-D8` — template bawaan JT (JTP/JTS/JTM, pola 21 langkah, crew A/B/C); `ROSTER_TEMPLATES` juga `ROT_13_1`, `WEEK_5_2`, `SHIFT_3X8`.
- `TM-D12`/`TM-D13`/`TM-D14` — `startsNextDay` + jendela shift digeser 24 jam; absen per shift, tanggal kerja = tanggal roster.
- `TM-D21`/`TM-D22` — "hari ini" logika harian TM lewat `settingsToday()`; zona bawaan `Asia/Makassar` bila kosong.
- `TM-D23` — template roster buatan HR (1-8 crew, geser antarcrew), pasang per lokasi, isi karyawan dibagi rata, tempel penuh kecuali hari terkunci.
- `TM-D24` — perubahan roster karyawan ber-crew diajukan (`roster_edit_requests`, approval `ROSTER_EDIT`: atasan + HR paralel), diterapkan di handler; tanggal berlaku boleh mundur selama periode belum ditutup; satu pengajuan menunggu per karyawan.
- `TM-D28` — Pola Kerja (`work_rosters`), kode `TO` (time off), Homebase lokal/non-lokal + Office (`resolveResidency`: override HR, lokasi kantor, Homebase), isi jadwal dengan pola kerja.
- OD terbuka: `OD-13` — format Excel roster final (saat ini NIP-Tanggal-Kode bentuk panjang & grid bulanan); jangan diputuskan, tanyakan ke pengguna.

## Peta file

### API — `apps/api/src/modules/attendance/`
| Lapisan | File | Simbol penting |
|---|---|---|
| Routes | `roster.routes.ts` | `registerRosterRoutes`, `ROUTES` (shift, pola, crew, grid, import, template, roster-edits, roster-changes) |
| Routes | `work-roster.routes.ts`, `calendar.routes.ts` | `/work-rosters*`, `/holidays*`, `/time-settings` |
| Policy | `attendance.policy.ts` | `canManageRoster`, `canViewRosterSetup`, `canViewEmployeeRoster`, `canRequestRosterChange`, `canApplyRosterCell`, `canManageHolidays`, `canManageTimeSettings` |
| Service | `roster.service.ts` | `createShift`, `createPattern`, `setCrewMembers`, `regenerateCrew`, `extendAllRosters`, `getRosterGrid`, `setRosterCells`, `previewRosterImport`, `commitRosterImport`, `lockedDayKeys`, `keepDayKeys`, `lockedEmployeesOn`, `configureCrewedCellSplitter` |
| Service | `roster-edit.service.ts` | `submitTemplateEdits`, `templateEditPreview`, `requestCrewMembers`, `registerRosterEditHandler`, `listRosterEdits`, `cancelRosterEdit` |
| Service | `roster-edit-app.service.ts` | `canViewRosterEdit` (detail `GET /roster-edits/{id}`, data mobile) |
| Service | `roster-change.service.ts` | `createRosterChange`, `respondToSwap`, `cancelRosterChange`, `registerRosterChangeHandler` (approval `ROSTER_CHANGE`, `assertDayUnlocked`) |
| Service | `roster-template.service.ts` | `applyRosterTemplate` (bawaan), `createCustomTemplate`, `installCustomTemplate`, `previewTemplateAssignment`, `applyTemplateAssignment`, `jtPatternSteps` |
| Service | `work-roster.service.ts` | `createDefaultWorkRosters`, `setLocalHomebases`, `listEmployeeResidencies`, `setEmployeeResidency`, `previewWorkRosterAssignment`, `applyWorkRosterAssignment` |
| Service | `calendar.service.ts` | `settingsToday`, `readTimeSettings`, `updateTimeSettings`, `importOfficialHolidays`, `holidaysBetween` |
| Engine | `roster-engine.ts` | `patternCodeOn`, `generateCrewDays`, `crossesMidnight` |
| Notifikasi | `roster-notify.service.ts` | notifikasi perubahan jadwal (target `ROSTER`) |
| Repository | `roster.repository.ts`, `work-roster.repository.ts`, `calendar.repository.ts` | `upsertDay`, `insertDays`, `nonPatternDaysBetween`, `membershipsBetween` |
| Contract/Zod | `roster.contract.ts`, `work-roster.contract.ts` | skema OpenAPI per rute (`assertExact` ke tipe service) |
| Cron | `apps/api/src/app.ts` | job `"roster-extend"` memanggil `extendAllRosters` (jadwal di `apps/api/vercel.json`) |
| Mobile | `apps/api/src/core/openapi.ts` | `APP_OPERATION_IDS` memuat `getRoster`, `getEmployeeRoster`, `listRosterChanges`, `createRosterChange`, `respondRosterChange`, `cancelRosterChange`, `listRosterEdits`, `getRosterEdit`, `listHolidays` |

### Shared — `packages/shared/src/`
| File | Simbol penting |
|---|---|
| `time-management.ts` | `shiftInputSchema`, `rosterPatternInputSchema`, `rosterCellsInputSchema`, `rosterImportInputSchema`, `rosterChangeInputSchema`, `holidayInputSchema`, `ROSTER_SOURCES`, `ROSTER_CHANGE_STATUSES`, `expandRosterShorthand` |
| `overtime.ts` | `ROSTER_TEMPLATES`, `rosterTemplateInputSchema`, `patternRestWarnings` |
| `roster-template.ts` | `rosterTemplateDefInputSchema`, `rosterTemplateAssignInputSchema`, `rosterTemplatePreview`, `ROSTER_TEMPLATE_MAX_CREWS` |
| `work-roster.ts` | `TIME_OFF_CODE`, `workRosterInputSchema`, `workRosterSteps`, `DEFAULT_WORK_ROSTERS`, `workRosterAssignInputSchema`, `employeeResidencyInputSchema` |
| `holidays-id.ts` | `OFFICIAL_HOLIDAYS_ID` (data libur resmi per tahun) |

### Web — `apps/web/src/features/time-management/`
| Jenis | File | Simbol penting |
|---|---|---|
| Halaman | `pages/roster-page.tsx` | `RosterPage` (grid, mode kuas, import, `TemplateAssignDialog`) |
| Halaman | `pages/roster-setup-page.tsx` | `RosterSetupPage` (shift, pola, crew, tab template) |
| Halaman | `pages/roster-changes-page.tsx`, `pages/work-roster-page.tsx` | `RosterChangesPage`, `WorkRosterPage` |
| Halaman | `pages/calendar-settings-pages.tsx` | `HolidaysPage`, `TimeSettingsPage` |
| Komponen | `components/roster-template-tab.tsx`, `template-assign-dialog.tsx`, `work-roster-assign-dialog.tsx`, `roster-edit-list.tsx`, `roster-week.tsx`, `display.tsx` | `TemplateTab`, `TemplateAssignDialog`, `WorkRosterAssignDialog`, `RosterEditList`, `RosterWeek`, `scheduleLabel` |
| Hook/API | `api.ts`, `work-roster-api.ts`, `roster-file.ts` | `useRosterGrid`, `useSetRosterCells`, `useRosterImport`, `useSetCrewMembers`, `useCustomTemplateMutations`, `useRosterChangeActions`, `useHolidays`, `useTimeSettings`, `useWorkRosters`, `rowsFromGrid` |
| Akses UI | `access.ts` | `tmAccess.viewRoster`/`manageRoster`/`rosterChanges`/`decideRosterChanges`/`manageHolidays`/`viewSettings`/`manageSettings` |
| Saklar | `apps/web/src/app/feature-flags.ts` | `tmRoster`, `tmRosterChanges`, `tmRosterSetup`, `tmWorkRoster`, `tmHolidays`, `tmSettings` (jalur rilis: jangan diubah di jalur ini) |

### Test
| Jenis | File |
|---|---|
| API integration | `apps/api/tests/integration/time-management/roster.test.ts`, `roster-edit.test.ts`, `roster-edit-app.test.ts`, `roster-custom-template.test.ts`, `work-roster.test.ts`, `roster-notify.test.ts`, `timezone.test.ts` |
| API unit | `apps/api/src/modules/attendance/__tests__/roster-engine.test.ts`, `self-management.policy.test.ts`, `shift-instance.test.ts` |
| Web | `apps/web/tests/roster-edit.test.tsx`, `template-assign.test.tsx`, `work-roster.test.tsx`, `time-management.test.ts` |

## Endpoint -> policy -> siapa
Pemeriksaan dilakukan di service (bukan di routes); semua rute lewat `protect` (login wajib).
| Method & path | Fungsi policy | Siapa boleh |
|---|---|---|
| `GET /shifts`, `/roster-patterns`, `/crews`, `/roster-custom-templates` | `canViewRosterSetup` | SA; akun yang terdaftar di PT itu |
| `POST/PUT/DELETE /shifts`, `/roster-patterns`, `/crews`, `PUT /crews/{id}/members` | `canManageRoster` | SA; HR PT ditugaskan (anggota crew: lewat approval `ROSTER_EDIT`) |
| `POST/PUT/DELETE /roster-custom-templates*` + `/install`, `/assign[/preview]`, `POST /roster/templates` | `canManageRoster` | SA; HR PT |
| `GET /roster` | `canViewRosterSetup` + cakupan di `getRosterGrid` | SA/HR: PT; MANAGER: tim; karyawan: sendiri |
| `GET /roster/employees/{id}` | `canViewEmployeeRoster` | SA; HR PT; diri sendiri; atasan langsung |
| `PUT /roster/cells`, `POST /roster/import/{preview,commit}` | `canApplyRosterCell` (+ `canManageRoster`) | SA; HR PT (HR tidak boleh sel dirinya tanpa crew); sel ber-crew -> `ROSTER_EDIT` |
| `GET /roster-edits`, `GET /roster-edits/{id}`, `POST /roster-edits/{id}/cancel` | `canViewRosterEdit`, `canManageRoster` | pemutus, pengaju, HR PT; batal oleh pengaju |
| `GET/POST /roster-changes`, `/{id}/peer-response`, `/{id}/cancel` | `canRequestRosterChange`, `canViewEmployeeRoster` | karyawan (diri), MANAGER (tim); inbox: SA/HR/atasan |
| `GET/POST/PUT/DELETE /work-rosters*`, `/work-rosters/residencies`, `/assign[/preview]` | `canViewRosterSetup` (baca), `canManageRoster` (tulis) | SA; HR PT |
| `GET/PUT /work-rosters/local-homebases` | `canSetLocalHomebases` (lokal di service) | SA, HR |
| `GET /holidays`, `/holidays/official-years` | `canReadHolidays` | semua akun |
| `POST/PUT/DELETE /holidays*`, `/holidays/import-official` | `canManageHolidays` | SA |
| `GET /time-settings` / `PUT /time-settings` | `canReadTimeSettings` / `canManageTimeSettings` | semua akun / SA |

## Resep "cara menambah X"

### R1. Menambah/ubah field master shift
- File: `packages/shared/src/time-management.ts` (`shiftInputSchema`), `roster.service.ts` (`shiftDto`, `createShift`, `updateShift`), `roster.contract.ts`, `display.tsx` (`scheduleLabel`), `roster-setup-page.tsx`. Kolom baru = skema Prisma: berhenti dan lapor.
- Test: `tests/integration/time-management/roster.test.ts`, `__tests__/shift-instance.test.ts`.

### R2. Menambah template bawaan atau opsi template buatan HR
- File: `packages/shared/src/overtime.ts` (`ROSTER_TEMPLATES`, label), `roster-template.service.ts` (definisi bawaan, `applyRosterTemplate`), `roster-template-tab.tsx`; buatan HR: `packages/shared/src/roster-template.ts`, `createCustomTemplate`.
- Test: `roster-custom-template.test.ts`, `apps/web/tests/template-assign.test.tsx`.

### R3. Menambah rute/aturan roster (deny-by-default)
- File: `roster.routes.ts` (entri `ROUTES` + `route(...)`), `roster.contract.ts`, fungsi di `attendance.policy.ts` (pakai pola `canManageRoster`/`canViewRosterSetup`), panggil di service paling awal, `access.ts` hanya untuk menyembunyikan UI.
- Bila dipakai app HP: tambah ke `APP_OPERATION_IDS` (`apps/api/src/core/openapi.ts`) dan perbarui kontrak.
- Test: `roster.test.ts` (200, 400, 401, 403), `self-management.policy.test.ts` bila menyentuh HR-self.

### R4. Mengubah aturan perubahan roster / pengajuan ROSTER_EDIT
- File: `roster-edit.service.ts` (`registerRosterEditHandler`, `submitTemplateEdits`, `requestCrewMembers`, `CellEditPayload`), `roster.service.ts` (`configureCrewedCellSplitter`), `roster-edit-list.tsx`. Efek di handler lewat `tx` keputusan; efek luar lewat `afterCommit`.
- Test: `roster-edit.test.ts`, `roster-edit-app.test.ts`, `apps/web/tests/roster-edit.test.tsx`.

### R5. Pola Kerja / Homebase / kelompok karyawan
- File: `packages/shared/src/work-roster.ts` (skema, `DEFAULT_WORK_ROSTERS`), `work-roster.service.ts` (`planWorkRoster`, `resolveResidency` via `listEmployeeResidencies`), `work-roster.repository.ts`, `work-roster-api.ts`, `work-roster-page.tsx`.
- Test: `work-roster.test.ts`, `apps/web/tests/work-roster.test.tsx`.

### R6. Menambah pengaturan TM atau jenis libur
- File: `calendar.routes.ts` (`settingsSchema`, `holidaySchema`), `calendar.service.ts` (`updateTimeSettings`), `packages/shared/src/time-management.ts` (`HOLIDAY_KINDS`, `holidayInputSchema`), `calendar-settings-pages.tsx`. Pengaturan disimpan di kunci pengaturan TM (tanpa migrasi).
- Test: `foundation.test.ts` (kalender/pengaturan), `timezone.test.ts`.

## Cek & test
- `bun run typecheck && bunx biome ci . && bun run check:boundaries`
- API: `<prefix lokal> bun run db:which && <prefix lokal> bun run --cwd apps/api test <file>`
- Web: `bun run --cwd apps/web test <file>`
- Dokumen: README fitur (checklist) + satu entri `log.md`; develop: `docs/codemap/attendance.md`; branch rekan: "catatan codemap" di `log.md`; kartu ini + baris `INDEX.md`.

## Jebakan
- `roster_days.crewId` hanya terisi untuk baris `source: PATTERN`; keanggotaan crew per tanggal dibaca dari `crew_members` (rentang tanggal), jangan dari `crewId` hari MANUAL/IMPORT/CHANGE.
- Hari terkunci (absen disetujui / periode CLOSED) tidak pernah ditimpa: `lockedDayKeys`, `keepDayKeys`, `lockedEmployeesOn`, `assertDayUnlocked` (tukar shift). Tempel template mundur juga mempertahankan hari yang sudah ada absennya.
- Karyawan yang sudah anggota crew pada tanggal itu tidak boleh diubah langsung (kuas/import/template/anggota crew): dipecah ke `ROSTER_EDIT`; HR yang mengajukan tidak memutus langkahnya sendiri. HR tidak boleh sel diri sendiri tanpa crew (`canApplyRosterCell`).
- Shift `startsNextDay`: jendela & istirahat digeser 24 jam (`shiftWindow`/`breakWindow` di `attendance-engine.ts`); jam shift baru wajib dites lewat tengah malam (`crossesMidnight`, `midnight.test.ts`).
- Logika harian TM memakai `settingsToday()` (zona dari pengaturan), bukan `new Date()` WIB; cron `roster-extend` ikut horizon `rosterHorizonDays`.
- Langkah `TO` pada pola menghasilkan hari tanpa shift `timeOff`; `upsertDay` mereset `timeOff`. Jangan menyamakan `TO` dengan `OFF`.
- Rute di `APP_OPERATION_IDS` adalah kontrak aplikasi HP: ubah bentuk respons = ubah kontrak (`roster.contract.ts`, `assertExact`).
- Skema Prisma, tabel baru, role/grant baru: di luar gerbang `/fitur-kecil`. Tabel `roster_*`, `crews`, `crew_members`, `work_rosters`, `employee_residencies` hanya diubah lewat migrasi.
- Area ini tidak menyentuh nominal rupiah; lembur & upah ada di [tm-lembur.md](tm-lembur.md), absen/approval di kartu `tm-absen.md` / `tm-approval.md` (bila sudah ada).
