# Kartu: Cuti, izin & sakit

- **Area:** Cuti, izin & sakit (modul `leave`)
- **Fitur:** Time Management — [docs/features/time-management/README.md](../../../../docs/features/time-management/README.md)
- **Modul:** `apps/api/src/modules/leave/` · `apps/web/src/features/time-management/`
- **diverifikasi:** 99bd49a 2026-11-24
- **Jalur yang dipantau:** `apps/api/src/modules/leave/` `apps/api/src/modules/attendance/leave-bridge.ts` `packages/shared/src/time-management.ts` `packages/shared/tests/leave-rules.test.ts` `apps/web/src/features/time-management/leave-api.ts` `apps/web/src/features/time-management/pages/leave-page.tsx` `apps/web/src/features/time-management/pages/leave-admin-pages.tsx` `apps/web/src/features/time-management/access.ts` `apps/api/tests/integration/time-management/leave.test.ts`

## Ringkasan
Jenis cuti/izin/sakit (`leave_types`), Master Cuti per tahun (`leave_years`), buku besar saldo (`leave_ledger`: GRANT/HOLD/USE/dst), pengajuan (`leave_requests`) dengan approval paralel Atasan + HR (mesin ada di modul approval, lihat `tm-approval.md`). Hari terhitung = hari kerja roster (OFF/tanggal merah tidak memotong; cuti bersama pada hari kerja = 1 hari). Cron `leave-daily` (`app.ts`) menjalankan `runLeaveDaily`: cuti bersama, jatah 1 Jan, hangus 31 Des, pelunasan hutang akhir Jan, hak keluar. Pengguna: karyawan (ajukan/saldo), atasan & HR (putuskan), HR (saldo/import), SA (master/job manual).

## Keputusan aktif
- `D-072` — jatah 1 Jan prorata, hutang cuti boleh, setiap perubahan saldo tercatat di buku besar
- `TM-D4` — izin (`PERMIT`) boleh melebihi `maxDaysPerRequest`; sisanya ditahan dari saldo tahunan (`annualChargedDates`)
- `TM-D5` — `description` (maks 300) & `documentLabel` (maks 120) per jenis, diatur SA; form pengajuan menampilkannya
- `TM-D9` — sisa hangus 31 Des tanpa uang; beban = saldo tahun mulai (`chargeYearOf`); pengajuan ditolak boleh diajukan ulang <= 6 bln (`resubmitOfId`); hak keluar (`leave-exit.service.ts`)
- `TM-D21/D22` — batas hari memakai `settingsToday()` (attendance/index.ts), bawaan WITA
- `ORG-D9` — atasan langsung (role apa pun) boleh melihat/memutuskan cuti bawahan
- OD terbuka: tidak ada yang tercatat untuk area ini

## Peta file

### API — `apps/api/src/modules/leave/`
| Lapisan | File | Simbol penting |
|---|---|---|
| Routes | `leave.routes.ts` | `route`, `ROUTES`, `registerLeaveRoutes` |
| Policy | `leave.policy.ts` | `canViewLeaveMaster`, `canManageLeaveMaster`, `canViewLeaveYears`, `canViewEmployeeLeave`, `canManageBalances`, `canRequestLeave`, `canRunLeaveJobs`, `canAdjustBalance` |
| Service | `leave.service.ts` | `listTypes`, `saveType`, `saveYear`, `previewLeave`, `createLeaveRequest`, `cancelLeaveRequest`, `annualChargedDates`, `myLeave`, `listLeaveRequests`, `balanceTable`, `employeeLedger`, `adjustBalance`, `importBalances`, `grantAnnual`, `settleDebts`, `expireCarry`, `chargeCollectiveLeave`, `runLeaveDaily`, `runLeaveJob`, `registerLeaveIntegrations`, `DEFAULT_TYPES` |
| Engine | `leave-engine.ts` | `prorataDays`, `countLeaveDates`, `chargeYearOf`, `allocateCharges`, `realBalance`, `summarize`, `datesBetween` |
| Hak keluar | `leave-exit.service.ts` | `computeExit`, `syncExitSettlements`, `listExitSettlements`, `recalculateExitSettlement`, `markExitSettlementPaid` |
| Repository | `leave.repository.ts` | `ledgerOf`, `addEntries`, `findRequest`, `createRequest`, `overlapping`, `activeResubmissions`, `lockEmployeeYear`, `activeExitSettlements` |
| Contract | `leave.contract.ts` | `leaveTypeSchema`, `leaveYearSchema`, `leaveRequestSchema`, `leaveExitSettlementSchema` |
| Fakta dashboard | `leave-analytics.ts` | `leaveFacts` (dipakai modul analytics, lihat `dashboard.md`) |
| Index | `index.ts` | `registerLeaveRoutes`, `runLeaveDaily`, `leaveFacts` |
| Jembatan | `apps/api/src/modules/attendance/leave-bridge.ts` | `rosterMarks`, `datesWithPunches`, `markLeaveDays` (leave tidak query tabel attendance langsung) |

### Shared — `packages/shared/src/time-management.ts`
`leaveCategorySchema`, `LEAVE_REQUEST_STATUS_LABELS`, `LEAVE_LEDGER_KINDS`, `leaveBalanceLastDay`, `isLeaveYearExpired`, `leaveResubmitDeadline`, `leaveTypeInputSchema`, `leaveYearInputSchema`, `leaveRequestInputSchema`, `leavePreviewInputSchema`, `leaveAdjustInputSchema`, `leaveBalanceImportSchema`.

### Web — `apps/web/src/features/time-management/`
| Jenis | File | Simbol penting |
|---|---|---|
| Halaman | `pages/leave-page.tsx` | `LeavePage` (/time/cuti), `RequestCard`, `LeaveStatusBadge` |
| Halaman | `pages/leave-admin-pages.tsx` | `LeaveApprovalsPage` (/time/persetujuan-cuti), `LeaveBalancesPage` (/time/saldo-cuti, termasuk hak keluar), `LeaveMasterPage` (/time/master-cuti) |
| Hook/API | `leave-api.ts` | `leaveKeys`, `useLeaveTypes`, `useLeaveYears`, `useMyLeave`, `useLeavePreview`, `useLeaveActions`, `useLeaveRequests`, `useLeaveBalances`, `useEmployeeLedger`, `useBalanceActions`, `useExitSettlements`, `exitSettlementSchema` |
| Akses UI | `access.ts` | `tmAccess.requestLeave`, `decideLeave`, `manageLeaveBalances`, `manageLeaveMaster`, `viewLeaveMaster` |
| Saklar | `apps/web/src/app/feature-flags.ts` | `tmLeave`, `tmLeaveApprovals`, `tmLeaveBalances`, `tmLeaveMaster` (jalur rilis: jangan diubah) |
| HP | `pages/mobile-pages.tsx` | halaman cuti `/absen/cuti` (pakai hook yang sama) |

### Test
| Jenis | File |
|---|---|
| API integration | `apps/api/tests/integration/time-management/leave.test.ts` (juga `security/hr-self-management.test.ts`) |
| API unit | `apps/api/src/modules/leave/__tests__/leave-engine.test.ts`, `self-management.policy.test.ts` |
| Shared | `packages/shared/tests/leave-rules.test.ts` |
| Web | `apps/web/tests/leave.test.tsx` |

## Endpoint → policy → siapa
Semua di `leave.routes.ts`; policy dipanggil dari service (403 `ForbiddenError`, atau 404 bila target tak terlihat).
| Method & path | Fungsi policy | Siapa boleh |
|---|---|---|
| `GET /leave-types` | `canViewLeaveMaster` | semua akun |
| `POST /leave-types`, `PUT /leave-types/{id}` | `canManageLeaveMaster` | SA |
| `GET /leave-years` | `canViewLeaveYears` | SA, HR, MANAGER |
| `PUT /leave-years` | `canManageLeaveMaster` | SA |
| `GET /leave/me`, `POST /leave/preview`, `POST /leave/attachment-upload` | `canRequestLeave` (employeeId sendiri) | akun terhubung karyawan |
| `POST /leave-requests` (+ `Idempotency-Key`) | `canRequestLeave` | diri sendiri |
| `GET /leave-requests?scope=inbox/all` | cakupan di `listLeaveRequests` | SA, HR PT, atasan |
| `GET /leave-requests/{id}` | `canViewEmployeeLeave` | SA, HR PT, diri sendiri, atasan langsung |
| `POST /leave-requests/{id}/cancel` | pemilik, status menunggu | diri sendiri |
| `GET /leave-balances` | `canManageBalances` | SA, HR PT |
| `GET /leave-balances/employees/{id}` | `canViewEmployeeLeave` | SA, HR PT, diri sendiri, atasan |
| `POST /leave-balances/adjust`, `/import/preview`, `/import/commit` | `canManageBalances` + `canAdjustBalance` | SA, HR PT (HR tidak untuk dirinya) |
| `GET /leave-exit-settlements`, `POST .../{id}/recalculate`, `.../{id}/paid` | `canManageBalances` | SA, HR PT; rupiah hanya `canSeeLaborCost` |
| `POST /leave-jobs` | `canRunLeaveJobs` | SA |

## Resep "cara menambah X"

### R1. Menambah jenis cuti/izin/sakit bawaan
- File: `leave.service.ts` (`DEFAULT_TYPES`; seed hanya bila kosong), `packages/shared/src/time-management.ts` (`leaveCategorySchema` bila kategori baru)
- Test: `apps/api/tests/integration/time-management/leave.test.ts`, `packages/shared/tests/leave-rules.test.ts`

### R2. Menambah isian pada jenis (mis. field Master Cuti)
- File: `leaveTypeInputSchema` (shared), `leave.contract.ts` (`leaveTypeSchema`), `leave.service.ts` (`saveType`, `LeaveTypeDto`), `leave-admin-pages.tsx` (`LeaveMasterPage`), `leave-api.ts` (`leaveTypeSchema`). Kolom DB baru = perubahan Prisma: berhenti dan laporkan.
- Test: `leave.test.ts`, `apps/web/tests/leave.test.tsx`

### R3. Mengubah aturan hitung hari / pembebanan saldo
- File: `leave-engine.ts` (`countLeaveDates`, `allocateCharges`, `chargeYearOf`), `leave.service.ts` (`previewLeave`, `annualChargedDates`)
- Test: `__tests__/leave-engine.test.ts`, `leave.test.ts`

### R4. Menambah tindakan/endpoint HR di saldo
- File: `leave.policy.ts` (fungsi baru, deny-by-default), `leave.service.ts`, `leave.contract.ts`, `leave.routes.ts` (`ROUTES`), `leave-api.ts` (`useBalanceActions`), `leave-admin-pages.tsx`. Hak akses baru = berhenti dan laporkan.
- Test: `leave.test.ts` (200/400/401/403), `__tests__/self-management.policy.test.ts`

### R5. Mengubah teks/label status pengajuan
- File: `time-management.ts` (`LEAVE_REQUEST_STATUS_LABELS`, `LEAVE_LEDGER_KIND_LABELS`), `leave-page.tsx` (`LeaveStatusBadge`)
- Test: `apps/web/tests/leave.test.tsx`

## Cek & test area ini
- `bun run typecheck && bunx biome ci . && bun run check:boundaries`
- API: `<prefix lokal> bun run db:which && <prefix lokal> bun run --cwd apps/api test tests/integration/time-management/leave.test.ts`
- API unit: `bun run --cwd apps/api test src/modules/leave/__tests__`
- Shared: `bun run --cwd packages/shared test leave-rules`
- Web: `bun run --cwd apps/web test leave`

## Dokumen yang wajib diperbarui
- `docs/features/time-management/README.md` (checklist) dan satu entri `docs/features/time-management/log.md`
- develop: `docs/codemap/leave.md`; branch rekan tim: "catatan codemap" di `log.md` (PROMPT §8)
- kartu ini + barisnya di `kartu/INDEX.md`

## Jebakan
- Modul leave tidak boleh query tabel attendance: pakai `leave-bridge.ts` / `attendance/index.ts` (`settingsToday`, `exitWageBasis`, `canSeeLaborCost`).
- Pembebanan memakai tahun hari terhitung pertama; tahun yang sudah hangus menolak cuti tahunan (sakit/izin dalam jatah tetap boleh).
- Tahanan (HOLD) bukan hutang nyata: `settleDebts` memakai `employeesWithLedger(year, { excludeHolds })`.
- HR tidak boleh menyesuaikan/mengimpor saldo dirinya sendiri (`canAdjustBalance`; SA dikecualikan); import tetap semua-atau-tidak kecuali baris diri sendiri.
- Hak keluar: nominal uang/upah hanya SA atau HR ber-`labor.cost.read` dan di luar gerbang perubahan kecil; jangan menulis nilai ke log/kartu.
- Lampiran (`leave-attachments`) dokumen sensitif: tidak masuk log/test output.
- Menyembunyikan tombol bukan pemeriksaan akses; API yang memutuskan.
