# Hasil Uji — Lampiran Google Drive di Import (D-060, 2026-10-08)

- **Commit:** develop di atas `07a5474` (belum di-commit saat uji) · **Branch:** `HRIS/Oatse/Linux-Windows` (tidak di-push) · **Env:** lokal Linux, PostgreSQL 17, API + web lokal, login & Storage Supabase staging (prefix `dev/oatse/`), service account Google sungguhan · **Bun/PG:** 1.4.2 / 17
- **Perintah & ringkasan:** `bun run typecheck` ✔ · `bunx biome ci .` ✔ (374 file) · `bun run check:boundaries` ✔ (314 modul) · `db:check` ✔ · test shared **166** · api **539** · web **202** ✔ · bundle api (`bun build`) ✔.
- **Service account:** login JWT ✔, Drive API aktif ✔, 7/7 file respons contoh terbaca (4 JPEG, 3 PDF). Catatan: folder tidak muncul sebagai "dibagikan langsung" → diduga masih "siapa saja yang memiliki link" (daftar keamanan PROGRESS §2).
- **Playwright lokal:** `/mnt/winD/WORK/Magang/QA/2026-10-08-lampiran-drive/lampiran-ui.ts` → **7/7 LULUS** (run ke-2; run 1 6/7: LD-06 gagal — tombol "Simpan 0 karyawan" nonaktif saat baris hanya membawa lampiran → **bug diperbaiki** + test web). Bukti: `ld-01-pemetaan.png`, `ld-02-pratinjau.png`, `ld-03-lampiran.png`, `ld-05-dokumen.png` (foto profil disamarkan), `ld-06-impor-ulang.png`; `ld-db.txt`, `ld-mapping.txt` (tautan disamarkan). Data dibersihkan (`cleanup.ts`: dokumen + objek Storage, foto, pelatihan uji, riwayat import).

| ID | Hasil | Bukti / catatan |
|---|---|---|
| TC-EMP-178 | LULUS | SHG `import-attachments.test.ts` (+ `applySavedMapping`), `import-groups.test.ts`; WEB `employee-import.test.tsx` "D-060"; PW LD-01/02 |
| TC-EMP-179 | LULUS | INTI `import-attachments.test.ts` (foto, KTP 2 gambar → PDF, buku rekening, ISO 45001 + nomor + pelatihan, POP dilewati, file hilang gagal); UNIT `import-attachment-files.test.ts`, `google-drive.test.ts`; PW LD-03/04/05 (7/7 masuk; KTP/NPWP/buku rekening PDF asli, KK/ijazah/sertifikat JPEG) |
| TC-EMP-180 | LULUS | INTI "HR tanpa grant dokumen …" (KTP dilewati, ijazah masuk, HR lain 404) |
| TC-EMP-181 | LULUS | INTI "impor ulang …" (versi 1 → 2); PW LD-06 (7 dilewati, 6 dokumen tetap) |
| TC-EMP-182 | LULUS | INTI "coba ulang …", daftar `/attachments/open`; WEB `import-attachments.test.tsx` |
| TC-EMP-183 | LULUS | INTI "Drive belum dikonfigurasi → 422"; WEB `import-attachments.test.tsx` |

**Temuan (diperbaiki):** tombol Simpan nonaktif bila baris hanya membawa lampiran; profil pemetaan tersimpan sebelum D-060 menandai kolom tautan "diabaikan" (→ `applySavedMapping`); screenshot detail karyawan memuat foto asli dari respons contoh (→ disamarkan; script memburamkan gambar sebelum memotret).
