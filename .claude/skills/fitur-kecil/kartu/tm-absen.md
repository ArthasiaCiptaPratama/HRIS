# Kartu: Absensi & punch

- **Area:** Absensi & punch (absen masuk/pulang/istirahat, absen manual HR, Data Absen Harian, lokasi absen per karyawan, cron `attendance-daily`)
- **Fitur:** Time Management — [docs/features/time-management/README.md](../../../../docs/features/time-management/README.md)
- **Modul:** `apps/api/src/modules/attendance/` · `apps/web/src/features/time-management/`
- **diverifikasi:** 464f923 2026-11-24
- **Jalur yang dipantau:** `apps/api/src/modules/attendance/attendance.service.ts` `apps/api/src/modules/attendance/attendance.policy.ts` `apps/api/src/modules/attendance/attendance-engine.ts` `apps/api/src/modules/attendance/attendance.repository.ts` `apps/api/src/modules/attendance/attendance.contract.ts` `apps/api/src/modules/attendance/attendance-day.routes.ts` `apps/api/src/modules/attendance/location-setting.service.ts` `apps/api/src/modules/attendance/location-setting.routes.ts` `apps/api/src/modules/attendance/alpha.service.ts` `apps/api/src/modules/attendance/normal-pending.service.ts` `apps/api/src/modules/attendance/index.ts` `packages/shared/src/time-management.ts` `apps/web/src/features/time-management/api.ts` `apps/web/src/features/time-management/capture.ts` `apps/web/src/features/time-management/pages/absen-page.tsx` `apps/web/src/features/time-management/components/install-banner.tsx` `apps/web/src/lib/standalone.ts` `apps/web/src/features/time-management/pages/attendance-days-page.tsx` `apps/web/src/features/time-management/pages/location-settings-page.tsx` `apps/api/tests/integration/time-management/`

## Ringkasan
Karyawan (akun tertaut karyawan) absen lewat PWA `/absen` atau app Android: `precheck` → unggah selfie → `punch` (IN/OUT/BREAK_START/BREAK_END). Waktu selalu dari server. Engine menghitung jendela shift, label (Telat, Pulang cepat, Di luar radius, dst.) dan alasan wajib. Tanpa label → punch langsung `APPROVED` (EMP-D9); berlabel → approval ATTENDANCE_PUNCH (lihat `tm-approval.md`). HR/SA bisa input manual dan melihat Data Absen Harian; atasan melihat timnya. Koreksi/Alpha/tutup periode: `tm-rekap.md`; shift/roster: `tm-jadwal.md`; lembur: `tm-lembur.md`.

## Keputusan aktif
- `D-067`/`D-070` — absen PWA selfie+GPS+label, tidak memblokir; alasan wajib bila ada label. `D-073` — Clock In & Out masing-masing diputus MANAGER+HR paralel; diubah EMP-D9 (tanpa label = auto-APPROVED).
- `TM-D1` — lokasi absen per karyawan: bebas lokasi > lokasi khusus (1 titik) > bawaan crew/lokasi kerja; atur SA + HR PT.
- `TM-D3` — hari kerja tanpa absen = Alpha `NO_ATTENDANCE`; koreksi & input manual HR hanya s.d. tanggal kerja + 3 hari (`CORRECTION_WINDOW_DAYS`).
- `TM-D11` — Data Absen Harian hanya hari yang punya absen (Alpha tanpa absen ada di Rekap), kecuali per `employeeId`.
- `TM-D12` — Clock Out normal dibuka `checkOutEarlyMin` sebelum jam pulang; lebih awal = pulang darurat (alasan wajib, label Pulang cepat). Istirahat hanya di jendela shift.
- `TM-D13/D14/D15` — absen per shift (tanggal kerja = tanggal roster, `startsNextDay`, `planCheckIn` pilih shift yang sedang berjalan).
- `TM-D16` — lupa Clock Out → `NO_CHECKOUT` + approval (bila `requireCheckOut` mati).
- `TM-D21/D22` — "hari ini" TM = `settingsToday()`/`time_settings.timezone` (bawaan WITA), bukan WIB.
- `TM-D25` — alasan opsional untuk `LOW_ACCURACY` & Clock In lembur hari libur ber-SPL (`LABELS_WITHOUT_REASON`).
- `TM-D26` — wajib absen pulang (`requireCheckOut`, bawaan nyala): lewat batas → Alpha `NO_CHECKOUT_ALPHA`; pulang di luar kantor ke-1/2 per bulan (`freeOutsideCheckOutsPerMonth`) auto-disetujui.
- `TM-D31` — ekspor Excel data absen (`/attendance/days/export`, tanpa selfie/koordinat); detail di `tm-rekap.md`.
- `TM-D32` — Absen bisa dipasang ke layar utama; mode "hanya Absen" HANYA saat `display-mode: standalone` (dibuka dari ikon); browser HP/desktop web tetap utuh tanpa pengalihan. Nama "Akselerasi Arthasia" / `short_name` "Akselerasi".
- `MOB-D3/D22` — kanal APP/PWA (`X-App-Version`), label `MOCK_LOCATION`, `Idempotency-Key` pada punch.

## Peta file

### API — `apps/api/src/modules/attendance/`
| Lapisan | File | Simbol penting |
|---|---|---|
| Routes | `attendance-day.routes.ts` | `ROUTES`, `registerAttendanceDayRoutes` (me/today, precheck, selfie-upload, punch, punches/{id}/cancel, manual, me/history, days, days/export, days/{id}) |
| Routes | `location-setting.routes.ts` | `registerLocationSettingRoutes` |
| Policy | `attendance.policy.ts` | `canManageRoster`, `canManageAttendanceLocation`, `canSetEmployeeAttendanceLocation`, `canListAttendanceDays`, `canListAttendanceInbox`, `canListEmployeeAttendanceDays`, `canViewEmployeeRoster`, `canExportAttendance` |
| Service | `attendance.service.ts` | `getToday`, `precheck`, `evaluate` (privat), `openDayTimes`, `suspicionFor`, `punch`, `recordPunch`, `cancelOwnPunch`, `manualPunch`, `myHistory`, `listDays`, `getDay`, `toDayViews`, `closeOverdueDays`, `purgeSelfies`, `recomputeDay`, `registerAttendanceIntegrations`, `outsideCheckOutWarning` |
| Service | `location-setting.service.ts` | `resolveAttendanceLocation`, `listLocationSettings`, `setLocationSettings` |
| Service | `alpha.service.ts` | `markNoAttendanceAlpha` (idempoten; dipanggil cron & saat `listDays` per `employeeId`) |
| Service | `normal-pending.service.ts` | `approveNormalPendingPunches` (script migrasi antrean lama) |
| Engine | `attendance-engine.ts` | `shiftWindow`, `breakWindow`, `planCheckIn`, `checkOutLabels`, `checkOutOpensAt`, `relaxedCheckOutDeadline`, `endOfLocalDay`, `checkGeofence`, `distanceM`, `restShortfall`, `localDate` |
| Repository | `attendance.repository.ts` | `findDay`, `listDays`, `daysByIds`, `dayIdsOfPunches`, `withTransactionDay`, `normalPendingPunches`, `countOutsideCheckOuts` |
| Contract/Zod | `attendance.contract.ts`, `location-setting.contract.ts` | `dayViewSchema`, `todayViewSchema`, `precheckResultSchema`, `locationSettingsViewSchema` |
| Fasad | `index.ts`, `directory.ts` | ekspor ke modul lain; `directory` = akses employee/organization tanpa Prisma |
| Cron | `apps/api/src/app.ts` | kunci `attendance-daily` (`closeOverdueDays` + `markNoAttendanceAlpha` + `purgeSelfies`); jadwal di `apps/api/vercel.json` |

### Shared — `packages/shared/src/`
| File | Simbol penting |
|---|---|
| `time-management.ts` | `PUNCH_KINDS`, `punchPrecheckSchema`, `punchInputSchema`, `manualPunchInputSchema`, `ATTENDANCE_LABELS`, `ATTENDANCE_LABEL_TEXT`, `LABELS_WITHOUT_REASON`, `PUNCH_STATUSES`, `PUNCH_CANCEL_WINDOW_MIN`, `PUNCH_CHANNELS`, `ATTENDANCE_LOCATION_MODES`, `attendanceLocationInputSchema`, `timeSettingsSchema` (`requireCheckOut`, `checkOutEarlyMin`), `CORRECTION_WINDOW_DAYS`, `ALPHA_RULE_START` |

### Web — `apps/web/src/features/time-management/`
| Jenis | File | Simbol penting |
|---|---|---|
| Halaman HP | `pages/absen-page.tsx` | `AbsenHome`, `MobileShell`, `PunchFlow`, `TodayCard`, `BreakButton`, `PunchRow` |
| Halaman | `pages/attendance-days-page.tsx` | `AttendanceDaysPage`, `PunchPanel`, `BulkDialog`, `ManualDialog`, `DayDialog` |
| Halaman | `pages/location-settings-page.tsx` | `LocationSettingsPage`, `LocationDialog` |
| Komponen | `components/install-banner.tsx` | `InstallBanner` (TM-D32: `beforeinstallprompt` Android, petunjuk iPhone, ditutup via localStorage) |
| Lib | `apps/web/src/lib/standalone.ts` | `isStandalone`, `useStandalone`, `isAbsenPath`, `openInBrowser`, `webLinkClick`, `getInstallPrompt`/`takeInstallPrompt`/`subscribeInstallPrompt` (penangkap `beforeinstallprompt` sejak bundel awal) |
| Guard/Auth | `features/auth/components/guards.tsx`, `features/auth/pages/login-page.tsx` | `RequireAuth` (pengalihan standalone), `StandaloneNoEmployee`, `safeNext(next, standalone)` |
| PWA statis | `apps/web/index.html`, `apps/web/public/absen.webmanifest`, `public/pwa/absen-{180,192,512,maskable-512}.png` | tag manifest/apple/theme-color; `name`/`short_name`, `id`/`start_url` `/absen` |
| Komponen | `components/display.tsx`, `components/selfie-thumb.tsx` | `LabelChips`, `ApprovalSteps`, `DayStatusBadge`, `SelfieThumb` |
| Hook/API | `api.ts`, `location-api.ts`, `capture.ts` | `useToday`, `usePrecheck`, `usePunch`, `useCancelPunch`, `useManualPunch`, `useAttendanceDays`, `useAttendanceDay`, `useSetLocationSettings`, `compressSelfie`, `stampSelfie` |
| Akses UI | `access.ts` | `tmAccess.punch`, `tmAccess.reviewDays`, `tmAccess.manageAttendanceLocations`, `tmAccess.absenHome` |
| Saklar fitur | `apps/web/src/app/feature-flags.ts` | `tmAbsen`, `tmAttendanceDays` (jalur rilis: jangan diubah di jalur ini) |

### Test
| Jenis | File |
|---|---|
| API integration | `apps/api/tests/integration/time-management/attendance.test.ts` (alur punch, label, hari), `punch-window.test.ts` (TM-D12), `require-checkout.test.ts` (TM-D26), `mobile-punch.test.ts` (APP/idempotensi), `location-setting.test.ts` (TM-D1), `auto-approve.test.ts` (EMP-D9), `alpha.test.ts`, `midnight.test.ts`, `shift-instance.test.ts`, `timezone.test.ts` |
| API unit | `apps/api/src/modules/attendance/__tests__/attendance-engine.test.ts`, `shift-instance.test.ts`, `midnight.test.ts`, `self-management.policy.test.ts` |
| Web | `apps/web/tests/punch-window.test.tsx`, `punch-channel-note.test.tsx`, `attendance-days-search.test.tsx`, `attendance-locations.test.tsx`, `employee-absen-home.test.tsx`, `absen-standalone.test.tsx` (TM-D32: kedua sisi standalone/browser), `absen-install-banner.test.tsx` |

## Endpoint → policy → siapa
| Method & path | Fungsi policy | Siapa boleh |
|---|---|---|
| `GET /attendance/me/today`, `GET /attendance/me/history` | `selfEmployee` (service) | akun tertaut karyawan; selain itu 403 |
| `POST /attendance/precheck`, `POST /attendance/selfie-upload`, `POST /attendance/punch` | `selfEmployee`; path selfie dicek `assertOwnedPath` | akun tertaut karyawan, untuk dirinya sendiri |
| `POST /attendance/punches/{id}/cancel` | `canCancelPunch` (service) | pemilik punch, ≤ 15 mnt, belum diputuskan |
| `POST /attendance/manual` | `canManageRoster` + larangan diri sendiri | SA; HR PT-nya (bukan untuk dirinya) |
| `GET /attendance/days` | `canListAttendanceInbox` (scope inbox) / `canListAttendanceDays` (+ `canListEmployeeAttendanceDays` bila `employeeId`) | inbox: SA/HR/atasan; semua: SA, HR PT, MANAGER tertaut (tim) |
| `GET /attendance/days/{id}` | `canViewEmployeeRoster` (tak berhak → 404) | SA, HR PT, atasan langsung, pemilik |
| `POST /attendance/days/export` | `canExportAttendance` | SA; HR PT; MANAGER tertaut (bawahan) |
| `GET/PUT /attendance-locations` | `canManageAttendanceLocation` / `canSetEmployeeAttendanceLocation` | SA; HR PT-nya (HR tak boleh ubah lokasinya sendiri; batch berisi HR self ditolak) |

## Resep "cara menambah X"

### R1. Menambah label/alasan absen baru
- File: `packages/shared/src/time-management.ts` (`ATTENDANCE_LABELS`, `ATTENDANCE_LABEL_TEXT`, `LABELS_WITHOUT_REASON` bila alasan opsional), `attendance.service.ts` (`evaluate`, `needsReason`), `components/display.tsx` (`LabelChips`)
- Test yang diperluas: `attendance.test.ts` + `attendance-engine.test.ts`; web `punch-window.test.tsx`. Enum Prisma label bisa butuh migrasi: berhenti dan lapor.

### R2. Mengubah aturan jendela/jam (Clock Out, istirahat, hari OFF)
- File: `attendance-engine.ts` (`shiftWindow`, `breakWindow`, `checkOutOpensAt`, `planCheckIn`), `attendance.service.ts` (`openDayTimes`, `evaluate`, `getToday`)
- Test yang diperluas: `__tests__/attendance-engine.test.ts`, `punch-window.test.ts`, `require-checkout.test.ts`

### R3. Menambah filter/kolom Data Absen Harian
- File: `attendance-day.routes.ts` (query `GET /attendance/days`), `attendance.service.ts` (`DayListQuery`, `listDays`, `toDayViews`), `attendance.contract.ts` (`dayViewSchema`), web `api.ts` (`DayListParams`), `pages/attendance-days-page.tsx`
- Test yang diperluas: `attendance.test.ts`; web `attendance-days-search.test.tsx`
- Ingat: ini kontrak mobile (lihat Jebakan).

### R4. Mengubah aturan lokasi/geofence absen
- File: `location-setting.service.ts` (`resolveAttendanceLocation`), `attendance-engine.ts` (`checkGeofence`), `attendance.service.ts` (`expectedLocation`), `attendance.policy.ts`, web `pages/location-settings-page.tsx`
- Test yang diperluas: `location-setting.test.ts`, `attendance-locations.test.tsx`

### R5. Mengubah aturan input manual HR
- File: `attendance.service.ts` (`manualPunch`), `attendance.policy.ts` (`canManageRoster`), shared `manualPunchInputSchema`, web `ManualDialog`
- Test yang diperluas: `attendance.test.ts`, `auto-approve.test.ts`

## Cek & test area ini
- `bun run typecheck && bunx biome ci . && bun run check:boundaries`
- API: `<prefix lokal> bun run db:which && <prefix lokal> bun run --cwd apps/api test <file>` (baca output `db:which`: harus lokal `hris`)
- Web: `bun run --cwd apps/web test <file>`

## Dokumen yang wajib diperbarui
- `docs/features/time-management/README.md` (checklist) dan satu entri `docs/features/time-management/log.md`
- develop: `docs/codemap/attendance.md`; branch rekan tim: "catatan codemap" di `log.md` (PROMPT §8)
- kartu ini + barisnya di `kartu/INDEX.md`

## Jebakan
- TM-D32: pengalihan standalone ada di `RequireAuth` (bukan `DashboardPage`); `/onboarding` dikecualikan (terkunci ↔ `/absen` akan berputar). `isStandalone()` dibaca tiap panggilan; di test stub `matchMedia`. Tag manifest/theme-color statis di `index.html`: jangan suntik lagi dari `usePwaInstall` (hanya daftar SW). Tautan ke halaman web dari dalam `/absen` wajib lewat `webLinkClick` (tile non-`/absen` otomatis; `CompleteDataBanner` ke `/onboarding` juga). `beforeinstallprompt` harus ditangkap di `lib/standalone.ts` (diimpor `guards.tsx`), bukan di chunk `/absen`. iOS tidak bisa keluar ke Safari secara pasti.
- `GET /attendance/days` (+ `/{id}`, me/today, me/history, precheck, punch, cancel) adalah kontrak mobile: `APP_OPERATION_IDS` di `apps/api/src/core/openapi.ts`; ubah path/bentuk respons = ubah map + kabari tim mobile; `attendance.contract.ts` memakai `assertExact` ke tipe service.
- `/attendance/manual`, `/attendance/days/export` dan `/attendance-locations` hanya web (tidak ada di `APP_OPERATION_IDS`).
- `listDays`: batas diam-diam 500 baris (1000 bila `employeeId`), selfie ditandatangani saat `toDayViews`; tanpa `employeeId` Alpha tanpa absen disaring (TM-D11) dan tidak ada marking Alpha.
- Waktu absen selalu dari server (Aturan Emas #9); jangan terima jam dari klien. Hitung "hari ini" lewat `settingsToday()`/`localDate(now, timezone)`, bukan WIB.
- Selfie, koordinat, dan path selfie tidak boleh masuk log/error/test output; path selfie dicek `assertOwnedPath`.
- Approval punch berlabel dibuat di `recordPunch`; efek luar (notifikasi) lewat `afterCommit`, lihat `tm-approval.md`.
- Hari/periode `CLOSED` menolak input manual (`isDateClosed`); batas koreksi H+3 berlaku juga untuk input manual HR.
- Label `SELF_REPORT`/`GALLERY_PHOTO` hanya sisa data lama (TM-D29 dicabut); jangan dihidupkan lagi.
