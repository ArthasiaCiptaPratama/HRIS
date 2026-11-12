# Rencana — Homebase karyawan (EMP-D6)

> **Status:** rencana final, **implementasi ditahan** sampai EMP-D5 (riwayat perubahan data) selesai dan rencana ini disetujui.
> **Sumber:**
> - Handoff supervisor 2026-11-12 09:00, poin 3.
> - Jawaban grill H1–H7: kutipan pengguna 12:29 WIB, "Untuk P1/P2 dan H1-H7 setuju semua berdasarkan rekomendasi anda semua."
> - H6 belum dijawab.
>
> Audit lengkap ada di bagian "Audit" di bawah (develop `2b37d1f`).

## 1. Keputusan (EMP-D6)

| # | Keputusan | Grill |
|---|---|---|
| 1 | **Homebase = Point of Hire (POH):** kota/daerah asal rekrut karyawan. Nanti menjadi dasar hak yang menyangkut uang, misalnya tiket pulang, hari perjalanan, dan cuti lapangan. Homebase berbeda dari:<br>• **Lokasi kerja** (`workLocationId`): tempat kerja dan geofence absen.<br>• **Zona HO/Site** (`departments.zone`, ORG-D5): atribut unit organisasi, bukan per karyawan.<br>• **Kota asal** (`EmployeePersonal.originCity`): teks bebas dan sensitif.<br>Kota asal tetap ada dan tidak digabung. | H1 (a) |
| 2 | **Master data dikelola SA** (pola D-049): tambah, ubah, arsipkan, pulihkan, hapus (bila belum dipakai), dan gabungkan. Atribut tahap ini: nama, kota, provinsi, keterangan. Atribut untuk payroll (zona tarif, jarak, biaya tiket) ditambah di Fase 8. | H2 (a) |
| 3 | **Berlaku per tanggal:** setiap perubahan adalah baris riwayat dengan **berlaku mulai** (tanggal, boleh mundur, tidak boleh di masa depan), **no. SK opsional**, dan catatan. Nilai pada tanggal X = baris dengan `effective_from` terakhir ≤ X. Perubahan juga tercatat di tab Riwayat (EMP-D5). | H3 (a) |
| 4 | **Data kerja, bukan data pribadi.** Terlihat oleh siapa saja yang boleh melihat data kerja: SA, HR sesuai PT, atasan untuk timnya, karyawan untuk dirinya sendiri, dan HR Kepegawaian. Tidak butuh grant `employee.personal.*`. | H4 (a) |
| 5 | **Diubah hanya oleh HR/SA**, mengikuti cakupan PT yang sama dengan ubah data kerja (`canUpdateEmployee`; bukan data milik sendiri lewat jalur HR). Saluran: detail karyawan, tambah karyawan, import Excel, dan koreksi data kerja saat approve onboarding. Karyawan **tidak** bisa mengajukan lewat ESS/app. Field ini **opsional** dulu; dijadikan wajib saat payroll aktif. | H5 (a) |
| 6 | **Tampil di:**<br>• Detail karyawan (Penempatan + riwayat homebase).<br>• Daftar karyawan: kolom opsional + filter.<br>• Import + template Excel.<br>• Laporan, sebagai filter dan kolom ekspor headcount.<br>**Belum** tampil di app mobile, PDF Formulir Data Karyawan, dan dashboard pivot. Tunjangan yang bergantung pada homebase diputuskan di Fase 8 payroll (setelah OD-1 sampai OD-3). | H7 |
| 7 | **Data awal:** diisi manual atau lewat **kolom baru** "HOMEBASE" di template import. Kolom kantor "PENEMPATAN LOKASI KERJA" **tidak** dipetakan ke homebase sampai pengguna mengonfirmasi (H6 terbuka, lihat EMP-OD3). | H6 (sementara) |

## 2. Desain teknis

### Skema (migrasi Prisma, D-003)
- **`organization.homebases`**
  - Kolom: `id`, `name` (unik, case-insensitive), `city?`, `province?`, `note?`, `archived_at?`, `created_at`, `updated_at`.
  - Ikut pola `work_locations` (master lintas PT, D-039 poin 3).
- **`employee.employee_homebases`** (riwayat)
  - Kolom: `id`, `employee_id` (FK cascade), `homebase_id` (FK restrict), `effective_from` date, `decree_number?` varchar(60), `note?` varchar(500), `changed_by?` (account id tanpa FK), `created_at`.
  - Unik `(employee_id, effective_from)`; index `(employee_id, effective_from desc)`.
- **`employees.homebase_id`**: kolom turunan, nullable, FK, index. Isinya baris riwayat dengan `effective_from` terbaru. Diperbarui di transaksi yang sama setiap kali riwayat berubah. Kolom ini dipakai untuk daftar, filter, dan laporan tanpa subquery. Karena tanggal masa depan ditolak, tidak perlu cron.

### API (modul employee & organization)
- **Master** `GET/POST/PATCH /homebases`, arsip, pulihkan, hapus, merge. Ikut endpoint master data D-049. Bila dua homebase digabung, riwayat yang memakai homebase lama dipindah ke yang baru dan tercatat `MASTER_MERGE` (EMP-D5).
- **Riwayat homebase per karyawan:**
  - `GET /employees/{id}/homebases`
  - `POST /employees/{id}/homebases` dengan body `{ homebaseId, effectiveFrom, decreeNumber?, note? }`.
  - `PATCH` / `DELETE` hanya untuk koreksi baris oleh HR/SA. Setiap aksi dicatat di audit + EMP-D5. Field `homebase` berisi "Nama (berlaku YYYY-MM-DD)".
- **`EmployeeDetail`** + `homebase` (nilai sekarang) + `homebases[]` (riwayat).
- **`EmployeeListItem`** + `homebase` (nullable, aditif). Daftar mendapat filter `homebaseId`.
  - Item daftar dipakai app (`listEmployees`, MOB-D9). Penambahan field nullable tidak memutus app, tetapi tetap dikabarkan ke sesi mobile saat masuk develop.
  - Endpoint homebase **tidak** masuk `APP_OPERATION_IDS`.
- **Tambah karyawan** (EMP-D2) dan **approve onboarding** (koreksi data kerja): `homebaseId` opsional, `effectiveFrom` = tanggal masuk.
- **Import** (IMP):
  - Kolom "HOMEBASE" (sinonim: "POH", "POINT OF HIRE") dicocokkan ke master seperti lokasi kerja. Nama baru ditawarkan sebagai master baru (pola `createMissingMasterData`).
  - Opsional "HOMEBASE BERLAKU MULAI". Bawaan: tanggal masuk untuk baris baru, tanggal import untuk baris yang diperbarui.
  - Nilai sama dengan yang sekarang berlaku → tidak membuat riwayat baru.
- **Adapter untuk payroll:** `getHomebasesOn(employeeIds, date)` diekspor lewat `employee/index.ts` (pola `directory.ts`) supaya modul payroll membaca nilai per tanggal tanpa FK lintas modul.
- **Laporan:** `reportFilterSchema` + `homebaseId`; kolom Homebase di ekspor headcount.

### Web
- **Detail › Data kerja › Penempatan:** baris "Homebase" + tombol "Ubah homebase". Dialognya berisi pilihan master, berlaku mulai (≤ hari ini), no. SK, dan catatan. Di bawahnya daftar riwayat homebase.
- **Form tambah karyawan:** field "Homebase" opsional di langkah Data kerja.
- **Daftar karyawan:** kolom + filter Homebase.
- **Administrasi › Master Data:** tab "Homebase" (pola Lokasi Kerja, tanpa peta).
- **Import:** pemetaan kolom + kartu "Master data baru" untuk homebase.
- Template Excel (`apps/web/scripts/generate-import-template.ts`) ditambah kolom HOMEBASE.

### Test
- **Shared:** sinonim import + skema.
- **API integration:**
  - Master CRUD/merge dengan izin SA-only (403 untuk HR).
  - POST riwayat: SA/HR dalam PT 201; HR di luar PT 404; manager 403; tanpa login 401.
  - Validasi: tanggal masa depan 400; tanggal kembar 409.
  - Kolom turunan selalu = riwayat terbaru, termasuk setelah DELETE/PATCH baris.
  - `getHomebasesOn` per tanggal (sebelum, tepat di, dan sesudah batas).
  - Import buat/perbarui/sama.
  - Catatan EMP-D5 tertulis.
- **Web:** dialog ubah, riwayat, filter daftar, import pemetaan.

### Tahapan (setelah disetujui)
- **A.** Skema + master + API riwayat + adapter + test API.
- **B.** Web detail/form/daftar/master data.
- **C.** Import + template + laporan.
- **D.** Docs (PLAN §4.2 tabel data kerja, codemap, ERD `docs/erd/hris.dbml`), smoke Zen, lalu kabari Mat (migrasi + shared) dan sesi mobile (field aditif).

## 3. Keputusan terbuka
- **EMP-OD3:** apakah kolom Excel kantor **"PENEMPATAN LOKASI KERJA"** sebenarnya Homebase/POH? Bila ya, import memetakannya ke Homebase. Bila tidak, kolom itu tetap diabaikan. Sementara ini: tidak dipetakan.

## 4. Audit (ringkas)
- **Belum ada konsep Homebase/POH** di kode maupun docs. Konsep terdekat:
  - `originCity` (teks bebas, sensitif).
  - `workLocationId` (tempat kerja + geofence, tanpa riwayat).
  - `departments.zone` (ORG-D5).
  - `EmployeeLocationSetting` (TM-D1).
  - `CrewMember` (punya rentang tanggal).
- **Payroll** belum dirancang. Yang ada baru rencana `employee_salary_structures` "berlaku per tanggal" (`docs/codemap/payroll.md`) dan `GradeWage.fixedAllowance` (per grade, ditimpa tanpa riwayat).
- **Pola yang dipakai ulang:**
  - `CrewMember` (berlaku dari/sampai) → `employee_homebases`.
  - `EmploymentHistory` (SK) → `decree_number`.
  - Master data D-049 → `homebases`.
  - Snapshot `AttendanceDay` → payroll nanti menyalin nilai saat tutup periode.
- **Titik yang tersentuh:**
  - Prisma + migrasi.
  - shared (`import/fields.ts`, `row.ts`, `report.ts`, label).
  - `employee.schema/service/repository/policy`.
  - organization (master).
  - `employee-import.*`, onboarding review, report.
  - OpenAPI (`EmployeeDetail`, `EmployeeListItem`).
  - Web: detail, form, daftar, master data, import, template.
  - Docs.
