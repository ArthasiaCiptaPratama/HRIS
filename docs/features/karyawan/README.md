# Karyawan — Personal Management

> **Kode prefix:** `EMP` · **Fase:** 4 · **PIC:** Oatse · **Branch:** `HRIS/Oatse/Linux-Windows` (develop) · **Saklar `FEATURES`:** `changeStatus`
> **Status:** Berjalan — ✔ staging (daftar, detail, form, ubah status, foto, print, multi-PT)

Data karyawan aktif per kategori, detail layar penuh bertab, tambah/ubah, ubah status & nonaktif/aktifkan, riwayat, foto profil (D-037), Print data, data sensitif ber-grant.

Dokumen fitur ini: **README** (status, checklist, keputusan) · [log.md](log.md). Induk: [PROGRESS](../../PROGRESS.md).

## Checklist

Legenda: `[ ]` belum · `[~]` sedang · `[x]` selesai · `[-]` dibatalkan/ditunda. Langkah baru: sub-item `(tambahan YYYY-MM-DD) alasan`.

### Fase 4 — Employee (bagian Personal Management)
- [~] Skema + migrasi + seed dummy (NIK/NPWP fiktif berformat valid) — tabel ERD + seed dummy ✔; `employment_histories` + `exit_reason` (migrasi `20260929020000_employee_categories_and_histories`, D-035) ✔, seed 21 karyawan (2 nonaktif) + riwayat ✔; `import_jobs` (+ `import_job_issues`, `import_mappings`, `import_job_attachments`; D-042/D-060) ✔; dokumen `document_types` + `employee_documents` berversi (D-055, Arsip 1b) ✔ lokal & staging (2026-10-08, disembunyikan saklar `archive` kecuali tab Dokumen)
- [x] CRUD karyawan + filter, pencarian, paginasi — `GET/POST/PATCH /employees`, filter kategori/departemen/lokasi/aktif, `q`, sort whitelist, paginasi ≤ 100; "hapus" = nonaktifkan (arsip, PLAN §4.5); 20 integration test (D-035)
 - [x] Ubah status kepegawaian, nonaktifkan (alasan + tanggal efektif; akun login ikut nonaktif), aktifkan kembali; riwayat + audit (tambahan 2026-09-29: D-035 menu b–d)
 - [x] `GET /employees/summary` (badge jumlah per kategori) & `GET /org-structure` (tambahan 2026-09-29: D-035)
- [x] `manager_id` + validasi (harus MANAGER/SUPER_ADMIN) — akun aktif MANAGER/SA, bukan diri sendiri, tanpa siklus; `GET /employees/manager-options`
- [~] Data sensitif & rekening dengan grant (HR: semua, MANAGER: tim) — **baca** ✔ (key dihilangkan bila tidak berhak, audit `employee.sensitive.read`, `view=work` need-to-know); tulis lewat pengajuan yang disetujui (D-054, Arsip 1c ✔ lokal 2026-10-07)
- [x] Dokumen (signed upload URL), kontak darurat, riwayat — dokumen & riwayat kerja lewat wizard onboarding (D-045 b) ✔; kelola dokumen oleh HR (tab Dokumen, Data File, D-055) & menu Arsip 1a–1d ✔ lokal; di staging 2026-10-08 tab Dokumen tampil, menu Arsip disembunyikan saklar `archive`; kontak darurat 1–2 (D-059/D-061) ✔
- [x] Policy + test — matriks employee 45 test (TDD) ✔ untuk aksi D-035; + cakupan PT (D-040), import (D-042), onboarding (D-045/D-047), Arsip (D-054), Dokumen (D-055), pengajuan perubahan data (OD-6) di `employee.policy.test.ts`; aksi berikutnya (Aset/SP) ikut gelombangnya
- [~] Web: daftar, detail, form, import — daftar per kategori, panel detail bertab, form tambah/ubah, Ubah Status, Pengaktifan, Pegawai Tidak Aktif ✔ (D-035); import ✔ staging (D-042, Form D-059–D-061 2026-10-08)
 - [x] Menu **Ubah Status Karyawan** aktif (`FEATURES.changeStatus`); pemilih karyawan menampilkan nomor induk; test b–e mengikuti `FEATURES` (tambahan 2026-09-30: Tahap 1 / A, permintaan pemilik projek) — web 84 + 1 dilewati, Playwright lokal 15/15 + staging `c30ef30` 9/9 (`docs/qa/runs/2026-09-30-menu-be.md`)
  - [x] Aktifkan Pengaktifan Karyawan, Data Karyawan Tidak Aktif, Struktur Organisasi — `FEATURES` `true` (keputusan pemilik projek 2026-10-05), aktif di staging sejak rilis gel. 1 (Deploy #37253110211)
 - [x] Web: shell navigasi baru (top nav kelompok besar → sidebar kelompok kecil/isi, drawer mobile, breadcrumb, Ctrl+K, lazy route + prefetch), Dashboard kosong, halaman Maintenance untuk Arsip (f–o) & Laporan (p) (tambahan 2026-09-29: D-035)
 - [x] Web: panel detail pegawai **layar penuh**, avatar besar di tengah atas, baris tab sticky, tombol "← Kembali" di kiri atas (menggantikan X) (tambahan 2026-09-29: permintaan pemilik projek)
 - [x] Riwayat kepegawaian menampilkan pengubah: nama, role, lokasi kerja (`changedBy` di `GET /employees/:id`, `iam.getAccountSummaries`) (tambahan 2026-09-29: permintaan pemilik projek)
 - [x] **Print data**: tombol di detail pegawai (SA/HR) → `GET /employees/:id?view=print` (audit `employee.printed`, data pribadi hanya bila berhak, rekening tidak dibaca) → template `public/template/Template-excel.xlsx` diisi & diunduh (.xlsx) (tambahan 2026-09-29: permintaan pemilik projek; keputusan: satu pegawai per file dari detail, periode = tgl masuk s/d tgl keluar)
 - [x] **Foto profil** (D-037): kolom `photo_path` (migrasi `20260929100000_add_employee_photo`), bucket private `employee-photos` (script `storage:setup`, staging ✔), API upload-url/konfirmasi/hapus + `photoUrl` bertanda tangan, web unggah/ganti/hapus di detail (SA/HR) & Profil (diri sendiri), foto 3:4 ikut ter-print di bingkai formulir (tambahan 2026-09-29: permintaan pemilik projek)
  - [x] Path foto memakai `STORAGE_PATH_PREFIX` (lokal `dev/<nama>/`, staging/produksi kosong; format divalidasi `env.ts`; konfirmasi menolak path lingkungan lain) (tambahan 2026-09-30: temuan audit, PLAN §3.3) — ENV 2 + FOTO 2 test; `.env` lokal pemilik projek = `dev/oatse/`
 - [x] Sidebar Data Karyawan Aktif dikelompokkan: Semua Karyawan Aktif · Karyawan Internal (Tetap, Percobaan, PKWT, Pekerja Harian, Semua) · Program Magang (Magang) · Tenaga Kerja Eksternal (Outsourcing, Vendor, Semua); seksi Pengelolaan Karyawan; API `?group=`; istilah "Karyawan" di Personal Management; slug lama dialihkan (tambahan 2026-09-30: D-038, permintaan pemilik projek) — api 272 · web 82, Playwright lokal 19/19 + staging `1da5e2d` 19/19 setelah seed ulang master data staging (`docs/qa/runs/2026-09-30-grup-kategori.md`)

## Keputusan

Isi lengkap di [decisions.md](../../decisions.md).

- [D-026](../../decisions.md#d-026) ERD employee management jadi model data
- [D-035](../../decisions.md#d-035) Personal Management web lebih awal
- [D-037](../../decisions.md#d-037) Foto profil pegawai
- [D-038](../../decisions.md#d-038) Kategori & pengelompokan Data Karyawan Aktif
- [D-041](../../decisions.md#d-041) Kolom data karyawan tambahan

**Keputusan baru** (prefix `EMP-D1`, `EMP-D2`, …; tulis lengkap di sini, lalu daftarkan di indeks [PLAN §8](../../PLAN.md#8-keputusan-adr-ringkas) saat digabung ke develop):

| ID | Keputusan | Alasan / sumber |
|---|---|---|
| – | – | – |

## Keputusan terbuka

Tidak ada.

OD baru: `EMP-OD1`, … (tulis di sini + ringkasan di [PROGRESS](../../PROGRESS.md#keputusan-terbuka)).

## Kode

Detail modul: [employee](../../codemap/employee.md).

## QA

- [plans/2026-09-29-personal-management.md](../../qa/plans/2026-09-29-personal-management.md)
- [runs/2026-09-29-personal-management.md](../../qa/runs/2026-09-29-personal-management.md)
- [plans/2026-09-29-detail-print.md](../../qa/plans/2026-09-29-detail-print.md)
- [runs/2026-09-29-detail-print.md](../../qa/runs/2026-09-29-detail-print.md)
- [plans/2026-09-29-foto-profil.md](../../qa/plans/2026-09-29-foto-profil.md)
- [runs/2026-09-29-foto-profil.md](../../qa/runs/2026-09-29-foto-profil.md)
- [plans/2026-09-30-grup-kategori.md](../../qa/plans/2026-09-30-grup-kategori.md)
- [runs/2026-09-30-grup-kategori.md](../../qa/runs/2026-09-30-grup-kategori.md)
- [plans/2026-09-30-menu-be.md](../../qa/plans/2026-09-30-menu-be.md)
- [runs/2026-09-30-menu-be.md](../../qa/runs/2026-09-30-menu-be.md)
- [runs/2026-09-30-audit-ui.md](../../qa/runs/2026-09-30-audit-ui.md)
- [cases/employee.md](../../qa/cases/employee.md)

Aturan & templat QA: skill `hris-qa-docs` ([docs/qa/README.md](../../qa/README.md)).
