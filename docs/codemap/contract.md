# Codemap — `contract`

> Struktur standar modul: [CODEMAP §4](../CODEMAP.md#4-struktur-standar-modul-appsapisrcmodulesmodul) · peta modul: [CODEMAP §5](../CODEMAP.md#5-peta-modul). Fitur pemakai: [kontrak](../features/kontrak/README.md).

**2026-11-25 — K1 [done lokal]** (KTR-D1–D4/D6/D7). GET `/employees/{id}/contracts` juga mengembalikan `access {manage, missingGrant}` (tombol aksi web; `missingGrant` = HR_ADMIN tanpa `contract.manage`). **Revisi KTR-D2:** kolom salinan `employee.employees.contract_stage` & `contract_end_date` = kontrak ACTIVE (PKWT: tahap + akhir; percobaan: tahap null + akhir; tanpa ACTIVE: keduanya null). **Sumber kebenaran tetap `contract.contracts`**; salinan ditulis `copyActiveContract` (employee.service) di transaksi setiap aksi (isi tahap, perpanjang, `status-change` + kontrak, angkat/lulus, akhiri/tidak lulus) — jalur baru K2/K3 wajib ikut. Dipakai `GET /employees?pkwtStage=1|2|3|NONE`, sort `contractStage`/`contractEndDate` (null di akhir), `summary.active.pkwtStages`. Test konsistensi: `assertContractCopy` di `tests/integration/contract/contracts.test.ts`.

**2026-11-25 — K2 [done lokal]** (KTR-D5, D6, D11): cron `contract-daily` → `employee/contract-reminder.service.ts` `remindContracts` / `contractReminderThreshold` (PKWT 30/7, percobaan 14, lewat harian; HR_ADMIN PT + atasan; dedupe per penerima; tanpa email & tanpa nonaktif); repository `findContractsEndingBy`, `countContractsEnding`; `GET /employees?contractEndsWithin=N`, `summary.active.contractsEnding`. Web `pages/contract-expiring-page.tsx` (rute `/personal/kontrak-akan-habis`, saklar `FEATURES.contractExpiring`, menu Pengelolaan Karyawan + badge `CONTRACTS_ENDING`). Test `tests/integration/contract/contract-reminders.test.ts`.

| File | Tanggung jawab |
|---|---|
| `apps/api/prisma/schema/contract.prisma` | `ContractKind`, `ContractStatus`, `EmploymentContract` → `contract.contracts`; satu baris per tahap. |
| `apps/api/src/modules/contract/contract.repository.ts` | Baca/buat/tutup kontrak, menerima klien transaksi opsional; hanya tabel kontrak. |
| `contract.service.ts` | Validasi durasi/tahap, perpanjangan dan penutupan; DTO dan ringkasan baca memakai shared. |
| `contract.policy.ts` | SA atau HR_ADMIN dengan `contract.manage`; cek PT (D-040). Akses baca mengikuti `employee.loadInScope`/`canViewEmployee`. |
| `contract.contract.ts` | Skema body dan respons OpenAPI bernama, `assertExact` pada DTO/ringkasan/hasil aksi; `employee/employee.contract.ts` mengunci respons perubahan status. |
| `contract.routes.ts`, `index.ts` | GET/POST `/employees/{id}/contracts`, POST `/{contractId}/extend`, `/{contractId}/end`, `/employees/{id}/promote`, `/employees/{id}/probation/fail`; interface publik. |
| `apps/api/src/modules/employee/employee.service.ts` | Pemilik transaksi lintas modul: kunci baris employee, riwayat, status/tanggal PKWTT, audit; pengakhiran memakai jalur nonaktif yang sama (pos, approval, akun/ban). |
| `apps/api/src/app.ts` | Memasang handler employee ke rute contract melalui dependency injection; tidak ada impor contract → employee. |
| `packages/shared/src/contract.ts` | Tier/label, validasi kalender 2+1+1/4 tahun dan 3 bulan, tenure, ringkasan/peringatan, input Zod aksi. |
| `apps/api/prisma/seed/contract.ts` | Empat karyawan fiktif: PKWT 1 aktif, PKWT 3 + riwayat 1–2, percobaan aktif, PKWT lama kosong. Idempoten. |
| `apps/api/tests/integration/contract/contracts.test.ts` | Matriks akses, flow, rollback ban, concurrency, constraint DB, OpenAPI. |
| `apps/api/scripts/verify-contract-migration.ts` | Database lokal sementara: seluruh migrasi polos, bentrok nama arsip, backfill, seed dan idempotensi; database dihapus setelah uji. |

`contract.contracts`: employee FK cascade; `company_id` snapshot tanpa relasi; `kind`, `sequence?`, tanggal mulai/akhir wajib, status, self-reference tahap sebelumnya, `pkwt_first_start_date?` hanya di akar untuk tahap lama, penutupan/alasan/catatan dan metadata audit. Index `(employee_id, start_date DESC)`, `(status, end_date)`, `previous_contract_id`; SQL migrasi menegakkan satu ACTIVE/karyawan, urutan tanggal, tahap 1–3 PKWT/null percobaan dan metadata akar.

`employee.employees.pkwtt_start_date` dibackfill dari riwayat terakhir masuk kategori PKWTT, fallback `join_date`. Lulus percobaan mempertahankannya; PKWT/THL → permanen memakai tanggal pengangkatan. `changeStatus` lama menolak asal PKWT/PROBATION; masuk dua kategori itu membutuhkan body `contract` dan grant dalam transaksi yang sama. Respons aksi kontrak memuat `contract` (nullable untuk pengangkatan THL) dan `warnings`.

## Web K1

| File | Tanggung jawab |
|---|---|
| `apps/web/src/features/employee/contract-schemas.ts` | Subset respons kontrak OpenAPI, akses kelola, masa kerja dan hasil aksi dengan warning; tipe diinfer dari Zod. |
| `apps/web/src/features/employee/api.ts` | `useEmployeeContracts`, `useContractAction` dan body kontrak/warning `useChangeStatus`; invalidasi seluruh kunci employees setelah aksi (termasuk daftar, detail, ringkasan, kontrak). |
| `components/employment-contract-section.tsx` | Kartu status dua tingkat, sisa/masa kerja/progres shared, akses respons API, tabel riwayat yang juga dipakai di tab Riwayat. |
| `components/employment-contract-dialog.tsx` | Isi tahap, perpanjangan, pengangkatan/lulus, tidak lulus/pengakhiran dengan konfirmasi nonaktif dan toast warning/error. |
| `components/contract-period-fields.tsx` | Isian periode RHF, bawaan akhir kalender, validasi shared termasuk awal PKWT 1 untuk tahap lama; digunakan ulang oleh Ubah Status. |
| `components/employee-detail-sheet.tsx`, `schemas.ts` | Integrasi kartu/tabel, ikon CONTRACT_STAGE_CHANGED, tahap/periode opsional pada entri riwayat jika tersedia. Backend saat ini hanya menyediakan peristiwa/tanggal efektif; periode lengkap tetap terlihat melalui tabel kontrak. |
| `pages/change-status-page.tsx`, `components/status-badge.tsx` | Label shared, kontrak saat tujuan PKWT/percobaan; asal dua kategori diarahkan ke tab Kepegawaian dan tidak bisa menyimpan. |
| `apps/web/tests/employee-contract.test.tsx` | 31 kasus render/akses/aksi/validasi/masa kerja/riwayat/Ubah Status; API palsu memeriksa payload, invalidasi cache, toast warning dan error 403. |
| `apps/web/tests/employee-detail.test.tsx`, `employee-status-actions.test.tsx` | Integrasi filter Kepegawaian untuk peristiwa tahap/periode dan aturan status baru; flow status biasa tetap diuji. |
