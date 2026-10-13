# Arsip karyawan & Layanan Mandiri

> **Kode prefix:** `ARS` · **Fase:** 4 · **PIC:** Oatse · **Branch:** `HRIS/Oatse/Linux-Windows` (develop) · **Saklar `FEATURES`:** `archive`, `selfService`
> **Status:** Gel. 1a–1d ✔ develop & **✔ tampil di staging (rilis gel. 6, 2026-10-13), QA LEGIT**; sisa: gel. 2 (Aset, SP), gel. 3 (Laporan), impor per kategori, OD-11

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
  - [~] Gel. 2a Aset & APD (ARS-D1–D6; grill 2026-10-13) — tahap A API ✔ lokal 2026-10-13; tahap B web & C QA menyusul
    - [x] Tahap A (tambahan 2026-10-13): shared `asset.ts` + permission `asset.manage`; migrasi `20261013095006_add_asset_module` (skema `asset`, 5 tabel, unik parsial, CHECK); modul `apps/api/src/modules/asset/` (policy TDD 21, service + audit, PDF BAST, 23 path, cron `asset-daily` + `vercel.json`); `employee/index.ts` + `getEmployeeBriefs`/`listEmployeeBriefs`/`getEmployeeDocumentRef`, `iam/index.ts` + `listAssetManagers`; integration 13 skenario; PLAN §4.2/§4.3, ERD, codemap
    - [ ] Tahap B: web — Arsip › Data Assets (Aset, Pembagian APD, Belum kembali), Master Data › Kategori aset & Jenis APD, tab Aset di detail karyawan, Layanan Mandiri › Aset saya + konfirmasi, daftar aset di dialog nonaktifkan, saklar `FEATURES.assets`
    - [ ] Tahap C: QA lokal (Playwright) + dokumen QA
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

## Keputusan terbuka

- [OD-6](../../decisions.md#od-6) Ubah data sensitif milik sendiri (terjawab D-054)
- [OD-11](../../decisions.md#od-11) Masa simpan data karyawan keluar

OD baru: `ARS-OD1`, … (tulis di sini + ringkasan di [PROGRESS](../../PROGRESS.md#keputusan-terbuka)).

## Kode

Detail modul: [employee](../../codemap/employee.md) · [asset](../../codemap/asset.md).

## QA

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
