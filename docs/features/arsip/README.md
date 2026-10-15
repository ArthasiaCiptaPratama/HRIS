# Arsip karyawan & Layanan Mandiri

> **Kode prefix:** `ARS` · **Fase:** 4 · **PIC:** Oatse · **Branch:** `HRIS/Oatse/Linux-Windows` (develop) · **Saklar `FEATURES`:** `archive`, `selfService`, `assets`
> **Status:** Gel. 1a–1d ✔ develop & **✔ tampil di staging (rilis gel. 6, 2026-10-13), QA LEGIT**; gel. 2a Aset & APD **✔ tampil di staging (rilis gel. 7, 2026-10-14), QA LEGIT**; sisa: gel. 2b SP, gel. 3 Laporan, impor per kategori, OD-11

Arsip lintas karyawan (kontak, pendidikan, pelatihan, riwayat), dokumen bermasa berlaku (D-055), pengajuan perubahan data milik sendiri (D-054), ekspor & cetak (D-058); rencana aset (D-056), surat peringatan (D-057), laporan.

Dokumen fitur ini: **README** (status, checklist, keputusan) · [design.md](design.md) · [log.md](log.md). Induk: [PROGRESS](../../PROGRESS.md).

## Checklist

Legenda: `[ ]` belum · `[~]` sedang · `[x]` selesai · `[-]` dibatalkan/ditunda. Langkah baru: sub-item `(tambahan YYYY-MM-DD) alasan`.

### Fase 4 — Employee (bagian Arsip & Layanan Mandiri)
- [x] Keputusan OD-6 (ubah data sensitif milik sendiri) — saat onboarding boleh (D-046); setelah disetujui **lewat pengajuan** yang disetujui HR ber-grant (D-054, 2026-10-05)
- [x] Karyawan ubah data diri terbatas — lewat pengajuan di `/ess` (Arsip 1c, D-054; ✔ lokal 2026-10-07, staging menyusul)
 - [~] **Arsip karyawan** (D-054–D-058, desain `docs/features/arsip/design.md`; rencana disetujui lewat grill 2026-10-05) (tambahan 2026-10-05)
  - [x] Gel. 1a fondasi Arsip (tabel lintas karyawan + tab detail): Kontak, Pendidikan, Riwayat Kerja, Pelatihan (+kolom), Riwayat Jabatan (+riwayat lama & SK) — migrasi `20261005075926_add_archive_training_and_history_fields`, `GET /archive/{category}`, kelola item di detail; lokal Playwright 22/22 (`docs/qa/runs/2026-10-05-arsip-1a.md`)
  - [x] Gel. 1b dokumen: `document_types` (SA), versi, masa berlaku, cron `document-expiry`, menu Data File — migrasi `20261005083543_add_document_types_and_versions` + `20261005083749_add_document_item_links`; lampiran sertifikat/SK; lokal Playwright 19/19 (`docs/qa/runs/2026-10-05-arsip-1b.md`)
  - [x] Gel. 1c pengajuan perubahan data (ESS, OD-6/D-054): Keluarga, Bank (buku tabungan + notifikasi), dokumen — kode di-commit lokal 2026-10-05 (`ddf59d8`, `783ec81`, `1ebe808`; migrasi `20261005091041_add_data_change_requests`); desain §12.2; lokal Playwright 19/19 (`docs/qa/runs/2026-10-07-arsip-1c.md`)
    - [x] Verifikasi penuh di Linux 2026-10-07: typecheck ✔ · biome ✔ (356 file) · boundaries ✔ (301 modul) · `db:check` ✔ · test shared 140 · api 521 · web 199 ✔ · build ✔ (tambahan 2026-10-07)
    - [x] QA lokal 1c: plan/run `2026-10-07-arsip-1c`, TC-EMP-149…160, Playwright 19/19 (tambahan 2026-10-07: temuan audit dokumen)
  - [x] Gel. 1d ekspor & cetak per kategori (D-058; QA Playwright 7/7, 2026-10-08) — impor per kategori **ditunda** (keputusan pemilik projek 2026-10-08: tunggu contoh rekap Excel lama dari HR)
  - [x] Tampil di staging (tambahan 2026-10-13: permintaan pemilik projek) — saklar `archive` + `selfService` `true` di rilis `42df46e` → PR #47/#48 → `Deploy staging` #38374784477; grant `employee.changes.review` HR uji; QA staging 14/14 TC-STG-059…072 **LEGIT**, arsip Drive `hris-qa:2026-10-13-staging-arsip`
  - [x] Gel. 2a Aset & APD (ARS-D1–D6; grill 2026-10-13) — tahap A API ✔ lokal 2026-10-13; tahap B web ✔ & tahap C QA ✔ lokal 2026-10-14 (12/12); ✔ staging rilis gel. 7 (2026-10-14), QA LEGIT
    - [x] Tahap A (tambahan 2026-10-13): shared `asset.ts` + permission `asset.manage`; migrasi `20261013095006_add_asset_module` (skema `asset`, 5 tabel, unik parsial, CHECK); modul `apps/api/src/modules/asset/` (policy TDD 21, service + audit, PDF BAST, 23 path, cron `asset-daily` + `vercel.json`); `employee/index.ts` + `getEmployeeBriefs`/`listEmployeeBriefs`/`getEmployeeDocumentRef`, `iam/index.ts` + `listAssetManagers`; integration 13 skenario; PLAN §4.2/§4.3, ERD, codemap
    - [x] Tahap B (2026-10-14): web `features/assets/` — Arsip › Data Assets (tab Aset, Pembagian APD, Belum kembali; panel detail aset + riwayat), form aset (usulan kode), serah-terima, catat APD, kembali/hilang, PDF BAST + unggah scan → dokumen `BAST_ASSET`; Master Data › Aset & APD; tab Aset di detail karyawan; peringatan aset terbuka di form nonaktifkan; Layanan Mandiri › Aset saya + "Sudah saya terima"; saklar `FEATURES.assets`, `access.viewAssets/manageAssets`; test web 8 (`tests/assets.test.tsx`); smoke Playwright lokal 4 role × desktop/HP
    - [x] Tahap C (2026-10-14): QA lokal Playwright alur penuh SA → MGR/HR → EMP → SA **12/12** (TC-EMP-215…226; plan/run `2026-10-14-aset-lokal`); isi PDF BAST dicek (`pdftotext` + render); bug nomor BAST bentrok diperbaiki (`bastNumber`, test `asset-bast.test.ts`)
    - [x] Audit ulang A–C (tambahan 2026-10-14: permintaan pemilik projek): 5 temuan diperbaiki — BAST mencatat pelaku transaksi, aksi bersamaan atomik, tanggal masa depan ditolak, urutan "sudah diganti", teks dialog Serahkan; api 717, QA ulang 12/12
    - [x] Logo Arthasia di kop PDF BAST (tambahan 2026-10-14: permintaan pemilik projek) — sama dengan logo email, `bast-logo.ts`
    - [x] Rilis staging (migrasi `20261013095006_add_asset_module`, cron `asset-daily`, saklar `assets` di rilis) + QA staging + arsip Drive — 2026-10-14: rilis `219b372` (merge develop `5859111`, ikut membawa Time Management tersembunyi) → PR #49/#50 → `Deploy staging` #38509894453; QA staging TC-STG-073…087 **15/15** (putaran 2) → **LEGIT**, Drive `hris-qa:2026-10-14-staging-aset`
      - [x] (tambahan 2026-10-14) Temuan QA staging P3: PT bawaan di form Tambah aset kosong bila data master belum termuat saat dialog dibuka — diperbaiki di develop (efek PT bawaan menyusul data master; test web gagal-dulu), belum dirilis
  - [ ] Gel. 2b Surat peringatan (PDF, konfirmasi, cron)
  - [ ] Gel. 3 Laporan (10 laporan awal) — menggantikan menu Laporan "Maintenance"
  - [ ] Keputusan OD-11 (masa simpan data karyawan keluar) sebelum rilis produksi gelombang 1

## Keputusan

Isi lengkap di [decisions.md](../../decisions.md).

- [D-054](../../decisions.md#d-054) Arsip karyawan & perubahan data milik sendiri
- [D-055](../../decisions.md#d-055) Dokumen karyawan bermasa berlaku
- [D-056](../../decisions.md#d-056) Aset karyawan (rencana)
- [D-057](../../decisions.md#d-057) Surat peringatan (rencana)
- [D-058](../../decisions.md#d-058) Ekspor, impor, cetak & laporan Arsip

**Keputusan baru** (prefix `ARS-D1`, `ARS-D2`, …; tulis lengkap di sini, lalu daftarkan di indeks [PLAN §8](../../PLAN.md#8-keputusan-adr-ringkas) saat digabung ke develop):

| ID | Keputusan | Alasan / sumber |
|---|---|---|
| ARS-D1 | **Dua jenis pencatatan (melengkapi D-056):** (1) **aset per unit** — barang bernomor/berharga yang dipinjamkan & harus kembali (laptop, HP, radio HT, kendaraan, alat kerja): kode, kategori, merek/tipe, no. seri, kondisi, status, PT, lokasi; satu pemegang aktif; (2) **APD/seragam berbasis jumlah** — hanya **pembagian** (karyawan, jenis, jumlah, ukuran, tanggal, oleh siapa), **tanpa stok gudang**; jenis APD = master data. | Grill pemilik projek 2026-10-13 ("per unit + APD berbasis jumlah", "pembagian saja") |
| ARS-D2 | **BAST:** sistem membuat **PDF BAST** (kop Akselerasi Arthasia, daftar aset/APD, kondisi, pihak) untuk serah-terima, pengembalian, dan pembagian APD → dicetak & ditandatangani basah → **scan diunggah** sebagai dokumen karyawan jenis `BAST_ASSET` (D-055) dan ditautkan ke transaksinya. Tambahan: karyawan menekan **"Sudah saya terima"** di Layanan Mandiri (jejak waktu & akun) — pelengkap, bukan pengganti BAST. | Grill 2026-10-13 ("PDF otomatis + unggah scan", "lihat + konfirmasi terima") |
| ARS-D3 | **Akses:** SA semua PT; HR_ADMIN dengan grant baru **`asset.manage`** mengelola aset & APD di PT yang ditugaskan (staf GA bisa diberi akun HR + grant ini); HR tanpa grant **melihat** di PT-nya; MANAGER melihat aset & APD **tim** tanpa harga; karyawan melihat milik sendiri tanpa harga + konfirmasi terima. Grant/role dicek dari DB (D-008). | Grill 2026-10-13 ("SA + HR ber-grant asset.manage"); matriks PLAN §4.3 |
| ARS-D4 | **Kode aset** diusulkan otomatis `<KODE-PT>-<KODE-KATEGORI>-<NNNN>` (urut per PT + kategori), boleh diganti manual (label fisik lama), unik se-sistem. **Harga beli** (Decimal 15,2) & tanggal beli opsional, hanya terlihat SA & pemegang `asset.manage`. **Import Excel inventaris lama menyusul** setelah ada contoh file dari HR/GA (pola Arsip 1d). | Grill 2026-10-13 ("otomatis, boleh diganti", "harga terbatas", "input manual dulu") |
| ARS-D5 | **Jatuh tempo & masa ganti:** serah-terima boleh diberi "kembali paling lambat" (pinjaman sementara); jenis APD boleh punya **masa ganti (bulan)** dan tanda **wajib kembali**. Cron harian **`asset-daily`** menandai pinjaman terlambat & APD jatuh tempo ganti lalu mengingatkan pengelola (+ karyawan untuk pinjaman terlambat), dedupe per transaksi + ambang. | Grill 2026-10-13 ("jatuh tempo opsional + pengingat", "masa ganti per jenis + pengingat", "wajib kembali per jenis") |
| ARS-D6 | **Karyawan keluar (mengubah rencana design §6.5):** nonaktifkan **tidak diblokir**. Dialog nonaktifkan (web) memanggil API `asset` untuk menampilkan aset terbuka + APD wajib kembali (kembalikan sekarang / tandai hilang / biarkan); yang dibiarkan muncul di daftar **"Belum kembali dari karyawan keluar"** dan cron `asset-daily` memberi notifikasi ke pengelola. Modul `employee` **tidak** mengimpor `asset` (aturan `no-circular`: `asset` → `employee/index.ts` satu arah). | Grill 2026-10-13 ("peringatan + daftar tindak lanjut"); temuan rencana: pemanggilan employee→asset melanggar no-circular |
| ARS-D7 | **Surat SP = template sistem (melengkapi D-057):** PDF bawaan (kop Arthasia seperti BAST): nomor, tingkat, jenis pelanggaran, uraian, tanggal terbit & berlaku s/d, kolom tanda tangan HR, atasan, karyawan → dicetak, ditandatangani basah, **scan diunggah** sebagai dokumen `WARNING_LETTER` (D-055) dan ditautkan ke SP. Teks surat tidak bisa diedit dari aplikasi (template disetujui HR/legal sebelum produksi). | Grill pemilik projek 2026-10-14 ("Template sistem") |
| ARS-D8 | **Masa berlaku:** bawaan **6 bulan** untuk semua tingkat (PP 35/2021); angka bawaan diubah **SA** di pengaturan (bila PKB/PP berbeda); `effective_until` = tanggal terbit + N bulan, tidak diubah per surat. Cron harian menandai **Kedaluwarsa**; SP tetap tersimpan sebagai riwayat. | Grill 2026-10-14 ("6 bulan, diatur SA"; "riwayat tetap") |
| ARS-D9 | **Konfirmasi:** atasan menekan **"Sudah disampaikan"**, karyawan **"Sudah menerima"** di aplikasi (jejak waktu & akun); scan bertanda tangan opsional. SP **berlaku sejak terbit** walau belum/tidak dikonfirmasi; status Dikonfirmasi bila keduanya sudah. Pengingat konfirmasi lewat cron. | Grill 2026-10-14 ("Atasan + karyawan di aplikasi") |
| ARS-D10 | **Tingkat, pembuat & koreksi:** hanya SA / HR ber-grant **`employee.discipline.write`** (PT ditugaskan) membuat & menerbitkan; `employee.discipline.read` untuk HR yang hanya melihat. Sistem **menyarankan tingkat berikut** bila ada SP aktif; memilih tingkat lebih tinggi dari saran (mis. langsung SP3 untuk pelanggaran berat) boleh dengan **alasan wajib** (audit); SP3 menampilkan catatan "pertimbangkan proses PHK" (tidak otomatis). **Draft** bebas diubah/dihapus; SP **terbit tidak bisa diedit** — dicabut (alasan wajib, audit, status Dicabut) lalu diterbitkan ulang. | Grill 2026-10-14 ("Boleh, dengan alasan", "HR ber-grant saja", "Draft bebas, terbit hanya dicabut") |
| ARS-D11 | **Nomor surat** otomatis per PT per tahun, mis. `007/SP1/HRD-ACP/X/2026` (urut, bulan romawi); HR boleh menimpa dengan nomor manual (unik se-sistem). | Grill 2026-10-14 ("Otomatis per PT per tahun") |
| ARS-D12 | **Jenis pelanggaran = master data** (mis. Mangkir, Terlambat berulang, K3/APD, Indisipliner, Lainnya; dikelola SA & HR ber-grant `employee.discipline.write`) + uraian/kronologi bebas per SP. Untuk pelanggaran **mangkir**, HR **boleh menautkan hari ALPHA + surat pernyataan** (D-071) sebagai bukti — manual, tanpa SP/kandidat otomatis. | Grill 2026-10-14 ("Master jenis + uraian bebas", "Manual + tautan bukti") |
| ARS-D13 | **Visibilitas & notifikasi:** SA semua; HR ber-grant `discipline.read/write` semua riwayat di PT-nya; MANAGER SP **tim** (aktif + riwayat) untuk menyampaikan & konfirmasi; karyawan semua SP **miliknya**; tanpa grant = tidak terlihat. Saat terbit: notifikasi in-app + **email tanpa isi** ("ada surat untuk Anda, buka aplikasi", PROMPT §3.7) ke karyawan & atasan; cron mengingatkan konfirmasi dan menandai kedaluwarsa (tanpa email). | Grill 2026-10-14 ("Sesuai matriks, riwayat tetap", "In-app + email tanpa isi") |

## Keputusan terbuka

- [OD-6](../../decisions.md#od-6) Ubah data sensitif milik sendiri (terjawab D-054)
- [OD-11](../../decisions.md#od-11) Masa simpan data karyawan keluar

OD baru: `ARS-OD1`, … (tulis di sini + ringkasan di [PROGRESS](../../PROGRESS.md#keputusan-terbuka)).

## Kode

Detail modul: [employee](../../codemap/employee.md) · [asset](../../codemap/asset.md).

## QA

- [plans/2026-10-14-aset-lokal.md](../../qa/plans/2026-10-14-aset-lokal.md) · [runs/2026-10-14-aset-lokal.md](../../qa/runs/2026-10-14-aset-lokal.md) — Aset & APD lokal 12/12
- [plans/2026-10-13-staging-arsip.md](../../qa/plans/2026-10-13-staging-arsip.md) · [runs/2026-10-13-staging-arsip.md](../../qa/runs/2026-10-13-staging-arsip.md) — staging rilis gel. 6, **LEGIT**
- [plans/2026-10-05-arsip-1a.md](../../qa/plans/2026-10-05-arsip-1a.md)
- [runs/2026-10-05-arsip-1a.md](../../qa/runs/2026-10-05-arsip-1a.md)
- [plans/2026-10-05-arsip-1b.md](../../qa/plans/2026-10-05-arsip-1b.md)
- [runs/2026-10-05-arsip-1b.md](../../qa/runs/2026-10-05-arsip-1b.md)
- [plans/2026-10-07-arsip-1c.md](../../qa/plans/2026-10-07-arsip-1c.md)
- [runs/2026-10-07-arsip-1c.md](../../qa/runs/2026-10-07-arsip-1c.md)
- [plans/2026-10-08-arsip-1d.md](../../qa/plans/2026-10-08-arsip-1d.md)
- [runs/2026-10-08-arsip-1d.md](../../qa/runs/2026-10-08-arsip-1d.md)

Aturan & templat QA: skill `hris-qa-docs` ([docs/qa/README.md](../../qa/README.md)).
