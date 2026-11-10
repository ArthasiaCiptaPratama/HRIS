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

Log sebelum 2026-10-13 ada di [archive/log-2026-09.md](../../archive/log-2026-09.md) dan [archive/log-2026-10.md](../../archive/log-2026-10.md) (cari judul atau D-xxx fitur ini).

### 2026-11-10 — Import melengkapi pemegang bagan ASLI- (IMP-D1) (Oatse)
- **Dikerjakan:** shared `import/chart-holder.ts` (kunci nama tanpa gelar/tanda baca, saran inisial, `NAME_TITLES`), pesan issue; API: `chartHolderChoices` di body, `rows[].chartHolder` & `chartHolders` di pratinjau, gabung = UPDATE (NIP diganti/dikosongkan, jabatan pos dipertahankan, CREATE_ONLY tetap boleh), audit `employee.import.chart_holder_merged`, stempel hash pratinjau memuat target; web: pemilih "Gabungkan dengan pemegang bagan…" per baris (saran nama/inisial + pemegang lain PT sama) & blok "Pemegang bagan yang belum dilengkapi".
- **Keputusan:** IMP-D1 (menutup catatan risiko D-066).
- **Verifikasi:** typecheck ✔, biome ✔, boundaries ✔; shared import-chart-holder 11 · integration import 50 (baru 3) · web employee-import 13 ✔.
- **Masalah / catatan:** nama dengan susunan kata berbeda (mis. nama panggilan) tetap perlu dipilih manual.
- **Berikutnya:** rilis staging gelombang berikutnya (setelah `hris-rilis-0d`).

