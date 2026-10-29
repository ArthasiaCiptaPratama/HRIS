# Codemap — `approval`

> Detail modul `approval`, dipindah utuh dari `CODEMAP.md` §2/§3/§6 pada 2026-10-13. Struktur standar modul: [CODEMAP §4](../CODEMAP.md#4-struktur-standar-modul-appsapisrcmodulesmodul) · peta modul: [CODEMAP §5](../CODEMAP.md#5-peta-modul). Fitur pemakai: [time-management](../features/time-management/README.md).

## Tabel & rincian

### `approval`

**[wip] 2026-10-13 (gabung `HRIS/Mat/windows`, desain [time-management.md](../features/time-management/design.md), D-067–D-073):** file `approval.{policy,repository,routes,schema,service}.ts`; subjek baru `ATTENDANCE_PUNCH` (D-073: Clock In & Clock Out masing-masing MANAGER + HR paralel); persetujuan massal; tabel di bawah = rancangan awal.

| Tabel | Isi penting |
|---|---|
| `approval_requests` | `subject_type` (`LEAVE`, `PERMIT`, `ATTENDANCE_CORRECTION`, `OVERTIME`), `subject_id`, `requester_id`, `mode` (`PARALLEL`/`SINGLE`), `status` |
| `approval_steps` | `request_id`, `step` (`MANAGER`/`HR`), `assignee_id?`, `decision`, `decided_by?`, `decided_at?`, `note?`, `is_override` |

Modul pemilik subjek (leave/attendance) dipanggil kembali lewat interface-nya saat status final berubah. **2026-10-29:** event handler membawa `afterCommit(task)` (tipe `AfterCommit` diekspor `index.ts`) — efek luar (notifikasi/FCM) dijalankan `decide()` setelah commit, gagal diabaikan; transaksi keputusan timeout 30 dtk.
