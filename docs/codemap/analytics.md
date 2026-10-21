# Codemap — `analytics`

> Modul dashboard analitik SDM & biaya (DSB-D1 / TM-D10, 2026-10-21, Mat). Struktur standar modul: [CODEMAP §4](../CODEMAP.md#4-struktur-standar-modul-appsapisrcmodulesmodul) · peta modul: [CODEMAP §5](../CODEMAP.md#5-peta-modul). Fitur pemakai: [dashboard](../features/dashboard/README.md). **Tanpa tabel sendiri**: angka dihitung dari fungsi baca-saja modul pemilik data lewat `index.ts`. Dependensi satu arah: `analytics → attendance/index.ts (employeeDirectory.analyticsEmployees, attendanceFacts, monthlyWagesOfGrades, formulasOfEmployees, canSeeLaborCost), leave/index.ts (leaveFacts)`.

## API (`apps/api/src/modules/analytics/`)

```
├── index.ts                [done] registerAnalyticsRoutes
├── analytics.policy.ts     [done] analyticsScope (SA semua/1 PT; HR PT ditugaskan; MANAGER tim), canSeeBirthDates (SA / employee.personal.read)
├── analytics.service.ts    [done] dashboardAnalytics: headcount 12 bulan (awal/masuk/keluar per alasan/akhir/turnover), gender, masa kerja vs cuti,
│                                  cuti hari ini, efisiensi (jam efektif ÷ terjadwal, % lembur/telat/Alpha, per lokasi, vs bulan lalu), proyeksi
│                                  12 bulan (PKWT habis, naik tingkat pesangon/UPMK, pensiun 58 th bila boleh data pribadi, tambahan biaya),
│                                  labor cost per kategori (upah grade + lembur), kewajiban kompensasi per skenario PHK
├── analytics.routes.ts     [done] GET /dashboard/analytics?month=YYYY-MM&companyId&scenario
└── analytics.schema.ts     [done] skema respons OpenAPI `DashboardAnalytics` (MOB-D10; cek tipe = DTO service)
```

Rupiah (`laborCost`, `liability`, `projection.costDelta`) hanya untuk SA / HR ber-grant `labor.cost.read`; MANAGER tanpa rupiah. Rumus murni di `@hris/shared` `severance.ts` (pesangon & UPMK PP 35/2021 Pasal 40, kompensasi PKWT Pasal 16, skenario, `tenureYears` kalender, `anniversary` 29 Feb). Fakta pendukung: `attendance/analytics-facts.ts`, `leave/leave-analytics.ts`, `attendance/directory.ts analyticsEmployees`.

## Test

`apps/api/tests/integration/analytics/dashboard-analytics.test.ts` (PT uji terisolasi, bulan 2026-09) · `packages/shared/tests/severance.test.ts`.
