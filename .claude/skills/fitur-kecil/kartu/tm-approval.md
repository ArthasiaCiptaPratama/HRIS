# Kartu: Approval & notifikasi

- **Area:** Approval & notifikasi Time Management (mesin approval, inbox & antrean `/time/queue`, notifikasi TM, cron `attendance-reminders` & `approval-digest`)
- **Fitur:** Time Management — [docs/features/time-management/README.md](../../../../docs/features/time-management/README.md)
- **Modul:** `apps/api/src/modules/approval/` · `apps/api/src/modules/notification/` · `apps/api/src/modules/attendance/` (time-notify) · `apps/web/src/features/time-management/`
- **diverifikasi:** 99bd49a 2026-11-24
- **Jalur yang dipantau:** `apps/api/src/modules/approval/approval.routes.ts` `apps/api/src/modules/approval/approval.policy.ts` `apps/api/src/modules/approval/approval.service.ts` `apps/api/src/modules/approval/approval.repository.ts` `apps/api/src/modules/approval/approval.schema.ts` `apps/api/src/modules/approval/index.ts` `apps/api/src/modules/notification/notification.service.ts` `apps/api/src/modules/notification/notification.routes.ts` `apps/api/src/modules/notification/notification.policy.ts` `apps/api/src/modules/notification/index.ts` `apps/api/src/modules/attendance/time-notify.service.ts` `apps/api/src/modules/attendance/time-notify.routes.ts` `apps/api/src/app.ts` `apps/api/vercel.json` `apps/api/src/core/openapi.ts` `packages/shared/src/time-management.ts` `apps/web/src/features/time-management/queue-api.ts` `apps/web/src/features/time-management/api.ts` `apps/web/src/features/time-management/access.ts` `apps/web/src/features/time-management/components/display.tsx` `apps/web/src/features/time-management/pages/mobile-pages.tsx` `apps/web/src/features/time-management/pages/attendance-days-page.tsx` `apps/web/src/app/navigation.ts` `apps/web/src/app/layout/sidebar.tsx` `apps/web/src/features/notification/api.ts` `apps/web/src/features/notification/components/*` `apps/web/src/features/notification/pages/*` `apps/api/tests/integration/time-management/supervisor-approval.test.ts` `apps/api/tests/integration/time-management/foundation.test.ts` `apps/api/tests/integration/time-management/auto-approve.test.ts` `apps/api/tests/integration/time-management/time-notify.test.ts` `apps/api/tests/integration/time-management/roster-notify.test.ts` `apps/api/tests/integration/notification.test.ts`

## Ringkasan
Modul `approval` adalah mesin generik: modul pemilik subjek (attendance, leave) memanggil `createApprovalRequest` di transaksinya dan mendaftarkan handler status final (`registerApprovalHandler`). Mode PARALLEL = langkah MANAGER + HR (keduanya setuju → APPROVED; satu tolak → REJECTED); SINGLE = satu langkah. Pemutus: atasan snapshot, HR PT-nya, SA (override wajib alasan). Inbox = `listActionable`; angka antrean `GET /time/queue`. Notifikasi TM = lonceng in-app (+ FCM) lewat `notify`, dikirim setelah commit. Cron mengingatkan absen dan merangkum antrean harian.

## Keputusan aktif
- `D-010`/`D-068`/`D-069` — approval paralel atasan+HR, inbox massal, override SA/HR dengan alasan.
- `D-073` — absen: Clock In & Out masing-masing satu approval `ATTENDANCE_PUNCH`; EMP-D9: tanpa label tidak membuat approval.
- `EMP-D8`/`EMP-D9` — PARALLEL tanpa pemutus atasan → request `SINGLE` langkah `["HR"]`; atasan null → HR PT/SA memutus langkah MANAGER secara regular; `setApprovalSubmitter` (input HR = pengaju, tak bisa memutus); `autoApproveRequest` (keputusan sistem, audit `approval.auto_approve`).
- `ORG-D9` — atasan role apa pun memutus langkah MANAGER bila `actor.employeeId` = snapshot; atasan tanpa akun aktif → snapshot null.
- `TM-D24` — `submittedByAccountId`: pengaju atas nama tidak boleh memutus.
- `TM-D2` — notifikasi TM hanya in-app, sekali per kejadian (`dedupeKey`); pengingat Clock In/Out + hari terakhir koreksi (cron `attendance-reminders`), ringkasan antrean harian (`approval-digest`).
- `TM-D16` — FCM pengingat pulang sekali di +15 mnt sebagai cadangan alarm lokal app.
- `TM-D27` — `overtimeClaims` ikut antrean (bukan approval, dihitung dari `overtime.repository`).
- `OD-15` — ringkasan harian = rekomendasi, bukan keputusan final.

## Peta file

### API — `apps/api/src/modules/approval/`
| Lapisan | File | Simbol penting |
|---|---|---|
| Routes | `approval.routes.ts` | `registerApprovalRoutes`, `ApprovalRouteDeps`, `strict` |
| Policy | `approval.policy.ts` | `stepRight` (regular/override/null), `canViewApproval`, `ApprovalTarget` |
| Service | `approval.service.ts` | `createApprovalRequest`, `registerApprovalHandler`, `registerApprovalGuard`, `listActionable`, `decide`, `decideInTx`, `decideBulk`, `cancelApprovalRequest`, `getApproval`, `toView`, `setApprovalSubmitter`, `autoApproveRequest`, `reassignPendingManagerSteps`, `releasePendingManagerSteps`, tipe `AfterCommit` |
| Repository | `approval.repository.ts` | `createRequest`, `findRequest`, `listRequests`, `decideStep`, `setStatus`, `cancelPendingSteps`, `pendingRequestsForSubjects` |
| Schema | `approval.schema.ts`, `index.ts` | `approvalViewSchema`, `decisionResultSchema`, `bulkResultSchema`; `index.ts` = satu-satunya pintu masuk modul lain |

### API — notifikasi & antrean
| Lapisan | File | Simbol penting |
|---|---|---|
| Service TM | `attendance/time-notify.service.ts` | `notifyEmployees`, `recipientsOfEmployees`, `EmployeeNotice`, `queueFor`, `myQueue`, `QUEUE_SUBJECTS`, `TimeQueue`, `runAttendanceReminders`, `runApprovalDigest` |
| Routes | `attendance/time-notify.routes.ts` | `registerTimeNotifyRoutes` |
| Notification | `notification/notification.service.ts` (via `index.ts`) | `notify`, `retryEmailOutbox`, `configureNotification` |
| Notification | `notification/notification.routes.ts`, `notification.policy.ts` | `registerNotificationRoutes` |
| Handler per subjek | `attendance/attendance.service.ts`, `period.service.ts`, `overtime.service.ts`, `roster-change.service.ts`, `roster-edit.service.ts`; `leave/leave.service.ts` | `registerApprovalHandler` untuk `ATTENDANCE_PUNCH`, `ATTENDANCE_DAY`, `ATTENDANCE_CORRECTION`, `OVERTIME` (+ guard), `ROSTER_CHANGE`, `ROSTER_EDIT`, `LEAVE`/`PERMIT` |
| Cron | `apps/api/src/app.ts`, `apps/api/vercel.json` | kunci `attendance-reminders` (tiap 5 mnt), `approval-digest` (harian) |

### Shared — `packages/shared/src/`
| File | Simbol penting |
|---|---|
| `time-management.ts` | `APPROVAL_SUBJECTS`, `ApprovalSubject`, `APPROVAL_SUBJECT_LABELS`, `approvalDecisionBodySchema`, `bulkApprovalDecisionBodySchema`, `MAX_BULK_DECISIONS`, `APPROVAL_REQUEST_STATUS_LABELS`, `APPROVAL_STEP_LABELS`, `TM_NOTIFICATION_TARGETS` |

### Web — `apps/web/src/features/time-management/`
| Jenis | File | Simbol penting |
|---|---|---|
| Hook/API | `queue-api.ts` | `timeQueueSchema`, `useTimeQueue` (refetch 60 dtk) |
| Hook/API | `api.ts` | `useDecideApproval`, `useDecideBulk` |
| Komponen | `components/display.tsx` | `ApprovalSteps`, `StepBadge`, `StepChips` |
| Halaman | `pages/mobile-pages.tsx` | `MobileApprovalsPage`, `DecisionButtons`, `PunchApprovalCard` |
| Halaman | `pages/attendance-days-page.tsx` | `BulkDialog`, `PunchPanel` (inbox absen + keputusan massal) |
| Akses UI | `access.ts` | `tmAccess.approvalInbox`, `tmAccess.verifyAlpha`, `tmAccess.decideRosterChanges` |
| Navigasi | `apps/web/src/app/navigation.ts`, `app/layout/sidebar.tsx` | `queueKey` (badge menu dari `/time/queue`) |
| Lonceng | `apps/web/src/features/notification/` | `api.ts`, `components/`, `pages/` |

### Test
| Jenis | File |
|---|---|
| API integration | `apps/api/tests/integration/time-management/supervisor-approval.test.ts`, `foundation.test.ts`, `auto-approve.test.ts`, `time-notify.test.ts`, `roster-notify.test.ts`; `apps/api/tests/integration/notification.test.ts` |
| API unit | `apps/api/src/modules/approval/__tests__/approval.policy.test.ts` |
| Web | `apps/web/tests/approval-steps.test.tsx`, `attendance-days-search.test.tsx` |

## Endpoint → policy → siapa
| Method & path | Fungsi policy | Siapa boleh |
|---|---|---|
| `GET /approvals/{id}` | `canViewApproval` (tak berhak → 404) | pengaju, atasan snapshot, HR PT-nya, SA |
| `POST /approvals/{id}/decision` | `stepRight` di `decideInTx` (tak berhak sama sekali → 404; ada hak tapi bukan → 403) | pemutus langkah; override HR PT/SA wajib `note` |
| `POST /approvals/decisions` | `stepRight` per item; gagal satu tidak membatalkan lain | sama; maks 200 `requestIds` |
| `GET /time/queue` | tanpa policy khusus; `queueFor(actor)` memakai `listActionable` | akun login mana pun (angka sesuai hak) |
| `GET /notifications`, `POST /notifications/{id}/read`, `POST /notifications/read-all` | milik akun sendiri (`notification.policy.ts`) | akun login |

## Resep "cara menambah X"

### R1. Menambah jenis subjek approval
- File: `packages/shared/src/time-management.ts` (`APPROVAL_SUBJECTS`, `APPROVAL_SUBJECT_LABELS`), modul pemilik (`createApprovalRequest` + `registerApprovalHandler`, opsional `registerApprovalGuard`), `time-notify.service.ts` (`QUEUE_SUBJECTS`, `runApprovalDigest`), `apps/api/src/app.ts` (wiring `register…Integrations`). Enum Prisma `subject_type` = migrasi: berhenti dan lapor.
- Test yang diperluas: `supervisor-approval.test.ts`, `__tests__/approval.policy.test.ts`

### R2. Menambah notifikasi TM ke karyawan
- File: handler/service pemilik: panggil `notifyEmployees([{ employeeId, type, title, body, link, dedupeKey, target }])` di dalam `event.afterCommit(...)`; target baru → `TM_NOTIFICATION_TARGETS` (shared)
- Test yang diperluas: `time-notify.test.ts` (atau test modul pemilik)

### R3. Mengubah aturan siapa boleh memutus
- File: `approval.policy.ts` (`stepRight`, `canViewApproval`), `approval.service.ts` (`decideInTx`, `listActionable`, `toView`). Perubahan model akses (role/grant baru) = berhenti dan lapor.
- Test yang diperluas: `__tests__/approval.policy.test.ts`, `supervisor-approval.test.ts`, web `approval-steps.test.tsx`

### R4. Menambah angka antrean / jenis pengingat
- File: `time-notify.service.ts` (`TimeQueue`, `QUEUE_SUBJECTS`, `queueFor`, `runAttendanceReminders`), `location-setting.contract.ts` (`timeQueueSchema`), web `queue-api.ts` (`timeQueueSchema`), `apps/web/src/app/navigation.ts` (`queueKey`)
- Test yang diperluas: `time-notify.test.ts`

### R5. Mengubah jadwal/isi cron
- File: `apps/api/vercel.json` (jadwal), `apps/api/src/app.ts` (peta job), `time-notify.service.ts` (`runAttendanceReminders(now, employeeIds?)`, `runApprovalDigest`)
- Test yang diperluas: `time-notify.test.ts` (pakai `employeeIds` agar data lain tak ikut)

## Cek & test area ini
- `bun run typecheck && bunx biome ci . && bun run check:boundaries`
- API: `<prefix lokal> bun run db:which && <prefix lokal> bun run --cwd apps/api test <file>` (baca output `db:which`: harus lokal `hris`)
- Web: `bun run --cwd apps/web test <file>`

## Dokumen yang wajib diperbarui
- `docs/features/time-management/README.md` (checklist) dan satu entri `docs/features/time-management/log.md`
- develop: `docs/codemap/approval.md` (+ `attendance.md`/`notification.md` bila disentuh); branch rekan tim: "catatan codemap" di `log.md` (PROMPT §8)
- kartu ini + barisnya di `kartu/INDEX.md`

## Jebakan
- Handler approval berjalan di transaksi keputusan: notifikasi/FCM wajib lewat `event.afterCommit(...)`, bukan langsung; kegagalannya diabaikan `decide()` (transaksi timeout 30 dtk).
- Modul lain hanya boleh impor `approval` lewat `modules/approval/index.ts` (boundary check); jangan query tabel approval dari modul lain.
- `/approvals/*`, `/time/queue`, `/notifications*` ada di `APP_OPERATION_IDS` (`apps/api/src/core/openapi.ts`) = kontrak mobile; ubah path/bentuk = ubah map + kabari tim mobile. `/time/queue` dipakai badge web dan tile Approval HP.
- Tolak wajib alasan (`approvalDecisionBodySchema`) → 400; override tanpa `note` → `BusinessRuleError`; satu orang tidak boleh memutus dua langkah berbeda (`decidedAnyStep` → 403).
- `queueFor` memanggil `listActionable` per subjek (take 1000); antrean web dan inbox harus tetap sama hitungannya.
- Cron memakai `time_settings.timezone` (`readTimeSettings`/`localDate`), bukan WIB; `dedupeKey` menjamin sekali per karyawan per tanggal; `attendance-reminders` tiap 5 mnt di `vercel.json`.
- Isi notifikasi tanpa data sensitif (tanpa selfie/koordinat/nominal); tautan memakai rute web (`/time/...`, `/absen/approval` untuk akun Karyawan, TM-D30).
- Pembatalan: `cancelApprovalRequest` menutup langkah PENDING menjadi `CANCELLED` (migrasi 2026-11-04).
