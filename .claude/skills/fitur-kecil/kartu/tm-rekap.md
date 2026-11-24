# Kartu: Rekap & tutup periode

- **Area:** Rekap bulanan, tutup periode, Alpha, surat pernyataan, export Excel absen
- **Fitur:** Time Management — [docs/features/time-management/README.md](../../../../docs/features/time-management/README.md)
- **Modul:** `apps/api/src/modules/attendance/` (period, alpha, attendance-export) · `apps/web/src/features/time-management/`
- **diverifikasi:** 99bd49a 2026-11-24
- **Jalur yang dipantau:** `apps/api/src/modules/attendance/period.service.ts` `apps/api/src/modules/attendance/period.routes.ts` `apps/api/src/modules/attendance/period.contract.ts` `apps/api/src/modules/attendance/alpha.service.ts` `apps/api/src/modules/attendance/attendance-export.service.ts` `apps/api/src/modules/attendance/attendance-export.contract.ts` `apps/api/src/modules/attendance/attendance.policy.ts` `apps/api/src/modules/attendance/attendance-day.routes.ts` `packages/shared/src/attendance-export.ts` `packages/shared/src/xlsx.ts` `packages/shared/src/time-management.ts` `apps/web/src/features/time-management/period-api.ts` `apps/web/src/features/time-management/pages/period-pages.tsx` `apps/web/src/features/time-management/components/attendance-export-dialog.tsx` `apps/web/src/features/time-management/components/alpha-verification-list.tsx` `apps/web/src/features/time-management/access.ts`

## Ringkasan
`GET /attendance/recap` merekap bulan per karyawan aktif dalam cakupan (hari kerja, hadir, Alpha, cuti, telat, dst). Tutup periode (D-071) mengubah hari belum disetujui/tanpa absen menjadi ALPHA dan mengunci bulan. Alpha tanpa absen dibuat harian (TM-D3), koreksi maks 3 hari. Atasan memverifikasi Alpha (TM-D13 Fase B). Karyawan membuat surat pernyataan per hari Alpha. Export Excel data absen (TM-D31) dari Data Absen Harian. Koreksi absen (`/attendance/corrections*`) juga di kartu ini; punch: `tm-absen.md`; roster: `tm-jadwal.md`.

## Keputusan aktif
- `D-071` — tutup periode: hari kerja tanpa persetujuan = ALPHA + surat pernyataan wajib (sebagian diubah TM-D3)
- `TM-D3` — Alpha harian `NO_ATTENDANCE` setelah batas pulang shift; koreksi s.d. tanggal kerja + 3 hari (`CORRECTION_WINDOW_DAYS`, `ALPHA_RULE_START`); rekam jejak tidak dihapus
- `TM-D11` — Data Absen Harian tanpa hari Alpha-tanpa-absen; tempatnya `/time/rekap?tab=alpha`
- `TM-D13` — verifikasi Alpha oleh atasan: Alpha/izin/sakit/tugas luar (`ALPHA_VERIFICATION_OUTCOMES`)
- `TM-D21/D22` — "hari ini" = `settingsToday()`, bawaan WITA
- `TM-D31` — export Excel: Detail per crew (16 kolom, sel link peta) dan Flash; audit `attendance.export`. Flash dikunci 5 kolom (Nama, Tanggal, Clock In, Clock Out, Status). Kolom Detail/Flash, pengelompokan crew, batas dan akses disetujui pengguna: mengubahnya = mengubah TM-D31, jadi rencana wajib bertanya ke pengguna
- OD terbuka: tidak ada yang tercatat untuk area ini

## Peta file

### API — `apps/api/src/modules/attendance/`
| Lapisan | File | Simbol penting |
|---|---|---|
| Routes | `period.routes.ts` | rekap, periods, record, statements, corrections, alpha-verifications |
| Routes | `attendance-day.routes.ts` | rute `/attendance/days/export` |
| Policy | `attendance.policy.ts` | `canViewRosterSetup`, `canManageRoster`, `canVerifyAlpha`, `canViewAlphaVerifications`, `canExportAttendance`, `canViewEmployeeRoster` |
| Service | `period.service.ts` | `canClosePeriod`, `isDateClosed`, `scopedEmployees`, `monthlyRecap`, `previewClose`, `closePeriod`, `alphaCandidates`, `listStatements`, `createStatement`, `alphaDaysForEvidence`, `createCorrection`, `cancelCorrection`, `listCorrections`, `correctionInstant`, `registerPeriodIntegrations` (handler approval `ATTENDANCE_CORRECTION`) |
| Service | `alpha.service.ts` | `markNoAttendanceAlpha`, `listAlphaVerifications`, `verifyAlpha`, `myAttendanceRecord`, `employeeAttendanceRecord` |
| Export | `attendance-export.service.ts` | `exportAttendance`, `resolveScope`, `detailRows`, `detailSheets`, `flashSheet`, `crewSheetNames`, `mapCell`, `locationText`, `summarize`, `rosterOnlyStatus` |
| Repository | `attendance.repository.ts` / `roster.repository.ts` | `exportDays` (query ramping tanpa selfie) / `crewMembershipsForExport` (termasuk crew terhapus) |
| Contract | `period.contract.ts`, `attendance-export.contract.ts` | `recapRowSchema`, `monthlyRecapSchema`, `periodPreviewSchema`, `statementRowSchema`, `alphaVerificationSchema`, `attendanceExportFileSchema` |

### Shared — `packages/shared/src/`
| File | Simbol penting |
|---|---|
| `attendance-export.ts` | `ATTENDANCE_EXPORT_MAX_DAYS` (92), `ATTENDANCE_EXPORT_MAX_ROWS` (20.000), `attendanceExportInputSchema`, `attendanceExportFileName`, `formatClockTime`, `googleMapsUrl` |
| `xlsx.ts` | `XlsxStyledCell.link` (sel HYPERLINK, hanya di sheet berjudul), `buildWorkbook`, `sheetName` |
| `time-management.ts` | `ALPHA_RULE_START`, `CORRECTION_WINDOW_DAYS`, `canStillCorrect`, `correctionDeadline`, `periodCloseInputSchema`, `statementInputSchema`, `alphaVerificationInputSchema` |

### Web — `apps/web/src/features/time-management/`
| Jenis | File | Simbol penting |
|---|---|---|
| Halaman | `pages/period-pages.tsx` | `RecapPage` (/time/rekap, CSV bulanan & rincian), `CloseDialog`, `CorrectionsStatementsPage` (/time/pernyataan: koreksi + surat; HP memakai hook `period-api.ts` yang sama) |
| Komponen | `components/attendance-export-dialog.tsx` | `AttendanceExportDialog` (dipakai `pages/attendance-days-page.tsx`) |
| Komponen | `components/alpha-verification-list.tsx` | `AlphaVerificationList`, `useAlphaInbox` |
| Komponen | `components/attendance-record.tsx` | `MyAttendanceRecord`, `EmployeeAttendanceRecord` |
| Hook/API | `period-api.ts` | `useRecap`, `usePeriodClose`, `useCorrections`, `useCorrectionActions`, `useStatements`, `useCreateStatement`, `useAlphaVerifications`, `useVerifyAlpha`, `recapRowSchema` |
| Akses UI | `access.ts` | `tmAccess.viewRecap`, `tmAccess.exportDays`, `tmAccess.correctionsStatements` |
| Saklar | `apps/web/src/app/feature-flags.ts` | `tmRecap`, `tmCorrections` (jalur rilis: jangan diubah) |
| CSV | `apps/web/src/lib/csv.ts` | `escapeCsvCell` (netralkan `=+-@`) |

### Test
| Jenis | File |
|---|---|
| API integration | `apps/api/tests/integration/time-management/period.test.ts`, `alpha.test.ts`, `alpha-verification.test.ts`, `attendance-export.test.ts` (koreksi juga di `foundation.test.ts`, `timezone.test.ts`) |
| API unit | `apps/api/src/modules/attendance/__tests__/attendance-export.service.test.ts`, `attendance-export.policy.test.ts` |
| Shared | `packages/shared/tests/attendance-export.test.ts`, `xlsx.test.ts` |
| Web | `apps/web/tests/attendance-export.test.tsx`, `alpha-verification.test.tsx`, `period-close-warning.test.tsx`, `csv.test.ts` |

## Endpoint → policy → siapa
| Method & path | Fungsi policy | Siapa boleh |
|---|---|---|
| `GET /attendance/recap` | `scopedEmployees` (`canViewRosterSetup`/`canManageRoster`) | SA, HR PT, MANAGER (tim) |
| `POST /attendance/periods/preview`, `/close` | `canClosePeriod` | SA; HR PT ber-grant `payroll.period.prepare` |
| `GET /attendance/record/me` | akun terhubung karyawan | diri sendiri |
| `GET /attendance/record/employees/{id}` | `canViewEmployeeRoster` | SA, HR PT, atasan langsung |
| `GET /attendance/statements/me`, `POST /attendance/statements`, `/statements/upload` | employeeId sendiri | diri sendiri |
| `GET /attendance/statements` | `scopedEmployees` | SA, HR PT, MANAGER tim |
| `GET /attendance/alpha-verifications` | `canViewAlphaVerifications` | SA, HR, atasan (inbox/all) |
| `POST /attendance/alpha-verifications/{id}` | `canVerifyAlpha` | atasan karyawan, SA, HR PT; bukan diri sendiri |
| `GET /attendance/corrections?scope=mine/inbox` | `listCorrections` (inbox: `listActionable` modul approval) | diri sendiri / pemutus (SA, HR PT, atasan) |
| `POST /attendance/corrections` (+ `Idempotency-Key`) | employeeId sendiri; batas `canStillCorrect`, bulan tertutup ditolak | diri sendiri; approval paralel Atasan + HR (`tm-approval.md`) |
| `POST /attendance/corrections/{id}/cancel` | `cancelCorrection` (pemilik, status PENDING) | diri sendiri |
| `POST /attendance/days/export` | `canExportAttendance` | SA; HR PT (di luar PT 403); MANAGER tim langsung |


## Resep "cara menambah X"

### R1. Menambah kolom di export Detail
- File: `attendance-export.service.ts` (`DetailRow`, `detailRows`, `detailSheets` header+`formats`), `attendance.repository.ts` (`exportDays` bila butuh field baru; tanpa selfie/koordinat), `xlsx.ts` bila tipe sel baru
- Test: `__tests__/attendance-export.service.test.ts`, `packages/shared/tests/xlsx.test.ts`, `time-management/attendance-export.test.ts`

### R2. Menambah kolom di sheet Flash / ubah batas
- File: `attendance-export.service.ts` (`flashSheet`; nama/NIP dari `people()` → `employeeNumber`, seperti `detailRows`), `packages/shared/src/attendance-export.ts` (batas, `attendanceExportFileName`)
- Test: `apps/api/tests/integration/time-management/attendance-export.test.ts` (helper `flash()`), `packages/shared/tests/attendance-export.test.ts`; `apps/web/tests/attendance-export.test.tsx` bila teks web berubah. (Unit `attendance-export.service.test.ts` tidak menyebut Flash: belum diverifikasi)

### R3. Menambah kolom di rekap bulanan
- File: `period.service.ts` (`RecapRow`, `monthlyRecap`), `period.contract.ts` (`recapRowSchema`), `period-api.ts` (`recapRowSchema`), `period-pages.tsx` (`RecapPage`, CSV)
- Test: `time-management/period.test.ts`, `apps/web/tests/period-close-warning.test.tsx`

### R4. Mengubah aturan Alpha / batas koreksi
- File: `time-management.ts` (`CORRECTION_WINDOW_DAYS`, `canStillCorrect`), `alpha.service.ts` (`markNoAttendanceAlpha`), `period.service.ts` (`alphaCandidates`)
- Test: `time-management/alpha.test.ts`, `period.test.ts`

### R5. Mengubah verifikasi Alpha atau surat pernyataan
- File: `alpha.service.ts` (`verifyAlpha`), `attendance.policy.ts` (`canVerifyAlpha`), `period.service.ts` (`createStatement`), `alpha-verification-list.tsx`
- Test: `alpha-verification.test.ts`, `apps/web/tests/alpha-verification.test.tsx`

### R6. Mengubah form/aturan koreksi absensi
- File: `time-management.ts` (`correctionInputSchema`, `CORRECTION_STATUS_LABELS`), `period.service.ts` (`createCorrection`, `correctionInstant`, handler `ATTENDANCE_CORRECTION`), `period.contract.ts` (`correctionSchema`), `period-api.ts` (`correctionSchema`, `useCorrectionActions`), `period-pages.tsx` (`CorrectionsStatementsPage`)
- Test: `time-management/period.test.ts` (tambahan: `foundation.test.ts`, `alpha.test.ts`)

## Cek & test area ini
- `bun run typecheck && bunx biome ci . && bun run check:boundaries`
- API: `<prefix lokal> bun run db:which && <prefix lokal> bun run --cwd apps/api test tests/integration/time-management/period.test.ts` (ganti file sesuai tabel Test)
- Unit export: `bun run --cwd apps/api test src/modules/attendance/__tests__/attendance-export`
- Shared: `bun run --cwd packages/shared test attendance-export xlsx`
- Web: `bun run --cwd apps/web test attendance-export alpha-verification period-close-warning`

## Dokumen yang wajib diperbarui
- `docs/features/time-management/README.md` (checklist) dan satu entri `docs/features/time-management/log.md`
- develop: `docs/codemap/attendance.md`; branch rekan tim: "catatan codemap" di `log.md` (PROMPT §8)
- kartu ini + barisnya di `kartu/INDEX.md`

## Jebakan
- `monthlyRecap` dan tampilan karyawan memanggil `markNoAttendanceAlpha` (MENULIS data saat dibuka); export TM-D31 baca-saja, tidak menandai Alpha.
- Rekap memakai `scopedEmployees` (karyawan aktif, batas 2000); `alphaCandidates` batas 5000. Rekap dan tutup periode memakai `settingsToday()`, bukan jam server WIB.
- Bulan tertutup mengunci koreksi, verifikasi Alpha, roster dan cuti (`isDateClosed`).
- Export: batas 92 hari dan 20.000 baris (`BusinessRuleError`), crew terhapus tampil sebagai sheet "... (dihapus)", crew menurut keanggotaan pada tanggal itu; audit `attendance.export` tidak boleh memuat isi data.
- Export tanpa selfie dan koordinat mentah; sel peta hanya tautan. Hindari menambah data pribadi ke sheet.
- Surat pernyataan dan lampiran adalah dokumen sensitif; signed URL hanya bila diminta (`alphaDaysForEvidence`, dipakai modul discipline).
- Tombol sembunyi bukan akses: API memutuskan (`canExportAttendance`, `canClosePeriod`).
- Tutup periode terkait payroll (grant `payroll.period.prepare`): perubahan aturan tutup periode di luar gerbang perubahan kecil.
