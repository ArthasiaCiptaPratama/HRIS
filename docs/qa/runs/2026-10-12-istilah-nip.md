# Hasil Uji — Istilah NIP di seluruh tampilan (039b42b, 2026-10-12)

- **Lokal:** test web 206 ✔ (develop `3272c53`).
- **Staging (2026-10-12):** staging `hris-staging-web` / `hris-staging-api` (rilis gel. 4: rilis `6b5bae5`, `Deploy staging` #38205386868), Supabase staging · akun uji SA/HR/MGR/EMP · Playwright Chromium 1.56 (`/mnt/winD/WORK/Magang/QA/2026-10-12-staging-gel4/`). `def-singkat.ts` D-01 **LULUS** (run ke-2; run 1 GAGAL karena asumsi skrip: NIP ditampilkan di bawah nama, bukan kolom tersendiri, dan baris dicari di halaman 1).

| Case | Hasil | Bukti |
|---|---|---|
| TC-EMP-214 | LULUS | Placeholder "Cari nama, NIP, email…"; cari `QA-G4-A01` menemukan karyawannya; "NIP belum ada" sebagai penanda & tombol filter; label form "NIP" — `staging-d-01-daftar-nip.png`, `staging-d-01b-form-nip.png` |

**Kesimpulan:** LULUS lokal + staging — **LEGIT**. **Bug terbuka:** tidak ada.

**Arsip Drive:** `hris-qa:2026-10-12-istilah-nip` — 5 file (plan, run, cases, screenshot), 2026-10-12.
