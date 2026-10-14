# Codemap — `leave`

> Detail modul `leave`, dipindah utuh dari `CODEMAP.md` §2/§3/§6 pada 2026-10-13. Struktur standar modul: [CODEMAP §4](../CODEMAP.md#4-struktur-standar-modul-appsapisrcmodulesmodul) · peta modul: [CODEMAP §5](../CODEMAP.md#5-peta-modul). Fitur pemakai: [time-management](../features/time-management/README.md).

## Tabel & rincian

### `leave`

**[wip] 2026-10-13:** `leave.{policy,repository,routes,service}.ts` + `leave-engine.ts` (prorata, sisa tahun lalu hangus 31 Maret, hutang cuti — D-072); tabel nyata: `leave_types`, `leave_years` (Master Cuti per tahun), `leave_ledger` (buku besar saldo), `leave_requests`. Tabel di bawah = rancangan awal (sudah digantikan).

| Tabel | Isi penting |
|---|---|
| `leave_types` | `kind` (`ANNUAL`/`PERMIT`), `name`, `quota_days?`, `requires_document`, `is_paid`, aturan akrual/carry-over |
| `leave_balances` | `employee_id`, `year`, `entitled`, `used`, `held`, `adjusted` |
| `leave_balance_adjustments` | Penyesuaian manual + alasan |
| `leave_requests` | `employee_id`, `leave_type_id`, `start_date`, `end_date`, `working_days`, `document_path?`, `status`, referensi approval |
