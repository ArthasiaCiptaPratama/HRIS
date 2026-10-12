# Hasil Uji — Tampilan proses lampiran Drive & ketahanan koneksi (TC-EMP-207/208, 2026-10-12)

- **Lokal:** develop `928c38e` — test web 205 ✔ (+ 2 test coba ulang); perbaikan BUG-003 (`PROCESS_TIMEOUT` 60 dtk) — test web 206 ✔ (test BUG-003 merah sebelum, hijau sesudah). Playwright `b-lampiran-ui.ts` ke dev server lokal → **8/8 LULUS** (`QA/2026-10-12-bug-003-lokal/`): B-04a coba ulang muncul 3 dtk setelah request diputus lalu lanjut (0 → 20 lampiran); B-04b request ditahan tanpa jawaban → coba ulang setelah ±64 dtk → lanjut (20 → 30).
- **Staging (2026-10-12, rilis gel. 4 tanpa perbaikan BUG-003):** staging `hris-staging-web` / `hris-staging-api` (rilis gel. 4: rilis `6b5bae5`, `Deploy staging` #38205386868), Supabase staging · akun uji SA/HR/MGR/EMP · Playwright Chromium 1.56 (`/mnt/winD/WORK/Magang/QA/2026-10-12-staging-gel4/`). B-01–B-03 LULUS; **B-04 GAGAL → BUG-003**: setelah koneksi diputus (`setOffline`) panel diam di 10/150 "Mengunduh…" > 5 menit tanpa pesan; DB: 140 PENDING, tidak ada yang diklaim (request tertahan di peramban). B-05/B-06 ikut gagal karena skrip tidak memulihkan koneksi setelah B-04 gagal (diperbaiki: `finally`).

| ID | Lokal | Staging | Bukti / catatan |
|---|---|---|---|
| B-01 | LULUS | LULUS | "Simpan 25 karyawan + 150 lampiran" — `staging-b-01-pratinjau.png` |
| B-02 | LULUS | LULUS | Dua kolom, "Data karyawan tersimpan", stepper "Memproses lampiran", badge "Mengunduh…", 4 kartu — `staging-b-02-memproses.png` |
| B-03 | LULUS | LULUS | Import file lain → dialog "Lampiran masih diproses" → Tetap di sini — `staging-b-03-dialog-jeda.png` |
| B-04a | LULUS | LULUS (4.1) | Request diputus → "mencoba lagi otomatis" → lanjut — `lokal-b-04a-coba-ulang.png` |
| B-04b | LULUS | GAGAL → BUG-003 → LULUS (4.1, coba ulang ±67 dtk) | Request menggantung → batas waktu → coba ulang → lanjut — `lokal-b-04b-timeout-coba-ulang.png` |
| B-05 | LULUS | LULUS (4.1) | Selesai dengan catatan; "Import selesai"; tabel tanpa Baris, melebar + petunjuk geser — `lokal-b-05-selesai-catatan.png`, `lokal-b-05b-tabel-digeser.png` |
| B-06 | LULUS | LULUS (4.1) | Tanpa dialog setelah selesai; kartu "belum selesai" + Lanjutkan → lembar samping — `lokal-b-06-kartu-tertunda.png`, `lokal-b-06b-lembar-samping.png` |

| Case | Hasil |
|---|---|
| TC-EMP-207 | LULUS lokal + staging (4.1: B-01–B-03, B-05) |
| TC-EMP-208 | GAGAL staging gel. 4 (BUG-003) → diperbaiki → LULUS lokal + staging 4.1 (B-04a, B-04b) |
| TC-EMP-182 | LULUS lokal + staging 4.1 (B-06) |

**Data uji:** dihapus (staging & lokal).

**Staging 4.1 (2026-10-12, rilis `a7791b4`, PR #43/#44, `Deploy staging` #38219815931):** `b-lampiran-ui.ts` → **8/8 LULUS** (`QA/2026-10-12-staging-gel41/`): B-04a pesan coba ulang 5 dtk setelah request diputus → lanjut (0 → 20); B-04b request ditahan tanpa jawaban → coba ulang setelah 67 dtk → lanjut (20 → 30); antrean 150/150 selesai; 0 error konsol. Data uji dihapus (staging 66 karyawan, 0 import, 0 objek Storage).

**Kesimpulan:** LULUS lokal + staging — **LEGIT**. **Bug terbuka:** tidak ada (BUG-003 ditutup).

**Arsip Drive:** `hris-qa:2026-10-12-lampiran-ui` — 22 file (plan, run, cases, BUG-003, screenshot lokal & staging), 2026-10-12.
