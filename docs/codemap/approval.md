# Codemap — `approval`

> Detail modul `approval`, dipindah utuh dari `CODEMAP.md` §2/§3/§6 pada 2026-10-13. Struktur standar modul: [CODEMAP §4](../CODEMAP.md#4-struktur-standar-modul-appsapisrcmodulesmodul) · peta modul: [CODEMAP §5](../CODEMAP.md#5-peta-modul). Fitur pemakai: [time-management](../features/time-management/README.md).

## Tabel & rincian

### `approval`

**2026-11-24 — EMP-D9 (audit PM Paket 1):** `createApprovalRequest`: mode PARALLEL tanpa pemutus atasan (`decidingManager` null = tanpa atasan / atasan tanpa akun aktif) → request `SINGLE` berlangkah `["HR"]` saja (SINGLE eksplisit = atasan, lembur, tetap). `approval.policy.ts` `stepRight`: langkah MANAGER dengan atasan null → HR PT-nya **regular** (dulu override) + SA regular. Baru: `setApprovalSubmitter` (input manual HR tanpa atasan → penginput jadi pengaju, tidak bisa memutus), `pendingRequestsForSubjects`, `autoApproveRequest(tx, id, now, note)` (keputusan sistem `decidedByAccountId` null + handler + audit `approval.auto_approve`, dipakai script antrean lama); repository `setSubmitter`, `pendingRequestsForSubjects`, `decideStep` menerima pemutus null. Test: `__tests__/approval.policy.test.ts`, `tests/integration/time-management/auto-approve.test.ts`.

**2026-11-23 — EMP-D8 (audit PM T4):** `approval.service.ts` `reassignPendingManagerSteps(tx, requesterId, managerId)` (snapshot atasan permintaan PENDING yang langkah MANAGER-nya masih PENDING diganti; atasan tanpa akun aktif = null via `decidingManager`) & `releasePendingManagerSteps(tx, managerId)` (atasan nonaktif → null); repository `reassignPendingManager`/`clearPendingManager`. Dipanggil modul employee; diekspor lewat `index.ts`.

**[wip] 2026-10-13 (gabung `HRIS/Mat/windows`, desain [time-management.md](../features/time-management/design.md), D-067–D-073):** file `approval.{policy,repository,routes,schema,service}.ts`; subjek baru `ATTENDANCE_PUNCH` (D-073: Clock In & Clock Out masing-masing MANAGER + HR paralel); persetujuan massal; tabel di bawah = rancangan awal.

| Tabel | Isi penting |
|---|---|
| `approval_requests` | `subject_type` (`LEAVE`, `PERMIT`, `ATTENDANCE_CORRECTION`, `OVERTIME`), `subject_id`, `requester_id`, `mode` (`PARALLEL`/`SINGLE`), `status` |
| `approval_steps` | `request_id`, `step` (`MANAGER`/`HR`), `assignee_id?`, `decision`, `decided_by?`, `decided_at?`, `note?`, `is_override` |

Modul pemilik subjek (leave/attendance) dipanggil kembali lewat interface-nya saat status final berubah. **2026-10-29:** event handler membawa `afterCommit(task)` (tipe `AfterCommit` diekspor `index.ts`) — efek luar (notifikasi/FCM) dijalankan `decide()` setelah commit, gagal diabaikan; transaksi keputusan timeout 30 dtk. Semua handler terdaftar (OVERTIME, ROSTER_CHANGE, ATTENDANCE_CORRECTION, ATTENDANCE_PUNCH, ATTENDANCE_DAY, ROSTER_EDIT, LEAVE/PERMIT) mengirim notifikasi lewat `afterCommit`. **2026-11-04 (backlog BE mobile):** enum `ApprovalDecision` + `CANCELLED`; `cancelApprovalRequest()` juga menutup langkah yang masih `PENDING` (`repository.cancelPendingSteps`, `decided_at` = waktu batal) — migrasi `20261104070000_approval_step_cancelled` (ADD VALUE) + `20261104070100_approval_step_cancelled_backfill` (data lama). Kontrak `Approval.steps[].decision` + `CANCELLED`; web menampilkan "Dibatalkan" (`display.tsx`, `attendance-days-page.tsx`). **2026-11-17 (ORG-D9):** `createApprovalRequest` menyimpan snapshot `managerEmployeeId` = null bila atasan tidak punya akun aktif tertaut (`iam.employeesWithActiveAccount`) → perilaku "tanpa atasan" (SA regular, HR override). `stepRight`/`listActionable` tetap netral role: atasan role apa pun memutus langkah MANAGER bila `actor.employeeId` = snapshot.
