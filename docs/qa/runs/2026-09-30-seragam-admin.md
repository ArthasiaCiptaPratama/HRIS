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

## Sesi staging (setelah deploy `b7828a0`, `Deploy staging` #36661819195)
- **Env:** https://hris-staging-web.vercel.app + api staging, login Supabase sungguhan SA/HR/MGR/EMP, Playwright Chromium 1440×900 & 390×844 (`ui.ts` yang sama, `WEB` = staging).
- **Hasil:** **31/31 LULUS**, konsol bersih. Screenshot audit log pertama tertangkap di tengah animasi kaskade → diambil ulang (`audit-recheck.ts`: 20 baris, opacity 1).
- **Bukti:** `/mnt/winD/WORK/Magang/QA/2026-09-30-seragam-admin-staging/`.

## Unggah foto berprefix sungguhan (lokal → bucket staging)
- `prefix-upload.ts upload`: HR unggah foto untuk pegawai dummy lokal Agus Salim → `photo_path` = `dev/oatse/employees/f118b415-…/e4a5f3a7-….webp`; MCP: objek ada (7 530 B, image/webp); signed URL memuat `/employee-photos/dev/oatse/employees/`; konsol bersih (`hr-foto-berprefix.png`).
- `prefix-upload.ts delete`: hapus lewat UI → `photo_path` NULL; MCP: 0 objek `dev/oatse/` tersisa dari uji ini. → TC-EMP-054 terbukti juga dengan Storage sungguhan.
- 2 foto lama tanpa prefix (Agus Pratama, Hendra Gunawan, milik DB lokal) dipindah ke `dev/oatse/…` + `photo_path` lokal diperbarui; `moved-photos.ts`: keduanya tampil (600×800, 470×626) dari path berprefix.

**Kesimpulan:** memenuhi kriteria rencana, lokal & staging. **Bug terbuka:** tidak ada.
**Belum diverifikasi:** browser selain Chromium, Windows.
