# Hasil Uji — Import data Form asli: NIP opsional, unit organisasi, status bawaan, Lengkapi data (D-062–D-064, 2026-10-12)

- **Lokal (2026-10-09):** develop `0b35d43` + `f47df40` — typecheck ✔ · biome ✔ · boundaries ✔ · `db:check` ✔ · test shared 192 · api 559 · web 192 ✔; Playwright review UI desktop & mobile (`QA/2026-10-09-import-review/review-ui.ts`, catatan `review-notes.txt`): urutan unit tetap, tombol Lanjut aktif setelah lengkap, tanpa error konsol; uji browser pemilik projek dengan xlsx Form asli ✔ ("udah oke").
- **Staging (2026-10-12):** staging `hris-staging-web` / `hris-staging-api` (rilis gel. 4: rilis `6b5bae5`, `Deploy staging` #38205386868), Supabase staging · akun uji SA/HR/MGR/EMP · Playwright Chromium 1.56 (`/mnt/winD/WORK/Magang/QA/2026-10-12-staging-gel4/`). Script `a-import-lengkapi.ts` → **7/7 LULUS** (run ke-3; run 1 GAGAL A-05/A-07 karena selektor skrip — judul & toast sama-sama "Import selesai", kolom cari bukan `searchbox`; run 2 A-03 tidak menemukan "Pakai saran" karena **profil pemetaan dari run 1 sudah mengingat pilihan unit** (perilaku D-064 yang benar) → profil dihapus sebelum run 3).

| ID | Hasil | Bukti / catatan |
|---|---|---|
| A-01 | LULUS | Pemetaan otomatis: header baris 1 · 4 baris · 9 kolom — `staging-a-01-pemetaan.png` |
| A-02 | LULUS | Langkah Lengkapi data muncul: PT dari kolom file (ACP 4), 2 unit perlu dipilih + 1 unit baru, status bawaan belum dipilih — `staging-a-02-lengkapi.png` |
| A-03 | LULUS | "Pakai saran untuk 2 nilai" + status bawaan Karyawan Tetap → 3/3 selesai, Lanjut aktif — `staging-a-03-lengkapi-selesai.png` |
| A-04 | LULUS | Pratinjau "Simpan 3 karyawan"; baris NIK 15 digit tanpa NIP error — `staging-a-04-pratinjau.png` |
| A-05 | LULUS | Simpan → Import selesai — `staging-a-05-selesai.png` |
| A-06 | LULUS | DB: "QA G4 Dua" tanpa NIP; gol. darah `0` → O; `_` → kosong (NIK & gol. darah); "Engineering" → Engineering (ACP); "HRGA Site" → HR & GA Site (ACP); unit baru "Unit Baru QA G4" dibuat |
| A-07 | LULUS | Daftar/detail menandai "NIP belum ada" — `staging-a-07-detail-tanpa-nip.png` |

| Case | Hasil | Otomasi / bukti |
|---|---|---|
| TC-EMP-193 | LULUS | INTI `import.test.ts`; staging A-02/A-03 (status bawaan wajib) |
| TC-EMP-194 | LULUS | WEB `employee-import.test.tsx` (0 option sebelum dibuka) |
| TC-EMP-195 | LULUS | INTI `import.test.ts`; staging A-04/A-06/A-07 |
| TC-EMP-196 | LULUS | INTI `import.test.ts` (lokal) |
| TC-EMP-197 | LULUS | SHG + INTI; staging A-04 (NIK 15 digit tanpa NIP → error) |
| TC-EMP-198 | LULUS | SHG `import-d064.test.ts`; staging A-03/A-06 |
| TC-EMP-199 | LULUS | INTI; staging A-02/A-06 (unit baru) |
| TC-EMP-200 | LULUS | INTI 2 test per PT; PW `review-ui.ts` (lokal) |
| TC-EMP-201 | LULUS | SHG + INTI; staging A-06 (`0` → O, `_` kosong) |
| TC-EMP-202 | LULUS | INTI; staging A-02 (PT dari kolom file) |
| TC-EMP-203 | LULUS | WEB; staging A-02/A-03 |
| TC-EMP-204 | LULUS | PW `review-ui.ts` (urutan sebelum = sesudah, lokal) |
| TC-EMP-205 | LULUS | WEB; staging A-04 |
| TC-EMP-206 | LULUS | WEB `employee-import.test.tsx` |

**Data uji:** dihapus setelah run (3 karyawan, riwayat import, audit, unit & jabatan uji, profil pemetaan) — verifikasi MCP: 66 karyawan, 26 unit, 0 import.

**Kesimpulan:** LULUS lokal + staging — **LEGIT**. **Bug terbuka:** tidak ada.

**Arsip Drive:** `hris-qa:2026-10-12-import-lengkapi` — 15 file (plan, run, cases, screenshot), 2026-10-12.
