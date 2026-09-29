# BUG-001: Peringatan konsol "No `HydrateFallback` element provided"

- **Prioritas:** P3 · **Status:** TERBUKA · **Case:** TC-STG-054 (lulus; hanya warning, bukan error)
- **Langkah reproduksi:** 1. Buka `https://hris-staging-web.vercel.app/` (atau lokal) dalam keadaan login. 2. Lihat konsol browser saat pemuatan pertama.
- **Diharapkan:** konsol bersih. · **Terjadi:** `warning: No HydrateFallback element provided to render during initial hydration` pada setiap pemuatan awal, di semua role & viewport (juga dilaporkan pemilik projek dari Firefox).
- **Akar masalah (dugaan, belum diverifikasi):** `createBrowserRouter` (`apps/web/src/app/router.tsx:101`) memakai route `lazy` (Dashboard, Personal Management) tanpa `HydrateFallback` di route induk, sehingga React Router tidak punya elemen untuk dirender selama modul lazy pertama dimuat. Tampilan tidak rusak.
- **Usulan perbaikan:** tambahkan `HydrateFallback` (mis. skeleton layout) pada route akar `RequireAuth`/`AppLayout`, lalu test Vitest yang memastikan tidak ada warning saat render awal.
- **Test pencegah:** belum ada.
