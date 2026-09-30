# Hasil Uji — Seragam Halaman Administrasi & Akun Saya, prefix Storage, SMTP di test (2026-09-30)

- **Commit:** working tree di atas `98af18f` (belum di-commit) · **Branch:** `HRIS/Oatse/Linux-Windows` · **Env:** lokal Linux · **Bun/PG:** 1.4.2 / PostgreSQL 17
- **Perintah & ringkasan:**
  - Test ditulis dulu dan merah: ENV 1 gagal, FOTO 2 gagal, APP (ekspor belum ada), ADM 8 gagal → setelah implementasi hijau.
  - `bun run typecheck` ✔ · `bunx biome ci .` ✔ (208 file) · `bun run check:boundaries` ✔ (183 modul) · `bun run db:check` ✔ · `bun run test` ✔ (shared 10 · api 271 · web 72) **dengan `SMTP_*` terisi di `.env`** (sebelumnya harus dikosongkan) · `bun run build` ✔
  - Playwright login sungguhan: `ui.ts` → **31/31 LULUS** (1 perbaikan script: selector opsi "10" bentrok dengan "100")

| ID | Hasil | Bukti / catatan |
|---|---|---|
| TC-ADM-001 … TC-ADM-006 | LULUS | ADM 8 test; UI `sa-*-desktop.png` |
| TC-ADM-007 | LULUS | UI HR-01…03, MGR-01, EMP-01; `hr-akun-desktop.png` |
| TC-ADM-008 | LULUS | UI MOB-*; `sa-*-mobile.png` |
| TC-ADM-009 | LULUS | APP 2 test + suite api penuh tanpa timeout dengan SMTP terisi |
| TC-ADM-010 | LULUS | ENV 2 test |
| TC-EMP-054 … TC-EMP-055 | LULUS | FOTO 2 test baru (9 pass) |

**Bukti:** `/mnt/winD/WORK/Magang/QA/2026-09-30-seragam-admin/` (13 screenshot + `ui-results.json`).

**Temuan selama uji (diperbaiki):** breadcrumb "Akun Saya › Akun Saya" (label kelompok & seksi sama) → seksi tidak diulang; jsdom tanpa API pointer untuk Radix Select → polyfill di `tests/setup.ts`.

**Kesimpulan:** memenuhi kriteria rencana. **Bug terbuka:** tidak ada.
**Belum diverifikasi:** staging (butuh rilis), unggah foto sungguhan dengan prefix `dev/oatse/` ke bucket staging (logika teruji dengan Storage palsu), browser selain Chromium, Windows.
