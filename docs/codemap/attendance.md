# Codemap — `attendance`

> Detail modul `attendance`, dipindah utuh dari `CODEMAP.md` §2/§3/§6 pada 2026-10-13. Struktur standar modul: [CODEMAP §4](../CODEMAP.md#4-struktur-standar-modul-appsapisrcmodulesmodul) · peta modul: [CODEMAP §5](../CODEMAP.md#5-peta-modul). Fitur pemakai: [time-management](../features/time-management/README.md).

## Web (`apps/web/src/features/`)

```
│       ├── time-management/          [wip] 2026-10-13 (gabung `HRIS/Mat/windows`, saklar `FEATURES.timeManagement`): PWA `/absen` (`pages/absen-page.tsx` shell HP + beranda; `pages/mobile-pages.tsx` aplikasi HP mandiri `/absen/{riwayat,roster,cuti,koreksi,tukar-shift,kalender,approval,notifikasi,profil}`, 2026-10-13; `capture.ts` kamera+GPS, `public/absen.webmanifest` + `absen-sw.js` tanpa cache), `/time/*` (absen harian, rekap & tutup periode, roster + pengaturan shift/pola/crew, perubahan roster, cuti, persetujuan cuti, saldo, master cuti, kalender libur, pengaturan, koreksi & surat pernyataan); `access.ts`, `api.ts`/`leave-api.ts`/`period-api.ts`, `roster-file.ts` (import Excel roster); **TM-D2 (2026-10-20):** `queue-api.ts` (badge menu `queueKey`), `components/home-insights.tsx` (beranda HP); **TM-D3 (2026-10-19):** `components/attendance-record.tsx` + `record-api.ts` (halaman Koreksi & tab Absensi detail karyawan); **TM-D1 (2026-10-15):** `/time/lokasi-absen` (`pages/location-settings-page.tsx` + `location-api.ts`, akses `tmAccess.manageAttendanceLocations`)
```

## Tabel & rincian

### `attendance`

**[wip] 2026-10-13:** tabel nyata di `attendance.prisma` (lihat §2); file: `calendar.*` (libur + pengaturan), `roster.*` + `roster-engine.ts` + `roster-change.service.ts` (shift/pola/crew/grid/import/tukar shift, D-069), `attendance.*` + `attendance-engine.ts` + `attendance-day.routes.ts` (absen PWA selfie+GPS+label tanpa blokir D-070, hari absen, koreksi, absen manual), `period.*` (rekap, tutup periode → ALPHA + surat pernyataan, D-071), `leave-bridge.ts`, **TM-D2 (2026-10-20)** `time-notify.{service,routes}.ts` (notifikasi, pengingat, `GET /time/queue`, ringkasan harian), **TM-D3 (2026-10-19)** `alpha.service.ts` (Alpha harian `NO_ATTENDANCE`, rekam jejak; route di `period.routes.ts` `/attendance/record/*`), **TM-D1 (2026-10-15)** `location-setting.{repository,service,routes}.ts` (tabel `employee_location_settings`; `GET`/`PUT /attendance-locations`; `resolveAttendanceLocation` dipakai mesin absen: bebas lokasi → lokasi khusus → crew → lokasi kerja; `checkGeofence(..., anywhere)`), `directory.ts` fasad baca-saja (2026-10-21: tanpa Prisma, meneruskan ke `employee/index.ts` & `organization/index.ts`; dipakai juga modul leave lewat `employeeDirectory`). Selfie di bucket private `attendance-selfies`, path wajib `attendance/<employeeId>/`. Tabel di bawah = rancangan awal (sudah digantikan).

**2026-10-21 (TM-D6–TM-D8, Mat):** `overtime.service.ts` (lokasi wajib istirahat = `time_settings.breakLocations`; upah grade `grade_wages`; `syncOvertime(tx, dayId)` dipanggil dari `punch` OUT & `recomputeDay`; `listOvertime`, `overtimeSummary`; approval `OVERTIME` + guard alasan), `overtime.routes.ts` (`GET /overtime`, `GET /overtime/summary`, `GET|PUT /grade-wages`, `GET|PUT /break-locations`, `POST /roster/templates`), `roster-template.service.ts` (JT: shift JTP/JTS/JTM, pola 21 langkah, crew A/B/C). Perhitungan murni: `@hris/shared` `computeOvertimeDay`. Absen istirahat: `PunchKind` `BREAK_START`/`BREAK_END` (status APPROVED, tanpa approval), `TodayView.breakState`. Policy: `canSeeLaborCost` (SA / HR + `labor.cost.read`), `canManageGradeWages` (SA), `canManageBreakLocations` (SA + HR), `canSeeTeamCostTotal` (MANAGER). Index: `syncOvertimeForDay`. Web: `overtime-api.ts`, `pages/overtime-pages.tsx` (`/time/lembur`, `/time/upah-grade`, `BreakLocationsCard`).

**2026-10-15 (Arsip 2b, Oatse):** `period.service.ts` + `alphaDaysForEvidence(employeeId, dayIds?, withUrls?)` (baca-saja: hari ALPHA + surat pernyataan, memakai `statementRows`; signed URL hanya bila `withUrls`), diekspor dari `index.ts` bersama tipe `StatementRow` — dipakai modul [discipline](discipline.md) untuk bukti SP mangkir (ARS-D12). Logika attendance tidak berubah.

| Tabel | Isi penting |
|---|---|
| `shift_templates` | Jam masuk/pulang, toleransi (policy SUPER_ADMIN) |
| `work_schedules` | Penugasan shift ke karyawan per tanggal/pola |
| `attendance_records` | `employee_id`, `date`, `clock_in_at`, `clock_out_at` (waktu server), koordinat, `is_outside_geofence`, `selfie_in_path`, `selfie_out_path`, `selfie_purged_at?`, status (tepat/telat/pulang cepat/izin/cuti/alpha) |
| `attendance_corrections` | Koreksi + referensi approval |
| `overtime_requests` | Lembur + referensi approval |
| `attendance_periods` | `period` (YYYY-MM), `status` (`OPEN`/`CLOSED`), `closed_by`, `closed_at` |

**Merge Mat 2026-10-21:** `directory.ts` tetap fasad tanpa Prisma; fungsi baru `activeGrades`, `activeLocations`, `exitedEmployees`, `exitStatusOf`, `analyticsEmployees` mendelegasikan ke `employee/index.ts` & `organization/index.ts` (dipakai `overtime.service`, `leave-exit.service`, `analytics.service`).

**TM-D12 (2026-10-22, Mat):** `attendance-engine.ts` `breakWindow` (jam istirahat sebelum jam mulai shift = keesokan hari), `checkOutOpensAt`, `planCheckIn().offDay`; `checkOutLabels(now, normalEnd, earlyMin)` memakai pengaturan `checkOutEarlyMin` (bukan toleransi shift). `attendance.service.ts` `openDayTimes` dipakai `evaluate` & `getToday`; Mulai istirahat di luar jendela → 422; Clock In hari OFF tanpa `offDayOvertime` → 422 (`details: [{ offDay: true }]`). Kolom `shifts.break_start_minute`/`break_end_minute`.

**2026-10-21 (rapi lapisan, Mat):** query lembur/upah grade/lokasi istirahat/fakta dashboard pindah ke `overtime.repository.ts`; `overtime.service.ts` & `analytics-facts.ts` tanpa `getPrisma()` (PROMPT §4). Skema respons rute lembur/upah grade/lokasi istirahat/template roster ada di `overtime.contract.ts` (merge develop 2026-10-22 menggantikan `overtime.schema.ts` milik Mat).

**Kontrak OpenAPI (MOB-D7 #1/MOB-D17, 2026-10-21, `HRIS/mobile-app`):** `attendance.contract.ts` (AttendanceToday/Day/Punch/Precheck/SelfieUpload/PunchCancel, Shift), `roster.contract.ts`, `period.contract.ts`, `overtime.contract.ts`, `location-setting.contract.ts` — skema respons per file rute, `assertExact` ke tipe service. Helper `route(method, path, summary, { response, body?, params?, query? })` di tiap `*.routes.ts`. Punch: `channel`/`appVersion`/`idempotencyKey` (`findPunchByIdempotencyKey`, `replayPunch`), `withMockLabel` + `LABELS_WITHOUT_REASON`; `notifyEmployees({ target })`.
