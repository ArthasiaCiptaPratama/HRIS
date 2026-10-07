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

**Temuan (diperbaiki):** pilihan "Sudah Menikah" tidak dikenali (status nikah terlewat diam-diam); "Golongan Darah" terbaca Grade; kolom tautan Drive terbaca nomor rekening; kolom keluarga & "Alamat email" ekspor Form terpetakan ke data karyawan; urutan jenis SIM tidak baku (dianggap berubah saat UPSERT).

**Kesimpulan:** LULUS lokal. **Bug terbuka:** tidak ada. **Belum diverifikasi:** file `.xlsx` asli dari Google Sheet (diuji CSV berheader sama), staging.
