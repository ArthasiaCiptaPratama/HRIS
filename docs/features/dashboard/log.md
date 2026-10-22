# Log — Dashboard SA/HR

Entri terbaru di **atas**. Format satu entri (salin):

```
### YYYY-MM-DD — <judul singkat> (<PIC>)
- **Dikerjakan:** … (rujuk item checklist README)
- **Keputusan:** <PREFIX>-Dn baru / OD terjawab
- **Verifikasi:** perintah + hasil nyata
- **Masalah / catatan:** …
- **Berikutnya:** …
```

Log sebelum 2026-10-13 ada di [archive/log-2026-09.md](../../archive/log-2026-09.md) dan [archive/log-2026-10.md](../../archive/log-2026-10.md) (cari judul atau D-xxx fitur ini).

### 2026-10-21 — Dashboard analitik SDM & biaya, DSB-D1 (Mat, `HRIS/Mat/Mac`, `d7a186f`)
- **Dikerjakan ("lanjut" Paket 3):** modul `analytics` (policy cakupan SA/HR/atasan tim, service agregat), fakta pendukung `attendance/analytics-facts.ts` (jam terjadwal vs efektif, telat, Alpha, lembur & jam setara, rumus pola), `leave/leave-analytics.ts`, `directory.analyticsEmployees`; shared `severance.ts` (pesangon & UPMK Pasal 40, kompensasi PKWT Pasal 16, 6 skenario, masa kerja kalender, ulang tahun 29 Feb); web (agen): widget `insight` + 4 metrik stat baru, periode analitik, katalog "Analitik SDM & biaya", widget biaya tersembunyi tanpa izin.
- **Bug ditemukan saat test:** masa kerja 365,25 hari/tahun → tepat di ulang tahun ke-7 terbaca 6,998 th sehingga kenaikan tingkat pesangon tidak terdeteksi → diganti hitungan tahun kalender (+ kasus 29 Feb).
- **Verifikasi (DB lokal):** typecheck ✔ · lint ✔ · boundaries ✔ · shared **335** · api **863** (4 baru `analytics/dashboard-analytics.test.ts`, PT uji terisolasi) · web **309** (4 baru `dashboard-analytics.test.tsx`) · browser: dashboard SA tampil tanpa error, request analitik ± 1 dtk.
- **Masalah / catatan:** estimasi (upah grade, bukan gaji per orang); usia pensiun 58 th (konstanta); layout bawaan berubah (akun yang belum menyimpan susunan langsung melihat widget baru); 2 test lama `dashboard.test.tsx` berbatas tunggu 5 dtk dinaikkan ke 15 dtk (layout bawaan kini 20 widget).
- **Berikutnya:** papan dashboard untuk atasan (cakupan tim); uji tampilan HP.

### 2026-10-21 — Dashboard analitik SDM & biaya, DSB-D1 (Mat, `HRIS/Mat/Mac`)
- **Dikerjakan ("lanjut" Paket 3):** modul `analytics` (policy cakupan SA/HR/atasan tim, service agregat), fakta pendukung `attendance/analytics-facts.ts` (jam terjadwal vs efektif, telat, Alpha, lembur & jam setara, rumus pola), `leave/leave-analytics.ts`, `directory.analyticsEmployees`; shared `severance.ts` (pesangon & UPMK Pasal 40, kompensasi PKWT Pasal 16, 6 skenario, masa kerja kalender, ulang tahun 29 Feb); web (agen): widget `insight` + 4 metrik stat baru, periode analitik, katalog "Analitik SDM & biaya", widget biaya tersembunyi tanpa izin.
- **Bug ditemukan saat test:** masa kerja 365,25 hari/tahun → tepat di ulang tahun ke-7 terbaca 6,998 th sehingga kenaikan tingkat pesangon tidak terdeteksi → diganti hitungan tahun kalender (+ kasus 29 Feb).
- **Verifikasi (DB lokal):** typecheck ✔ · lint ✔ · boundaries ✔ · shared **335** · api **863** (4 baru `analytics/dashboard-analytics.test.ts`, PT uji terisolasi) · web **309** (4 baru `dashboard-analytics.test.tsx`; 2 test lama `dashboard.test.tsx` berbatas tunggu 5 dtk dinaikkan ke 15 dtk karena layout bawaan kini 20 widget) · browser: dashboard SA tampil tanpa error, request analitik ± 1 dtk.
- **Masalah / catatan:** estimasi (upah grade, bukan gaji per orang); usia pensiun 58 th (konstanta); layout bawaan berubah (akun yang belum menyimpan susunan langsung melihat widget baru).
- **Berikutnya:** papan dashboard untuk atasan (cakupan tim); uji tampilan HP.

## 2026-10-21 (lanjutan) — analitik tim atasan & akun uji
- **Dikerjakan:** panel **Analitik tim** untuk MANAGER (`team-analytics.tsx`, widget hanya baca: pergerakan, gender, cuti, efisiensi, masa kerja vs cuti); `BoardActions.readOnly` menyembunyikan menu widget. Sapuan HP 390 px 17 halaman per role tanpa gulir horizontal.
- **QA:** kasus TC-DSB-001…009 di `docs/qa/cases/time-management.md`, rencana `docs/qa/plans/2026-10-21-tm-paket-lokal.md`; akun uji `hr.biaya@arthasia.test` (grant Biaya + data pribadi) lewat `bun run db:seed:qa` (lokal saja).
- **Berikutnya:** jalankan rencana uji manual → `runs/2026-10-21-tm-paket-lokal.md`.

