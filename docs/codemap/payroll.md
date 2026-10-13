# Codemap — `payroll`

> Detail modul `payroll`, dipindah utuh dari `CODEMAP.md` §2/§3/§6 pada 2026-10-13. Struktur standar modul: [CODEMAP §4](../CODEMAP.md#4-struktur-standar-modul-appsapisrcmodulesmodul) · peta modul: [CODEMAP §5](../CODEMAP.md#5-peta-modul). Fitur pemakai: [payroll](../features/payroll/README.md).

## Tabel & rincian

### `payroll`
| Tabel | Isi penting |
|---|---|
| `tax_ter_rates`, `ptkp_values`, `bpjs_rates` | Konfigurasi tarif berlaku per tanggal (policy SUPER_ADMIN) |
| `salary_components` | `code`, `name`, `type` (earning/deduction), `is_fixed`, `is_taxable`, rumus |
| `employee_salary_structures` | Struktur gaji per karyawan, berlaku per tanggal |
| `employee_salary_items` | Nominal komponen per struktur |
| `payroll_periods` | `period`, `status` (`DRAFT`/`CALCULATED`/`LOCKED`/`PUBLISHED`) |
| `payroll_runs` | Eksekusi perhitungan + input snapshot |
| `payslips`, `payslip_items` | Hasil per karyawan + rincian komponen, BPJS, PPh 21 |
