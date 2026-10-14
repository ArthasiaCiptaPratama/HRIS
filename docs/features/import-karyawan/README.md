# Import data karyawan

> **Kode prefix:** `IMP` · **Fase:** 4 · **PIC:** Oatse · **Branch:** `HRIS/Oatse/Linux-Windows` (develop) · **Saklar `FEATURES`:** –
> **Status:** ✔ staging (rilis gel. 2–4.1); arsip QA Drive lengkap

Import CSV/Excel (D-042) dengan pratinjau & laporan error, pendataan dari Google Form (D-059, 171 kolom D-061), lampiran Google Drive (D-060), NIP opsional & penyesuaian nilai Form (D-062–D-064).

Dokumen fitur ini: **README** (status, checklist, keputusan) · [design.md](design.md) · [design-google-form.md](design-google-form.md) · [log.md](log.md). Induk: [PROGRESS](../../PROGRESS.md).

## Dokumen desain

- [design.md](design.md) — D-042 (lokal, §10 penyempurnaan): desain import CSV/Excel (profil file kantor, mesin deteksi, API, data, UI, test)
- [design-google-form.md](design-google-form.md) — D-059/D-060: pendataan karyawan existing dari Google Form lewat Import (panduan HR, judul pertanyaan yang disarankan, bagian berulang, lampiran Google Drive + penyiapan service account)

## Checklist

Legenda: `[ ]` belum · `[~]` sedang · `[x]` selesai · `[-]` dibatalkan/ditunda. Langkah baru: sub-item `(tambahan YYYY-MM-DD) alasan`.

### Fase 4 — Employee (bagian Import)
- [x] Import CSV/Excel (template, validasi per baris, laporan error) — desain D-042 `docs/features/import-karyawan/design.md` (Tahap 4) — selesai & teruji **lokal** 2026-09-30 (`docs/qa/runs/2026-09-30-import-karyawan.md`); ✔ staging 2026-09-30 (PR #29/#30), dengan PT 2026-10-05 (gel. 1), Form Google lengkap + lampiran Drive + Form 171 kolom 2026-10-08 (gel. 2)
  - [x] File contoh berisi data asli dipindah ke luar repo (`/mnt/winD/WORK/Magang/DATA-ASLI/`) + penjaga `.gitignore` (tambahan 2026-09-30: Tahap 0, PROMPT §3.7)
  - [x] Template import dummy berstruktur sama: `apps/web/scripts/generate-import-template.ts` → `public/template/Template-import-karyawan.xlsx` (header 37 kolom identik file kantor, dicek openpyxl) (tambahan 2026-09-30: Tahap 0)
  - [x] Kolom baru D-041 (BPJS TK/Kes, PTKP, kota asal, kontak darurat, jenjang pendidikan) + migrasi `20260930102336_add_import_and_employee_details` (rilis; versi lokal `20260930090116` dihapus 2026-10-01); tampil di detail, kontak darurat di form (tambahan 2026-09-30)
  - [x] Mesin deteksi `@hris/shared/import` (sheet, header, pemetaan, normalizer) + test (shared 63) (tambahan 2026-09-30)
  - [x] API preview/commit + `import_jobs`/`import_job_issues`/`import_mappings` + policy & test akses (import 11 integration; tambahan 2026-09-30)
  - [x] Web: stepper import `/personal/import` (Unggah → Pemetaan → Pratinjau → Selesai), tombol **Import** di setiap halaman Data Karyawan Aktif + menu Pengelolaan Karyawan (tambahan 2026-09-30) — web 6 test, Playwright 13/13
  - [x] Rilis ke staging **tanpa** multi-PT (PR #29/#30, 2026-09-30, `docs/qa/runs/2026-09-30-rilis-import.md`)
  - [x] Rilis import **dengan** PT (bagian antrean #2, `4441206`) — staging 2026-10-05 (PR #33/#34) + seed CD2
 - [x] **Pendataan karyawan existing dari Google Form lewat Import** (D-059, grill pemilik projek 2026-10-07; desain `docs/features/import-karyawan/design-google-form.md`) (tambahan 2026-10-07)
  - [x] Import: field email pribadi, nama panggilan, kebangsaan, suku, gol. darah, jenis & no. SIM (migrasi `20261007100618_add_employee_personal_form_fields`, `personal-fields.ts`) + deteksi Sheet respons Form (kolom tautan/keluarga/akun Google, NIK dari judul, header ganda) + "Sudah Menikah"; ekspor Sheet sungguhan 24 kolom terpetakan; QA `2026-10-07-import-form` Playwright 4/4
  - [-] Jalur otomatis Apps Script → API (antrean review, Kelola Form, token, tunnel) — dibangun & diuji lokal lalu **dihapus total** (keputusan pemilik projek 2026-10-07: terlalu banyak komponen untuk proses manual); tunnel/DNS `hris-dev-api.arthasia.id`, project Apps Script di Form, dan bukti QA ikut dihapus
  - [x] Import lengkap semua bagian Form: keluarga (+ kolom jenis kelamin, tempat lahir, pendidikan, pekerjaan, usia, alamat kerja), riwayat pendidikan 1–3 (+ tahun masuk), sertifikasi → Pelatihan + nomor, kontak darurat (+ alamat), No. SIM per jenis; impor ulang = tambah yang belum ada; dropdown berkelompok; tampilan detail (migrasi `20261007102154_add_form_family_education_training_fields`; ekspor Sheet 119/138 kolom; QA Playwright 8/8) (tambahan 2026-10-07)
  - [x] File di Drive (foto & dokumen) → **Lampiran Google Drive di Import** (D-060, keputusan pemilik projek 2026-10-08: di dalam Import lewat service account, impor ulang dengan sidik jari; script rclone yang sempat dibuat dihapus) — migrasi `20261008031553_add_import_job_attachments`, QA Playwright 7/7 (tambahan 2026-10-07)
  - [x] **Import Form versi 171 kolom** (D-061; tambahan 2026-10-08: Form direvisi di tengah pengisian, file hasil akhir 171 kolom tidak terbaca utuh) — judul pertanyaan & kolom kembar digabung, rincian alamat (teks; kode wilayah → Backlog), kontak darurat 2, status saudara, pekerjaan anak, file SIM A/C, Divisi persis (D-050), SIM tanpa masa berlaku; migrasi `20261008085810_add_form_v2_address_emergency2_relation`; QA lokal 8/8 · ✔ staging 2026-10-08 (QA 10/10 + lampiran asli 8/8; perbaikan profil pemetaan `f092efe`)
  - [x] **Import: status kepegawaian bawaan & per baris + pemetaan kolom tanpa lag** (D-062; tambahan 2026-10-09: laporan pemilik projek — uji `dummy_data(1).csv` 171 kolom: halaman tersendat & "Status karyawan wajib untuk karyawan baru") — kode + test ditulis di Windows 2026-10-09; **diverifikasi di Linux 2026-10-09**: typecheck ✔ · biome ✔ (3 file dirapikan formatter; 1 warning lama `employee-print.test.ts`) · boundaries ✔ (317 modul) · test shared 176 · api 550 · web 213 ✔; uji browser pemilik projek (`dummy_data.csv`): status bawaan & per baris tampil, tanpa error status (error tersisa = Divisi tidak cocok master data → D-064); QA Playwright menyusul bersama D-063/D-064
  - [x] **Import data Form asli: NIP boleh kosong + cocokkan unit organisasi + normalisasi + PT di Pratinjau** (D-063/D-064; tambahan 2026-10-09: uji xlsx respons Form asli — 6/9 tanpa NIP, Divisi/Departemen tidak konsisten, typo & placeholder `_`, NIK 15 digit, PT harus kembali ke awal) — kode + test ✔ lokal 2026-10-09 (typecheck ✔ · biome ✔ · boundaries ✔ · `db:check` ✔ · test shared 192 · api 559 · web 192 ✔ + 1 flaky lama); simulasi pratinjau xlsx asli tanpa tulis ✔; uji browser pemilik projek ✔ ("udah oke", 2026-10-09)
  - [x] **Import: tampilan proses lampiran Drive & import ulang lebih rapi** (tambahan 2026-10-12: laporan pemilik projek — layar lebar berantakan, progres lampiran minim, "Import file lain" diam-diam menghentikan unduhan) — panel lampiran (persen, 4 kartu status, "Sedang diproses", tabel "Perlu dicek" bisa dilipat), langkah Selesai 2 kolom + status jujur ("Data karyawan tersimpan" / stepper "Memproses lampiran"), konfirmasi jeda sebelum import file lain (opsi A pemilik projek), lampiran tertunda di langkah Unggah = kartu ringkas + lembar samping, indikator baca file di area unggah — kode + test ✔ lokal (typecheck ✔ · biome ✔ (1 warning lama) · boundaries ✔ · test shared 200 · web 203 ✔); dicoba pemilik projek ✔ ("i like it", 2026-10-12); QA `TC-EMP-207`
  - [x] **Lampiran Drive: "Tidak dapat terhubung ke server" padahal proses berjalan** (tambahan 2026-10-12: laporan pemilik projek, screenshot 81/95) — akar masalah: Bun lokal menutup koneksi diam > ±10 dtk, satu panggilan proses ±20–25 dtk → browser `NS_ERROR_NET_RESET` padahal server selesai 200. Perbaikan (rencana disetujui setelah kajian praktik industri): `BUDGET_MS` 20 → 8 dtk, coba ulang otomatis gangguan sementara (maks. 4×, backoff eksponensial + jitter), entry `apps/api/src/server.ts` (`idleTimeout` 60) untuk dev/start/Docker; Vercel tidak terdampak (function, bukan `Bun.serve`) — QA `TC-EMP-208`
  - [x] **BUG-003: panel lampiran macet saat koneksi menggantung** (tambahan 2026-10-12: ditemukan uji staging gel. 4) — `PROCESS_TIMEOUT` 60 dtk + test (web 206 ✔), Playwright lokal 8/8 · ✔ staging rilis 4.1 8/8 (coba ulang ±67 dtk); arsip QA `2026-10-12-lampiran-ui`
    - [x] **Alur Pratinjau disederhanakan** (tambahan 2026-10-09: pemilik projek — Pratinjau terlalu banyak blok, Cocokkan unit membingungkan, pesan baris panjang, memuat ulang mengganggu; minta tombol "?" panduan): langkah baru **Lengkapi data** (Unggah → Pemetaan → Lengkapi data → Pratinjau; dilewati bila tidak ada pilihan wajib) berisi 3 kartu bernomor PT / Unit organisasi / Status + opsional jabatan-grade-lokasi baru, lanjut terkunci sampai selesai; unit: yang perlu dipilih di atas, cocok & baru = ringkasan + "Ubah"; Pratinjau = ringkasan + "Pengaturan … Ubah" + tabel (filter Error otomatis, petunjuk 💡 per error, peringatan dilipat); pratinjau ulang tanpa mengosongkan layar (indikator "Memperbarui…", hasil lama tidak menimpa yang baru); tombol **"?" Panduan** (5 langkah + ilustrasi mini, langkah aktif ditandai) — kode + test web ✔ (typecheck · biome · boundaries · test web 194 ✔ + 1 flaky lama); uji browser pemilik projek ✔ ("sudah oke"); commit lokal 2026-10-09 (izin, tanpa push); **uji dengan xlsx Form asli dilakukan di staging setelah rilis** (keputusan pemilik projek)
    - [x] **Review & perbaikan alur Import** (tambahan 2026-10-09: review kode + UI browser dummy oleh agen atas permintaan pemilik projek; bukti `/mnt/winD/WORK/Magang/QA/2026-10-09-import-review/`): unit dicocokkan **per PT** (api `employee-import-units.ts`, unit baru milik PT + akhiran kode bila bentrok), daftar unit satu tabel urutan tetap + label Perlu dipilih/Sudah ada/Unit baru + Jenis & "Di bawah" selalu terlihat + filter "Hanya yang perlu dipilih", kartu PT dari kolom file (`companySource`), pesan Pratinjau dibungkus + "Perbaikan:", Pratinjau dibuka di "Semua" (urutan baris file + keterangan jumlah error & tautan "Lihat baris error saja", keterangan PT & status bisa diubah di tabel), langkah Unggah hanya Mode, tombol "Lanjut", "Kembali" Pratinjau → Lengkapi data, bilah aksi menempel ("n bagian lagi perlu diselesaikan"), teks lugas tanpa emoji/tanda pisah panjang, label "Nama (NIP belum ada)" di audit & notifikasi — typecheck · biome · boundaries ✔ · test shared 192 · api 561 · web 194 ✔ + 1 flaky lama; review UI ulang desktop & HP ✔ (urutan tetap, tanpa error konsol); uji browser pemilik projek ✔ ("sudah oke"); commit lokal 2026-10-09 (izin, tanpa push); **uji dengan xlsx Form asli dilakukan di staging setelah rilis** (keputusan pemilik projek)
  - [x] **Rilis gel. 2 ke staging** (tambahan 2026-10-08: permintaan pemilik projek — hanya Import & Struktur Organisasi ditampilkan): saklar `FEATURES.onboarding/archive/selfService` (D-043), PR #35–#38, `Deploy staging` #37762327378 & #37764701481, env `GOOGLE_SERVICE_ACCOUNT_JSON` staging, data staging = struktur organisasi + pemegang pos + akun uji; QA staging 10/10 + lampiran file asli 8/8 (data uji dihapus)

## Keputusan

Isi lengkap di [decisions.md](../../decisions.md).

- [D-022](../../decisions.md#d-022) Import CSV/Excel karyawan & saldo cuti
- [D-042](../../decisions.md#d-042) Import karyawan CSV/Excel
- [D-059](../../decisions.md#d-059) Pendataan karyawan existing dari Google Form
- [D-060](../../decisions.md#d-060) Lampiran Google Drive di Import
- [D-061](../../decisions.md#d-061) Import Form versi 171 kolom
- [D-062](../../decisions.md#d-062) Status kepegawaian bawaan & per baris di Import
- [D-063](../../decisions.md#d-063) NIP boleh kosong
- [D-064](../../decisions.md#d-064) Penyesuaian nilai Form saat Import

**Keputusan baru** (prefix `IMP-D1`, `IMP-D2`, …; tulis lengkap di sini, lalu daftarkan di indeks [PLAN §8](../../PLAN.md#8-keputusan-adr-ringkas) saat digabung ke develop):

| ID | Keputusan | Alasan / sumber |
|---|---|---|
| – | – | – |

## Keputusan terbuka

Tidak ada.

OD baru: `IMP-OD1`, … (tulis di sini + ringkasan di [PROGRESS](../../PROGRESS.md#keputusan-terbuka)).

## Kode

Detail modul: [employee](../../codemap/employee.md).

## QA

- [plans/2026-09-30-import-karyawan.md](../../qa/plans/2026-09-30-import-karyawan.md)
- [runs/2026-09-30-import-karyawan.md](../../qa/runs/2026-09-30-import-karyawan.md)
- [plans/2026-09-30-rilis-import.md](../../qa/plans/2026-09-30-rilis-import.md)
- [runs/2026-09-30-rilis-import.md](../../qa/runs/2026-09-30-rilis-import.md)
- [plans/2026-10-07-import-form.md](../../qa/plans/2026-10-07-import-form.md)
- [runs/2026-10-07-import-form.md](../../qa/runs/2026-10-07-import-form.md)
- [plans/2026-10-08-import-form-v2.md](../../qa/plans/2026-10-08-import-form-v2.md)
- [runs/2026-10-08-import-form-v2.md](../../qa/runs/2026-10-08-import-form-v2.md)
- [plans/2026-10-08-lampiran-drive.md](../../qa/plans/2026-10-08-lampiran-drive.md)
- [runs/2026-10-08-lampiran-drive.md](../../qa/runs/2026-10-08-lampiran-drive.md)
- [plans/2026-10-12-import-lengkapi.md](../../qa/plans/2026-10-12-import-lengkapi.md)
- [runs/2026-10-12-import-lengkapi.md](../../qa/runs/2026-10-12-import-lengkapi.md)
- [plans/2026-10-12-lampiran-ui.md](../../qa/plans/2026-10-12-lampiran-ui.md)
- [runs/2026-10-12-lampiran-ui.md](../../qa/runs/2026-10-12-lampiran-ui.md)
- [plans/2026-10-12-istilah-nip.md](../../qa/plans/2026-10-12-istilah-nip.md)
- [runs/2026-10-12-istilah-nip.md](../../qa/runs/2026-10-12-istilah-nip.md)
- [bugs/BUG-003-lampiran-macet-koneksi-menggantung.md](../../qa/bugs/BUG-003-lampiran-macet-koneksi-menggantung.md)

Aturan & templat QA: skill `hris-qa-docs` ([docs/qa/README.md](../../qa/README.md)).
