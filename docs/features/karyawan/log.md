# Log — Karyawan — Personal Management

Entri terbaru di **atas**. Format satu entri (salin):

```
### 2026-11-13 — Tombol Kembali kembali ke posisi asli, ikut tergulir (Oatse)
- **Dikerjakan:** kutipan pengguna 12:41 WIB (menolak tombol di bar tab, minta kembali ke posisi asli). `employee-detail-sheet.tsx`: `BackButton` "← Kembali" (berlabel) lagi di kiri atas di atas banner hijau, tetapi kini di dalam area gulir `DetailBody` (`relative`), jadi ikut tergulir bersama banner dan tidak lagi menimpa bar tab/judul. Bar tab sticky tetap opak, `pl-28` dihapus. Versi di bar tab (`compact`) dihapus. Saat memuat/galat, tombol ada di `SheetContent`.
- **Verifikasi:** test detail 21 ✔ (test tombol diperbarui: absolute di dalam area gulir, bukan di bar tab); screenshot `QA/2026-11-13-riwayat-ui/11-kembali-asli-{desktop,390px}-{atas,gulir}.png`.

### 2026-11-13 — Tombol Kembali detail karyawan tidak menimpa isi saat digulir (Oatse)
- **Dikerjakan:** kutipan pengguna 11:13 WIB ("perbaiki sekarang tombol kembali"). `employee-detail-sheet.tsx`: tombol Kembali (`BackButton`) dipindah ke dalam bar tab yang menempel (sebaris di depan tab, ikon saja di bawah xl, label tetap untuk pembaca layar); bar dibuat opak; tombol melayang hanya saat detail memuat/galat. Berlaku untuk semua tab detail.
- **Verifikasi:** web `employee-detail.test.tsx` (tombol di bar sticky, sebelum tablist, tidak absolute); typecheck ✔ · biome ci ✔ (1 warning lama) · boundaries ✔ · shared 372 · api 1342 · web 369 ✔; sebelum: `QA/2026-11-13-riwayat-ui/07-homebase-timeline-desktop.png`, `04-polish-390px.png`; sesudah: `09-kembali-sesudah-desktop.png`, `10-kembali-sesudah-390px.png`.

### 2026-11-13 — Test flaky laporan ulang tahun (ARS-D21) (Oatse)
- **Dikerjakan:** `reports-batch2.test.ts`: token `RUN` jadi huruf saja (digit hex dipetakan ke huruf) — sebelumnya token acak bisa "1995" dan menggagalkan asersi "tanpa tahun lahir 1995" (CI #43363521371 attempt 1, satu run lokal). Khusus test.
- **Verifikasi:** test itu 3× berturut-turut 9/9 ✔; api penuh ✔; typecheck/biome ✔.

### 2026-11-13 — Riwayat homebase di timeline tab Riwayat + segmen Homebase (Oatse)
- **Dikerjakan:** koreksi pengguna 13 Nov (kartu terpisah → entri timeline). `employee-detail-sheet.tsx`: kartu Riwayat homebase dihapus; filter berbasis jenis (`HistoryKind`) dengan segmen **Homebase**; entri homebase = `TimelineItem` (ikon pin, "Homebase diubah", badge Sekarang, diff "entri sebelumnya → entri ini", meta "Berlaku mulai · No. SK · pengubah · waktu dicatat", catatan, menu ⋯ Koreksi/Hapus). **Sumber:** `detail.homebases` (employee_homebases) — lengkap termasuk tanggal mundur/koreksi baris lama & entri import/tambah/onboarding, membawa id untuk menu; baris EMP-D5 `homebase` disembunyikan (anti-duplikat) kecuali jejak hapus (`HR_FORM` + `refId` yang sudah tidak ada) → "Riwayat homebase dihapus". "Data kerja" tidak lagi memuat homebase. Urut menurut waktu dicatat; saat masih ada halaman EMP-D5 berikutnya, peristiwa kepegawaian & homebase hanya ditampilkan sampai waktu baris tertua yang termuat (tidak menumpuk/terlewat saat "Muat lebih banyak").
- **Keputusan:** — (tampilan; arah dari pengguna lewat supervisor). Batas: koreksi baris lama tidak tampil sebagai peristiwa tersendiri (entri menampilkan nilai terbaru; jejak di audit).
- **Verifikasi:** web `employee-detail.test.tsx` +2 (anti-duplikat + jejak hapus; urutan Muat lebih banyak) & 2 disesuaikan; typecheck ✔ · biome ci ✔ (1 warning lama) · boundaries ✔ · shared 372 · api 1342 · web 369 ✔; Zen headless Rizky lokal `QA/2026-11-13-riwayat-ui/07-homebase-timeline-desktop.png`, `08-homebase-timeline-390px.png`.

### 2026-11-13 — EMP-D5: beda format nomor tidak dicatat sebagai perubahan (Oatse)
- **Dikerjakan:** temuan saat isi data contoh Rizky lokal: simpan profil (ubah kota asal saja) ikut mencatat "NPWP 09.009.009.9-017.000 → 090090099017000" karena EMP-D4 menormalkan nomor saat simpan. `field-change.ts`: `diffScalars` membandingkan bentuk tanpa pemisah untuk field nomor (`FORMAT_INSENSITIVE_FIELDS`: NIK, KK, NPWP, BPJS ×2, rekening, telepon, telepon darurat, SIM); `diffRows` + `summarizeRow(…, forCompare)` untuk ringkasan baris (keluarga, juga di persetujuan pengajuan `data-change.service.ts`). Nilai yang dicatat & penyimpanan EMP-D4 tidak berubah. Baris NPWP palsu Rizky di DB lokal dihapus.
- **Verifikasi:** test integration `field-changes.test.ts` +1 (NPWP & rekening berformat + kota asal → tepat 1 baris; gagal sebelum perbaikan); typecheck ✔ · biome ci ✔ (1 warning lama) · boundaries ✔ · shared 372 · api 1342 · web 367 ✔.

### 2026-11-13 — Polish tab Riwayat: tanggal homebase & pemisah meta (Oatse)
- **Dikerjakan:** permintaan supervisor setelah tinjau screenshot. (1) `homebase-history.ts` `homebaseChangeText`: tanggal "berlaku 01 Jan 2025" (id-ID, `dd MMM yyyy`, UTC = tanggal kalender) untuk entri EMP-D5 baru; entri lama (ISO) dibiarkan. (2) `employee-detail-sheet.tsx`: pemisah "·" meta jadi pseudo-element di akhir item (`META_LINE`), tidak pernah di awal baris saat wrap (meta timeline & Riwayat homebase).
- **Verifikasi:** typecheck ✔ · biome ci ✔ (1 warning lama) · boundaries ✔ · shared 372 · web 367 ✔ · api 1341 ✔ (run pertama 1 fail flaky `reports-batch2` ulang tahun ARS-D21 — lulus sendiri & di run ulang penuh); screenshot Zen headless 390 px `QA/2026-11-13-riwayat-ui/04-polish-390px.png` (animasi dimatikan di iframe uji); data uji lokal dihapus lagi.

### 2026-11-13 — Tampilan tab Riwayat dirapikan (Oatse)
- **Dikerjakan:** handoff supervisor 10:10 poin 5 (sub-item README). `employee-detail-sheet.tsx`: `HistoryTab` (header + aksi, filter segmented `fieldset` dengan jumlah dari data termuat + "+" bila ada halaman berikutnya, fade kanan < 640 px, kelompok per bulan Asia/Jakarta, empty state per filter), `TimelineItem`/`DiffList`/`DiffRow`/`EntryMeta` baru (menggantikan `ChangedBy`: avatar, chip peran, dan pin lokasi diganti meta teks; lokasi di `title`), peristiwa kepegawaian sebagai baris diff (Status/Jabatan/Perusahaan/Alasan), `HomebaseHistory` kartu ringkas (disembunyikan bila kosong). Acuan skill `minimalist-ui` (prinsip flat/border 1px/meta redup), token & ikon projek tetap.
- **Keputusan:** — (tampilan saja).
- **Verifikasi:** `bun run typecheck` ✔; `bunx biome ci .` ✔ (1 warning lama); `check:boundaries` ✔; test shared 372 · api 1341 · web 367 ✔. Zen lokal foreground: desktop & 390 px (iframe origin sama) — `QA/2026-11-13-riwayat-ui/01-sebelum-desktop.png`, `02-sesudah-desktop.png`, `03-sesudah-390px.png`.
- **Masalah / catatan:** data uji lokal (master "Makassar/Balikpapan (uji)", riwayat homebase + EMP-D5 Ahmad Hulaemi) dihapus dari DB lokal setelah screenshot (keputusan supervisor); baris audit `employee.homebase.*` lokal dibiarkan.
- **Berikutnya:** rilis staging di antrean RELEASE berikutnya; koreksi arah desain dari pengguna bila ada.

### 2026-11-13 — Perbaikan form Ubah data & riwayat homebase; homebase lewat Ubah data (Oatse)
- **Dikerjakan:** handoff supervisor 2026-11-13 10:10 poin 1–4 (sub-item EMP-D6 README). (1) `employee-form-dialog.tsx`: reset form hanya saat dialog dibuka / karyawan berganti (`useRef`), refetch detail tidak lagi menimpa isian; status bawaan mode tambah diisi lewat efek terpisah. (2) `homebase.service.ts` + `homebase.repository.ts` (`findLatestEntry`): EMP-D5 field `homebase` = baris berlaku sebelum → sesudah di tambah/koreksi/hapus. (3) `employee-detail-sheet.tsx`: Kepegawaian hanya "Homebase (POH)"; `HomebaseHistory` + menu koreksi/hapus di atas timeline tab Riwayat; `employee-homebase-editor.tsx` tanpa mode tambah. (4) `employee-work-fields.tsx` (field Homebase juga saat ubah bila `access.manage`, isian "Homebase berlaku mulai" + "No. SK homebase" saat diganti, `homebaseChangeFromForm`), `schemas.ts` (`homebaseEffectiveFrom`, `homebaseDecreeNumber`), dialog: validasi `employeeHomebaseInputSchema` + tidak masa depan → PATCH (hanya bila data kerja lain berubah) → profil → `POST /employees/{id}/homebases`; POST gagal setelah data lain tersimpan → pesan "Data lain sudah tersimpan, tetapi homebase gagal disimpan: …", isian tetap.
- **Keputusan:** pembaruan EMP-D6 (README); tanpa migrasi/kontrak baru.
- **Verifikasi:** `bun run typecheck` ✔; `bunx biome ci .` ✔ (1 warning lama); `check:boundaries` ✔ (566 modul); test shared 372 · api 1341 · web 367 ✔. Regresi dibuktikan gagal di kode lama: `homebase.test.ts` "pencatatan" (1 fail), `employee-form-reset.test.tsx` (1 fail). smoke Zen lokal SA (Zen terlihat, tab latar): Kepegawaian hanya nilai sekarang; Ubah data → Makassar (2025-01-01) lalu Balikpapan (2026-11-01, SK) → tab Riwayat "Makassar (uji) (berlaku 2025-01-01) → Balikpapan (uji) (berlaku 2026-11-01)" ✔ — bukti teks DOM `QA/2026-11-13-homebase-ubah-data/smoke-dom.txt` (screenshot tab latar tidak me-render dialog)
- **Masalah / catatan:** Codex tidak dipakai (kuota habis s.d. 17 Nov). Baris EMP-D5 lama di staging ("— → Balikpapan" Rizky) tidak dibetulkan (tanpa backfill). Simpan homebase dari form = request kedua (non-atomik), sama seperti profil.
- **Berikutnya:** rilis ke staging di antrean RELEASE berikutnya.

### YYYY-MM-DD — <judul singkat> (<PIC>)
- **Dikerjakan:** … (rujuk item checklist README)
- **Keputusan:** <PREFIX>-Dn baru / OD terjawab
- **Verifikasi:** perintah + hasil nyata
- **Masalah / catatan:** …
- **Berikutnya:** …
```

Log sebelum 2026-10-13 ada di [archive/log-2026-09.md](../../archive/log-2026-09.md) dan [archive/log-2026-10.md](../../archive/log-2026-10.md) (cari judul atau D-xxx fitur ini).

### 2026-11-13 — Data contoh Homebase + Riwayat di karyawan uji Rizky (staging) (Oatse)
- **Dikerjakan:** handoff supervisor 09:50 (kutipan pengguna ±09:45 WIB). Lewat UI staging sebagai SA: 2 master homebase berlabel CONTOH, 2 baris riwayat homebase Rizky, ubah No. HP, nama kontak darurat, kota asal (nilai asli di RELEASE §4).
- **Keputusan:** tidak ada.
- **Verifikasi:** MCP `SELECT`: `homebases` 2, `employee_homebases` Rizky 2, `employee_field_changes` Rizky 5; tab Riwayat + filter Data pribadi tampil; screenshot `QA/2026-11-13-staging-contoh-rizky/` 01–04.
- **Masalah / catatan:** (1) form Ubah data me-reset isian bila detail karyawan dimuat ulang saat dialog terbuka (`employee-form-dialog.tsx` effect `reset` bergantung pada objek `employee`) → edit No. HP/kontak darurat pertama hilang tanpa pesan; diulang per tab. (2) Entri riwayat homebase kedua tercatat "— → Balikpapan", bukan "Makassar → Balikpapan" (nilai lama tidak diisi untuk baris riwayat baru). Keduanya belum diperbaiki, diusulkan ke develop.
- **Berikutnya:** hapus/kembalikan data contoh hanya atas kata pengguna.

### 2026-11-12 — Homebase / Point of Hire tahap A–C (EMP-D6) (Oatse)
- **Dikerjakan:** rencana `homebase-plan.md` disetujui (supervisor atas nama pengguna). A `45e7eeb`: migrasi `20261112060046_employee_homebases`, master `homebases`, API riwayat + kolom turunan + audit + EMP-D5, detail/daftar/filter, tambah karyawan & approve onboarding, adapter `getHomebasesOn`. B `d15b06e`: web Master Data › Homebase, detail Penempatan + Riwayat homebase + dialog, tambah karyawan, approve onboarding, kolom & filter daftar. C `11754b4`: import HOMEBASE / HOMEBASE BERLAKU MULAI (master baru/terarsip, `HOMEBASE_FUTURE_DATE`), template import, filter laporan + kolom ekspor headcount, `diffWork` mencatat `homebase`. Implementasi tiap tahap oleh subagen Claude (Codex sedang kena batas kuota) dengan brief rinci; diff inti direview + verifikasi ulang sendiri.
- **Keputusan:** EMP-D6; EMP-OD3 terjawab 13:49 WIB "EMP-0D3: beda" → "PENEMPATAN LOKASI KERJA" bukan Homebase, tidak dipetakan.
- **Verifikasi:** per tahap `bun run typecheck` ✔, `bunx biome ci .` ✔ (1 warning lama), `check:boundaries` ✔, `db:check` ✔; terakhir shared 372 · api employee+report+organization 324 · web 365 ✔, tanpa peringatan pg; Zen headless lokal (SA): detail Penempatan + Riwayat homebase, Master Data › Homebase (baris uji disisipkan ke DB lokal lalu dihapus) — `QA/2026-11-12-homebase/`.
- **Masalah / catatan:** dialog Ubah homebase tidak ter-render di Zen headless (animasi Radix) — dicakup test web. Detail memakai 20 riwayat terbaru. Filter Homebase disembunyikan di tab laporan Aset. `masterData.homebases` jadi wajib di respons pratinjau import (OpenAPI). `EmployeeListItem.homebase` (nullable) baru — perlu diketahui sesi mobile.
- **Berikutnya:** kabar Mat (migrasi `employee_field_changes`, `employee_homebases` + fungsi bersama) & sesi mobile lewat supervisor; EMP-OD3 menunggu pengguna.

### 2026-11-12 — Riwayat perubahan data per field (EMP-D5) + rencana Homebase (EMP-D6) (Oatse)
- **Dikerjakan:** handoff supervisor 09:00 poin 1 & 3. Audit jalur tulis data karyawan (12 jalur). EMP-D5: migrasi `20261112053425_employee_field_changes`, `employee/field-change.ts` (diff skalar & baris, snapshot berurutan di transaksi), pencatatan di employee/profile/data-change/import/onboarding (lengkapi, review, undang)/bagan/`syncPostManagers`/gabung master/arsip/dokumen/foto, `GET /employees/{id}/field-changes`, shared `employee-field-changes.ts` (label), web tab Riwayat timeline gabungan + filter + "Muat lebih banyak". Implementasi awal Codex sol-high (berhenti di ±70% karena batas kuota), dilanjutkan & direview penuh sendiri. Rencana Homebase `homebase-plan.md` (EMP-D6) + EMP-OD3.
- **Keputusan:** EMP-D5, EMP-D6 (P1/P2/H1–H7 kutipan pengguna 12:29 WIB); EMP-OD3 baru.
- **Verifikasi:** `bun run typecheck` ✔; `bunx biome ci .` ✔ (1 warning lama); `check:boundaries` ✔ (562 modul); `db:check` ✔ (No difference); test shared 362 · api 1316 · web 352 (`--maxWorkers=4`) ✔; smoke Zen headless lokal SA: timeline + filter Data pribadi + label "sistem (otomatis)" (baris uji disisipkan langsung ke DB lokal lalu dihapus, karena dialog Ubah data tidak ter-render di headless) — screenshot `QA/2026-11-12-riwayat-perubahan/` (nama DB lokal, jangan diunggah).
- **Masalah / catatan:** review menemukan & memperbaiki: query paralel di klien transaksi interaktif (`Promise.all`/`include` banyak relasi → peringatan pg "client.query() when the client is already executing", dilarang di pg@9) di `loadMasterData(tx)`, `diffWork`, `fieldSnapshot`, `loadSelf(tx)` → dibuat berurutan / kembali di luar transaksi; master import dibaca sekali per commit; filter riwayat jadi `fieldset`. Belum diuji di browser dengan akun non-SA (penyamaran dibuktikan test integrasi). PATCH arsip mengganti item utuh, jadi kolom yang tidak dikirim (mis. tahun lulus) tercatat jadi kosong.
- **Berikutnya:** Homebase tahap A setelah push + CI hijau; kabar Mat lewat supervisor (migrasi baru).

### 2026-10-19 — Ubah data lengkap dari detail karyawan (EMP-D4) + perbaikan pengajuan Keluarga (Oatse)
- **Dikerjakan:** checklist "Ubah data lengkap" — `PATCH /employees/{id}/profile`, dialog Ubah data bertab, tombol di semua panel detail; perbaikan `replaceFamily` (pengajuan/onboarding) yang menghapus kolom keluarga lain; `PATCH /employees` tidak menerima `profile`.
- **Keputusan:** EMP-D4.
- **Verifikasi:** typecheck ✔ · biome ✔ · boundaries ✔ (469 modul) · test shared 250 · api 816 · web 270 + 5 dilewati. QA browser lokal ✔ (tab, 5 tab terisi, simpan & kembalikan, kolom lain utuh).
- **Insiden QA (DB lokal saja):** QA pertama menemukan dialog memakai detail view work (tanpa data pribadi) → menyimpan Kota asal **mengosongkan data pribadi "Calon Uji Oatse"** (tempat/tgl lahir, agama, status kawin, NIK, alamat, email pribadi). Dipulihkan dari PDF Print data lokal pagi ini; **No. KK & status PTKP tidak bisa dipulihkan** (tidak ada salinan). Bug diperbaiki sebelum commit (dialog memuat view full) + test regresi.
- **Masalah / catatan:** temuan agen eksplorasi: (1) persetujuan pengajuan Keluarga menghapus jenis kelamin/pendidikan/pekerjaan/almarhum semua anggota — kini anggota yang sama (hubungan + nama) diperbarui, bukan dibuat ulang; (2) `profile` di PATCH /employees diam-diam diabaikan (bug EMP-D2) — kini dibuang dari skema.
- **Berikutnya:** QA visual lokal → izin commit → rilis staging.

### 2026-10-19 — Print data jadi PDF dari template Formulir Data Karyawan; Formulir Aplikasi Word dihapus (Oatse)
- **Dikerjakan:** checklist "Print data → PDF" — renderer pdf-lib berlatar template PDF HR, `POST /employees/{id}/print`, tombol web (foto WebP → JPEG di browser), hapus Excel & seluruh Formulir Aplikasi Word/Gotenberg.
- **Keputusan:** EMP-D3; EMP-OD1 gugur.
- **Verifikasi:** typecheck ✔ · biome ✔ (tanpa warning) · boundaries ✔ (469 modul) · test shared 250 · api 812 · web 268 + 5 dilewati · QA browser lokal: PDF 3 halaman, foto tampil, tanpa tombol Formulir Aplikasi.
- **Masalah / catatan:** (1) foto profil tersimpan WebP → pdf-lib tidak bisa; diselesaikan dengan konversi di browser (sama seperti Excel lama). (2) Data Rekening di PDF kosong (Print data tidak membaca rekening) — **pemilik projek memutuskan tetap kosong** (2026-10-19). (3) Sheet arsip per kategori dari Excel lama (D-058) tidak ada di PDF.
- **Berikutnya:** ✔ rilis gel. 10 + QA staging lulus (Print data PDF berfoto, data asli). Ide: kolom alamat di tabel kontak darurat boleh 2 baris (sekarang mengecil & terpotong).

### 2026-10-19 — Arahan: Print data jadi PDF dari template, Formulir Aplikasi Word dihapus (Oatse)
- **Dikerjakan:** hanya dokumen — rencana dicatat di checklist ("Print data → PDF dari template Formulir Data Karyawan") & Backlog PROGRESS; belum ada kode.
- **Keputusan:** arahan pemilik projek: temuan poin 8 maksudnya tombol **Print data** (bukan Formulir Aplikasi) → PDF memakai template PDF yang diberikan; Formulir Aplikasi Word dihapus. EMP-OD1 akan gugur; **EMP-OD2** baru (template dinamis vs posisi tetap).
- **Verifikasi:** – (dokumen saja)
- **Masalah / catatan:** salah tafsir sebelumnya — poin 8 sempat dikerjakan pada Formulir Aplikasi (EMP-D1, tersembunyi di rilis), bukan Print data.
- **Berikutnya:** kerjakan checklist Print data PDF bila diminta.

### 2026-10-19 — Template Formulir Data Karyawan + Tambah karyawan bertahap (Oatse)
- **Dikerjakan:** template Formulir Aplikasi diganti "Formulir Data Karyawan" HR (tanpa pernyataan, daftar dokumen, tanda tangan; + kepegawaian, divisi, rekening, tabel kontak darurat); halaman Tambah karyawan 7 langkah urutan Google Form + `POST /employees` `profile` (checklist EMP-D1 sub-item, EMP-D2).
- **Keputusan:** EMP-D2 (form bertahap, simpan sekali, grant tulis per bagian, audit tanpa nilai).
- **Verifikasi:** typecheck ✔ 3 workspace · `bunx biome ci .` ✔ (1 warning lama `employee-print.test.ts`) · boundaries ✔ (473 modul) · test shared **250** · api **813** · web **294** + 5 dilewati (`--maxWorkers=4`; suite 12 worker: 5 gagal acak karena batas waktu, termasuk Backlog flaky lama); application-form 12, integration employees 38, shared profil 3, web tambah karyawan 3; PDF fiktif Gotenberg lokal 3 halaman (`QA/2026-10-19-ui-ux/contoh-fiktif-*.pdf`).
- **Masalah / catatan:** kolom "No. Sertifikasi" formulir masih memakai penyelenggara (data `certificateNumber` belum dikirim di detail); log audit menyamarkan kunci `personal`/`bank` (disengaja). QA visual Playwright lokal 11/11 (`docs/qa/runs/2026-10-19-ui-ux-lokal.md`).
- **Berikutnya:** izin commit (Formulir tetap lokal, EMP-OD1).


### 2026-10-15 — Tampilan header detail karyawan (Oatse)
- **Dikerjakan (rencana disetujui pemilik projek):** checklist "Tampilan header detail karyawan". Banner warna logo + pola statis (revisi atas masukan: celah putih di kiri banner = `border-l` panel → dihapus; pola shape ditambah; tanpa animasi), kartu header, status karyawan vs status akun dipisah (beberapa putaran masukan: dua "Aktif" membingungkan → Status Karyawan "Magang | Masih bekerja", Akses Aplikasi "Bisa login / Tidak bisa login", teks rapi tanpa badge & titik, sebab di tooltip, peran akun hanya di tab Kepegawaian; pemilik projek: "untuk sementara boleh gini"), pop-up perbesar foto profil.
- **Keputusan:** tidak ada keputusan baru (warna logo hanya token lokal halaman ini; tetap tanpa gradien sesuai tema D-035).
- **Verifikasi:** typecheck ✔ · biome ✔ (1 warning lama) · boundaries ✔ · test web **283** (`employee-detail.test.tsx` +3: status terpisah, pop-up foto & tombol kamera, tanpa foto) · build ✔ · screenshot Playwright 1440/1024/390 px terang & gelap, scroll horizontal 0, 0 error JS.
- **Masalah / catatan:** header sempat diubah Mat (template pas foto, merge `e400586`) — perubahan ini hanya tampilan di atasnya. Istilah "Akses Aplikasi" masih bisa diganti (opsi: hapus dari header / "Akun HRIS") — sementara dipertahankan.
- **Berikutnya:** ✔ commit `bfd43d0` + push; ✔ staging rilis gel. 8 (TC-STG-102 LULUS). Usulan terpisah: warna brand aplikasi mengikuti logo.


### 2026-10-16 — Formulir Aplikasi Word/PDF dari template (EMP-D1) (Oatse)
- **Dikerjakan:** purwarupa dari `Formulir_Aplikasi_PT_CAP_Rev_1.docx` (data asli satu karyawan dari staging + data fiktif; hasil di `/mnt/winD/WORK/Magang/QA/2026-10-16-docx-formulir/`), lalu tahap 1 di repo:
  - `apps/api/templates/formulir-aplikasi.docx` (template bertanda; footer "of 7" → field NUMPAGES; kontak darurat "Nama / Name : …"; foto = gambar mengambang `FOTO_KARYAWAN` di tengah sel, rasio dijaga) + `scripts/embed-templates.ts` → `src/modules/employee/application-form-template.ts` (base64).
  - `application-form.ts` (pemetaan data, isi docxtemplater, foto JPEG/PNG; WebP tidak didukung), `application-form.service.ts`, `core/pdf-convert.ts` (Gotenberg), env `GOTENBERG_URL`, route `GET /employees/{id}/application-form?format=docx|pdf`, `getEmployee(..., printFormat)` untuk audit.
  - `docker/gotenberg/` (font Liberation Sans Narrow, sha256 dicek) + layanan `gotenberg` (profil `pdf`) di `docker-compose.yml`, skrip `pdf:up`; `.env.example` + `.env` lokal `GOTENBERG_URL=http://localhost:3999`.
  - Web: `ApplicationFormButton` (PDF / Word) di header detail, saklar `FEATURES.applicationForm` (develop `true`).
- **Verifikasi:** typecheck api & web ✔ · biome berkas baru ✔ · unit `application-form.test.ts` **11/11** · integration employees `-t application-form` **3/3** (dengan Gotenberg: PDF nyata; tanpa `GOTENBERG_URL`: 422) · web `employee-detail.test.tsx` **12/12**. **Belum:** suite penuh + boundaries, QA browser `/mnt/winD/WORK/Magang/QA/2026-10-16-formulir-lokal/qa-formulir.ts` **4/4** (SA: tombol tampil, unduh PDF via Gotenberg lokal 3 halaman + Word; MANAGER tanpa tombol), 0 error JS/5xx. Putaran awal gagal karena skrip mengklik baris kerangka & saklar `applicationForm` di salinan kerja sedang `false` (diatur pemilik projek) — QA dijalankan dengan saklar dinyalakan sementara lalu berkas dikembalikan persis.
- **Verifikasi penuh:** typecheck ✔ · `biome ci` ✔ (1 warning lama) · boundaries ✔ (468) · shared 246 · api **806** · web 287 (+5 dilewati sesuai saklar salinan kerja) ✔.
- **Berikutnya:** commit lokal (izin 2026-10-16), **tidak di-push** sampai instruksi pemilik projek; tahap 2 halaman Template Dokumen; keputusan tempat Gotenberg staging/produksi.
- **Catatan:** pengambilan data Sefail (staging, view=print) tercatat di audit staging atas nama akun QA SA. Data Sefail tampak data asli → konfirmasi ke pemilik projek (memicu rotasi kredensial OD-4). `FEATURES.reports` di develop diubah pemilik projek ke `true` (belum di-commit; jangan disentuh).

### 2026-10-16 — Arahan pemilik projek setelah commit `a2ce380` (Oatse)
- **Saklar `FEATURES`:** nilai saklar di salinan kerja develop (saat ini `reports: true`, `timeManagement: false`, `applicationForm: false`) adalah pengaturan lokal pemilik projek → **jangan disentuh/di-commit** sampai ada instruksi; commit hanya membawa saklar baru milik tugas (dibuat dari HEAD).
- **Push:** `a2ce380` (+ commit lain yang belum di-push) menunggu instruksi.
- **Layanan PDF (EMP-OD1):** tempat Gotenberg staging/produksi menunggu instruksi tambahan; sementara hanya lokal (`bun run pdf:up`).
- **Data staging:** database staging akan di-reset pemilik projek (data karyawan asli yang dipakai uji formulir ikut hilang) → tidak perlu tindak lanjut sekarang; rotasi kredensial tetap wajib sebelum data asli (RELEASE §6).
- **Berikutnya (setelah instruksi):** tahap 2 halaman Template Dokumen (unggah, cek penanda, pratinjau, versi, audit); bila template baru datang (bagian kontak darurat berubah), ganti `apps/api/templates/formulir-aplikasi.docx` → `bun run templates:embed`.
