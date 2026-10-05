# Hasil Uji — Import Data Karyawan (D-041/D-042, 2026-09-30)

- **Commit:** working tree di atas `944e934` (belum di-commit, atas permintaan pemilik projek) · **Branch:** `HRIS/Oatse/Linux-Windows` · **Env:** lokal Linux · **Bun/PG:** 1.4.2 / PostgreSQL 17
- **Perintah & ringkasan:**
  - Migrasi `20260930090116_add_import_and_employee_details` diterapkan; "Already in sync"; `db:check` ✔.
  - Policy import ditulis dulu (merah → hijau); integration import 11 test.
  - `bun run typecheck` ✔ · `bunx biome ci .` ✔ · `bun run check:boundaries` ✔ (205 modul) · `bun run test` ✔ (shared 63 · api 341 · web 96) · `bun run --filter @hris/web build` ✔ (library xlsx/csv hanya di chunk halaman import).
  - Uji kering file data asli (lokal, tidak di-commit, hanya angka): 33/33 kolom bermakna terpetakan otomatis, 40/44 baris valid, 10 baris resign.
  - Playwright login sungguhan: `e2e.ts` → **13/13 LULUS** (percobaan sebelumnya 12/13: I-12 gagal karena skrip memeriksa sebelum master data termuat — skrip diperbaiki, bukan kode aplikasi).

| ID | Hasil | Bukti / catatan |
|---|---|---|
| TC-EMP-079 | LULUS | SHR; UI I-02 (`hr-2-pemetaan-desktop.png`: header baris 5 · 9 baris · 31 kolom) |
| TC-EMP-080 | LULUS | SHR (tabel kasus normalizer) |
| TC-EMP-081 | LULUS | IMP "tidak menulis apa pun…"; UI I-03 (`hr-3-pratinjau-desktop.png`: 7 dibuat, 2 error, 18 master data baru) |
| TC-EMP-082 | LULUS | IMP "SA: buat karyawan…"; UI I-05, I-07 (5 aktif + 2 resign nonaktif), I-08 (audit & job) |
| TC-EMP-083 | LULUS | IMP "UPSERT: sel kosong…"; UI I-09 (import ulang: 0 dibuat, 7 dilewati) |
| TC-EMP-084 | LULUS | IMP "HR tanpa grant…"; WIMP; UI I-03 (peringatan), I-07 (KTP 0, rekening 0 di DB) |
| TC-EMP-085 | LULUS | IMP "cakupan PT…"; UI: baris kode PNR (tidak terdaftar) → error "Kolom O · Perusahaan" |
| TC-EMP-086 | LULUS | IMP "akses…"; WIMP; UI I-13 (`emp-ditolak.png`) |
| TC-EMP-087 | LULUS | IMP "previewHash basi → 409"; WIMP (409 → pratinjau ulang → simpan) |
| TC-EMP-088 | LULUS | IMP "SA tanpa PT bawaan…"; WIMP; UI I-12 (`sa-unggah-desktop.png`, kolom sensitif tidak dilewati untuk SA) |
| TC-EMP-089 | LULUS | WIMP; UI I-01, I-05, I-06 (badge 22 → 27), I-09 (profil pemetaan dipakai) |
| TC-EMP-090 | LULUS | WIMP (.xls ditolak); UI I-04 (`baris-bermasalah.xlsx`: 2 baris + "Keterangan import"), I-11 (mobile tanpa scroll horizontal) |
| Regresi TC-EMP-001…078, TC-ADM-001…014 | LULUS | suite penuh |

**Bukti:** `/mnt/winD/WORK/Magang/QA/2026-09-30-import-karyawan/` (screenshot desktop & mobile, `baris-bermasalah.xlsx`, `e2e-results.json`). Semua data dari template dummy.

**Kesimpulan:** memenuhi kriteria rencana di lokal. **Bug terbuka:** tidak ada.
**Belum diverifikasi:** staging (butuh commit + rilis dengan 2 migrasi baru), browser selain Chromium, Windows, file > 1.000 baris (batas 2.000 baris diuji hanya di validasi skema).
