# Hasil Uji — Onboarding bagian a (2026-10-02)

- **Commit:** a1 `0d743e8` + a2 (web) · **Branch:** `HRIS/Oatse/Linux-Windows` · **Env:** lokal Linux · **Bun/PG:** 1.4.2 / PostgreSQL 17
- **Perintah & ringkasan:** test ditulis dulu & merah (nomor induk di shared, policy onboarding) → hijau; `bun run typecheck` ✔ · `bunx biome ci .` ✔ (271 file) · `bun run check:boundaries` ✔ (241 modul) · `db:check` ✔ · `bun run test` ✔ (shared 92 · api 396 · web 112) · `bun run build` ✔.

| ID | Hasil | Bukti |
|---|---|---|
| TC-EMP-096 | LULUS | INT "akses", POL "D-045", WEB (MANAGER) |
| TC-EMP-097 | LULUS | SH `onboarding.test.ts` (4), INT "pratinjau", INT "simpan ulang … 422" |
| TC-EMP-098 | LULUS | INT "masalah per baris", WEB (baris tanpa email tidak bisa dipilih) |
| TC-EMP-099 | LULUS | INT "simpan", WEB (konfirmasi: centang dilepas → `invite: false`) |
| TC-EMP-100 | LULUS | INT "calon tersembunyi", INT "import lama menolak", INT "login pertama" (calon melihat dirinya) |
| TC-EMP-101 | LULUS | INT "proses antrean", "undangan gagal", "batas per jam"; WEB (progres memproses otomatis) |
| TC-EMP-102 | LULUS | INT "login pertama", "kirim ulang"; WEB (tombol Undang) |
| TC-EMP-103 | LULUS | INT "undang karyawan existing" |

**Temuan selama uji (diperbaiki):** `GET /employees/:id` dan pemuatan foto memakai pengecekan akses sendiri sehingga calon masih terlihat → disaring (kecuali calon sendiri); validasi atasan kini menolak calon.

**Kesimpulan:** kriteria otomatis terpenuhi di lokal. **Bug terbuka:** tidak ada.
**Belum diverifikasi:** browser, email undangan sungguhan (Supabase staging), staging. Bagian a **tidak dirilis sendirian**.

## Tambahan — bagian b (wizard, dokumen, kunci akses)
- `bun run test` ✔ (shared 98 · api 416 · web 117) · typecheck ✔ · biome ✔ · boundaries ✔ · `db:check` ✔ · build ✔.

| ID | Hasil | Bukti |
|---|---|---|
| TC-EMP-104 | LULUS | INT "kunci akses" (2), UNIT daftar izin (12), WEB (calon diarahkan; existing banner) |
| TC-EMP-105 | LULUS | INT "simpan draf", SH `onboarding-form.test.ts`, WEB (PUT personal) |
| TC-EMP-106 | LULUS | INT "dokumen" (storage tiruan) |
| TC-EMP-107 | LULUS | INT "kirim" (422 / Menunggu review), WEB (ringkasan, layar menunggu) |
| TC-EMP-108 | LULUS | INT "karyawan existing" (2), WEB (field terisi nonaktif) |

**Belum:** bucket `employee-documents` di Supabase staging (butuh `storage:setup`), uji browser.

