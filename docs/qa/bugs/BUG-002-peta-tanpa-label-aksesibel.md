# BUG-002: Peta geofence tidak punya label aksesibel
- **Prioritas:** P3 · **Status:** DIPERBAIKI (commit `e3323a7`, develop; rilis staging menyusul) · **Case:** TC-ADM-033 (ditemukan saat TC-ADM-028, staging 2026-10-05)
- **Langkah reproduksi:** 1. Login SA di staging. 2. Administrasi › Master Data › Site / lokasi kerja › Tambah lokasi. 3. Periksa elemen `.leaflet-container` di dialog.
- **Diharapkan:** elemen peta ber-`aria-label` "Peta lokasi kerja: klik untuk menaruh titik" (tertulis di `geofence-map.tsx`), sehingga pembaca layar & selector `getByLabel` menemukannya.
- **Terjadi:** atribut `aria-label` tidak ada di DOM (`getAttribute("aria-label")` → `null`). Fungsi peta normal (klik mengisi koordinat, tersimpan).
- **Akar masalah:** `MapContainer` react-leaflet 5 tidak meneruskan prop sembarang (termasuk `aria-*`) ke elemen DOM; hanya `className`, `id`, `style`, dll. Test web tidak menangkap karena komponen Leaflet di-mock di jsdom.
- **Usulan perbaikan:** pasang label lewat `ref`/`whenReady` (`map.getContainer().setAttribute("aria-label", …)`) atau bungkus peta dengan elemen `role="region"` ber-`aria-label`; tambah test yang gagal dulu (render tanpa mock / Playwright GF-03).
- **Perbaikan:** komponen `AccessibleLabel` (`useMap` → `map.getContainer().setAttribute("aria-label", …)`) di `geofence-map.tsx`.
- **Test pencegah:** `apps/web/tests/geofence-map.test.tsx` (merah sebelum perbaikan, hijau sesudah; Leaflet dirender sungguhan di jsdom) + Playwright GF-03 di `QA/2026-10-05-gelombang-1-staging/ui.ts` (dijalankan ulang setelah rilis).
