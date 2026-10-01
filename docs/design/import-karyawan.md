# Desain — Import Data Karyawan (CSV/Excel)

> Keputusan: **D-042** (import), **D-039** (multi-perusahaan), **D-040** (akses per PT), **D-041** (kolom tambahan) di [PLAN §8](../PLAN.md#8-keputusan-adr-ringkas).
> Status: **[done]** — dirilis ke staging 2026-09-30 **tanpa** multi-perusahaan (migrasi `20260930102336`); versi **dengan** PT (D-039/D-040, `import_jobs.company_id` di migrasi `20261001100000`) ada di develop, menunggu rilis (antrean PROGRESS §2). Penyempurnaan saat implementasi: §10. Checklist: PROGRESS Fase 4.
> Dokumen ini **tidak memuat nilai data asli**. Profil file contoh di §2 hanya struktur & pola.

## 1. Tujuan & prinsip

1. HR/SA mengunggah file master data karyawan **apa adanya** (format kantor, bukan format khusus HRIS); sistem **membaca sendiri** struktur & isinya.
2. Pengguna selalu **melihat dan bisa mengoreksi** hasil tebakan sistem sebelum ada yang ditulis (pemetaan kolom, master data baru, diff).
3. **Server tidak pernah memercayai browser**: setiap baris dinormalisasi & divalidasi ulang di API dengan fungsi yang sama (`@hris/shared`).
4. **File tidak disimpan** (UU PDP); yang tersimpan hanya jejak import tanpa nilai sensitif.
5. Aturan akses PLAN §4 berlaku penuh: cakupan PT (D-040), grant untuk kolom sensitif (§4.2), audit (§4.5).

## 2. Profil file contoh (struktur saja)

File kantor "MASTER DATA KARYAWAN PT. …" (asli disimpan di luar repo: `/mnt/winD/WORK/Magang/DATA-ASLI/`).

| Aspek | Temuan | Konsekuensi desain |
|---|---|---|
| Sheet | 1 sheet (`ACP`), dimensi tercatat 1.220 kolom, **37 kolom berisi** | Buang kolom/baris kosong di ujung; pilih sheet dengan skor data tertinggi |
| Baris 1–4 | kosong, **judul** (baris 2), baris **"Control"** berisi formula `=(COUNTA(..)/..)` dan `#REF!` (baris 4) | Deteksi baris header, jangan asumsikan baris 1 |
| Baris 5 | **Header**, sebagian multi-baris (`STATUS MASA\nKONTRAK KARYAWAN`, `PERUSAHAAN\n(PNR / RCE / …)`) | Normalisasi header (newline, spasi ganda, isi kurung) |
| Baris 6+ | 43 baris data; baris bernomor formula `=ROW()-5` tanpa nama sampai baris 60 | Baris tanpa nilai literal (hanya formula) = kosong |
| Baris tersembunyi | 10 baris (baris resign) | Baris tersembunyi tetap dibaca, diberi tanda |
| Kolom formula | NO, LAMA KERJA, USIA, MASA AKTIF, STATUS MASA KONTRAK, PENEMPATAN (`=N6`), DOMISILI (`=AJ6`) | Kolom turunan diabaikan; kolom rujukan memakai **nilai tersimpan** (cached) |
| `NIK` | berisi nomor induk karyawan pola `9999.AAA.999` (bukan NIK KTP) | Tebakan dari isi kolom mengalahkan nama header |
| `NO. KTP` | 16 digit (1 baris 15 digit) | Validasi 16 digit → error per baris |
| `END OF DATE` | tanggal **atau** teks `Permanent` | Nilai campuran: tanggal = akhir kontrak (Fase 7), `Permanent` = petunjuk kategori Tetap |
| `STATUS KARYAWAN` | `PKWT I - 6 Bulan`, `PKWT II - 1 Tahun`, `PKWT Ke 3 - Perpanjang 3 Bulan`, `Probation  3 Bulan`; 7 baris kosong | Parser status → kategori + (ke-n, durasi) |
| `JOIN DATE` | tanggal (1 sel berupa teks) | Parser tanggal multi-format |
| `STATUS` | `TK/0`, `K/0`–`K/3` | Kolom ambigu "STATUS" dikenali dari isi = PTKP |
| `Grade` | `3A`, `4B` (teks) & `1`, `2` (angka) | Grade = master data (nama teks) |
| `AGAMA` / `JENIS KELAMIN` | `Islam`/`ISLAM`/`Katholik`; `Laki-Laki`/`Laki - Laki`/`Perempuan` | Kamus nilai tidak peka huruf & spasi |
| `PENDIDIKAN` | `SMA`, `S1`, `D3`, `S2`, `D1`, `SMA N 3 …` | Jenjang (D-041) + sisa teks = nama sekolah |
| `ID BPJS …` | angka, teks panjang berisi nomor, catatan bebas | Ambil deret digit; teks tanpa nomor → peringatan |
| `NO. NPWP` | 15/16 digit, sebagian berspasi | Hapus pemisah; 15 atau 16 digit |
| `NO. TLP HP` | 12–13 digit | Normalisasi ke `08…` |
| `PERUSAHAAN` | kode `ACP` (header menyebut PNR / RCE / RDA / ACP / AU / NMA) | Kolom perusahaan (D-039) |
| Kolom kosong | KOTA ASAL, NO. TELP E-CONT, HUBUNGAN E-CONT | Tetap dikenali (tidak error) |
| Keterangan | `RESIGN` (ada spasi di ujung) + `Tgl Resign` | Baris resign → nonaktif (D-042 poin 6) |

## 3. Alur

```
Browser (web)                                                   API (employee)
┌──────────────────────────────────────────────┐
│ 1 Unggah (.xlsx / .csv, ≤ 5 MB)              │
│ 2 Baca workbook → pilih sheet → cari header  │  read-excel-file / papaparse
│ 3 Pemetaan kolom otomatis + koreksi pengguna │  @hris/shared/import (detect, map)
│ 4 Normalisasi nilai per baris                │  @hris/shared/import (normalize)
└───────────────┬──────────────────────────────┘
                │ POST /api/v1/employee-imports/preview  { companyId?, mode, mapping, rows[] }
                ▼
       policy (import, cakupan PT, grant kolom) → normalisasi ULANG + Zod per baris
       → duplikat (dalam file & DB) → rencana master data → diff (buat / perbarui / lewati / error)
                │
                ▼ pratinjau (tanpa menulis apa pun)
┌──────────────────────────────────────────────┐
│ 5 Pratinjau: tab Dibuat / Diperbarui (diff) /│
│   Dilewati / Error / Master data baru        │
│   (petakan "Ass Master Bor" → "Assistant …") │
└───────────────┬──────────────────────────────┘
                │ POST /api/v1/employee-imports  { …, masterDataMapping, previewHash }
                ▼
       validasi ulang penuh → satu transaksi: master data baru, karyawan, data pribadi,
       rekening, pendidikan, riwayat, import_job, audit → 201 { jobId, counts }
┌──────────────────────────────────────────────┐
│ 6 Hasil + unduh "baris gagal" (.xlsx dibuat  │  dari file asli yang masih di memori browser
│   di browser: baris asli + kolom Keterangan) │
└──────────────────────────────────────────────┘
```

`previewHash` = hash isi yang dipratinjau; commit ditolak (409) bila data DB berubah sejak pratinjau sehingga diff tidak lagi sama.

## 4. Mesin deteksi (`packages/shared/src/import/`)

Fungsi murni tanpa I/O, dipakai web (pratinjau cepat) **dan** api (sumber kebenaran). Semua dites dengan tabel kasus.

### 4.1 Grid
- Input: `Cell[][]` (nilai sudah bertipe: string, number, boolean, Date, null) + metadata (baris tersembunyi, sel formula tanpa nilai tersimpan).
- Pangkas baris/kolom kosong di tepi (1.220 → 37 kolom). Sel formula **tanpa** nilai tersimpan = kosong + peringatan level file.

### 4.2 Pilih sheet & baris header
- Skor baris *r* (30 baris pertama): `jumlah sel yang cocok kamus header × 3 + jumlah sel teks pendek (≤ 60 karakter) − jumlah sel angka/tanggal`. Baris dengan skor tertinggi = header; baris sesudahnya yang ≥ 50 % sel berisi → data.
- Header dua baris (grup di atas, sub-kolom di bawah; sel gabungan): gabungkan `atas + " " + bawah` bila baris di bawah juga berskor header tinggi.
- Sheet: skor = skor header terbaik + jumlah baris data. Lebih dari satu sheet layak → pengguna memilih (default skor tertinggi).
- Baris "Control"/total: baris yang sebagian besar selnya formula agregat atau berisi kata `total`, `jumlah`, `control` di kolom awal → dilewati.

### 4.3 Pemetaan kolom
Tiga sinyal, digabung jadi skor 0–1 per pasangan (kolom, field):
1. **Kamus sinonim** (ID + EN) — cocok persis setelah normalisasi (huruf kecil, tanpa tanda baca/newline/isi kurung, spasi tunggal) = 1,0; mengandung frasa kunci = 0,8.
2. **Kemiripan teks** (Jaro-Winkler per token) terhadap sinonim, maks 0,7.
3. **Isi kolom** (sampel ≤ 50 sel non-kosong): pengklasifikasi pola → bobot tambahan atau **veto**:

| Pengklasifikasi | Pola | Dampak |
|---|---|---|
| KTP | 16 digit (± spasi/titik) | kuat ke `ktpNumber`; veto `employeeNumber` |
| Nomor induk | campuran huruf-angka dengan pemisah `.`/`-`/`/`, unik | kuat ke `employeeNumber` |
| Tanggal | Date / serial Excel 20000–60000 / teks tanggal | syarat kolom tanggal |
| PTKP | `^(TK|K)\s*/\s*[0-3]$` (+ `K/I/n`) | `ptkpStatus` |
| Telepon | `^(\+?62|0)8\d{7,12}$` | `phoneNumber` / `emergencyPhone` |
| Email | RFC sederhana | `workEmail` |
| NPWP | 15/16 digit, pola `99.999.999.9-999.999` | `npwpNumber` |
| Jenis kelamin / agama / bank / jenjang | kamus nilai | field terkait |
| Status karyawan | mengandung PKWT/probation/tetap/permanent/harian/magang/outsourc/vendor | `employmentStatusText` |
| Perusahaan | kode 2–5 huruf besar yang cocok `companies.code` | `companyCode` |

- Penugasan satu-ke-satu: pasangan diurutkan menurun skornya, diambil serakah; skor < 0,5 → "tidak dipetakan" (pengguna bisa memilih).
- **Kolom turunan** (dikenali dari sinonim: `no`, `lama kerja`, `masa aktif`, `usia`, `status masa kontrak`) atau kolom yang **semua** selnya formula yang merujuk kolom lain di baris yang sama → "dihitung sistem, diabaikan".
- **Profil pemetaan**: `signature = sha256(header ternormalisasi, diurutkan)`; pemetaan yang dikonfirmasi pengguna disimpan (`employee.import_mappings`) dan otomatis dipakai bila signature sama.

### 4.4 Kamus field (awal)

| Field | Sinonim header (contoh) | Tabel tujuan | Sensitif |
|---|---|---|---|
| `employeeNumber` | nik, nik karyawan, no induk, nomor induk karyawan, nip, employee id, emp no | employees | – |
| `fullName` | nama, nama lengkap, nama karyawan, full name, name | employees | – |
| `companyCode` | perusahaan, pt, company, entitas | employees.company_id | – |
| `workEmail` | email, email kantor, work email | employees | – |
| `phoneNumber` | no hp, no tlp hp, telepon, handphone, phone, mobile | employees | – |
| `gender` | jenis kelamin, jk, gender, sex | employees | – |
| `joinDate` | join date, tgl masuk, tanggal masuk, tanggal bergabung, hire date, start date | employees | – |
| `employmentStatusText` | status karyawan, status kepegawaian, employment status, status kontrak | employees.employment_status_id (+ kontrak Fase 7) | – |
| `contractEndDate` | end of date, end date, akhir kontrak, tgl berakhir, end of contract | Fase 7 (kini: petunjuk kategori) | – |
| `offeringNumber` | nomor offering, no offering, offering letter | Fase 7 | – |
| `positionName` | jabatan, posisi, position, job title | positions | – |
| `departmentName` | divisi, departemen, departement, department, bagian | departments | – |
| `workLocationName` | kota penempatan, penempatan, lokasi kerja, site, work location | work_locations | – |
| `gradeName` | grade, golongan, level | grades | – |
| `managerRef` | atasan, atasan langsung, manager, supervisor | employees.manager_id (cocok nomor induk/nama) | – |
| `emergencyPhone` | no telp e-cont, telp darurat, emergency phone | employees | – |
| `emergencyContactName` | nama e-cont, kontak darurat | employees (D-041) | – |
| `emergencyContactRelationship` | hubungan e-cont, hubungan kontak darurat | employees (D-041) | – |
| `exitMarker` / `exitDate` | keterangan (nilai RESIGN) / tgl resign, tanggal keluar, resign date | nonaktif + exit_reason | – |
| `birthPlace` / `birthDate` | tempat lahir / tgl lahir, tanggal lahir, dob | employee_personal | ✔ |
| `originCity` | kota asal | employee_personal (D-041) | ✔ |
| `ptkpStatus` | status ptkp, ptkp, status pajak, status (isi PTKP) | employee_personal (D-041) | ✔ |
| `maritalStatus` | status pernikahan, status nikah (atau dari PTKP) | employee_personal | ✔ |
| `religion` | agama | employee_personal | ✔ |
| `ktpNumber` | no ktp, nik ktp, nomor ktp | employee_personal | ✔ |
| `npwpNumber` | npwp, no npwp | employee_personal | ✔ |
| `kkNumber` | no kk, kartu keluarga | employee_personal | ✔ |
| `bpjsEmploymentNumber` | bpjs ketenagakerjaan, bpjs tk, jamsostek | employee_personal (D-041) | ✔ |
| `bpjsHealthNumber` | bpjs kesehatan, bpjs kes, jkn, kis | employee_personal (D-041) | ✔ |
| `ktpAddress` / `domicileAddress` | alamat ktp, alamat / alamat domisili, domisili | employee_personal | ✔ |
| `educationText` | pendidikan, pendidikan terakhir, education | educations (level + nama sekolah) | – |
| `bankName` / `bankAccountNumber` / `bankAccountHolder` | nama bank, bank / no rekening, nomor rekening / atas nama | employee_bank_accounts | ✔ (bank) |

Field baru cukup ditambahkan ke kamus (satu tempat) + normalizer + test.

### 4.5 Normalisasi nilai
| Field | Aturan |
|---|---|
| Tanggal | Date; serial Excel (epoch 1899-12-30); `dd/mm/yyyy`, `dd-mm-yyyy`, `yyyy-mm-dd`, `dd MMM yyyy` & nama bulan Indonesia/Inggris; hasil `date` (tanpa jam, PROMPT §4). Tahun < 1940 atau > tahun ini + 5 → error |
| Jenis kelamin | `l`, `laki`, `laki-laki`, `laki - laki`, `pria`, `male`, `m` → MALE; `p`, `perempuan`, `wanita`, `female`, `f` → FEMALE |
| Agama | islam, kristen/protestan, katolik/katholik, hindu, buddha/budha, konghucu/khonghucu, lainnya |
| PTKP | `TK/0`–`TK/3`, `K/0`–`K/3`; `K/*` → menikah, `TK/*` → belum menikah (bila kolom status nikah kosong) |
| Status karyawan → kategori | `pkwtt`, `tetap`, `permanent` → PERMANENT; `probation`, `percobaan` → PROBATION; `pkwt` (+ `i/ii/iii/ke n`, `n bulan/tahun`) → PKWT; `harian`, `daily` → DAILY_WORKER; `magang`, `intern` → INTERNSHIP; `outsourc` → OUTSOURCING; `vendor` → VENDOR. Kosong + akhir kontrak `Permanent` → PERMANENT. Kategori dipetakan ke status berkategori itu di master data |
| Nomor induk | trim, huruf besar, maks 30 |
| KTP / KK | buang spasi/titik; tepat 16 digit, kalau tidak → error |
| NPWP | buang pemisah; 15 atau 16 digit |
| BPJS | ambil deret digit terpanjang (≥ 11 digit TK, 13 digit Kes); tidak ada → peringatan "bukan nomor" |
| Telepon | buang pemisah; `+62`/`62` → `0`; harus `08…` 10–14 digit |
| Pendidikan | awalan jenjang (`sd`, `smp`, `sma/smk/slta`, `d1`–`d4`, `s1`–`s3`) → level; sisa teks → nama sekolah |
| Teks umum | trim, spasi tunggal; master data dicocokkan tanpa peka huruf & spasi |
| Resign | `keterangan` berisi `resign` (+ tanggal keluar) → nonaktif, `exit_reason = RESIGNATION` |

Setiap masalah = `{ row (nomor baris Excel asli), column (huruf kolom asli), field, code, severity: error|warning }` — **tanpa nilai**.

## 5. API (modul `employee`)

| Method & path | Guna | Akses |
|---|---|---|
| `POST /api/v1/employee-imports/preview` | Validasi + diff tanpa menulis | SA; HR (cakupan PT) |
| `POST /api/v1/employee-imports` | Simpan (satu transaksi) | SA; HR (cakupan PT) |
| `GET /api/v1/employee-imports` · `GET /api/v1/employee-imports/:id` | Riwayat import & ringkasan error | SA; HR (import miliknya/PT-nya) |
| `GET /api/v1/employee-imports/mappings/:signature` · `PUT …` | Profil pemetaan | SA; HR |

- Body (implementasi): `{ fileName, fileSha256, mode: "CREATE_ONLY" | "UPSERT", companyId?, rows: [{ sourceRow, raw: { <fieldKey>: sel } }], masterDataMapping? }`, 1–2.000 baris; pemetaan sudah diterapkan di browser sehingga `raw` berkunci field (tidak ada `mapping` di body). Commit = body yang sama + `previewHash`. Zod di batas sistem (`employee-import.schema.ts`).
- `companyId` default untuk baris tanpa kolom perusahaan; baris dengan kode PT di luar cakupan aktor → error baris (D-040).
- Kolom sensitif tanpa hak menulis → dibuang di server, dilaporkan di `skippedFields` (D-042 poin 5).
- Master data: lewat fungsi publik `organization/index.ts` (`masterIndex`, `missingMasterData`, `createMissingMasterData`) — batas modul tetap (PROMPT §3.3). Status kepegawaian **tidak** dibuat otomatis: teks status harus cocok dengan kategori yang ada (baris baru tanpa status → error).
- Respons pratinjau: `{ counts, rows: [{ sourceRow, action, employeeNumber, changes: [field], issues }], masterData: { departments[], positions[], grades[], workLocations[], statuses[] }, skippedFields, previewHash }`. Nilai sensitif **tidak** dikembalikan (cukup nama field yang berubah).
- Audit: `employee.import.completed` (counts, mode, fileSha256), per karyawan `employee.create`/`employee.update` `{ source: "import", jobId }`, `employee.sensitive.write` `{ sections }`, `organization.<entity>.create` `{ source: "import" }`.

## 6. Data

| Tabel | Kolom |
|---|---|
| `employee.import_jobs` | id, actor_account_id, company_id?, file_name, file_sha256, mode, total_rows, created_count, updated_count, skipped_count, error_count, skipped_fields (text[]), created_at — hanya dibuat saat commit berhasil (transaksi gagal = tidak ada job), jadi tanpa kolom status |
| `employee.import_job_issues` | id, job_id, source_row, source_column, field, code, severity — **tanpa nilai** |
| `employee.import_mappings` | id, signature (unik), mapping (jsonb: header asli → field), updated_by, updated_at |

Kolom D-041 & `company_id` (D-039) ditambahkan lewat migrasi Tahap 2/4.

## 7. UI (web, `features/employee/import/`)

Rute `/personal/import` (SA/HR). Dibuka dari tombol **Import** di header setiap halaman **Data Karyawan Aktif** (`?dari=<kategori>` → tombol kembali ke kategori itu) dan menu **Pengelolaan Karyawan → Import Data Karyawan**. Implementasi 4 langkah (Struktur digabung ke Pemetaan): Unggah → Pemetaan kolom → Pratinjau → Selesai. Rancangan awal:
1. **Unggah** — tarik-lepas / pilih file; tautan **Unduh template** (`public/template/Template-import-karyawan.xlsx`, dummy); pilih PT default & mode.
2. **Struktur** — sheet & baris header terdeteksi (bisa diganti), pratinjau 5 baris pertama (kolom sensitif disamarkan `••••1234`).
3. **Pemetaan kolom** — tiap kolom: header asli → field (dropdown), chip keyakinan (tinggi/sedang/rendah), "diabaikan: dihitung sistem"; tombol "Simpan pemetaan".
4. **Pratinjau** — kartu ringkasan (dibuat / diperbarui / dilewati / error / master data baru); tab per kategori; master data baru bisa dipetakan ke yang sudah ada; peringatan kolom sensitif yang dilewati.
5. **Hasil** — ringkasan + **Unduh baris gagal** (.xlsx: baris asli + kolom "Keterangan error") + tautan ke Data Karyawan Aktif / Undangan akun (Tahap 5).

## 8. Pengujian

| Lapisan | Isi |
|---|---|
| Shared (bun test) | header di baris 5 dengan judul & baris Control; header dua baris; kolom acak; header Inggris; "NIK" berisi nomor induk vs KTP; kolom turunan diabaikan; normalizer (tabel kasus tanggal, gender, agama, PTKP, status → kategori, telepon, KTP 15 digit, BPJS teks bebas, pendidikan) |
| Fixture | `packages/shared/tests/fixtures/`: dibuat script dari data dummy — (a) replika struktur file kantor, (b) versi berantakan (kolom acak, header EN, 2 sheet), (c) CSV `;` + BOM, (d) CSV UTF-8 `,` |
| API integration | preview tanpa menulis; commit transaksi; mode CREATE_ONLY vs UPSERT (sel kosong tidak menimpa); duplikat dalam file & DB; baris resign → nonaktif + riwayat; master data baru + audit; HR tanpa grant → kolom sensitif dilewati; HR PT lain → error baris; MANAGER/EMPLOYEE 403; tanpa token 401; > 2.000 baris 400; `previewHash` basi 409 |
| Web (Vitest) | stepper, koreksi pemetaan, penyamaran kolom sensitif, unduh baris gagal |
| Playwright | alur penuh dengan template dummy (lokal & staging) |
| Uji kering file asli | **lokal saja**, tanpa commit; laporan hanya angka (kolom terpetakan otomatis, baris valid/error per kode) |

## 9. Di luar cakupan tahap ini
Import saldo cuti (Fase 6, memakai mesin yang sama), data kontrak (Fase 7, lewat import ulang mode UPSERT), `.xls` biner lama (diminta simpan ulang sebagai `.xlsx`), import foto/dokumen.

## 10. Penyempurnaan saat implementasi (2026-09-30)

1. **Nama wajib hanya untuk baris baru** — baris UPSERT yang hanya membawa nomor induk + kolom yang ingin diperbarui tetap sah.
2. **Baris kosong** (tanpa nama dan tanpa nomor induk) dilewati diam-diam dan dihitung di `counts.blank`, bukan error.
3. **PT bawaan**: SA (atau HR dengan > 1 PT) memilih "Perusahaan bawaan" di langkah Unggah; HR dengan satu PT otomatis. Baris tanpa kolom perusahaan dan tanpa PT bawaan → error `COMPANY_REQUIRED`.
4. **Status keluar karyawan yang sudah ada** tidak diubah oleh import (peringatan `EXIT_EXISTING_IGNORED`); menonaktifkan tetap lewat menu Ubah Status (alasan & tanggal efektif tercatat).
5. **Profil pemetaan** disimpan otomatis saat lanjut ke pratinjau (kotak "Ingat pemetaan…", default aktif), kunci = SHA-256 susunan header ternormalisasi.
6. **Unduh baris bermasalah** tersedia di Pratinjau dan Selesai: header asli + kolom "Keterangan import" (`Baris N: ERROR — <field>: <pesan>`), dibuat di browser (`lib/xlsx-write.ts`, fflate).
7. Pesan masalah menyebut **letak kolom** di file (mis. "Kolom K · Status karyawan: …").
8. Pengujian nyata: shared 63 · api (import 11 integration + policy) · web `employee-import.test.tsx` 6 · Playwright lokal 13/13 (`docs/qa/runs/2026-09-30-import-karyawan.md`). Fixture file (§8 baris "Fixture") diganti: template dummy `public/template/Template-import-karyawan.xlsx` + grid/CSV inline di test.

