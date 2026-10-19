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
 - [x] **Tampilan header detail karyawan** (tambahan 2026-10-15: permintaan pemilik projek "lebih tersusun, menarik, rapih"; susunan & data header tidak diubah): pita banner warna logo Arthasia (hijau tua + garis oranye, pola statis dari logo: garis cakrawala, tetesan api, titik, watermark; tanpa gradien & tanpa animasi), header dalam kartu, nama & NIP lebih menonjol, label kolom kanan lebih ramping, garis tab aktif hijau daun; token `--logo-green/--logo-leaf/--logo-orange` di `index.css` (hanya halaman ini, `--brand` aplikasi tetap teal); **Status Karyawan** (kategori + aktif) dan **Status Karyawan** teks "kategori | Masih bekerja / Sudah keluar · alasan" dan **Akses Aplikasi** "Bisa login / Tidak bisa login" (sebab di tooltip; rincian & peran di tab Kepegawaian › Akun login) — tanpa badge/titik, tanpa dua "Aktif" dipisah; **klik foto → pop-up foto besar** (`EmployeePhotoControl` `zoomable`; tombol kamera tetap untuk ganti foto; tanpa foto tidak bisa diklik); garis tepi kiri panel dihapus (tampak sebagai celah putih di banner). Test web +3, screenshot `/mnt/winD/WORK/Magang/QA/2026-10-15-ui-detail-karyawan/`; ✔ staging rilis gel. 8 (TC-STG-102)
 - [x] Riwayat kepegawaian menampilkan pengubah: nama, role, lokasi kerja (`changedBy` di `GET /employees/:id`, `iam.getAccountSummaries`) (tambahan 2026-09-29: permintaan pemilik projek)
 - [x] **Print data**: tombol di detail pegawai (SA/HR) → `GET /employees/:id?view=print` (audit `employee.printed`, data pribadi hanya bila berhak, rekening tidak dibaca) → template `public/template/Template-excel.xlsx` diisi & diunduh (.xlsx) (tambahan 2026-09-29: permintaan pemilik projek; keputusan: satu pegawai per file dari detail, periode = tgl masuk s/d tgl keluar)
 - [-] **Formulir Aplikasi Word/PDF** (EMP-D1 — **dihapus 2026-10-19**, digantikan Print data PDF EMP-D3), tambahan 2026-10-16: permintaan pemilik projek) — fitur **lokal** (saklar `FEATURES.applicationForm`; tombol Print data .xlsx tetap): template Word bertanda `apps/api/templates/formulir-aplikasi.docx` (disematkan base64, `bun run templates:embed`) → `GET /employees/:id/application-form?format=docx|pdf` (SA/HR, audit `employee.printed` format docx/pdf) → PDF lewat Gotenberg (`GOTENBERG_URL`, lokal `bun run pdf:up`). ✔ API + web + test + QA lokal 4/4; ⏳ tahap 2 halaman Template Dokumen (unggah/periksa/pratinjau/versi); ⏳ keputusan tempat Gotenberg staging/produksi
  - [x] Template diganti **"Formulir Data Karyawan"** dari HR (tambahan 2026-10-19: temuan pemilik projek poin 8): bagian pernyataan, daftar "Dokumen yg harus dilengkapi", tanggal & tanda tangan Pelamar dihapus; isian baru Data Kepegawaian (departemen, divisi = unit Divisi di atasnya, jabatan, tanggal masuk), Data Rekening, tabel kontak darurat 2 baris; footer "of N" otomatis. Skrip penanda `QA/2026-10-19-ui-ux/tag-formulir-data-karyawan.py`; contoh fiktif Word/PDF di folder yang sama; test 12
 - [~] **Tambah karyawan bertahap seperti Google Form** (EMP-D2, tambahan 2026-10-19: temuan pemilik projek poin 7) — halaman `/personal/tambah-karyawan` (7 langkah: Data kepegawaian → Data pribadi & alamat → Kontak darurat → Keluarga → Rekening → Pendidikan & sertifikasi → Ringkasan), `POST /employees` + `profile` opsional (satu transaksi), bagian pribadi/keluarga & rekening terkunci tanpa grant tulis; dialog lama tetap untuk Ubah data. ✔ API + web + test + QA lokal (Q-08, `docs/qa/runs/2026-10-19-ui-ux-lokal.md`) · ✔ staging gel. 9, QA staging LEGIT (sampai Ringkasan, tanpa simpan)
 - [x] **Print data → PDF dari template "Formulir Data Karyawan"** (tambahan 2026-10-19: arahan pemilik projek; EMP-D3) — ✔ staging gel. 10
  - [x] API `employee-form-pdf.ts`: template PDF HR (`templates/formulir-data-karyawan.pdf`, disematkan `templates:embed`) sebagai latar, isian di koordinat sel (Data Pribadi + pas foto, Keluarga, Kepegawaian + divisi, Rekening, Kontak darurat 2 baris, Pendidikan, Sertifikasi dengan nomor sertifikat); huruf mengecil/dipotong "..."; baris tetap (anak 5, saudara 5, pendidikan 3, sertifikasi 11; lebih → "+n lainnya"); pernyataan, daftar dokumen, tanggal & tanda tangan Pelamar ditutup; footer "Page x of 3"; titik dua NPWP ditambahkan
  - [x] Route `POST /employees/{id}/print` (body opsional `photoBase64` JPEG/PNG dari browser — foto profil tersimpan WebP); hak akses & audit `employee.printed` {format: pdf}
  - [x] Web: tombol "Print data" → foto WebP diubah JPEG (`imageUrlToJpeg`) → unduh PDF; pengisi Excel (`print.ts`, `lib/xlsx-template.ts`, `public/template/Template-excel.xlsx`, test `employee-print.test.ts`; uji foto dipindah ke `image.test.ts`) dihapus (dependency web `fflate` tetap: dipakai script template import)
  - [x] Formulir Aplikasi Word (EMP-D1) dihapus: tombol, endpoint `/application-form`, template docx, `core/pdf-convert.ts`, saklar `applicationForm`, env `GOTENBERG_URL`, layanan `gotenberg` docker-compose & `docker/gotenberg/`, script `pdf:up`, dependency `docxtemplater`/`pizzip`
  - [x] Test: unit `employee-form.test.ts` 10 (isi tergambar, "+n lainnya", potong teks, foto PNG/WebP, template = sumber), integration `employees.test.ts` (print PDF + audit, tanpa grant, foto browser, 401/403/400, rute lama 404), web `employee-detail.test.tsx`; QA browser lokal: unduh PDF 3 halaman berfoto (`/mnt/winD/WORK/Magang/QA/2026-10-19-print-pdf/`)
  - [x] Rilis staging ✔ gel. 10 (Deploy #39213066393); QA staging: unduh PDF 3 halaman data asli + foto, tanpa tombol Formulir Aplikasi, 0 error (bukti lokal `/mnt/winD/WORK/Magang/QA/2026-10-19-staging-gel10/`, tidak diunggah: berisi data asli)
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
| EMP-D3 | **Print data = PDF dari template PDF HR** "Formulir Data Karyawan" (menggantikan Excel `Template-excel.xlsx` dan Formulir Aplikasi Word EMP-D1): template PDF jadi latar, isian ditulis pdf-lib di koordinat tetap (tanpa LibreOffice/Gotenberg → jalan di Vercel); bagian pernyataan/daftar dokumen/tanda tangan Pelamar ditutup; foto profil (WebP) diubah JPEG di browser lalu dikirim ke `POST /employees/{id}/print`. Konsekuensi: ganti desain formulir = ukur ulang koordinat di kode (EMP-OD2); sheet arsip per kategori di Excel Print data lama (D-058) tidak ada lagi — data arsip diekspor lewat menu Arsip. EMP-OD1 gugur. **Data Rekening tetap tidak dicetak** (Print data tidak membaca rekening; pemilik projek 2026-10-19: "Tetap kosong"). | Pemilik projek 2026-10-19 ("template excel nya diganti jadi pdf", hapus Formulir Aplikasi Word) |
| EMP-D2 | **Tambah karyawan manual = form bertahap mengikuti Google Form** (D-059/D-061): halaman penuh 7 langkah; hanya data kepegawaian yang wajib, sisanya opsional; disimpan **sekali di akhir** lewat `POST /employees` + `profile` `{ personal, family[], educations[], certifications[], bank }` dalam satu transaksi (skema bersama `employeeProfileInputSchema`, aturan sama dengan Import: NIK/KK 16 digit, NPWP 15/16, SIM per jenis, gol. darah baku). Bagian pribadi/keluarga butuh `employee.personal.write`, rekening `employee.bank.write` (SA selalu boleh) — tanpa grant langkahnya terkunci dan API 403. Audit `employee.employee.create` mencatat bagian yang diisi (jumlah baris), bukan nilainya. Dokumen/lampiran tetap lewat tab Dokumen setelah disimpan. | Pemilik projek 2026-10-19 (pilih "Form bertahap lengkap") |
| EMP-D1 | **Formulir Aplikasi dari template Word**: template `.docx` kantor diberi penanda docxtemplater (`{fullName}`, `{#children}…{/children}`, gambar `FOTO_KARYAWAN`), diisi di API, PDF dikonversi **Gotenberg (LibreOffice headless)** sebagai layanan terpisah (LibreOffice tidak bisa di fungsi Vercel; pdf-lib tidak membaca .docx). Font Arial Narrow template diganti Liberation Sans Narrow (metrik sama) di image Gotenberg. Tahap 1 = template tersemat di kode; tahap 2 = halaman pengelolaan template (unggah, cek penanda, pratinjau, versi, audit). Fitur lokal dulu (saklar rilis `false`), tombol Print data .xlsx tetap. | Pemilik projek 2026-10-16 (purwarupa disetujui; pilih tahap 1) |

## Keputusan terbuka

| ID | Pertanyaan | Memblokir | Status |
|---|---|---|---|
| EMP-OD1 | Di mana layanan konversi PDF (Gotenberg/LibreOffice) dijalankan untuk staging & produksi? | Rilis Formulir Aplikasi (EMP-D1) | **Gugur** 2026-10-19 → EMP-D3 (PDF tanpa layanan konversi) |
| EMP-OD2 | **Template dinamis**: Print data PDF (dan surat lain) memakai posisi isian tetap di kode, atau dibuat aplikasi/halaman Template Dokumen supaya HR bisa mengganti desain formulir sendiri (unggah, cek penanda, pratinjau, versi)? | Penggantian desain formulir oleh HR tanpa developer | Menunggu instruksi pemilik projek (2026-10-19; sementara: posisi tetap di kode) |

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
