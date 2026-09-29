# Hasil Uji — Personal Management (2026-09-29)

- **Commit:** working tree di atas `694dae9` (belum di-commit) · **Branch:** `HRIS/Oatse/Linux-Windows` · **Env:** lokal Linux · **Bun/PG:** 1.4.2 / PostgreSQL 17 (Docker)
- **Perintah & ringkasan:**
  - `bun run typecheck` → shared, api, web exit 0
  - `bunx biome ci .` → 192 file, tanpa temuan
  - `bun run check:boundaries` → 0 pelanggaran (173 modul, 695 dependensi)
  - `bun run db:check` → "No difference detected."
  - `bun run test` → shared 10 pass · api 237 pass / 0 fail · web 27 pass (4 file)
  - Verifikasi visual: Playwright Chromium, 24 layar (desktop 1440×900, mobile 390×844, SA & MANAGER) → 0 error konsol
  - Alur UI penuh (TC-EMP-032): 4 toast sukses, 4 audit (`create`, `change_status`, `deactivate`, `reactivate`); data uji dihapus setelahnya

| ID | Hasil | Bukti / catatan |
|---|---|---|
| TC-EMP-001 | LULUS | POL 45 pass |
| TC-EMP-002 … TC-EMP-028 | LULUS | INT 20 pass (employees.test.ts) + ORG 5 pass |
| TC-EMP-029 … TC-EMP-031 | LULUS | WEB 10 pass, NAV 3 test diperbarui pass |
| TC-EMP-032 | LULUS | manual Playwright (harness preview lokal; token uji, tanpa Supabase) |

**Kesimpulan:** memenuhi kriteria rencana (semua P1 & P2 LULUS). **Bug terbuka:** tidak ada.
**Belum diverifikasi:** browser selain Chromium; Windows; staging (migrasi `employee_categories_and_histories` belum di staging); login Supabase sungguhan di web baru (harness memakai verifier uji).

## Sesi tambahan — akun HR_ADMIN (`hr.arthasia`, tanpa grant, tertaut "Siti Rahmawati")
- **Env:** lokal Linux, harness preview (verifier token uji; AuthAdmin & email **palsu** → tidak ada ban/email ke Supabase), Playwright Chromium 1440×900.
- **Bukti:** `/mnt/winD/WORK/Magang/QA/2026-09-29-hr-account/` (9 screenshot).
- **Hasil:** 18/18 cek LULUS — top nav (Dashboard, Personal Management, Administrasi); sidebar lengkap (Ubah Status, Pengaktifan, Tidak Aktif, Arsip); tab Pribadi & Rekening pegawai lain **terkunci** (tanpa grant); data pribadi milik sendiri terlihat & tombol Nonaktifkan untuk diri sendiri tidak ada; ubah status PKWT → Pegawai Tetap; nonaktifkan → muncul di Tidak Aktif → aktifkan kembali; tambah pegawai Internship (pilihan atasan hanya "Andi Wijaya", satu-satunya pegawai ber-akun Manager); nomor induk duplikat ditolak dengan pesan "Nomor induk karyawan sudah dipakai."; `/grant` → Akses ditolak; `/akun` boleh, sidebar Administrasi hanya "Akun"; API: HR menonaktifkan data dirinya sendiri → 403.
- **Error konsol:** hanya 409 (uji duplikat) & 403 (uji API) — keduanya disengaja.
- **Data uji:** pegawai `HR-TEST-0001` + auditnya dihapus; `db:seed` memulihkan status Wahyu Saputra & Joko Susilo.
- **Temuan (bukan bug):** halaman Akun (Fase 2) belum memakai gaya/komponen baru (tanpa breadcrumb, tabel lama) → usulan penyeragaman.
- **Belum diverifikasi:** login Supabase sungguhan sebagai HR (password dipegang pemilik projek).

## Sesi tambahan — regresi setelah judul tanpa angka & warna fokus/autofill
- **Env:** lokal Linux, harness preview (port 3001/5174), Playwright Chromium 1440×900.
- **Perintah:** `bun run typecheck` ✔ · `bunx biome ci .` ✔ · `bun run check:boundaries` ✔ (174 modul) · `bun run db:check` ✔ · `bun run test` ✔ (shared 10, api 237, web 27) · `bun run build` ✔.
- **Regresi browser:** 44 kunjungan halaman (SA 18, HR 16, MANAGER 10) — 41 LULUS; 3 "gagal" = `/profil` tanpa `<h1>` di ketiga role (halaman tampil normal, 0 error; temuan lama Fase 2, bukan akibat perubahan). Tidak ada error JS, tidak ada request API ≥ 400.
- **Bukti:** `/mnt/winD/WORK/Magang/QA/2026-09-29-judul-tanpa-angka/`, `/mnt/winD/WORK/Magang/QA/2026-09-29-focus-ring-abu/`, `/mnt/winD/WORK/Magang/QA/2026-09-29-autofill-netral/`.
