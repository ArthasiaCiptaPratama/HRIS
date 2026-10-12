# Hasil Uji — Tampilan proses lampiran Drive & ketahanan koneksi (TC-EMP-207/208, 2026-10-12)

- **Lokal:** develop `928c38e` — test web 205 ✔ (+ 2 test coba ulang); perbaikan BUG-003 (`PROCESS_TIMEOUT` 60 dtk) — test web 206 ✔ (test BUG-003 merah sebelum, hijau sesudah). Playwright `b-lampiran-ui.ts` ke dev server lokal → **8/8 LULUS** (`QA/2026-10-12-bug-003-lokal/`): B-04a coba ulang muncul 3 dtk setelah request diputus lalu lanjut (0 → 20 lampiran); B-04b request ditahan tanpa jawaban → coba ulang setelah ±64 dtk → lanjut (20 → 30).
- **Staging (2026-10-12, rilis gel. 4 tanpa perbaikan BUG-003):** staging `hris-staging-web` / `hris-staging-api` (rilis gel. 4: rilis `6b5bae5`, `Deploy staging` #38205386868), Supabase staging · akun uji SA/HR/MGR/EMP · Playwright Chromium 1.56 (`/mnt/winD/WORK/Magang/QA/2026-10-12-staging-gel4/`). B-01–B-03 LULUS; **B-04 GAGAL → BUG-003**: setelah koneksi diputus (`setOffline`) panel diam di 10/150 "Mengunduh…" > 5 menit tanpa pesan; DB: 140 PENDING, tidak ada yang diklaim (request tertahan di peramban). B-05/B-06 ikut gagal karena skrip tidak memulihkan koneksi setelah B-04 gagal (diperbaiki: `finally`).

| ID | Lokal | Staging | Bukti / catatan |
|---|---|---|---|
| B-01 | LULUS | LULUS | "Simpan 25 karyawan + 150 lampiran" — `staging-b-01-pratinjau.png` |
| B-02 | LULUS | LULUS | Dua kolom, "Data karyawan tersimpan", stepper "Memproses lampiran", badge "Mengunduh…", 4 kartu — `staging-b-02-memproses.png` |
| B-03 | LULUS | LULUS | Import file lain → dialog "Lampiran masih diproses" → Tetap di sini — `staging-b-03-dialog-jeda.png` |
| B-04a | LULUS | BELUM | Request diputus → "mencoba lagi otomatis" → lanjut — `lokal-b-04a-coba-ulang.png` |
| B-04b | LULUS | GAGAL → BUG-003 | Request menggantung → batas waktu → coba ulang → lanjut — `lokal-b-04b-timeout-coba-ulang.png` |
| B-05 | LULUS | BELUM | Selesai dengan catatan; "Import selesai"; tabel tanpa Baris, melebar + petunjuk geser — `lokal-b-05-selesai-catatan.png`, `lokal-b-05b-tabel-digeser.png` |
| B-06 | LULUS | BELUM | Tanpa dialog setelah selesai; kartu "belum selesai" + Lanjutkan → lembar samping — `lokal-b-06-kartu-tertunda.png`, `lokal-b-06b-lembar-samping.png` |

| Case | Hasil |
|---|---|
| TC-EMP-207 | LULUS lokal; staging B-01–B-03 LULUS, B-05 BELUM |
| TC-EMP-208 | GAGAL staging (BUG-003) → diperbaiki di develop, LULUS lokal; uji ulang staging setelah rilis |
| TC-EMP-182 | LULUS lokal (B-06 + WEB); staging BELUM |

**Data uji:** dihapus (staging & lokal).

**Kesimpulan:** belum LEGIT — menunggu rilis perbaikan BUG-003 lalu uji ulang staging. **Bug terbuka:** BUG-003 (P2, diperbaiki di develop).
