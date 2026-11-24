# Kartu: Lembur (Time Management)

- **Area:** Lembur: mesin hitung, usulan otomatis + approval `OVERTIME`, absen istirahat, SPL & susulan, pengajuan lembur karyawan, upah grade (gerbang nominal)
- **Fitur:** time-management — [docs/features/time-management/README.md](../../../../docs/features/time-management/README.md)
- **Modul:** `apps/api/src/modules/attendance/` · `apps/web/src/features/time-management/`
- **diverifikasi:** 99bd49a 2026-11-24
- **Jalur yang dipantau:** `apps/api/src/modules/attendance/overtime*` `apps/api/src/modules/attendance/attendance.policy.ts` `apps/api/src/modules/attendance/attendance-engine.ts` `packages/shared/src/overtime.ts` `packages/shared/tests/overtime.test.ts` `apps/web/src/features/time-management/overtime-api.ts` `apps/web/src/features/time-management/pages/overtime-pages.tsx` `apps/web/src/features/time-management/components/overtime-orders.tsx` `apps/web/src/features/time-management/components/overtime-claims.tsx` `apps/api/tests/integration/time-management/`

## Ringkasan
Setiap `recomputeDay`/Clock Out memanggil `syncOvertime`: kelebihan jam dari absen vs jadwal shift dihitung mesin murni `computeOvertimeDay` (`@hris/shared`) menjadi usulan lembur per hari (`overtime_requests`), diputuskan Atasan + HR paralel (approval `OVERTIME`). SPL (`overtime_orders`) dibuat atasan/HR sebelum dijalani (atau susulan oleh HR/SA) dan membatasi jendela absen serta jam yang diakui. Karyawan juga bisa mengajukan lembur (`overtime_claims`); HR/SA menetapkan jam lalu menyetujui = SPL susulan. Absen istirahat (`BREAK_START`/`BREAK_END`) menghasilkan utang menit yang mengurangi lembur. Pengguna: karyawan, atasan, HR PT, SA.

## Keputusan aktif
- `TM-D6` — usulan otomatis; diakui hanya bila >= 60 menit, bulat ke atas per 30 menit; utang menit (telat + istirahat lebih) mengurangi; batas 4 j/hari & 18 j/minggu = peringatan + alasan wajib dari pemutus; pengali per tipe hari/pola (rumus 6/5 hari) ada di `computeOvertimeDay`.
- `TM-D7` — absen istirahat hanya di lokasi kerja wajib istirahat; lebih jatah = `BREAK_OVER`, tanpa absen = `NO_BREAK_PUNCH`; hari OFF/tanpa jadwal tidak wajib.
- `TM-D12` — Clock In hari OFF hanya bila ada SPL (`offDayOvertime`); Mulai istirahat di luar jendela = 422.
- `TM-D17` — SPL berlaku langsung; lembur diakui hanya di dalam rentang SPL (`clampToOrder`); jendela Clock In awal & batas Clock Out mengikuti SPL.
- `TM-D18` — 45 jam/minggu hanya patokan menyusun jadwal; lembur tetap per hari.
- `TM-D19` — SPL susulan: HR PT/SA saja, periode tanggal itu belum ditutup (`isDateClosed`), kolom `retroactive`.
- `TM-D27` — pengajuan lembur karyawan: satu menunggu per tanggal; keputusan HR PT/SA memanggil `setOvertimeOrder`; atasan hanya diberi tahu.
- `ORG-D9` — atasan role apa pun (punya bawahan langsung) boleh SPL & lihat antrean.
- OD: tidak ada OD terbuka khusus area ini (`OD-14` sudah terjawab = TM-D6).

## Peta file

### API — `apps/api/src/modules/attendance/`
| Lapisan | File | Simbol penting |
|---|---|---|
| Routes | `overtime.routes.ts` | `registerOvertimeRoutes`, `ROUTES` (overtime, summary, grade-wages, break-locations, overtime-orders, overtime-claims, `/roster/templates`) |
| Policy | `attendance.policy.ts` | `canOrderOvertime`, `canOrderOvertimeRetroactive`, `canSeeLaborCost`, `canManageGradeWages`, `canManageBreakLocations`, `canSeeTeamCostTotal` |
| Service | `overtime.service.ts` | `calcDay`, `clampToOrder`, `loadCalcContext`, `syncOvertime`, `syncOvertimeForDay`, `registerOvertimeIntegrations` (guard+handler `OVERTIME`), `listOvertime`, `overtimeSummary`, `getBreakLocations`, `setBreakLocations`, `listGradeWages`, `setGradeWage` |
| Service | `overtime-order.service.ts` | `setOvertimeOrder`, `cancelOvertimeOrder`, `listOvertimeOrders`, `listOvertimeSubordinates`, `deadlineWithOrder`, `ordersOfEmployee`, `OFF_DAY_CLOSE_MIN` |
| Service | `overtime-claim.service.ts` | `createOvertimeClaim`, `cancelOvertimeClaim`, `decideOvertimeClaim`, `listOvertimeClaims`, `notifyNewClaim` |
| Absen | `attendance.service.ts` | `candidatesOf`, `applyOrder` (SPL ke jendela absen), `recordPunch` (punch istirahat), `openDayTimes` |
| Engine | `attendance-engine.ts` | `breakWindow`, `planCheckIn` (kandidat SPL: `openFrom`), `relaxedCheckOutDeadline` |
| Repository | `overtime.repository.ts` | `findOrder`, `upsertOrder`, `ordersOf`, `createOvertime`, `decideOvertime`, `findClaimById`, `createClaim`, `countPendingClaimsFor`, `listGradeWageRows` |
| Contract/Zod | `overtime.contract.ts` | skema `OvertimeOrder*`, `OvertimeClaim*`, respons lembur/upah grade/lokasi istirahat (`assertExact`) |
| Antrean | `time-notify.service.ts` | `TimeQueue.overtimeClaims`, pengingat pulang dari akhir SPL |
| Index | `index.ts` | `syncOvertimeForDay`, `exitWageBasis` (diekspor ke modul lain) |

### Shared — `packages/shared/src/overtime.ts`
| Simbol penting |
|---|
| `computeOvertimeDay`, `recognizeOvertimeMinutes`, `overtimeEquivalentHours`, `formulaForPattern`, `OVERTIME_*` (tipe hari, status, flag, batas), `BREAK_LABELS` |
| `overtimeOrderInputSchema`, `overtimeClaimInputSchema`, `overtimeClaimDecisionSchema`, `gradeWageInputSchema`, `breakLocationsInputSchema`, `formatMinutes` |
| Fungsi rupiah (`hourlyWage`, `overtimePay`, `leaveCompensation`, pembagi upah): lihat Jebakan, tidak dibahas kartu ini |
Tipe punch `PUNCH_KINDS`/label di `packages/shared/src/time-management.ts`.

### Web — `apps/web/src/features/time-management/`
| Jenis | File | Simbol penting |
|---|---|---|
| Halaman | `pages/overtime-pages.tsx` | `OvertimePage` (`?tab=claims`), `GradeWagesPage`, `BreakLocationsCard` |
| Halaman | `pages/overtime-claim-page.tsx` | `MyOvertimeClaimsPage` (`/absen/lembur`, TM-D27) |
| Komponen | `components/overtime-orders.tsx`, `components/overtime-claims.tsx` | `OvertimeOrdersView`, `OvertimeClaimsView`, `MyOvertimeClaims` |
| Hook/API | `overtime-api.ts` | `useOvertimeList`, `useOvertimeSummary`, `useOvertimeOrders`, `useSetOvertimeOrder`, `useCancelOvertimeOrder`, `useOvertimeSubordinates`, `useOvertimeClaims`, `useCreateOvertimeClaim`, `useDecideOvertimeClaim`, `useBreakLocations`, `useGradeWages` |
| Akses UI | `access.ts` | `tmAccess.overtime`, `decideOvertime`, `overtimeInbox`, `orderOvertimeRetroactive` |
| Saklar | `apps/web/src/app/feature-flags.ts` | `tmOvertime`, `tmGradeWages` (jalur rilis: jangan diubah di jalur ini) |

### Test
| Jenis | File |
|---|---|
| Shared unit | `packages/shared/tests/overtime.test.ts` |
| API integration | `apps/api/tests/integration/time-management/overtime.test.ts`, `overtime-order.test.ts`, `require-checkout.test.ts` (klaim lembur), `punch-window.test.ts` |
| API unit | `apps/api/src/modules/attendance/__tests__/overtime-order.test.ts`, `attendance-engine.test.ts` |
| Web | `apps/web/tests/overtime.test.tsx`, `overtime-claims.test.tsx` |

## Endpoint -> policy -> siapa
| Method & path | Fungsi policy | Siapa boleh |
|---|---|---|
| `GET /overtime`, `GET /overtime/summary` | cakupan di `listOvertime`/`overtimeSummary`; tampilan nominal `canSeeLaborCost`, total tim `canSeeTeamCostTotal` | karyawan (miliknya), pemutus (inbox), SA/HR PT; nominal dibatasi (lihat Jebakan) |
| `GET /overtime-orders`, `GET /overtime-orders/subordinates` | `canViewEmployeeRoster`, `canOrderOvertime` | SA, HR PT, atasan langsung, karyawan (miliknya) |
| `PUT /overtime-orders`, `POST /overtime-orders/{id}/cancel` | `canOrderOvertime`; tanggal lampau/susulan `canOrderOvertimeRetroactive` | atasan langsung, HR PT, SA (bukan diri sendiri kecuali SA); susulan: HR PT/SA |
| `GET/POST /overtime-claims`, `POST /{id}/cancel` | `canViewEmployeeRoster` (daftar); `employeeId` aktor (ajukan/batal) | karyawan (miliknya), HR/atasan sesuai cakupan |
| `POST /overtime-claims/{id}/decision` | `canOrderOvertimeRetroactive` | HR PT, SA |
| `GET/PUT /break-locations` | `canManageBreakLocations` | SA, HR |
| `GET /grade-wages` | `canSeeLaborCost` | SA; HR ber-grant `labor.cost.read` |
| `PUT /grade-wages/{gradeId}` | `canManageGradeWages` | SA |
| `POST /roster/templates` | `canManageRoster` | SA, HR PT (lihat `tm-jadwal.md`) |
Approval `OVERTIME` (Atasan + HR paralel) diputus lewat modul approval, bukan rute lembur (lihat kartu `tm-approval.md`). Rute di `APP_OPERATION_IDS` (`apps/api/src/core/openapi.ts`): `listOvertime`, `listOvertimeOrders`, `listOvertimeSubordinates`, `setOvertimeOrder`, `cancelOvertimeOrder`, `*OvertimeClaim*` = kontrak aplikasi HP.

## Resep "cara menambah X"

### R1. Mengubah aturan hitung lembur (pembulatan, ambang, label)
- File: `packages/shared/src/overtime.ts` (`recognizeOvertimeMinutes`, `computeOvertimeDay`, konstanta `OVERTIME_*`), pemakai `overtime.service.ts` `calcDay`. Perubahan tarif/pengali/rupiah di luar gerbang (lihat Jebakan).
- Test: `packages/shared/tests/overtime.test.ts`, `tests/integration/time-management/overtime.test.ts`.

### R2. Menambah field/aturan pada SPL
- File: `packages/shared/src/overtime.ts` (`overtimeOrderInputSchema`), `overtime.contract.ts`, `overtime-order.service.ts` (`setOvertimeOrder`), `attendance.service.ts` (`applyOrder`), `overtime-orders.tsx`. Kolom baru = skema Prisma: berhenti dan lapor.
- Test: `overtime-order.test.ts` (integration & unit), `punch-window.test.ts`.

### R3. Mengubah alur pengajuan lembur karyawan
- File: `overtime-claim.service.ts` (`createOvertimeClaim`, `decideOvertimeClaim`, `notifyNewClaim`), `overtime.routes.ts`, shared `overtimeClaimInputSchema`/`overtimeClaimDecisionSchema`, `overtime-claims.tsx`, `overtime-claim-page.tsx`; badge/antrean: `time-notify.service.ts`.
- Test: `require-checkout.test.ts`, `apps/web/tests/overtime-claims.test.tsx`.

### R4. Menambah rute lembur baru (deny-by-default)
- File: `overtime.routes.ts` (`route(...)` di `ROUTES`), `overtime.contract.ts`, policy baru di `attendance.policy.ts` mengikuti pola `canOrderOvertime`/`canManageBreakLocations`, cek di service paling awal; hook di `overtime-api.ts`; akses UI di `access.ts` (hanya kosmetik).
- Test: `overtime.test.ts` (200, 400, 401, 403).

### R5. Mengubah aturan absen istirahat / lokasi wajib istirahat
- File: `attendance.service.ts` (`recordPunch`, `openDayTimes`), `attendance-engine.ts` (`breakWindow`), `overtime.service.ts` (`isBreakRequired`, `setBreakLocations`), `BreakLocationsCard`.
- Test: `attendance-engine.test.ts`, `punch-window.test.ts`, `overtime.test.ts` (lokasi istirahat).

## Cek & test
- `bun run typecheck && bunx biome ci . && bun run check:boundaries`
- API: `<prefix lokal> bun run db:which && <prefix lokal> bun run --cwd apps/api test <file>`
- Shared: `bun run --cwd packages/shared test` (atau file tertentu)
- Web: `bun run --cwd apps/web test <file>`
- Dokumen: README fitur (checklist) + satu entri `log.md`; develop: `docs/codemap/attendance.md`; branch rekan: "catatan codemap" di `log.md`; kartu ini + baris `INDEX.md`.

## Jebakan
- **Nominal rupiah di luar gerbang `/fitur-kecil`:** tarif, pengali, upah grade, `hourlyWage`/`overtimePay`/`leaveCompensation`, `exitWageBasis`, total biaya tim. Hanya SA / HR ber-grant `labor.cost.read` (`canSeeLaborCost`); `canManageGradeWages` SA saja; atasan hanya TOTAL tim (`canSeeTeamCostTotal`). Perubahan di sini = lapor ke supervisor; jangan menulis nominal ke log/test/kartu.
- Gerbang nominal ada di service (`showPay` di `listOvertime`/`overtimeSummary`), bukan di UI; menyembunyikan kolom di web bukan pemeriksaan akses.
- Mesin hitung hanya di `@hris/shared` (`computeOvertimeDay`): jangan menduplikasi di API/web. Perubahan konstanta mengubah usulan semua hari yang di-`recomputeDay` lagi.
- `syncOvertime` jalan di dalam transaksi punch/recompute; handler approval `OVERTIME` memakai `tx` keputusan (efek luar lewat `afterCommit`).
- Lembur hanya diakui di dalam rentang SPL (`clampToOrder`); hari OFF tanpa SPL tidak bisa Clock In lembur.
- SPL susulan/klaim ditolak bila periode tanggal itu CLOSED (`isDateClosed`); atasan tidak boleh SPL susulan (`canOrderOvertimeRetroactive`).
- Waktu absen selalu dari server; hari "ini" lewat `settingsToday()`; shift `startsNextDay` menggeser jendela 24 jam (lihat `tm-jadwal.md`).
- Tidak ada rute ubah status usulan di `overtime.routes.ts`: keputusan lewat approval (`tm-approval.md`).
- Saklar web `tmOvertime`/`tmGradeWages`: ubah hanya di jalur rilis.
