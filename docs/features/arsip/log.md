# Log — Arsip karyawan & Layanan Mandiri

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

### 2026-10-13 — Arsip gel. 1 + Layanan Mandiri tampil di staging (rilis gel. 6) (Oatse)
- **Dikerjakan (rencana disetujui; setiap aksi keluar ditanya):** folder `HRIS-rilis`: saklar `FEATURES.archive` + `FEATURES.selfService` → `true` (commit `42df46e`, tanpa merge develop → Time Management tidak ikut, tanpa migrasi) → PR #47 ke `HRIS/debug/database` (CI ✔, merge `62632e2`) → PR #48 ke `HRIS/debug/fe-be` (CI ✔, merge `d0e652b`) → `Deploy staging` #38374784477 ✔. Grant `employee.changes.review` untuk HR uji (izin pemilik projek, lewat API sebagai SA, tercatat audit). QA staging Playwright + API → arsip Drive.
- **Keputusan:** tidak ada keputusan baru.
- **Verifikasi:** rilis (DB `hris_release`): typecheck ✔ · biome ✔ · boundaries ✔ · `db:check` ✔ · test shared 200 · api 600 · web 233 (0 dilewati) · build ✔; staging: health 200, web 200, advisor security tanpa temuan baru; QA TC-STG-059…072 **14/14 LULUS** (`docs/qa/runs/2026-10-13-staging-arsip.md`) → **LEGIT**; Drive `hris-qa:2026-10-13-staging-arsip` 13 file.
- **Masalah / catatan:** 2 kegagalan putaran 1 = asumsi script (ekspor memang JSON base64; kata "Maintenance" cocok dengan jabatan staging) — aplikasi tidak diubah. Screenshot yang memuat nama asli (D-066) dihapus; screenshot daftar kini disaring ke akun uji. Kontak darurat karyawan uji kini berisi data QA. Bucket `attendance-selfies` sudah ada di staging sebelum Time Management dirilis.
- **Berikutnya:** gel. 2a Aset / 2b Surat peringatan (grill dulu), OD-11 sebelum produksi.
