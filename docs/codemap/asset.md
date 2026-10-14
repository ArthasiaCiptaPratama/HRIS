# Codemap — `asset`

> Modul aset per unit & pembagian APD (Arsip gelombang 2a, D-056 + ARS-D1–D6, 2026-10-13). Struktur standar modul: [CODEMAP §4](../CODEMAP.md#4-struktur-standar-modul-appsapisrcmodulesmodul) · peta modul: [CODEMAP §5](../CODEMAP.md#5-peta-modul). Fitur pemakai: [arsip](../features/arsip/README.md). Skema Postgres `asset`; FK hanya ke `employee` & `organization` (PLAN §3.2). Dependensi satu arah: `asset → employee/index.ts, iam/index.ts, notification/index.ts, organization/index.ts` (modul `employee` tidak mengimpor `asset` — aturan `no-circular`, ARS-D6).

## API (`apps/api/src/modules/asset/`)

```
├── index.ts                 [done] registerAssetRoutes, runAssetDaily
├── asset.policy.ts          [done] canManageAssets (SA / HR ber-grant asset.manage di PT), canSeeAssetPrice, canManageAssetMasters,
│                                   canViewEmployeeAssets (SA, HR PT, MANAGER tim, diri), canViewAsset, assetListScope, canAcknowledge
├── asset.repository.ts      [done] kategori, jenis APD, aset (filter cakupan/pemegang/terlambat), serah-terima, pembagian APD; update bersyarat atomik (`closeAssignmentIfOpen`, `setAssetStatusIf`, `returnPpeIfOpen`, `deletePpeIfUnconfirmed`, `acknowledge…IfPending`) agar aksi bersamaan tidak sama-sama lolos
├── asset.service.ts         [done] aturan ARS-D1–D6, audit `asset.*`, harga hanya pengelola, notifikasi in-app ke karyawan
├── asset-bast.ts            [done] PDF BAST (pdf-lib, A4, font standar WinAnsi): serah, kembali, hilang, APD; `bastNumber` = `BAST-S|K|H|APD/<kode>/<tanggal>/<id6>` (unik per berita acara)
├── bast-logo.ts             [done] logo Arthasia (PNG base64, sama dengan email) untuk kop BAST
├── asset-daily.service.ts   [done] cron `asset-daily`: pinjaman terlambat, APD jatuh tempo ganti, aset/APD karyawan keluar
├── asset.schema.ts          [done] DTO OpenAPI (body longgar → divalidasi skema @hris/shared di service)
├── asset.routes.ts          [done] 23 path (lihat CODEMAP §5)
├── __tests__/asset.policy.test.ts  [done] matriks akses 21 kasus (TDD)
└── __tests__/asset-bast.test.ts    [done] nomor BAST unik, tanggal Indonesia, PDF dengan karakter di luar WinAnsi
```

- Shared: `packages/shared/src/asset.ts` — enum + label, `suggestAssetCode`/`nextAssetSequence` (ARS-D4), `loanState` (ARS-D5), `ppeReplacementDate`, skema input (harga = string desimal, PROMPT §4). Test `packages/shared/tests/asset.test.ts`.
- Pendukung di modul lain (lewat `index.ts`): `employee` → `getEmployeeBriefs`, `listEmployeeBriefs`, `getEmployeeDocumentRef` (`directory.{service,repository}.ts`, baca-saja, tanpa data sensitif); `iam` → `listAssetManagers`.
- Integration: `apps/api/tests/integration/asset/assets.test.ts` (13 skenario: master, kode otomatis, akses 4 role + HR PT lain, serah-terima, index unik parsial, konfirmasi, BAST, kembali/hilang, APD & masa ganti, karyawan keluar, cron + dedupe).

## Web (`apps/web/src/features/assets/`, 2026-10-14)

```
├── api.ts                       [done] hook kategori, jenis APD, aset (daftar/detail/usulan kode), APD, pegangan, Aset saya, belum kembali, mutasi; downloadBast
├── schemas.ts                   [done] subset respons API
├── components/display.tsx       [done] badge status/kondisi/pinjaman/masa ganti/konfirmasi, formatPrice (string → Rupiah tanpa number)
├── components/asset-actions.tsx [done] dialog kembali, hilang, kembali APD; BastButtons (PDF + unggah scan BAST_ASSET → tautkan). Tanpa impor fitur employee
├── components/holdings.tsx      [done] HoldingsList, EmployeeAssetsTab (tab Aset detail karyawan), MyAssets (Layanan Mandiri), OpenHoldingsWarning (form nonaktifkan)
├── components/asset-forms.tsx   [done] AssetFormDialog, AssignAssetDialog, PpeIssueDialog (pakai EmployeePicker & master data employee)
├── pages/assets-page.tsx        [done] /personal/arsip/aset — tab aset | apd | belum-kembali, panel ?asset=<id>, panel pegangan ?pegawai=<id>
└── pages/asset-masters-page.tsx [done] /master-data/aset — tab kategori | apd
```

Pemasangan: `app/router.tsx` (route `arsip/aset` sebelum `arsip/:section`, `master-data/aset`), `route-preload.ts`, `navigation.ts` (menu Data Assets & Master Data › Aset & APD), `feature-flags.ts` (`assets`), `lib/access.ts` (`viewAssets`, `manageAssets`), `employee-detail-sheet.tsx` (tab Aset), `change-status-page.tsx` (peringatan), `ess-page.tsx` (tab Aset saya). Test: `apps/web/tests/assets.test.tsx`.

## Tabel & rincian

| Tabel | Isi penting |
|---|---|
| `asset_categories` | `code` (2–6) unik, `name` unik, `requires_serial`, `is_active` |
| `assets` | `code` unik (otomatis `<PT>-<KATEGORI>-<NNNN>` atau manual), kategori, merek/model, `serial_number` unik, `company_id`, `work_location_id?`, `condition`, `status` (AVAILABLE/ASSIGNED/MAINTENANCE/LOST/RETIRED), `purchase_date?`, `purchase_price?` (Decimal 15,2, CHECK ≥ 0) |
| `asset_assignments` | serah-terima: `assigned_at`, `due_back_at?`, `condition_out`, `closed_at?` + `outcome` (RETURNED/LOST, CHECK berpasangan), `condition_in?`, `handover/return_document_id` (UUID dokumen BAST_ASSET tanpa FK), `acknowledged_at?`; **unik parsial** satu baris terbuka per aset |
| `ppe_types` | `code`/`name` unik, `replace_after_months?` (1–120), `must_return`, `is_active` |
| `ppe_issues` | pembagian: karyawan, jenis, `quantity` (1–100), `size?`, `issued_at`, `handover_document_id?`, `acknowledged_at?`, `returned_at?` (jenis wajib kembali) |

Status aset diatur service: serah → ASSIGNED; kembali → AVAILABLE (rusak → MAINTENANCE); hilang → LOST; status manual hanya AVAILABLE/MAINTENANCE/RETIRED dan tidak saat dipegang.
