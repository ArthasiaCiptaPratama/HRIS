# Arsip karyawan & Layanan Mandiri

> **Kode prefix:** `ARS` · **Fase:** 4 · **PIC:** Oatse · **Branch:** `HRIS/Oatse/Linux-Windows` (develop) · **Saklar `FEATURES`:** `archive`, `selfService`
> **Status:** Gel. 1a–1d ✔ develop, terpasang di staging tetapi disembunyikan saklar; sisa: aktifkan saklar di rilis, gel. 2 (Aset, SP), gel. 3 (Laporan), OD-11

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
  - [ ] Gel. 2a Aset (modul `asset`, BAST, peringatan saat nonaktif) · Gel. 2b Surat peringatan (PDF, konfirmasi, cron)
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
| – | – | – |

## Keputusan terbuka

- [OD-6](../../decisions.md#od-6) Ubah data sensitif milik sendiri (terjawab D-054)
- [OD-11](../../decisions.md#od-11) Masa simpan data karyawan keluar

OD baru: `ARS-OD1`, … (tulis di sini + ringkasan di [PROGRESS](../../PROGRESS.md#keputusan-terbuka)).

## Kode

Detail modul: [employee](../../codemap/employee.md).

## QA

- [plans/2026-10-05-arsip-1a.md](../../qa/plans/2026-10-05-arsip-1a.md)
- [runs/2026-10-05-arsip-1a.md](../../qa/runs/2026-10-05-arsip-1a.md)
- [plans/2026-10-05-arsip-1b.md](../../qa/plans/2026-10-05-arsip-1b.md)
- [runs/2026-10-05-arsip-1b.md](../../qa/runs/2026-10-05-arsip-1b.md)
- [plans/2026-10-07-arsip-1c.md](../../qa/plans/2026-10-07-arsip-1c.md)
- [runs/2026-10-07-arsip-1c.md](../../qa/runs/2026-10-07-arsip-1c.md)
- [plans/2026-10-08-arsip-1d.md](../../qa/plans/2026-10-08-arsip-1d.md)
- [runs/2026-10-08-arsip-1d.md](../../qa/runs/2026-10-08-arsip-1d.md)

Aturan & templat QA: skill `hris-qa-docs` ([docs/qa/README.md](../../qa/README.md)).
