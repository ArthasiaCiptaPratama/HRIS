# Hasil Uji — Laporan batch 1, lokal (2026-10-16)

- **Commit:** develop `c49668a` + perubahan gel. 3 (di-commit bersama dokumen ini) · **Branch:** `HRIS/Oatse/Linux-Windows` · **Env:** lokal (DB `hris`, Auth staging)
- **Perintah & ringkasan:** `bun run typecheck` ✔ · `bunx biome ci .` ✔ (1 warning lama `employee-print.test.ts`) · `bun run check:boundaries` ✔ (457 modul) · `db:check` ✔ · `bun run test` → shared **243** · api **792** · web **289** (2× berturut-turut) · build ✔
- **Script:** `/mnt/winD/WORK/Magang/QA/2026-10-16-laporan-lokal/qa-laporan.ts` — **11/11**, 0 error JS/5xx.

| ID | Hasil | Bukti / catatan |
|---|---|---|
| TC-EMP-239 | LULUS | R-01 — `R-01.png` |
| TC-EMP-240 | LULUS | R-01: 2026 aktif 1 Jan 82 → 88, masuk 8, keluar 2, turnover 2,4%; R-02 tahun 2025 — `R-01.png`, `R-02.png`; angka terkontrol di integration (turnover 2025 = 100% data uji) |
| TC-EMP-241 | LULUS | integration (unit induk memasukkan sub-unit) |
| TC-EMP-242 | LULUS | R-03 — `R-03.png` |
| TC-EMP-243 | LULUS | R-08: "1 dokumen sensitif tidak ditampilkan" untuk HR tanpa grant — `R-08.png` |
| TC-EMP-244 | LULUS | R-04: 88 karyawan belum lengkap (data lokal dummy) — `R-04.png`; integration memastikan nomor rekening tidak ikut di respons |
| TC-EMP-245 | LULUS | R-05: 1 SP berlaku (Rizky `003/SP1/HRD-ACP/X/2026`) — `R-05.png` |
| TC-EMP-246 | LULUS | R-07 — `R-07.png`; ekspor SP tanpa grant 403 (integration) |
| TC-EMP-247 | LULUS | R-06: `laporan-warning-letters-2026-10-16.xlsx`; audit `report.export` (integration) |
| TC-EMP-248 | LULUS | R-09 MANAGER & R-10 karyawan "Akses ditolak"; API 403; HR PT lain → laporan kosong (integration) |
| TC-EMP-249 | LULUS | R-11: scroll 0 — `R-11.png` |

**Catatan:**
- Integration test pertama gagal karena data uji memakai alasan keluar `RESIGNED` (yang benar `RESIGNATION`) — kesalahan test, bukan aplikasi.
- Suite web penuh sempat gagal 2 test baru (judul halaman Laporan lazy + ECharts melewati batas tunggu 1 detik saat suite padat) → batas tunggu judul 5 detik; ulang 2× 289/289. `import-attachments` flaky lama (Backlog).
- Batasan yang dicatat: rincian per unit/status memakai unit & status karyawan saat ini; karyawan yang diaktifkan kembali tidak lagi terhitung keluar di periode lama; dokumen wajib lingkup SITE belum dihitung (belum ada penanda site).

**Kesimpulan:** semua P1/P2 LULUS di lokal; belum LEGIT (butuh uji staging setelah rilis).

## Putaran 2 — perbaikan UI/UX + Excel bergaya (2026-10-16)

- **Perintah & ringkasan:** typecheck ✔ · biome ✔ (1 warning lama) · boundaries ✔ (460 modul) · `db:check` ✔ · shared **246** · api **792** · web **291** · build ✔.
- **Script:** `/mnt/winD/WORK/Magang/QA/2026-10-16-laporan-ui/qa-laporan-ui.ts` — **19/19**, 0 error JS/5xx/console.

| Langkah | Hasil | Bukti |
|---|---|---|
| U-01 Headcount 1440: KPI, grafik + alasan keluar, rincian bulan, komposisi, daftar | LULUS | `U-01.png` |
| U-02 klik baris bulan → daftar tersaring (chip) | LULUS | `U-02.png` |
| U-03 Headcount mode gelap | LULUS | `U-03.png` |
| U-04 Dokumen: KPI kelompok → daftar tersaring | LULUS | `U-04.png` |
| U-05 Kelengkapan: progres %, item kosong, per PT, daftar | LULUS | `U-05.png` |
| U-06 klik item kosong → daftar tersaring | LULUS | `U-06.png` |
| U-07 klik baris → panel profil di tab terkait (`?pegawai=&tab=work` untuk Email kantor) | LULUS | `U-07.png` |
| U-08 Back menutup panel, tetap di laporan | LULUS | `U-08.png` |
| U-09 cari nama | LULUS | `U-09.png` |
| U-10 SP: tabel bentuk Data Karyawan Aktif + "Buka SP" | LULUS | `U-10.png` |
| U-11 ekspor 4 laporan (Ringkasan + rincian; dibaca openpyxl: format, beku, autofilter, judul cetak) | LULUS | `laporan-*.xlsx` |
| U-12 1024 px tanpa geser samping | LULUS | `U-12.png` |
| U-13…U-17 HP 390 (4 tab + gelap) tanpa geser samping | LULUS | `U-13…17.png` |
| U-18 HR tanpa grant SP: daftar tersembunyi | LULUS | `U-18.png` |
| U-19 MANAGER ditolak | LULUS | `U-19.png` |

**Catatan:** putaran pertama U-05 gagal karena selector skrip (nama progressbar tidak eksak), bukan aplikasi. Tampilan Excel belum dilihat di Microsoft Excel/LibreOffice (tidak terpasang di mesin dev); struktur diverifikasi openpyxl.
