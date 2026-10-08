# Hasil Uji — Import Sheet Respons Google Form (D-059, 2026-10-07)

- **Commit:** develop di atas `e00c151` (belum di-commit saat uji) · **Branch:** `HRIS/Oatse/Linux-Windows` (tidak di-push) · **Env:** lokal Linux, PostgreSQL 17 (DB `hris`), API + web lokal, login Supabase staging sungguhan · **Bun/PG:** 1.4.2 / 17
- **Perintah & ringkasan (setelah jalur Apps Script dihapus):** `bun run typecheck` ✔ · `bunx biome ci .` ✔ (359 file) · `bun run check:boundaries` ✔ (302 modul) · `db:check` ✔ · test shared **150** · api **522** · web **199** ✔ · `bun run build` ✔.
- **Regresi browser** (`regresi.ts`, server uji terpisah :5174 → :3100): **8/8 LULUS** — login & lupa password "NIP atau email", menu Administrasi tanpa Pendataan Form & `/pendataan-form` tidak ditemukan, `/api/v1/intake/ping` 404, pencarian Penerimaan & label form karyawan NIP, Import Sheet Form end-to-end, 0 error konsol; data dibersihkan.
- **Playwright lokal:** `/mnt/winD/WORK/Magang/QA/2026-10-07-import-form/import-ui.ts` (CSV dummy 35 kolom berheader Form) → **4/4 LULUS** (run ke-2; run 1 4/4 tetapi kolom otomatis "Alamat email" ekspor Form terpetakan ke email kantor → aturan + test, diulang: email kantor kosong, email pribadi terisi). Bukti: `imp-01-pemetaan.png`, `imp-02-pratinjau.png`, `imp-03-selesai.png` (dummy). Data dibersihkan (`cleanup-import.ts`: 3 karyawan, 1 job, 1 profil pemetaan).
- **Ekspor Sheet sungguhan** (138 kolom, 1 baris; nilai tidak dicetak/difoto): pemetaan awal salah/kurang (NIK tak terpetakan karena isi belum 16 digit, "Pendidikan" ayah terbaca pendidikan karyawan, "Nama Pemilik"/"Hubungan" tak dikenali, regresi sementara "Nama Istri/Suami" → nama karyawan) → diperbaiki + test berheader asli; akhir **24 kolom terpetakan benar**. Pratinjau lewat API: HTTP 200; error hanya karena isian asal & kolom data kerja belum ditambahkan (langkah HR). Tanggal Sheet DD/MM terbaca benar.

| ID | Hasil | Bukti / catatan |
|---|---|---|
| TC-EMP-169 | LULUS | `packages/shared/tests/import-form.test.ts` (pemetaan header Form, ekspor sungguhan, ekspor Form "Alamat email") + PW IF-01 |
| TC-EMP-170 | LULUS | `apps/api/tests/integration/employee/import.test.ts` "Field Formulir Data Karyawan (D-059)" + PW IF-02/03 |

- **Import lengkap (bagian berulang)** — verifikasi: typecheck ✔ · biome ✔ (363 file) · boundaries ✔ (304 modul) · `db:check` ✔ (migrasi `20261007102154_add_form_family_education_training_fields`) · test shared **159** · api **525** · web **199** ✔ · build ✔. Ekspor Sheet sungguhan: **119/138** kolom terpetakan (sisa = tautan file, Timestamp, pertanyaan navigasi). Playwright `lengkap-ui.ts` (CSV dummy = 138 header asli + 5 kolom data kerja, 2 karyawan; server uji :5174 → :3100) **8/8 LULUS** (run ke-3: run 1 CSV tanpa kolom Perusahaan — "Perusahaan belum ditentukan", sesuai aturan; run 2 profil pemetaan lama menimpa kolom kembar → **bug diperbaiki** dengan kunci per kemunculan). Bukti: `fl-01-pemetaan.png` … `fl-06-pendidikan.png` (dummy). Data dibersihkan.

| ID | Hasil | Bukti / catatan |
|---|---|---|
| TC-EMP-173 | LULUS | SHG (pemetaan 138 header asli) + PW FL-01 |
| TC-EMP-174 | LULUS | INTI "buat karyawan: keluarga, pendidikan, sertifikasi …", "HR tanpa grant data pribadi …" + PW FL-02/03 |
| TC-EMP-175 | LULUS | INTI "impor ulang: hanya yang belum ada ditambah …" + PW FL-07 |
| TC-EMP-176 | LULUS | SHG "kunci profil pemetaan" + PW FL-07 |
| TC-EMP-177 | LULUS | INTI (detail `view=full`/`work`) + PW FL-04/05/06 |

**Temuan (diperbaiki):** (Import lengkap) profil pemetaan berkunci teks header menimpa kolom kembar saat dipakai ulang; label dropdown kelompok terpotong ("Nama"/"Usia" tanpa nama kelompok); field data pribadi dari commit `f7fafe8` belum tampil di detail karyawan; perbandingan nomor SIM per jenis berbasis rujukan (selalu "berubah"). Sebelumnya: pilihan "Sudah Menikah" tidak dikenali (status nikah terlewat diam-diam); "Golongan Darah" terbaca Grade; kolom tautan Drive terbaca nomor rekening; kolom keluarga & "Alamat email" ekspor Form terpetakan ke data karyawan; urutan jenis SIM tidak baku (dianggap berubah saat UPSERT).

**Kesimpulan:** LULUS lokal. **Bug terbuka:** tidak ada. **Belum diverifikasi:** file `.xlsx` asli dari Google Sheet (diuji CSV berheader sama), staging.
