# Hasil Uji — Template email bermerek & alur atur password (2026-10-12)

- **Lokal (render):** template `docs/email-templates/{invite,recovery}.html` di Chromium desktop 1280 px & HP 375 px.
- **Staging:** `hris-staging-web` (rilis gel. 5: rilis `790973c`, `Deploy staging` #38230471120), Supabase Auth staging · Playwright 1.56 · bukti `/mnt/winD/WORK/Magang/QA/2026-10-12-email-template/`.
- **Catatan run:** run pertama `email-flow.mjs` U-06/R-06 GAGAL (token 401) karena skrip memuat `.env` lewat shell sehingga kunci anon tidak terbaca (401 = kunci API, bukan password; probe kredensial salah dengan env benar → 400). Run ke-2 dengan `bun --env-file` → semua LULUS. Bukan bug aplikasi.

| Case | Hasil | Bukti |
|---|---|---|
| TC-ADM-053 | LULUS | Logo 200 & termuat (66 px), tombol & tautan cadangan ke URL konfirmasi, tanpa scroll mendatar (1280/375) — `lokal-invite-desktop.png`, `lokal-invite-hp.png`, `lokal-recovery-desktop.png`, `lokal-recovery-hp.png` |
| TC-ADM-054 | LULUS | Invite 200 (10:17:25 UTC) & `/recover` 200 (10:17:28 UTC), log Auth "request completed" tanpa error, ke `oatse2458+qa-email-undangan-1012@gmail.com` dan `oatse2458+qa-email-reset-1012@gmail.com`; kedua email diterima & tampilan sesuai (dikonfirmasi pemilik projek 2026-10-12) |
| TC-ADM-055 | LULUS | Tautan invite (desktop) & recovery (HP 390 px) → `/auth/atur-password` |
| TC-ADM-056 | LULUS | "Terlalu pendek", tombol tampilkan, "Belum sama…" → "Password cocok" — `staging-invite-atur-password.png`, `staging-recovery-atur-password.png` |
| TC-ADM-057 | LULUS | Toast "Password tersimpan.", token password baru 200, 0 error JS; pengguna tanpa akun HRIS → "Akun tidak aktif atau belum terdaftar" (sesuai aturan akun) — `staging-invite-setelah-simpan.png`, `staging-recovery-setelah-simpan.png` |

**Kesimpulan:** TC-ADM-053…057 LULUS lokal + staging — **LEGIT**. **Bug terbuka:** tidak ada.

**Data uji:** 4 pengguna Auth uji dihapus (2 alur + 2 penerima email, 200); cek MCP: 0 pengguna `qa-email` tersisa.

**Arsip Drive:** `hris-qa:2026-10-12-email-template` — 11 file (plan, run, cases, 8 screenshot), 2026-10-12.
