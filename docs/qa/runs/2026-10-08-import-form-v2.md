# Hasil Uji — Import Form Versi 171 Kolom (D-061, 2026-10-08)

- **Commit:** develop di atas `94f2112` (belum di-commit saat uji) · **Branch:** `HRIS/Oatse/Linux-Windows` (tidak di-push) · **Env:** lokal Linux, PostgreSQL 17, API + web lokal, login Supabase staging · **Bun/PG:** 1.4.2 / 17
- **Perintah & ringkasan:** `bun run typecheck` ✔ · `bunx biome ci .` ✔ (379 file; 1 peringatan lama di `apps/web/tests/employee-print.test.ts`, bukan dari perubahan ini) · `bun run check:boundaries` ✔ (316 modul) · `db:migrate` + `db:generate` + `db:check` ✔ · test shared **175** · api **547** ✔ · web **206** ✔ (dengan `--maxWorkers=2`; run paralel penuh sempat timeout 3–6 test acak karena beban CPU dev server, lulus semua saat diulang terpisah) · `bun run build` ✔.
- **File respons asli** (2 respons, tidak disalin ke repo/QA): pembaca xlsx web (`read-excel-file`) + pemetaan → 166/171 kolom terpetakan (5 sisanya memang diabaikan); responden versi baru **0 masalah**; responden pertama 5 error + 6 peringatan karena isinya tidak valid (NIK bukan 16 digit, email tanpa @, HP pendek, usia/tahun berupa kata) — tampak respons uji coba.
- **Playwright lokal:** `/mnt/winD/WORK/Magang/QA/2026-10-08-import-form-v2/form-v2-ui.ts` → **8/8 LULUS** (run ke-3). Run 1: FV-01 gagal karena teks harapan di script salah ("Sertifikasi SMKP Minerba: …" → label sebenarnya "SMKP Minerba: …"). Screenshot run 2 memperlihatkan **bug**: kolom "NPWP" yang kosong dipetakan ke "File NPWP" → diperbaiki + test regresi; run 2 lalu menemukan "Buku Rekening (Hal 1)" kosong tidak dikenali → aturan diperketat (judul persis field data). Bukti: `fv-01-pemetaan.png`, `fv-02-pratinjau.png`, `fv-03-selesai.png`, `fv-06-pribadi.png`, `fv-07-keluarga.png`, `fv-mapping.txt`, `fv-db.txt`. Data dummy: `make-dummy.ts` → `form-v2-dummy.xlsx`; karyawan seed dipulihkan (`snapshot-restore.ts restore`: nama, data pribadi, keluarga/pendidikan/riwayat baru, jabatan uji, job & profil pemetaan, audit).

| ID | Hasil | Bukti / catatan |
|---|---|---|
| TC-EMP-188 | LULUS | SHG `import-form-v2.test.ts` (pemetaan 171 kolom, kolom tak terpetakan, header tampilan); PW FV-01 (165 kolom pada file dummy, badge "Digabung") |
| TC-EMP-189 | LULUS | SHG `import-form-v2.test.ts` (responden lama & baru); INTI `import.test.ts` "rincian alamat …", "HR tanpa grant …"; PW FV-04/05/06/07 |
| TC-EMP-190 | LULUS | INTI `import.test.ts` "Divisi: harus persis …"; PW FV-02 (pesan), FV-04 (HSE Site di bawah Site Operasional) |
| TC-EMP-191 | LULUS | SHG `import-form-v2.test.ts` (KK nama file, tahun teks, kolom kosong); PW FV-02 |
| TC-EMP-192 | LULUS sebagian | Migrasi: `SIM` `has_expiry=f`, `reminder_days={}` (psql); SHG target & catatan SIM A/C. Pengambilan file SIM dari Drive sungguhan **BELUM** (butuh tautan unggahan SIM; logika antrean sama dengan D-060) |

**Temuan (diperbaiki):** kolom nomor "NPWP" yang kosong terpetakan sebagai lampiran (aturan kolom kosong D-061) → kolom kosong hanya lampiran bila judulnya kembar atau bukan persis nama field data; test lama `data-changes.test.ts` memakai SIM sebagai contoh dokumen bermasa berlaku → diganti SIO.
