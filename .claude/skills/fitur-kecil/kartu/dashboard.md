# Kartu: Dashboard & analitik

- **Area:** Dashboard SA/HR (agregat, pivot, susunan widget) dan analitik SDM & biaya
- **Fitur:** Dashboard — [docs/features/dashboard/README.md](../../../../docs/features/dashboard/README.md)
- **Modul:** `apps/api/src/modules/analytics/` (+ rute `/dashboard` & pivot di `employee`, susunan di `iam`) · `apps/web/src/features/dashboard/`
- **diverifikasi:** 99bd49a 2026-11-24
- **Jalur yang dipantau:** `apps/api/src/modules/analytics/` `apps/api/src/modules/employee/dashboard-pivot.service.ts` `apps/api/src/modules/employee/employee.routes.ts` `apps/api/src/modules/employee/employee.policy.ts` `apps/api/src/modules/iam/iam.policy.ts` `apps/api/src/modules/attendance/analytics-facts.ts` `apps/api/src/modules/leave/leave-analytics.ts` `packages/shared/src/dashboard.ts` `packages/shared/src/severance.ts` `apps/web/src/features/dashboard/` `apps/web/src/features/system/pages/dashboard-page.tsx`

## Ringkasan
Nama modul API sebenarnya `analytics` (benar seperti dugaan INDEX). Dashboard punya tiga sumber: (1) agregat kepegawaian `GET /dashboard` dan pivot `GET /dashboard/pivot` (modul `employee`), (2) susunan widget per akun `/me/dashboard-layout` (modul `iam`), (3) analitik SDM & biaya `GET /dashboard/analytics` (modul `analytics`, tanpa tabel, memanggil `attendance/index.ts` dan `leave/index.ts`). Board web: tiga section tetap (angka, menu cepat, grafik), widget bisa diseret, grafik ECharts. SA/HR melihat dashboard agregat; MANAGER melihat panel Analitik tim di dashboard pribadinya.

## Keputusan aktif
- `D-065` — dashboard bisa diatur: pivot, susunan per akun, drag & drop
- `DSB-D1` (= `TM-D10`) — analitik SDM & biaya: turnover, gender, masa kerja vs cuti, efisiensi, proyeksi 12 bulan, labor cost, kewajiban kompensasi per skenario
- `DSB-D2` — 3 section tetap (`DASHBOARD_SECTIONS`, `orderBySection`); widget 1/4 hanya donut/bar (`fitWidgetToSize`)
- `D-040` — angka mengikuti cakupan PT aktor
- OD terbuka: tidak ada

## Peta file

### API
| Lapisan | File | Simbol penting |
|---|---|---|
| Routes | `apps/api/src/modules/analytics/analytics.routes.ts` | `registerAnalyticsRoutes` (`GET /dashboard/analytics?month&companyId&scenario`) |
| Policy | `analytics.policy.ts` | `analyticsScope` (all / companies / team), `canSeeBirthDates` |
| Service | `analytics.service.ts` | `dashboardAnalytics`, `headcountMonth`, `shiftMonth`, tipe `DashboardAnalytics` |
| Contract | `analytics.contract.ts` | `dashboardAnalyticsSchema` (assertExact ke tipe service) |
| Index | `analytics/index.ts` | `registerAnalyticsRoutes` |
| Fakta | `apps/api/src/modules/attendance/analytics-facts.ts`, `apps/api/src/modules/leave/leave-analytics.ts` | `attendanceFacts`, `monthlyWagesOfGrades`, `formulasOfEmployees`, `leaveFacts` |
| Agregat | `apps/api/src/modules/employee/employee.service.ts` / `dashboard-pivot.service.ts` | `getDashboard`, `getDashboardPivot`, `tenureBucket`, `ageBucket` |
| Policy | `employee.policy.ts` / `iam.policy.ts` | `canViewDashboard`, `canPivotPersonal` / `canManageOwnDashboardLayout` |
| Susunan | `apps/api/src/modules/iam/iam.service.ts` | `getDashboardLayout`, `saveDashboardLayout`, `resetDashboardLayout` |

### Shared — `packages/shared/src/`
| File | Simbol penting |
|---|---|
| `dashboard.ts` | `PIVOT_DIMENSIONS`, `SENSITIVE_PIVOT_DIMENSIONS`, `STAT_METRICS`, `ANALYTICS_STAT_METRICS`, `INSIGHT_KINDS`, `COST_INSIGHTS`, `dashboardWidgetSchema`, `dashboardLayoutSchema`, `DEFAULT_DASHBOARD_LAYOUT`, `MAX_DASHBOARD_WIDGETS`, `fitWidgetToSize`, `orderBySection` |
| `severance.ts` | rumus pesangon/UPMK/kompensasi PKWT (PP 35/2021), skenario PHK |

### Web — `apps/web/src/features/dashboard/`
| Jenis | File | Simbol penting |
|---|---|---|
| Halaman | `apps/web/src/features/system/pages/dashboard-page.tsx` | `DashboardPage` |
| Board | `dashboard-board.tsx`, `widget-shell.tsx`, `widget-editor.tsx` | `DashboardBoard`, `WidgetShell`, `useBoard`, `WidgetEditorDialog`, `canUsePersonalDimensions` |
| Widget | `simple-widgets.tsx`, `pivot-widget.tsx`, `insight-widgets.tsx`, `team-analytics.tsx` | `StatWidgetCard`, `ShortcutsWidgetCard`, `PivotWidgetCard`, `InsightWidgetCard`, `TeamAnalytics` |
| Grafik/data | `pivot-chart.tsx`, `pivot-data.ts`, `palette.ts`, `templates.ts` | `PivotChart`, `buildOption`, `buildPivotView`, `categorical`, `STAT_TEMPLATES`, `INSIGHT_TEMPLATES`, `PIVOT_TEMPLATES` |
| Hook/API | `api.ts`, `analytics.ts` | `dashboardKeys`, `usePivot`, `useDashboardLayout`, `useSaveDashboardLayout`, `dashboardAnalyticsSchema`, `useAnalytics`, `AnalyticsPeriodContext` |

### Test
| Jenis | File |
|---|---|
| API integration | `apps/api/tests/integration/analytics/dashboard-analytics.test.ts`, `employee/dashboard.test.ts`, `employee/dashboard-pivot.test.ts`, `iam/dashboard-layout.test.ts` |
| Shared | `packages/shared/tests/dashboard.test.ts`, `severance.test.ts` |
| Web | `apps/web/tests/dashboard.test.tsx`, `dashboard-analytics.test.tsx`, `dashboard-pivot-data.test.ts` |

## Endpoint → policy → siapa
| Method & path | Fungsi policy | Siapa boleh |
|---|---|---|
| `GET /dashboard` | `canViewDashboard` | SA, HR (cakupan PT); hanya jumlah |
| `GET /dashboard/pivot` | `canViewDashboard`; dimensi pribadi `canPivotPersonal` | SA; HR ber-grant `employee.personal.read` untuk dimensi pribadi |
| `GET /dashboard/analytics` | `analyticsScope` (null = 403) | SA semua/1 PT; HR PT ditugaskan; MANAGER tim langsung |
| rupiah di respons analytics | `canSeeLaborCost` (attendance/index.ts) | SA; HR ber-`labor.cost.read`; tidak untuk tim |
| `GET/PUT/DELETE /me/dashboard-layout` | `canManageOwnDashboardLayout` | SA, HR (akun sendiri) |

## Resep "cara menambah X"

### R1. Menambah metrik kartu angka (stat)
- File: `dashboard.ts` (`STAT_METRICS`, `STAT_METRIC_LABELS`), `employee.service.ts` (`getDashboard`) atau `analytics.service.ts`, `templates.ts`, `simple-widgets.tsx` (`StatWidgetCard`)
- Test: `employee/dashboard.test.ts`, `packages/shared/tests/dashboard.test.ts`, `apps/web/tests/dashboard.test.tsx`

### R2. Menambah dimensi pivot
- File: `dashboard.ts` (`PIVOT_DIMENSIONS`, `PIVOT_DIMENSION_LABELS`, `SENSITIVE_PIVOT_DIMENSIONS` bila pribadi), `dashboard-pivot.service.ts`, `widget-editor.tsx`. Dimensi pribadi mengubah akses: laporkan.
- Test: `employee/dashboard-pivot.test.ts`, `dashboard-pivot-data.test.ts`

### R3. Menambah insight analitik (non-rupiah)
- File: `dashboard.ts` (`INSIGHT_KINDS`, `INSIGHT_LABELS`), `analytics.service.ts` (`dashboardAnalytics`), `analytics.contract.ts` dan `dashboardAnalyticsSchema` di `api.ts` (harus sama), `insight-widgets.tsx` (`InsightWidgetCard`), `templates.ts`
- Test: `analytics/dashboard-analytics.test.ts`, `apps/web/tests/dashboard-analytics.test.tsx`

### R4. Mengubah tampilan board/grafik
- File: `dashboard-board.tsx`, `widget-shell.tsx`, `pivot-chart.tsx` (`buildOption`), `palette.ts`; ukuran/section di `dashboard.ts`
- Test: `apps/web/tests/dashboard.test.tsx`, `packages/shared/tests/dashboard.test.ts`

### R5. Mengubah panel Analitik tim (MANAGER)
- File: `team-analytics.tsx`, `analytics.ts` (`useAnalytics`), cakupan `analytics.policy.ts`
- Test: `apps/web/tests/dashboard-analytics.test.tsx`, `dashboard-analytics.test.ts`

## Cek & test area ini
- `bun run typecheck && bunx biome ci . && bun run check:boundaries`
- API: `<prefix lokal> bun run db:which && <prefix lokal> bun run --cwd apps/api test tests/integration/analytics/dashboard-analytics.test.ts`
- Shared: `bun run --cwd packages/shared test dashboard severance`
- Web: `bun run --cwd apps/web test dashboard`

## Dokumen yang wajib diperbarui
- `docs/features/dashboard/README.md` (checklist) dan satu entri `docs/features/dashboard/log.md`
- develop: `docs/codemap/analytics.md` (dan `employee.md`/`iam.md` bila rute di sana berubah); branch rekan tim: "catatan codemap" di `log.md` (PROMPT §8)
- kartu ini + barisnya di `kartu/INDEX.md`

## Jebakan
- Angka biaya (labor cost, kewajiban kompensasi, `costDelta`) hanya SA / HR ber-`labor.cost.read` dan tidak pernah untuk cakupan tim: di luar gerbang perubahan kecil; jangan menulis nilai rupiah ke log/test/kartu.
- Proyeksi pensiun memakai tanggal lahir (data pribadi): hanya bila `canSeeBirthDates` dan bukan cakupan tim.
- Dimensi pivot pribadi (agama, status nikah, umur) butuh `employee.personal.read`; hasil tetap hanya jumlah.
- `analytics` tanpa tabel dan hanya boleh memakai `attendance/index.ts`, `leave/index.ts`; tidak boleh query tabel modul lain.
- Skema `DashboardAnalytics` ada dua salinan (API contract dan `api.ts` web); ubah keduanya.
- Widget biaya tidak dirender bila API tidak mengirim angka biaya (`InsightWidgetCard`); sembunyi di UI bukan akses.
- Susunan layout dinormalisasi saat disimpan API (`orderBySection`, `fitWidgetToSize`); ubah di shared, bukan hanya web.
