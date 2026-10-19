# Codemap — `report`

> Modul laporan (Arsip gelombang 3, Laporan batch 1 — D-058 + ARS-D16–D18, 2026-10-16). Struktur standar modul: [CODEMAP §4](../CODEMAP.md#4-struktur-standar-modul-appsapisrcmodulesmodul) · peta modul: [CODEMAP §5](../CODEMAP.md#5-peta-modul). Fitur pemakai: [arsip](../features/arsip/README.md). **Tanpa tabel sendiri**: angka dihitung dari fungsi baca-saja modul pemilik data lewat `index.ts` (aturan emas #3). Dependensi satu arah: `report → employee/index.ts, discipline/index.ts, organization/index.ts`.

## API (`apps/api/src/modules/report/`)

```
├── index.ts                     [done] registerReportRoutes
├── report.policy.ts             [done] canViewReports (SA / HR), reportCompanyScope (PT ditugaskan), canListSensitiveDocument
│                                       (SA / employee.documents.read; WARNING_LETTER juga grant SP), canListWarningLetters (SA / grant SP)
├── report.service.ts            [done] headcountReport (12 bulan s/d hari ini, setahun, per PT/unit/status, alasan & daftar keluar),
│                                       documentExpiryReport (lewat/≤30/≤60/≤90, per jenis, daftar; sensitif disembunyikan + jumlahnya),
│                                       completenessReport (7 data inti + dokumen wajib ALL/POSITIONS; SITE dilewati, ARS-D18),
│                                       warningLettersReport (berlaku per tingkat/jenis/PT, tren terbit per bulan, daftar ber-grant),
│                                       exportReport (xlsx bergaya: sheet Ringkasan + rincian, judul + keterangan filter/waktu/
│                                       RAHASIA, format angka/persen/tanggal, autofilter, cetak A4 lanskap; maks 10.000 baris,
│                                       audit `report.export`); headcount juga mengirim `joiners`, kelengkapan `missingKeys`;
│                                       filter unit = unit + sub-unit
├── report.routes.ts             [done] GET /reports/{headcount,document-expiry,completeness,warning-letters} + /export (8 operasi)
└── __tests__/report.policy.test.ts  [done] 7 kasus
```

- Shared: `packages/shared/src/xlsx.ts` — sheet ber-`title` = tata letak laporan (`info`, `formats`, `totalRow`, `freezeColumns`, `autoFilter`, `notes`; sel `{ value, format }`), `buildWorkbook(sheets, meta)` menulis properti berkas; test `packages/shared/tests/xlsx.test.ts`.
- Shared: `packages/shared/src/report.ts` — `reportFilterSchema`, `headcountQuerySchema`, `monthlyTurnover`/`yearlyTurnover`/`turnoverPercent` (ARS-D17), `expiryBucket` + label, `CORE_COMPLETENESS_ITEMS` + label, `completenessPercent`. Test `packages/shared/tests/report.test.ts`.
- Pendukung di modul lain (lewat `index.ts`): `employee` → `listReportEmployees`, `listExpiringDocuments`, `listCompletenessFacts` (terisi/kosong saja), `listRequiredDocumentTypes` (`report-data.{service,repository}.ts`); `discipline` → `listWarningLettersForReport` (`report-data.service.ts`, tanpa uraian/alasan).
- Integration: `apps/api/tests/integration/report/reports.test.ts` (8 skenario: akses, PT lain, turnover 2025 terkontrol, filter sub-unit, dokumen sensitif ber-grant, kelengkapan tanpa nilai, SP per grant, ekspor + audit).

## Web (`apps/web/src/features/reports/`, 2026-10-16)

```
├── api.ts                        [done] useReport(kind, params), exportReport (unduh xlsx)
├── schemas.ts                    [done] subset respons 4 laporan
├── format.ts                     [done] fmt, pct, percentTone (ambang < 60 merah, < 85 kuning, ≥ 85 hijau)
├── components/report-chart.tsx   [done] grafik batang ECharts (palet & tinta Dashboard D-065, tema terang/gelap); onSelect = klik kolom
│                                         kategori (bulan), selectedIndex meredupkan kategori lain
├── components/report-ui.tsx      [done] Kpi (ikon, KPI utama, kartu penyaring), Panel, InfoTip (rumus/definisi), Num (0 redup),
│                                         BarCell, PercentBar, FilterChip, Segmented, Notes (batasan dilipat), ListSection,
│                                         DataTable ringkas (rincian, "Lihat semua (N)")
├── components/people-list.tsx    [done] PeopleList — daftar per orang dengan bentuk tabel Data Karyawan Aktif (ListPanel + DataTable
│                                         + SearchField + TablePagination bersama); cari/urut/halaman di klien; personColumn, unitColumn
└── pages/reports-page.tsx        [done] /personal/laporan?laporan=headcount|dokumen|kelengkapan|sp&unit=&tahun= — bilah filter
                                         menempel, KPI, grid 12 kolom (grafik 8 + samping 4), klik untuk menyaring, klik baris membuka
                                         EmployeeDetailSheet (?pegawai=&tab=), tautan "Buka SP"
```

Pemasangan: `app/router.tsx` (route `laporan` dengan `RequireAccessRoute access.viewReports`), `route-preload.ts`, `navigation.ts` (menu Laporan, tidak lagi Maintenance), `feature-flags.ts` (`reports`), `lib/access.ts` (`viewReports`). Test: `apps/web/tests/reports.test.tsx` (8: + saringan item & cari, buka panel profil).

## Batasan (dicatat, ARS-D18)

- Rincian per unit/status memakai unit & status **saat ini** (belum ada snapshot historis).
- Karyawan yang diaktifkan kembali: `endDate` dikosongkan → keluarnya dulu tidak terhitung.
- Dokumen wajib lingkup **SITE** belum dihitung (belum ada penanda lokasi site).
