# Desain — Arsip Karyawan (Data Kontak … Riwayat Peringatan) & Laporan

> Keputusan: **D-054** (bentuk menu Arsip & pengajuan perubahan data — menjawab **OD-6**), **D-055** (dokumen bermasa berlaku & jenis dokumen sebagai master data), **D-056** (aset inventaris + serah-terima), **D-057** (surat peringatan/SP), **D-058** (ekspor/impor/cetak per kategori & laporan awal) di [PLAN §8](../PLAN.md#8-keputusan-adr-ringkas). Keputusan terbuka baru: **OD-11** (masa simpan data karyawan keluar).
> Status: **gelombang 1a [done] lokal 2026-10-05** (Kontak, Pendidikan, Riwayat Jabatan, Pelatihan, Riwayat Kerja: tabel lintas karyawan + kelola di detail) · **gelombang 1b [done] lokal 2026-10-05** (Data File: jenis dokumen master data, dokumen berversi & bermasa berlaku, tautan baca singkat, lampiran sertifikat/SK, cron `document-expiry`; catatan implementasi §12.1) · **gelombang 1c [done] lokal 2026-10-05, QA lokal 19/19 2026-10-07** (pengajuan perubahan data diri lewat ESS, antrean HR `/pengajuan-data`, Arsip Keluarga & Bank, buku tabungan; kode di-commit, verifikasi penuh & QA lokal ✔ 2026-10-07; catatan §12.2). Gelombang lain: **RENCANA** (hasil grill pemilik projek 2026-10-05). Checklist: PROGRESS Fase 4 → "Arsip karyawan".
> Dokumen ini tidak memuat data asli. Contoh nama/nomor fiktif.

## 1. Tujuan & prinsip

1. Setiap menu Arsip = **satu kategori data karyawan** yang bisa (a) direkap **lintas karyawan** (tabel, cari, filter PT/unit/status, ekspor) dan (b) dikelola **per karyawan** di tab yang sama pada detail karyawan. **Satu sumber data, dua pintu.**
2. **Tidak ada data ganda**: tabel yang sudah ada dipakai ulang (`family_members`, `educations`, `trainings`, `employee_bank_accounts`, `employee_documents`, `work_experiences`, `employment_histories`, kolom kontak di `employees`/`employee_personal`). Tabel baru hanya untuk hal yang belum ada: jenis dokumen, versi & masa berlaku dokumen, pengajuan perubahan data, aset, surat peringatan, riwayat jabatan lama.
3. **Karyawan tidak mengubah data resmi langsung** setelah disetujui: lewat **pengajuan** (Layanan Mandiri/ESS) yang diverifikasi HR (menjawab OD-6). Pengecualian yang sudah ada di PLAN §4.3 tetap: no. HP, domisili, kontak darurat, foto boleh langsung.
4. Aturan akses PLAN §4 berlaku penuh (cakupan PT D-040, grant, audit, data sensitif tidak pernah ke log/email, bucket private + URL bertanda tangan).
5. Praktik industri HRIS (core HR + document compliance) dipakai sebagai acuan: masa berlaku sertifikat & pengingat, maker-checker untuk rekening, SP dengan masa berlaku, serah-terima aset saat keluar.

## 2. Ringkasan keputusan grill (2026-10-05)

| Topik | Keputusan |
|---|---|
| Bentuk menu | Tabel lintas karyawan + tab di detail karyawan |
| OD-6 | Perubahan data milik sendiri setelah disetujui **lewat pengajuan**, HR ber-grant menyetujui; kontak non-sensitif langsung |
| Urutan | Gelombang 1: data yang tabelnya sudah ada → Gelombang 2: Aset & SP → Gelombang 3: Laporan |
| Ekspor/impor/cetak | Ketiganya, praktik terbaik (lihat §9) |
| Aset | Inventaris + serah-terima (BAST), peringatan saat karyawan keluar |
| File/dokumen | Jenis dokumen dikelola SA, masa berlaku + pengingat, versi, karyawan unggah lewat pengajuan |
| SP | HR terbitkan, atasan & karyawan konfirmasi, berlaku 6 bulan (PP 35/2021, kecuali PKB/PP perusahaan), surat PDF dari template |
| Rekening | Pengajuan + lampiran buku tabungan + notifikasi ke karyawan setiap perubahan |
| Riwayat jabatan | Otomatis dari sistem + input riwayat lama (sebelum HRIS) dengan no. SK & lampiran |
| Pelatihan | Bisa melampirkan sertifikat yang tercatat di Data File (ikut pengingat kedaluwarsa) |
| Laporan | Headcount & turnover, dokumen/sertifikat kedaluwarsa, kontrak & SP aktif, kelengkapan data (+ tambahan §10) |
| Retensi | Simpan, akses dibatasi, tinjau berkala; masa simpan → **OD-11** |

## 3. Katalog menu Arsip

| Menu (`/personal/arsip/<slug>`) | Isi | Sumber data | Sensitif? | Siapa ubah | Gel. |
|---|---|---|---|---|---|
| **Data Kontak** (`kontak`) | No. HP, email kantor, email pribadi, alamat domisili, kontak darurat (nama, hubungan, telepon) | `employees` (+ `employee_personal.domicile_address`) | Alamat = sensitif (PLAN §4.2); lainnya data kerja | HR; karyawan langsung untuk HP/domisili/kontak darurat | 1 |
| **Data Keluarga** (`keluarga`) | Pasangan, anak, orang tua: nama, hubungan, tgl lahir (umur dihitung), telepon, alamat, tanggungan PTKP | `family_members` | Ya (`employee.personal.*`) | HR+grant; karyawan via pengajuan | 1 |
| **Data Pendidikan** (`pendidikan`) | Jenjang, sekolah, jurusan, tahun lulus, lampiran ijazah | `educations` (+ dokumen `DIPLOMA`) | Tidak (data kerja) | HR; karyawan via pengajuan | 1 |
| **Riwayat Jabatan** (`riwayat-jabatan`) | Masuk, mutasi, promosi, demosi, rotasi, pindah PT, ubah status, nonaktif/aktif; no. SK + lampiran | `employment_histories` (+ kolom baru, §6.4) | Tidak | Otomatis; HR input riwayat lama/koreksi | 1 |
| **Data Pelatihan** (`pelatihan`) | Nama pelatihan, penyelenggara, internal/eksternal, tanggal, jam, biaya (opsional), sertifikat (berlaku s/d) | `trainings` (+ kolom baru) + dokumen `CERTIFICATE` | Tidak (biaya = data kerja SA/HR) | HR; karyawan via pengajuan | 1 |
| **Data Riwayat Kerja** (`riwayat-kerja`) | Perusahaan sebelumnya, jabatan, tahun mulai–selesai, keterangan | `work_experiences` | Tidak | HR; karyawan via pengajuan | 1 |
| **Data File** (`file`) | Semua dokumen per jenis, versi, masa berlaku, status verifikasi; filter "akan/sudah kedaluwarsa" | `employee_documents` (+ `document_types`, versi) | Ya (`employee.documents.*`) | HR+grant; karyawan via pengajuan (unggah) | 1 |
| **Data Bank** (`bank`) | Bank, no. rekening (disamarkan kecuali berhak), nama pemilik, buku tabungan, riwayat perubahan | `employee_bank_accounts` (+ riwayat via pengajuan/audit) | Ya (`employee.bank.*`) | HR+grant (notifikasi ke karyawan); karyawan via pengajuan wajib buku tabungan | 1 |
| **Data Assets** (`aset`) | Inventaris (kode, kategori, merek/tipe, no. seri, kondisi, lokasi/site, PT) & riwayat serah-terima per karyawan | Modul baru `asset` (§6.5) | Tidak | SA/HR (grant `asset.manage`) | 2 |
| **Riwayat Peringatan** (`peringatan`) | SP1/SP2/SP3: pelanggaran, tanggal terbit, berlaku s/d, status konfirmasi, surat PDF | `warning_letters` (§6.6) | Ya (disiplin) | HR+grant `employee.discipline.write` | 2 |
| **Laporan** (`/personal/laporan`) | Rekap & grafik (§10) | Agregat dari tabel di atas | Agregat tanpa data per orang kecuali laporan rinci ber-akses | SA/HR | 3 |

## 4. Katalog jenis dokumen (master data `document_types`, dikelola SA)

Nilai awal (seed). Kolom: **wajib** (U = semua karyawan, S = karyawan site/operasional, J = jabatan tertentu), **berlaku** (punya tanggal kedaluwarsa), **unggah** (K = karyawan via pengajuan, H = HR), **sensitif** (butuh grant `employee.documents.read`).

| Kode | Nama | Wajib | Berlaku | Unggah | Catatan |
|---|---|---|---|---|---|
| `KTP` | KTP | U | – | K/H | Sudah ada di onboarding |
| `KK` | Kartu Keluarga | U | – | K/H | |
| `NPWP` | NPWP | – | – | K/H | "Belum punya" di onboarding |
| `BPJS_TK` | Kartu BPJS Ketenagakerjaan | – | – | H | |
| `BPJS_KES` | Kartu BPJS Kesehatan | – | – | H | |
| `DIPLOMA` | Ijazah terakhir | U | – | K/H | Terhubung ke Data Pendidikan |
| `TRANSCRIPT` | Transkrip nilai | – | – | K/H | |
| `CV` | Daftar riwayat hidup | – | – | K | |
| `PHOTO_FORMAL` | Pas foto formal | – | – | K | Berbeda dari foto profil |
| `BANK_BOOK` | Buku tabungan / bukti rekening | U | – | K/H | Wajib untuk pengajuan rekening |
| `SKCK` | SKCK | – | ✓ (umumnya 6 bln) | K/H | |
| `MCU` | Hasil Medical Check-Up | S | ✓ (1 thn) | H | Fit to work (K3 tambang) |
| `SIM` | SIM A/B/C | J | ✓ | K/H | Operator/driver |
| `SIMPER` | SIMPER (izin mengemudi di area tambang) | J | ✓ | H | Diterbitkan perusahaan/KTT |
| `SIO` | Surat Izin Operator (Kemnaker) | J | ✓ | K/H | Operator alat berat |
| `CERT_K3` | Sertifikat Ahli K3 Umum | J | ✓ | K/H | |
| `CERT_POP` | Sertifikat Pengawas Operasional Pertama (POP) | J | ✓ | K/H | Pengawas tambang |
| `CERT_POM` | Sertifikat Pengawas Operasional Madya (POM) | J | ✓ | K/H | |
| `CERT_POU` | Sertifikat Pengawas Operasional Utama (POU) | J | ✓ | K/H | KTT/wakil |
| `CERT_OTHER` | Sertifikat pelatihan lain | – | opsional | K/H | Dari Data Pelatihan |
| `CONTRACT` | Perjanjian kerja (PKWT/PKWTT) | U | ✓ (PKWT) | H | Modul Kontrak (Fase 7) |
| `DECREE` | SK (pengangkatan/mutasi/promosi) | – | – | H | Dari Riwayat Jabatan |
| `WARNING_LETTER` | Surat Peringatan | – | ✓ (6 bln) | sistem/H | Dari Riwayat Peringatan |
| `BAST_ASSET` | Berita Acara Serah Terima aset | – | – | H | Dari Data Assets |
| `RESIGN_LETTER` | Surat pengunduran diri / PHK | – | – | H | Saat nonaktif |
| `OTHER` | Lainnya | – | opsional | H | |

Atribut jenis dokumen: `code`, `name`, `category` (identitas, pendidikan, kompetensi/sertifikat, kesehatan, kepegawaian, keuangan, lainnya), `has_expiry`, `default_validity_months`, `reminder_days` (bawaan `[60, 30, 7]`), `required_scope` (none / all / site / positions[]), `employee_can_upload`, `sensitive`, `max_size_mb` (bawaan 5), `allowed_mime` (pdf/jpg/png), `archived`.

## 5. Arsitektur

- **Modul**: semua data Arsip milik modul **`employee`** (sudah memiliki tabelnya), kecuali **Aset** = modul baru **`asset`** (skema Postgres `asset`; FK ke `employee` diperbolehkan karena modul inti, PLAN §3.2). SP di modul `employee` (sub-domain disiplin) — bisa diekstrak nanti.
- **API per kategori** (pola sama untuk setiap menu):
  - `GET /archive/<kategori>?q=&companyId=&departmentId=&status=&page=&pageSize=&sort=` — tabel lintas karyawan (paginasi server, cakupan PT, kolom sensitif dihilangkan bila tidak berhak).
  - `GET|POST|PATCH|DELETE /employees/{id}/<kategori>[/{itemId}]` — kelola per karyawan (tab detail).
  - `GET /archive/<kategori>/export?…` — ekspor (§9), `POST /archive/<kategori>/import/preview|commit` — impor (mesin D-042).
- **Layer**: routes → policy (matriks §8) → service (aturan, transaksi, audit, notifikasi) → repository. Modul lain hanya lewat `index.ts`.
- **Web**: `features/archive/` — satu halaman generik berbasis konfigurasi kolom per kategori (mirip `MasterDataPage`), memakai `DataTable` + filter; tab detail karyawan memakai komponen form yang sama.
- **Penyimpanan file**: bucket private `employee-documents` (sudah ada), path `prefix/<employeeId>/<docTypeCode>/<uuid>.<ext>`, URL baca bertanda tangan ≤ 10 menit, unggah lewat signed upload URL (pola D-037/D-045 b). Surat SP & BAST yang dihasilkan sistem juga disimpan di bucket ini.
- **Cron baru** (Vercel Cron, CODEMAP §7): `document-expiry` (harian: pengingat kedaluwarsa, dedupe per dokumen+ambang), `warning-letter-expiry` (harian: SP lewat masa berlaku → EXPIRED). Batas Vercel Hobby (cron harian) cukup.

## 6. Desain database (rencana; semua migrasi **hanya menambah**, pola expand → contract)

### 6.1 Jenis & versi dokumen
```
employee.document_types (id, code UNIQUE, name, category, has_expiry, default_validity_months,
  reminder_days int[], required_scope enum, required_position_ids uuid[], employee_can_upload,
  sensitive, max_size_mb, allowed_mime text[], created_at, updated_at, deleted_at)
employee.employee_documents  + document_type_id (FK document_types; backfill dari enum `type`)
  + document_number varchar(60) null, issued_at date null, expires_at date null,
  + version int default 1, is_current bool default true, replaces_id uuid null (FK self),
  + status enum(PENDING_REVIEW, VERIFIED, REJECTED) default VERIFIED, verified_by uuid null, verified_at,
  + note varchar(500) null
  INDEX (employee_id, document_type_id, is_current), INDEX (expires_at) WHERE is_current
```
Kolom enum `type` lama dipertahankan sampai semua pembaca pindah (contract di rilis berikutnya).

### 6.2 Pengajuan perubahan data (ESS, menjawab OD-6)
```
employee.data_change_requests (id, employee_id FK, section enum(CONTACT, PERSONAL, FAMILY, EDUCATION,
  TRAINING, WORK_EXPERIENCE, BANK, DOCUMENT), action enum(CREATE, UPDATE, DELETE), target_id uuid null,
  payload jsonb (nilai baru; divalidasi skema Zod per section), attachment_document_ids uuid[],
  status enum(PENDING, APPROVED, REJECTED, CANCELLED), submitted_by uuid, submitted_at,
  decided_by uuid null, decided_at null, decision_note varchar(500) null, applied_at null,
  created_at, updated_at)
  INDEX (status, submitted_at), INDEX (employee_id, status)
```
`payload` bisa berisi data sensitif → hanya dibaca reviewer ber-grant section terkait; tidak pernah ditulis ke log/audit (audit hanya nama field). Disetujui = diterapkan dalam satu transaksi + riwayat (audit before/after nama field).

### 6.3 Pelatihan
`trainings` + `type` enum(INTERNAL, EXTERNAL), `start_date`, `end_date`, `hours` smallint, `cost` Decimal(15,2) null, `certificate_document_id` uuid null (FK employee_documents). `training_year` lama tetap (diisi dari `start_date`).

### 6.4 Riwayat jabatan
`employment_histories` + `source` enum(SYSTEM, MANUAL) default SYSTEM, `movement_type` enum(PROMOTION, MUTATION, DEMOTION, ROTATION, OTHER) null, `decree_number` varchar(60) null, `decree_document_id` uuid null, `from_department_id`/`to_department_id` uuid null, `corrected_by_id` uuid null (koreksi = baris baru yang menandai baris lama, bukan edit). Nilai `EmploymentChangeType` baru: `MOVED` (mutasi unit tanpa ganti jabatan).

### 6.5 Aset (modul `asset`)
```
asset.asset_categories (id, name UNIQUE, requires_serial bool, created_at, updated_at, deleted_at)
asset.assets (id, code UNIQUE, category_id FK, name, brand, model, serial_number null UNIQUE,
  company_id FK organization.companies, work_location_id FK null, condition enum(GOOD, FAIR, DAMAGED),
  status enum(AVAILABLE, ASSIGNED, MAINTENANCE, LOST, RETIRED), purchase_date date null,
  note varchar(500) null, created_at, updated_at, deleted_at)
asset.asset_assignments (id, asset_id FK, employee_id FK employee.employees, assigned_at date,
  due_back_at date null, returned_at date null, condition_out, condition_in null,
  handover_document_id uuid null, return_document_id uuid null, assigned_by uuid, returned_by uuid null,
  note varchar(500) null, created_at)
  UNIQUE (asset_id) WHERE returned_at IS NULL   -- satu pemegang aktif per aset (index parsial, SQL mentah)
```
Saat karyawan dinonaktifkan: `employee` memanggil `asset.index.ts#openAssignmentsOf(employeeId)` → dialog nonaktifkan menampilkan daftar aset belum kembali (peringatan, tidak memblokir; pilihan "tandai hilang").

### 6.6 Surat peringatan
```
employee.warning_letters (id, employee_id FK, level enum(SP1, SP2, SP3), letter_number varchar(60) UNIQUE,
  violation varchar(200), description text, issued_date date, effective_until date,
  status enum(DRAFT, ISSUED, ACKNOWLEDGED, EXPIRED, REVOKED), previous_letter_id uuid null,
  issued_by uuid, manager_ack_by uuid null, manager_ack_at null, employee_ack_at null,
  revoked_reason varchar(500) null, letter_document_id uuid null, created_at, updated_at)
  INDEX (employee_id, status), INDEX (effective_until) WHERE status IN ('ISSUED','ACKNOWLEDGED')
```
Aturan: `effective_until` bawaan = `issued_date + 6 bulan` (pengaturan sistem, bisa diubah SA bila PKB/PP berbeda); SP baru menyarankan tingkat berikut bila masih ada SP aktif; SP3 → saran proses PHK (catatan, bukan otomatis).

### 6.7 Lain-lain
- Izin baru (PLAN §4.2): `employee.discipline.read`, `employee.discipline.write`, `asset.manage`, `employee.changes.review` (menyetujui pengajuan data non-sensitif; section sensitif tetap butuh grant `personal/bank/documents.write`).
- Audit: `employee.<kategori>.<aksi>`, `employee.change_request.{submit,approve,reject,cancel}`, `employee.archive.export` (kategori, filter, jumlah baris), `asset.*`, `employee.warning_letter.*`.

## 7. Alur data

### 7.1 Pengajuan perubahan data (ESS)
```
Karyawan (Layanan Mandiri)          API                                   HR (Arsip › Pengajuan)
1 Isi form section (mis. Keluarga) → POST /me/change-requests  ─────────▶ notifikasi in-app + email (tanpa nilai)
  + lampiran (unggah dokumen         (validasi Zod per section,
    status PENDING_REVIEW)            simpan payload, audit nama field)
                                                                          2 Buka: nilai lama vs baru, lampiran
                                                                          3 Setujui → terapkan (1 transaksi),
                                                                            dokumen → VERIFIED, riwayat & audit
                                                                            atau Tolak (catatan)
4 Notifikasi hasil ◀──────────────────────────────────────────────────────┘
```
Rekening: wajib lampiran `BANK_BOOK`; setelah diterapkan email ke email pribadi & kantor "Rekening Anda diubah" (tanpa nomor) — deteksi penipuan.

### 7.2 Dokumen & kedaluwarsa
Unggah (HR langsung = VERIFIED; karyawan = PENDING_REVIEW) → versi lama `is_current=false` (tetap bisa dilihat) → cron `document-expiry` mengirim pengingat ke karyawan & HR ber-grant di PT terkait pada ambang `reminder_days` (dedupe) → daftar "akan/sudah kedaluwarsa" di Data File & Laporan.

### 7.3 Surat peringatan
HR buat DRAFT → terbitkan (nomor, PDF dari template, `effective_until`) → notifikasi atasan & karyawan → atasan konfirmasi "sudah disampaikan" & karyawan konfirmasi "sudah menerima" (status ACKNOWLEDGED) → cron menandai EXPIRED setelah lewat masa berlaku → HR bisa REVOKE (alasan, audit).

### 7.4 Aset
Daftarkan aset → serahkan ke karyawan (kondisi, BAST PDF terunggah/terbuat) → kembalikan (kondisi masuk, BAST kembali) atau tandai hilang/rusak → riwayat per aset & per karyawan. Nonaktifkan karyawan → peringatan aset terbuka.

## 8. Keamanan & akses (matriks rencana)

| Menu / aksi | SA | HR | MANAGER | EMPLOYEE |
|---|---|---|---|---|
| Tabel lintas karyawan (data kerja: kontak kerja, pendidikan, pelatihan, riwayat kerja/jabatan) | ✅ | ✅ PT ditugaskan | 👁 tim (kolom kerja) | ❌ |
| Keluarga, alamat, data pribadi | ✅ | 🔑 `employee.personal.read/write` | 🔑 tim | 👁 sendiri; ubah via pengajuan |
| Rekening | ✅ | 🔑 `employee.bank.read/write` | 🔑 tim | 👁 sendiri (disamarkan); ubah via pengajuan + buku tabungan |
| Dokumen | ✅ | 🔑 `employee.documents.read/write` | 🔑 tim | ✅ sendiri; unggah via pengajuan |
| Setujui pengajuan | ✅ | 🔑 `employee.changes.review` + grant section sensitif | ❌ | ❌ |
| Aset | ✅ | 🔑 `asset.manage` | 👁 tim | 👁 aset sendiri |
| SP | ✅ | 🔑 `employee.discipline.read/write` | 👁 tim + konfirmasi | 👁 sendiri + konfirmasi |
| Ekspor kategori | ✅ | ✅ (kolom sensitif hanya bila ber-grant) | ❌ | ❌ |
| Impor kategori | ✅ | ✅ PT sendiri (kolom sensitif butuh `*.write`) | ❌ | ❌ |
| Laporan | ✅ | ✅ PT ditugaskan | ❌ | ❌ |

Prinsip: respons disaring di API (field sensitif dihilangkan, bukan disembunyikan di UI); setiap baca data sensitif diaudit (pola `employee.sensitive.read`); email/notifikasi hanya nama section, tanpa nilai; file hanya lewat URL bertanda tangan singkat; MIME & ukuran dicek ulang di server setelah unggah (pola D-037); nama file asli tidak dipakai sebagai path.

## 9. Ekspor, impor, cetak (praktik terbaik)

| Fitur | Aturan |
|---|---|
| **Ekspor Excel** | Mengikuti filter aktif; dibuat di server (streaming, maks 10.000 baris), tidak disimpan; kolom sensitif hanya bila aktor berhak; NIK/rekening disamarkan kecuali grant; audit `employee.archive.export` (kategori, filter, jumlah baris); nama file `arsip-<kategori>-<PT>-<tanggal>.xlsx`. |
| **Impor massal** | Mesin D-042 (`@hris/shared/import`): file diurai di browser, pemetaan kolom, pratinjau per baris, `previewHash` mengunci commit, laporan baris bermasalah (.xlsx), file tidak disimpan; mode CREATE_ONLY/UPSERT per kunci (mis. keluarga: nomor induk + nama + hubungan); kolom sensitif butuh grant `*.write`; templat dummy per kategori di `public/template/`. |
| **Cetak per karyawan** | Print data (.xlsx, D-035) ditambah sheet per kategori Arsip yang boleh dilihat aktor; audit `employee.printed` (sudah ada). |

## 10. Laporan awal (`/personal/laporan`)

1. **Headcount & turnover** — jumlah aktif per PT/unit/lokasi/status/level per periode, masuk/keluar, turnover % = keluar ÷ rata-rata headcount, alasan keluar.
2. **Masa kerja** — distribusi masa kerja, jubilee (5/10/15 tahun) bulan ini.
3. **Demografi** — usia, gender, pendidikan, kota asal (agregat; tanpa data per orang).
4. **Dokumen & sertifikat kedaluwarsa** — ≤ 30/60/90 hari & sudah lewat, per site/jenis (rinci per orang hanya SA/HR ber-grant dokumen).
5. **Kontrak & SP aktif** — PKWT akan habis (setelah modul Kontrak Fase 7) + SP yang masih berlaku per unit.
6. **Kelengkapan data** — karyawan dengan data wajib kosong (NPWP/BPJS/rekening/dokumen wajib per jenis) per PT.
7. **Mutasi & promosi** — rekap riwayat jabatan per periode.
8. **Ulang tahun** karyawan bulan ini (nama + tanggal saja).
9. **Aset** — aset per status/lokasi, aset belum kembali dari karyawan keluar.
10. **Pengajuan perubahan data** — antrean & waktu proses rata-rata.

Semua laporan: filter PT/unit/periode, grafik (ECharts yang sudah dipakai dashboard) + tabel, ekspor Excel (aturan §9).

## 11. Retensi (OD-11)

Data karyawan keluar **disimpan** (kewajiban ketenagakerjaan & pajak), akses dibatasi SA/HR ber-grant, ditandai "arsip" di semua tabel. Usulan untuk diputuskan bersama HR/legal (OD-11): masa simpan dokumen kepegawaian & pajak 10 tahun setelah keluar (sejalan kewajiban penyimpanan dokumen perpajakan), dokumen identitas/kesehatan 5 tahun, lalu anonimisasi/hapus terjadwal (cron) dengan laporan sebelum eksekusi. Sebelum OD-11 diputuskan: **tidak ada penghapusan otomatis**.

## 12. Rencana bertahap

| Gel. | Paket | Isi | Perkiraan |
|---|---|---|---|
| 1a | Fondasi Arsip | halaman generik + API tabel lintas karyawan + tab detail; Data Kontak, Pendidikan, Riwayat Kerja, Pelatihan (+kolom baru), Riwayat Jabatan (+input lama & SK) | 2–3 sesi |
| 1b | Dokumen | `document_types` (master data SA) + versi + masa berlaku + cron `document-expiry` + Data File | 2 sesi |
| 1c | Pengajuan (OD-6) | `data_change_requests` + ESS form + antrean HR; Keluarga, Bank (buku tabungan + notifikasi), dokumen | 2–3 sesi |
| 1d | Ekspor/impor/cetak | ekspor server per kategori, impor (mesin D-042), sheet cetak | 1–2 sesi |
| 2a | Aset | modul `asset`, inventaris, serah-terima, BAST, peringatan saat nonaktif | 2 sesi |
| 2b | SP | `warning_letters`, PDF template, konfirmasi, cron masa berlaku | 2 sesi |
| 3 | Laporan | 10 laporan §10 + ekspor | 2–3 sesi |

### 12.1 Catatan implementasi gelombang 1b (2026-10-05)

- **Jenis tunggal vs jamak** (`multiple`): jenis tunggal (KTP, SIMPER, MCU, …) — unggahan baru otomatis menjadi versi baru & versi lama `is_current=false`; jenis jamak (SIM, sertifikat lain, SK, SP, kontrak, BAST, lainnya) — unggahan baru berdiri sendiri, versi baru lewat "Unggah versi baru" pada dokumen tertentu (`replaces_id`).
- **Sensitif** (katalog awal): KTP, KK, NPWP, BPJS TK/Kes, SKCK, MCU, kontrak, SP, surat resign/PHK, buku tabungan. Jenis biasa terbaca dalam cakupan lihat karyawan (HR PT, MANAGER tim); jenis sensitif butuh grant `employee.documents.read` (SA & pemilik selalu); tulis jenis sensitif butuh `employee.documents.write`. Membuka file sensitif diaudit `employee.sensitive.read` (tanpa isi).
- **Masa berlaku**: tanggal kedaluwarsa wajib bila jenis `has_expiry`; terisi otomatis dari tanggal terbit + `default_validity_months`. Lencana & filter "Akan kedaluwarsa" memakai ambang tetap 60 hari (`EXPIRY_WARN_DAYS`); pengingat memakai `reminder_days` per jenis + sekali "sudah kedaluwarsa" (≤ 30 hari setelahnya). Penerima pengingat: karyawan (akun aktif) + HR PT terkait (sensitif: HR ber-grant), tanpa HR → SA.
- **Hapus** satu versi = hapus file di Storage + baris ditandai `deleted_at`; bila versi aktif, versi sebelumnya aktif kembali. Hapus jenis dokumen hanya bila belum pernah dipakai & bukan padanan wizard onboarding (`legacy_type`) — selain itu arsipkan.
- **Lampiran**: `employee_documents.training_id` (sertifikat: K3, POP, POM, POU, SIO, sertifikat lain) & `history_id` (SK) — item dihapus → tautan dilepas, dokumen tetap.
- **Belum**: unggah oleh karyawan (`employee_can_upload`, status `PENDING_REVIEW`) menunggu gelombang 1c (pengajuan); laporan kelengkapan dokumen (`required_scope`) di gelombang 3; kolom enum lama `type` dilepas (contract) setelah semua pembaca pindah.

### 12.2 Catatan implementasi gelombang 1c (2026-10-05)

- **Bagian pengajuan**: Data pribadi (tanpa nama & jenis kelamin — diubah HR lewat data kerja), Kontak darurat, Data keluarga, Rekening bank (wajib lampiran buku tabungan), Dokumen (jenis yang `employee_can_upload`). Skema isian memakai skema bagian wizard onboarding agar aturan format sama.
- **Satu pengajuan menunggu** per karyawan per bagian (index unik parsial; Dokumen boleh beberapa sekaligus). Pemilik dapat membatalkan selama `PENDING`.
- **Keputusan**: SA atau HR ber-grant `employee.changes.review` dalam cakupan PT; bagian sensitif tetap butuh grant bagian itu. Pemilik tidak memeriksa pengajuannya sendiri (403); di luar cakupan → 404. Setuju = perubahan diterapkan dalam satu transaksi, nilai lama disimpan di `previous`; dokumen berlampiran menjadi versi aktif terverifikasi; tolak = lampiran dibuang dari Storage.
- **Notifikasi & email** hanya menyebut nama bagian, tanpa isi data (PROMPT §3.7). Semua aksi diaudit `employee.data_change.*`.
- **Arsip Keluarga & Bank**: tabel lintas karyawan sensitif, hanya SA / pemegang grant baca; setiap pembacaan diaudit. Buku tabungan tampil di tab Rekening detail karyawan.
- **Verifikasi (2026-10-07, Linux):** typecheck, biome, boundaries, `db:check`, test shared 140 · api 521 · web 199, build ✔; QA lokal Playwright 19/19 (`docs/qa/runs/2026-10-07-arsip-1c.md`). Staging menyusul (tidak dirilis).

Setiap paket: migrasi tambah-saja, policy TDD (matriks §8), integration test (sukses/400/401/403/404 cakupan PT), web test, QA lokal + staging, dokumen QA, arsip Drive bila LEGIT. Fase 5 Time Management bisa disisipkan di antara gelombang sesuai prioritas pemilik projek.

## 13. Risiko & catatan

- `payload` pengajuan berisi data sensitif dalam jsonb → wajib penyaringan akses ketat & tidak ikut log/audit; pertimbangkan enkripsi kolom saat produksi (OD-4/hardening).
- Kedaluwarsa sertifikat tambang (SIMPER/SIO/POP) berdampak kepatuhan K3 → pengingat harus andal (dedupe, retry email_outbox).
- Pengecualian kontak non-sensitif (PLAN §4.3) tetap langsung; batas antara "kontak" dan "alamat" (sensitif) harus jelas di UI.
- Impor massal dokumen (file) **tidak** didukung (hanya metadata); unggah file satu per satu atau zip di versi berikutnya.
- Template surat SP & BAST perlu disetujui HR/legal sebelum dipakai.
