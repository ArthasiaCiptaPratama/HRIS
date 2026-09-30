# Hasil Uji — Pengelompokan Kategori Karyawan di Sidebar (D-038, 2026-09-30)

- **Commit:** working tree di atas `66d686d` (belum di-commit) · **Branch:** `HRIS/Oatse/Linux-Windows` · **Env:** lokal Linux · **Bun/PG:** 1.4.2 / PostgreSQL 17
- **Perintah & ringkasan:**
  - Migrasi `20260930035548_add_probation_and_vendor_categories` diterapkan; rerun `prisma migrate dev` → "Already in sync"; `bun run db:check` ✔; `bun run db:seed` → 7 status, 23 karyawan.
  - Test grup ditulis dulu dan merah (1 gagal) → setelah implementasi hijau (employee integration 34 pass).
  - `bun run typecheck` ✔ · `bunx biome ci .` ✔ (209 file) · `bun run check:boundaries` ✔ (184 modul) · `bun run test` ✔ (shared 10 · api 272 · web 82) · `bun run build` ✔
  - Playwright login sungguhan: `ui.ts` → **19/19 LULUS** (3 perbaikan script: breadcrumb memang berhenti di induk, label Ctrl+K = "Tenaga Kerja Eksternal · Vendor", selector drawer ganda); pengukuran label sidebar terpotong di 1440 px → `[]`.

| ID | Hasil | Bukti / catatan |
|---|---|---|
| TC-EMP-056 … TC-EMP-058 | LULUS | INT "D-038 filter grup" |
| TC-EMP-059 … TC-EMP-060 | LULUS | WEB 7 test navigasi; UI G-01, G-02, G-08 |
| TC-EMP-061 | LULUS | WEB; UI G-03 (Internal 17 = 11+1+3+2, Eksternal 3 = 2+1, total 22) |
| TC-EMP-062 | LULUS | WEB; UI G-04 … G-06; `hr-semua`, `hr-internal`, `hr-eksternal-desktop.png` |
| TC-EMP-063 | LULUS | WEB 3 test; UI G-09 |
| TC-EMP-064 | LULUS | WEB/DET/PRN; UI G-12, G-13 (`hr-ctrlk-vendor-desktop.png`) |
| TC-EMP-065 | LULUS | UI G-07, G-11 (`hr-percobaan`, `hr-tambah-percobaan-desktop.png`) |
| TC-EMP-066 | LULUS | UI MOB-01 (`sa-drawer-mobile.png`, `sa-eksternal-mobile.png`) |
| TC-EMP-057 | LULUS | INT + UI M-01 (MANAGER: 2 baris tim, tanpa Ubah Status/Pengaktifan) |
| TC-EMP-003, TC-EMP-029 (regresi) | LULUS | INT, WEB; UI E-01 (EMPLOYEE Akses ditolak) |

**Bukti:** `/mnt/winD/WORK/Magang/QA/2026-09-30-grup-kategori/` (11 screenshot + `ui-results.json`).

**Temuan selama uji (diperbaiki):** label "Semua Tenaga Kerja Eksternal" (dan "Data Karyawan Tidak Aktif", sudah terpotong sebelumnya) terpotong di sidebar 17rem → sidebar 18.5rem + atribut `title`; judul kosong "Belum ada karyawan Semua …" janggal → "Belum ada data <kategori>" / "Belum ada karyawan aktif di kelompok ini".

**Kesimpulan:** memenuhi kriteria rencana di lokal. **Bug terbuka:** tidak ada.
**Belum diverifikasi:** staging (butuh rilis + seed ulang master data staging), browser selain Chromium, Windows.
