# Codemap — `report`

> Modul laporan (Arsip gelombang 3, Laporan batch 1 — D-058 + ARS-D16–D18, 2026-10-16; batch 2 — ARS-D21, 2026-10-20). Struktur standar modul: [CODEMAP §4](../CODEMAP.md#4-struktur-standar-modul-appsapisrcmodulesmodul) · peta modul: [CODEMAP §5](../CODEMAP.md#5-peta-modul). Fitur pemakai: [arsip](../features/arsip/README.md). **Tanpa tabel sendiri**: angka dihitung dari fungsi baca-saja modul pemilik data lewat `index.ts` (aturan emas #3). Dependensi satu arah: `report → employee/index.ts, discipline/index.ts, asset/index.ts, organization/index.ts`.

## API (`apps/api/src/modules/report/`)

```
├── index.ts                     [done] registerReportRoutes
├── report.policy.ts             [done] canViewReports (SA / HR), reportCompanyScope (PT ditugaskan), canListSensitiveDocument
│                                       (SA / employee.documents.read; WARNING_LETTER juga grant SP), canListWarningLetters (SA / grant SP),
│                                       canListDataChanges (SA / employee.changes.review — ARS-D21)
├── report-common.ts             [done] (2026-10-20, dipindah dari report.service) RequestContext, parse, scopedEmployees (cakupan PT +
│                                       filter unit/sub-unit/lokasi), personDto, unitOf, group, todayInJakarta; pembantu ekspor d/dmy/
│                                       PERSON_HEADERS/person/people/share/pct/MONTH_NAMES
├── report-batch2.service.ts     [done] ARS-D21: tenureReport (kelompok per hari ini, per PT/unit, jubilee bulan terpilih),
│                                       demographicsReport (agregat usia/gender/pendidikan tertinggi/kota asal 15 teratas + lainnya),
│                                       movementsReport (POSITION_CHANGED + COMPANY_CHANGED hari sama digabung; jenis dari level jabatan; historyId),
│                                       birthdaysReport (hari saja), assetsReport (per status/kategori/lokasi/PT, pinjaman terlambat,
│                                       aset & APD wajib kembali di karyawan keluar; tanpa harga), dataChangesReport (per status/bagian/
│                                       bulan, rata-rata proses, daftar ber-grant); sheetsForBatch2 (Excel tiap laporan)
├── report.service.ts            [done] headcountReport (12 bulan s/d hari ini, setahun, per PT/unit/status, alasan & daftar keluar),
│                                       documentExpiryReport (lewat/≤30/≤60/≤90, per jenis, daftar; sensitif disembunyikan + jumlahnya),
│                                       completenessReport (7 data inti + dokumen wajib ALL/POSITIONS; SITE dilewati, ARS-D18),
│                                       warningLettersReport (berlaku per tingkat/jenis/PT, tren terbit per bulan, daftar ber-grant),
│                                       exportReport (xlsx bergaya: sheet Ringkasan + rincian, judul + keterangan filter/waktu/
│                                       RAHASIA, format angka/persen/tanggal, autofilter, cetak A4 lanskap; maks 10.000 baris,
│                                       audit `report.export`); headcount juga mengirim `joiners`, kelengkapan `missingKeys`;
│                                       filter unit = unit + sub-unit
├── report.routes.ts             [done] GET /reports/{headcount,document-expiry,completeness,warning-letters,tenure,demographics,
│                                       movements,birthdays,assets,data-changes} + /export (20 operasi)
└── __tests__/report.policy.test.ts  [done] 8 kasus
```

- Shared: `packages/shared/src/xlsx.ts` — sheet ber-`title` = tata letak laporan (`info`, `formats`, `totalRow`, `freezeColumns`, `autoFilter`, `notes`; sel `{ value, format }`), `buildWorkbook(sheets, meta)` menulis properti berkas; test `packages/shared/tests/xlsx.test.ts`.
- Shared: `packages/shared/src/report.ts` — batch 2 (ARS-D21): `fullYears`, `tenureBucket`/`ageBucket` (kelompok `TENURE_BUCKETS`/`AGE_BUCKETS` dari `dashboard.ts`), `jubileeYears`, `MOVEMENT_KINDS` + `movementKind`, `averageDays`, `monthQuerySchema`; test `packages/shared/tests/report-batch2.test.ts` (18). Batch 1: `reportFilterSchema`, `headcountQuerySchema`, `monthlyTurnover`/`yearlyTurnover`/`turnoverPercent` (ARS-D17), `expiryBucket` + label, `CORE_COMPLETENESS_ITEMS` + label, `completenessPercent`. Test `packages/shared/tests/report.test.ts`.
- Pendukung di modul lain (lewat `index.ts`): `employee` → `listReportEmployees`, `listExpiringDocuments`, `listCompletenessFacts` (terisi/kosong saja), `listRequiredDocumentTypes` (`report-data.{service,repository}.ts`); `discipline` → `listWarningLettersForReport` (`report-data.service.ts`, tanpa uraian/alasan).
- Pendukung batch 2: `employee` → `listDemographicFacts`, `listBirthdaysInMonth`, `listMovements`, `listDataChangeFacts`; `asset` → `listAssetsForReport`, `listUnreturnedPpeForReport` (`asset/report-data.service.ts`).
- Integration batch 2: `apps/api/tests/integration/report/reports-batch2.test.ts` (9: akses, masa kerja + jubilee, demografi tanpa nama/tanggal lahir, mutasi/promosi/level kosong + pindah PT digabung, ulang tahun tanpa tahun, aset tanpa harga + belum kembali, pengajuan per grant + nilai tidak ikut, ekspor + audit).
- Integration: `apps/api/tests/integration/report/reports.test.ts` (8 skenario: akses, PT lain, turnover 2025 terkontrol, filter sub-unit, dokumen sensitif ber-grant, kelengkapan tanpa nilai, SP per grant, ekspor + audit).

## Web (`apps/web/src/features/reports/`, 2026-10-16)

```
├── api.ts                        [done] useReport(kind, params: + month), exportReport (unduh xlsx)
├── schemas.ts                    [done] subset respons 10 laporan
├── report-helpers.ts             [done] (2026-10-20) MONTHS/MONTH_NAMES, thisYear/thisMonth, DetailTab, useOpenProfile, scrollToId,
│                                         personSearch, sum, maxOf
├── components/report-state.tsx   [done] (2026-10-20) State (muat/galat), AsOf
├── components/tabs/              [done] ARS-D21: tenure-tab, demographics-tab (SliceList, tanpa tabel), movements-tab (saring jenis/
│                                         bulan), birthdays-tab, assets-tab (tautan Data Assets), data-changes-tab (daftar terkunci tanpa grant)
├── format.ts                     [done] fmt, pct, percentTone (ambang < 60 merah, < 85 kuning, ≥ 85 hijau)
├── components/report-chart.tsx   [done] grafik batang ECharts (palet & tinta Dashboard D-065, tema terang/gelap); onSelect = klik kolom
│                                         kategori (bulan), selectedIndex meredupkan kategori lain
├── components/report-ui.tsx      [done] Kpi (ikon, KPI utama, kartu penyaring), Panel, InfoTip (rumus/definisi), Num (0 redup),
│                                         BarCell, PercentBar, FilterChip, Segmented, Notes (batasan dilipat), ListSection,
│                                         DataTable ringkas (rincian, "Lihat semua (N)")
├── components/people-list.tsx    [done] PeopleList — daftar per orang dengan bentuk tabel Data Karyawan Aktif (ListPanel + DataTable
│                                         + SearchField + TablePagination bersama); cari/urut/halaman di klien; personColumn, unitColumn
└── pages/reports-page.tsx        [done] /personal/laporan?laporan=headcount|dokumen|kelengkapan|sp|masa-kerja|demografi|mutasi|
                                         ulang-tahun|aset|pengajuan-data&unit=&tahun=&bulan= — bilah filter
                                         menempel, KPI, grid 12 kolom (grafik 8 + samping 4), klik untuk menyaring, klik baris membuka
                                         EmployeeDetailSheet (?pegawai=&tab=), tautan "Buka SP"
```

Pemasangan: `app/router.tsx` (route `laporan` dengan `RequireAccessRoute access.viewReports`), `route-preload.ts`, `navigation.ts` (menu Laporan, tidak lagi Maintenance), `feature-flags.ts` (`reports`), `lib/access.ts` (`viewReports`). Test: `apps/web/tests/reports.test.tsx` (14: batch 1 8 + batch 2 6).

## Batasan (dicatat, ARS-D18)

- Rincian per unit/status memakai unit & status **saat ini** (belum ada snapshot historis).
- Karyawan yang diaktifkan kembali: `endDate` dikosongkan → keluarnya dulu tidak terhitung.
- Dokumen wajib lingkup **SITE** belum dihitung (belum ada penanda lokasi site).
- Batch 2: filter unit di laporan Aset hanya berlaku untuk daftar belum kembali (aset terikat PT & lokasi). Demografi tanpa sensor kelompok kecil (ARS-D21).
- Batch 2: Mutasi & promosi hanya memuat karyawan yang **saat ini** ada di PT/unit terpilih (yang pindah keluar tidak tampil di PT asal). Pengajuan data dikelompokkan per tahun/bulan menurut tanggal WIB (perbaikan audit 2026-10-20).
