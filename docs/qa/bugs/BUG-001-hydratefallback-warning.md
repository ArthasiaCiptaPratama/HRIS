# BUG-001: Peringatan konsol "No `HydrateFallback` element provided"

- **Prioritas:** P3 · **Status:** DIPERBAIKI (commit `c31ae96`; staging `3afbd3f`, `Deploy staging` #36537885447: konsol bersih di desktop & mobile, 2026-09-29) · **Case:** TC-STG-054 (lulus; hanya warning, bukan error)
- **Langkah reproduksi:** 1. Buka `https://hris-staging-web.vercel.app/` (atau lokal) dalam keadaan login. 2. Lihat konsol browser saat pemuatan pertama.
- **Diharapkan:** konsol bersih. · **Terjadi:** `warning: No HydrateFallback element provided to render during initial hydration` pada setiap pemuatan awal, di semua role & viewport (juga dilaporkan pemilik projek dari Firefox).
- **Akar masalah (terbukti oleh test):** router memakai route `lazy` (Dashboard, Personal Management) tanpa `HydrateFallback` di route induk, sehingga React Router tidak punya elemen untuk dirender selama modul lazy pertama dimuat. Tampilan tidak rusak.
- **Perbaikan:** `HydrateFallback: RouteHydrateFallback` ("Memuat halaman…") pada route akar `RequireAuth` (`apps/web/src/app/router.tsx`, komponen di `features/auth/components/guards.tsx`).
- **Test pencegah:** `apps/web/tests/router-hydration.test.tsx` — gagal sebelum perbaikan (warning tertangkap), lulus sesudahnya. Browser (Playwright Chromium, reload langsung ke route lazy, desktop & mobile): konsol bersih — bukti `/mnt/winD/WORK/Magang/QA/2026-09-29-bug001-mobile/lokal/`.
