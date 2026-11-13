# Log — Import data karyawan

Entri terbaru di **atas**. Format satu entri (salin):

```
### YYYY-MM-DD — <judul singkat> (<PIC>)
- **Dikerjakan:** … (rujuk item checklist README)
- **Keputusan:** <PREFIX>-Dn baru / OD terjawab
- **Verifikasi:** perintah + hasil nyata
- **Masalah / catatan:** …
- **Berikutnya:** …
```

### 2026-11-13 — Mode import "Isi yang kosong saja" (IMP-D2) (Oatse)
- **Dikerjakan:** handoff supervisor 14:21 (keputusan pengguna 14:20). Migrasi `20261113073214_add_import_mode_fill_empty` (enum `ImportMode` + `FILL_EMPTY`). API `employee-import.service.ts`: `diff` memisah `changes` (field kosong → diisi) dan `kept` (sudah berisi & beda → dibiarkan) bila `fillEmpty`; status nikah turunan PTKP ikut dibiarkan bila PTKP dibiarkan; baris yang jabatannya sudah terisi tidak ikut `resolveUnits` (tanpa unit baru); simpan: data pribadi per kunci yang masih kosong, bank per field; pratinjau `rows[].kept`. Shared `detect.ts`: kolom email berisi email gratis tanpa kata kantor → Email pribadi. Web: kartu "Isi yang kosong saja" (tengah, bawaan tetap "Tambah + perbarui"), Pratinjau "Diisi:" + "Dibiarkan (sudah berisi, beda):", mode di ringkasan Pengaturan.
- **Keputusan:** IMP-D2.
- **Verifikasi:** test import api 40 ✔ (+1 FILL_EMPTY: isi kosong, kept, tanpa master baru, baris baru, EMP-D5 IMPORT), employee integration 243 ✔, shared 375 ✔ (+3 deteksi email), web import 15 ✔ (+1); smoke pratinjau ke DB lokal (Rizky, tanpa simpan): UPSERT 6 field berubah + unit baru, FILL_EMPTY diisi Email pribadi & PTKP, dibiarkan HP/jabatan/kota asal/status nikah, tanpa unit baru.
- **Masalah / catatan:** ada migrasi → rilis staging perlu `db:deploy`; Mat perlu dikabari (migrasi baru di develop).
- **Berikutnya:** rilis staging (sesi HRIS-rilis), lalu import pelengkapan data staging dengan mode ini.

Log sebelum 2026-10-13 ada di [archive/log-2026-09.md](../../archive/log-2026-09.md) dan [archive/log-2026-10.md](../../archive/log-2026-10.md) (cari judul atau D-xxx fitur ini).

### 2026-11-10 — IMP-D1 ke staging (Oatse)
- **Dikerjakan:** IMP-D1 dirilis ke staging gel. 23 (develop `a95d62d`, oleh `hris-rilis-0d`); contoh nama di README, komentar `chart-holder.ts`, dan test diganti nama fiktif (`a95d62d`).
- **Keputusan:** —
- **Verifikasi:** `Deploy staging` #42796846160 ✔ (`openapi.json` memuat `chartHolderChoices`); CI develop #42793861373 ✔.
- **Masalah / catatan:** belum ada import file data asli di staging.
- **Berikutnya:** import file data asli di staging memakai IMP-D1 setelah file dari pengguna tersedia.

### 2026-11-10 — Import melengkapi pemegang bagan ASLI- (IMP-D1) (Oatse)
- **Dikerjakan:** shared `import/chart-holder.ts` (kunci nama tanpa gelar/tanda baca, saran inisial, `NAME_TITLES`), pesan issue; API: `chartHolderChoices` di body, `rows[].chartHolder` & `chartHolders` di pratinjau, gabung = UPDATE (NIP diganti/dikosongkan, jabatan pos dipertahankan, CREATE_ONLY tetap boleh), audit `employee.import.chart_holder_merged`, stempel hash pratinjau memuat target; web: pemilih "Gabungkan dengan pemegang bagan…" per baris (saran nama/inisial + pemegang lain PT sama) & blok "Pemegang bagan yang belum dilengkapi".
- **Keputusan:** IMP-D1 (menutup catatan risiko D-066).
- **Verifikasi:** typecheck ✔, biome ✔, boundaries ✔; shared import-chart-holder 11 · integration import 50 (baru 3) · web employee-import 13 ✔.
- **Masalah / catatan:** nama dengan susunan kata berbeda (mis. nama panggilan) tetap perlu dipilih manual.
- **Berikutnya:** rilis staging gelombang berikutnya (setelah `hris-rilis-0d`).

