# Hasil Uji — Detail Pegawai Layar Penuh & Print Data (2026-09-29)

- **Commit:** working tree di atas `9dcabd3` (belum di-commit) · **Branch:** `HRIS/Oatse/Linux-Windows` · **Env:** lokal Linux · **Bun/PG:** 1.4.2 / PostgreSQL 17 (Docker) · Playwright Chromium (build 1243)
- **Perintah & ringkasan:**
  - `bun run typecheck` → shared, api, web exit 0
  - `bunx biome ci .` → 200 file, tanpa temuan
  - `bun run check:boundaries` → 0 pelanggaran (179 modul, 717 dependensi)
  - `bun run db:check` → exit 0 (tanpa selisih; tidak ada migrasi baru)
  - `bun run test` (SMTP dikosongkan) → shared 10 · api 248 pass / 0 fail · web 54 pass (7 file)
  - `bun run --filter @hris/web build` → ✔; `dist/template/Template-excel.xlsx` ikut
  - Playwright (login sungguhan SA/HR/MGR): `ui.ts` → **31/31 LULUS** (run akhir setelah tombol "Kembali")
  - Validasi file unduhan dengan `openpyxl`: zip utuh, 244 merge (= template), judul cetak `$1:$7`, A4 skala 80%

| ID | Hasil | Bukti / catatan |
|---|---|---|
| TC-EMP-033 | LULUS | DET; UI `desktop-*-detail.png`, `mobile-*-detail.png` (lebar 1440/1440 & 390/390, pusat avatar selisih ≤ 0,5 px) |
| TC-EMP-034 | LULUS | UI `mobile-*-gulir-sticky.png` (ruang gulir 452 px, tab y = 0, "Kembali" di atas & sejajar) |
| TC-EMP-035 | LULUS | INT "Riwayat: pelaku perubahan" |
| TC-EMP-036 | LULUS | DET; UI `*-riwayat.png` ("Siti Rahmawati · HR Admin · Kantor Pusat Jakarta") |
| TC-EMP-037 | LULUS | POL 7 baris baru (52 pass) |
| TC-EMP-038 … TC-EMP-040 | LULUS | INT 3 test `view=print`; audit lokal: SA `{sections:[personal]}`, HR `{sections:[]}` |
| TC-EMP-041, TC-EMP-042 | LULUS | PRN 17 pass (template asli) |
| TC-EMP-043 | LULUS | UI `desktop-*-print-toast.png` + file `sa-…xlsx` (data pribadi terisi) & `hr-…xlsx` (bagian pribadi kosong) |
| TC-EMP-044 | LULUS | DET; UI `desktop-mgr-detail.png` |
| TC-EMP-045 | LULUS | DET; UI `*-tombol-kembali.png` (desktop x=17 y=16; mobile x=13 y=4), klik menutup panel & URL tanpa `?pegawai` |

**Bukti:** `/mnt/winD/WORK/Magang/QA/2026-09-29-detail-print/` (screenshot, 2 file .xlsx, `ui.ts`, `ui-results.json`).

**Temuan selama uji (sudah diperbaiki sebelum run akhir):**
1. Deklarasi `<?xml …?>` ganda di lembar hasil pada Chromium (jsdom tidak menyertakannya sehingga unit test awal lolos) → file tidak valid. Diperbaiki (`serializeSheet`) + test penjaga.
2. Baris tab sticky menutupi tombol tutup (X) saat digulir di mobile → tombol `z-20` + ruang di baris tab (kemudian X diganti "← Kembali" di kiri atas atas permintaan pemilik projek; ruang pindah ke kiri `pl-28` di bawah `lg`).
3. Toast unduhan di kanan atas menutupi X panel layar penuh → toast print di bawah-tengah.

**Catatan lingkungan:** Vite dev server di partisi NTFS kadang melewatkan perubahan file (watcher) sehingga menyajikan modul lama; `touch` file memicu ulang. Bukan masalah aplikasi.

**Kesimpulan:** memenuhi kriteria rencana. **Bug terbuka:** tidak ada.
**Belum diverifikasi:** file dibuka & dicetak di **Microsoft Excel** sungguhan (tidak tersedia di Linux sesi ini; divalidasi dengan openpyxl); browser selain Chromium; Windows; staging (belum di-deploy).
