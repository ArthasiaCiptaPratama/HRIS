# Desain — Pendataan Karyawan Existing dari Google Form lewat Import (D-059)

> Keputusan: **D-059** di [PLAN §8](../PLAN.md#8-keputusan-adr-ringkas) (dibangun di atas Import D-042, [import-karyawan.md](import-karyawan.md)).
> Status: **[done] lokal 2026-10-07** — Import mengenali seluruh Sheet respons "Formulir Data Karyawan" (ekspor 138 kolom: 119 terpetakan otomatis; 19 sisanya tautan file/Timestamp/pertanyaan navigasi). File di Drive (foto & dokumen) ikut Import sejak 2026-10-08 (D-060, §4). Checklist: PROGRESS Fase 4 → "Pendataan karyawan existing lewat Google Form".
> Dokumen ini tidak memuat data asli.

Karyawan existing yang belum ada di HRIS mengisi **Google Form** "Formulir Data Karyawan"; responsnya masuk Google Sheet, lalu HR memasukkannya ke HRIS lewat **Import Data Karyawan** (pratinjau, pemetaan kolom diingat, simpan satu transaksi). Tidak ada integrasi otomatis Form → HRIS.

## 1. Alur: Sheet respons Form → Import Data Karyawan (manual)

Dipilih pemilik projek 2026-10-07: migrasi karyawan existing bersifat satu kali/bertahap; Import (D-042) sudah mendukung lebih banyak field teks (KK, NPWP, BPJS, rekening, kontak darurat, pendidikan) tanpa infrastruktur tambahan.

**Langkah HR**
1. Google Form → tab **Jawaban** → **Tautkan ke Spreadsheet** (sekali).
2. Sheet → **File → Download → Microsoft Excel (.xlsx)**.
3. Tambah kolom data kerja yang tidak ditanyakan Form: **Perusahaan** (kode PT) bila tidak memakai PT bawaan, **Jabatan**, **Departemen/unit**, **Tanggal masuk** (Form versi 171 kolom sudah menanyakan ketiganya). **Status karyawan** tidak perlu ditambah (D-062): pilih **Status kepegawaian bawaan** di langkah Unggah atau di Pratinjau, dan ubah per baris di kolom Status Pratinjau bila ada yang berbeda. Kolom status di file tetap dipakai bila ada; karyawan yang sudah ada tidak diubah statusnya.
4. HRIS → **Personal Management › Import Data Karyawan** → unggah → periksa **Pemetaan** (diingat per susunan kolom) → **Pratinjau** → Simpan. Kolom "Timestamp"/"Stempel waktu" dan "Alamat email" (akun Google pengisi) otomatis diabaikan.
5. Foto & dokumen di Sheet berupa **tautan Drive** → dipetakan otomatis ke grup "Lampiran (Google Drive)"; setelah Simpan, panel **Lampiran Google Drive** mengambil filenya (§4).
6. Setelah impor: batasi akses Sheet / hapus baris yang sudah diimpor (data pribadi, UU PDP).
7. Lokal Sheet harus **Indonesia** (File → Setelan → Lokal) supaya tanggal tertulis DD/MM/YYYY; lokal US (M/D/YYYY) membuat tanggal lahir terbaca salah/ditolak.

**Hasil uji ekspor sungguhan (2026-10-07, 138 kolom):** 24 kolom terpetakan otomatis (identitas, NIK KTP dari judul "Nomor Induk Kependudukan", KK, NPWP, alamat, No. HP, email pribadi, TTL, kebangsaan, status nikah termasuk "Sudah Menikah", gol. darah, jenis SIM, No. SIM A, agama, suku, hubungan kontak darurat, pendidikan terakhir, bank, no. rekening, atas nama). Tidak terpetakan: "No. SIM C" (DB satu nomor SIM), nama/No. HP/alamat kontak darurat (judul generik — lihat saran judul), data keluarga, sertifikasi, tautan dokumen.

**Dukungan Import yang ditambahkan (D-059):** field `personalEmail` (unik; ganda di file & milik karyawan lain ditolak), `nickname`, `nationality` (WNI → Indonesia), `ethnicity`, `bloodType` (A/B/AB/O ± rhesus; tak dikenali = peringatan), `drivingLicenseTypes` (jamak, urutan baku; sebagian tak dikenali = peringatan), `drivingLicenseNumber`; deteksi kolom: "Golongan Darah" tidak lagi terbaca Grade, kolom berisi tautan (unggahan Drive) tidak dipetakan, kolom keluarga dalam kurung — "(Anak 1)", "(Saudara Kandung 2)" — tidak dipetakan, "No. Telp" → No. HP, "Email Pribadi" → email pribadi, NIK dari judul "Nomor Induk Kependudukan" (walau isi belum berformat), header ganda kalah dari header unik, kolom "Alamat email" ekspor Form (diawali "Timestamp") diabaikan, "Nama Pemilik" → atas nama rekening, "Hubungan" → hubungan kontak darurat, pilihan "Sudah Menikah" dikenali.

**Judul pertanyaan Form yang disarankan** (header ganda/generik tidak bisa dibedakan otomatis):

| Judul sekarang | Saran | Kenapa |
|---|---|---|
| Kontak Darurat: "Nama Lengkap", "Hubungan", "No. HP", "Alamat Lengkap" | "Nama Kontak Darurat", "Hubungan Kontak Darurat", "No. HP Kontak Darurat", "Alamat Kontak Darurat" | "Nama Lengkap"/"No. HP" bentrok dengan data karyawan |
| Orang Tua: "Usia", "Pendidikan", "Pekerjaan" (Ayah & Ibu) | "Usia Ayah", "Pendidikan Ayah", … | "Pendidikan" terbaca sebagai pendidikan karyawan |
| "Pendidikan Terakhir Pertama" | "Pendidikan Terakhir" | dikenali langsung |
| "Agama " (spasi) | "Agama" | rapi |

Data keluarga, pendidikan 1–3, sertifikasi, kontak darurat, dan No. SIM per jenis kini didukung (§3). Hasil uji di atas adalah keadaan sebelum §3; sesudahnya 119/138 kolom terpetakan; sejak D-060 kolom unggahan file juga dipetakan sebagai lampiran (§4).


## 2. Riwayat keputusan

- 2026-10-07 (grill): rencana awal = Apps Script di Form mengirim ke API (antrean review, foto ke Storage, token per Form). Dibangun & diuji lokal, lalu **dihapus total** atas keputusan pemilik projek: untuk pendataan yang dilakukan HR secara manual/bertahap, jalur itu menambah 3 tabel, ±7 endpoint, 3 halaman, cron, token, dan URL publik/tunnel tanpa dipakai. Bila kelak dibutuhkan pendataan otomatis, rancang ulang dari kebutuhan saat itu.
- Yang dipertahankan dari pekerjaan itu: kolom data pribadi baru (`nickname`, `nationality`, `ethnicity`, `blood_type`, `driving_license_types`, `driving_license_number` — migrasi `20261007100618_add_employee_personal_form_fields`), perluasan Import, istilah layar **NIP** (D-048).

## 3. Bagian berulang (dikerjakan 2026-10-07)

Keputusan pemilik projek 2026-10-07: semua bagian Form ikut Import; impor ulang = **tambah yang belum ada**; dropdown pemetaan **berkelompok**.

| Bagian Form | Field Import (grup dropdown) | Disimpan ke |
|---|---|---|
| Pasangan | `spouse{Name,Occupation,WorkAddress,BirthPlace,BirthDate}` | `family_members` (+ `gender`, `birth_place`, `education`, `occupation`, `age_at_entry`, `work_address`) |
| Anak 1–5 | `child{n}{Name,Gender,BirthPlace,BirthDate,Education}` | `family_members` |
| Ayah, Ibu | `father/mother{Name,Age,Education,Occupation}` | `family_members` (usia = `age_at_entry`, usia saat didata) |
| Saudara 1–5 | `sibling{n}{Name,Age,Education,Occupation}` | `family_members` |
| Pendidikan 1–3 | `education{n}{Level,School,EntryYear,GraduationYear}` | `educations` (+ `entry_year`) |
| Sertifikasi (K3 Umum, POP, POM, POU, SMKP Minerba, SMK3 Kemnaker, PROPER, ISO 45001/14001/9001/50001) | `cert{Key}{Number,Year}` | `trainings` (bidang = nama sertifikasi, + `certificate_number`) |
| Kontak darurat | nama/hubungan/HP (field lama) + `emergencyContactAddress` | `employees` + `employee_personal.emergency_contact_address` |
| No. SIM A/C/… | `simNumber{Jenis}` | `employee_personal.driving_license_numbers` (jsonb; `driving_license_number` = nomor pertama) |

- **Pengenalan kolom** (`detect.ts` `formGroupMapping`, hanya untuk ekspor Form — kolom pertama "Timestamp" — atau file dengan ≥ 2 kolom penanda): kolom generik ("Usia", "Pendidikan", "Pekerjaan", "Tahun Masuk", "No. Sertifikasi", "No. HP", "Nama Lengkap") dimiliki kelompok dari kolom penanda sebelumnya ("Nama Istri/Suami", "Nama Lengkap Ayah/Ibu", "(Anak n)", "(Saudara Kandung n)", "Pendidikan Terakhir Pertama…Ketiga", nama sertifikasi, "Hubungan").
- **Impor ulang**: dicocokkan keluarga = hubungan + nama, pendidikan = jenjang + sekolah, sertifikasi = nama; yang sudah ada dilewati, yang baru ditambah (tampil sebagai perubahan di pratinjau). Tidak ada yang dihapus/ditimpa.
- **Akses**: keluarga, alamat kontak darurat, No. SIM = data pribadi (grant `employee.personal.write` untuk HR; dilewati bila tidak berhak; data milik akun sendiri tidak diubah lewat Import). Pendidikan & sertifikasi tidak sensitif.
- **Profil pemetaan** (diingat per susunan kolom) memakai kunci per kemunculan (`usia`, `usia#2`, …) supaya kolom kembar tidak tertukar saat dipakai ulang.
- **Tampilan**: detail karyawan › Pribadi (email pribadi, panggilan, kebangsaan, suku, gol. darah, SIM per jenis, alamat kontak darurat), › Keluarga (jenis kelamin, TTL, usia saat didata, pendidikan, pekerjaan, alamat kerja), › Pendidikan (tahun masuk–lulus, No. sertifikat).

## 4. Lampiran Google Drive (D-060)

Dikerjakan 2026-10-08 (keputusan pemilik projek: di dalam fitur Import, bukan script rclone; impor ulang memakai sidik jari).

| Kolom Form | Field Import | Disimpan sebagai |
|---|---|---|
| Foto Karyawan | `attachPhoto` | foto profil (JPEG ≤ 1024 px) |
| KTP · Kartu Keluarga · Ijazah Terakhir · NPWP (kolom file) | `attachKtp`, `attachKk`, `attachDiploma`, `attachNpwp` | dokumen KTP / KK / DIPLOMA / NPWP |
| Sertifikasi POP/POM/POU | `attachCertPop/Pom/Pou` | CERT_POP/POM/POU — **dilewati** (jenis ini wajib tanggal kedaluwarsa; unggah manual) |
| SIM A · SIM C (Form versi baru, D-061) | `attachSimA`, `attachSimC` | SIM (jenis jamak, tanpa masa berlaku sejak D-061), catatan "SIM A/C — …", nomor = No. SIM jenisnya |
| Sertifikasi lain (K3 Umum, SMKP, SMK3, PROPER, ISO …) | `attachCert{Key}` | CERT_OTHER, catatan = nama sertifikasi, nomor dari kolom "No. Sertifikasi", ditautkan ke Pelatihan bernama sama |
| Buku Rekening (Hal 1) | `attachBankBook` | BANK_BOOK |

**Alur:** kolom berisi tautan dengan judul di atas dipetakan otomatis (profil pemetaan lama yang belum mengenal lampiran tidak mematikannya) → pratinjau menampilkan jumlah lampiran → Simpan mencatat antrean (`import_job_attachments`; baris error & baris "hanya tambah baru" yang dilewati tidak ikut; baris tanpa perubahan data tetap ikut) → panel **Lampiran Google Drive** memanggil `POST /employee-imports/{id}/attachments/process` berulang (±20 dtk/panggilan) dengan progress bar; halaman boleh ditutup, sisa antrean muncul di halaman Import ("Lanjutkan"); yang gagal bisa "Coba lagi".

**Aturan:** sidik jari SHA-256 file Drive (gabungan bila beberapa file) sama dengan lampiran yang sudah masuk untuk karyawan & tujuan yang sama → dilewati; berbeda → versi dokumen baru (yang lama tetap di riwayat versi; unggahan manual HR juga menjadi versi lama); foto diganti. Hak tulis mengikuti layar: dokumen sensitif (KTP, KK, NPWP) butuh grant dokumen, buku rekening grant dokumen atau rekening — tanpa grant dilewati "Tidak berhak". Beberapa gambar satu jawaban → satu PDF; HEIC/WebP & file > 20 MB dilewati (unggah manual).

**Penyiapan (sekali per lingkungan):**
1. Google Cloud Console (akun pemilik Form) → project → aktifkan **Google Drive API** → IAM › Service Accounts → buat service account → Keys › JSON. Gratis, tanpa billing.
2. Drive: folder unggahan Form (mis. "Formulir Data Karyawan (File responses)") → Bagikan ke email service account sebagai **Viewer**; akses umum folder **Dibatasi** (jangan "siapa saja yang memiliki link").
3. Isi env API `GOOGLE_SERVICE_ACCOUNT_JSON` = isi file JSON dalam satu baris (lokal: `.env` diapit kutip tunggal; staging/produksi: env Vercel). Kosong = lampiran tetap tercatat di antrean dan bisa diproses setelah diisi.
4. File kunci = rahasia: simpan di luar repo (mis. `~/.config/hris/`, izin 600), jangan dikirim lewat chat.

Catatan kapasitas: lampiran memakai Supabase Storage (paket gratis 1 GB); foto & gambar dikompres sebelum disimpan.

## 5. Form versi baru 171 kolom (D-061)

Dikerjakan 2026-10-08 dari file "Formulir Data Karyawan (Jawaban).xlsx" (2 respons; judul kolom = fixture `packages/shared/tests/fixtures/form-sheet-headers-v2.ts`, tanpa data pribadi). Form **direvisi di tengah pengisian**: responden lama mengisi kolom 1–137, responden baru juga kolom 138–171. Pertanyaan baru yang judulnya sama dengan pertanyaan lama diberi akhiran " 2", " 3" oleh Sheet; deskripsi pertanyaan ikut di header setelah baris baru (kadang tertulis `_x000a_`).

**Pengenalan kolom:** pencocokan memakai **judul pertanyaan** (baris pertama header, akhiran kembar dibuang). Kolom versi lama & baru untuk data yang sama dipetakan ke satu field; saat menyimpan, **nilai pertama yang terisi** dipakai (badge "Digabung" di langkah pemetaan).

| Kolom Form (versi baru) | Field Import | Disimpan di |
|---|---|---|
| Kelurahan/Desa · Kecamatan · Kabupaten/Kota · Provinsi (set pertama) | `domicileVillage/District/City/Province` | `employee_personal.domicile_*` (teks isian) |
| idem (set kedua) | `ktpVillage/District/City/Province` | `employee_personal.ktp_*` |
| Nama Lengkap · Hubungan · No. HP · Alamat Lengkap (kelompok kedua, di ujung Sheet, urutan acak) | `emergency2Name/Relationship/Phone/Address` | `employee_personal.emergency_contact2_*` |
| Status Hubungan (Saudara Kandung n) | `sibling{n}Relation` | `family_members.relation_detail` (Kakak/Adik) |
| Pekerjaan (Anak n) | `child{n}Occupation` | `family_members.occupation` |
| Jenis Kelamin 2 (isinya = jenis kelamin Anak 1) | `child1Gender` (digabung dengan "Jenis Kelamin (Anak 1)") | `family_members.gender` |
| No. SIM A 2 · No. SIM C 2 | `simNumberA/C` (digabung dengan "No. SIM A/C") | `driving_license_numbers` |
| SIM A · SIM C (unggahan) | `attachSimA/C` | dokumen SIM (§4) |
| Divisi | `divisionName` | tidak disimpan — pencocokan unit (§6, D-064) |
| Departemen · Jabatan · Tanggal Masuk PT … | `departmentName`, `positionName`, `joinDate` | data kerja |
| Pendidikan 1 (Terbaru/Tertinggi) · Pendidikan 2/3 (Sebelumnya) + sekolah/tahun | `education{1–3}*` | riwayat pendidikan |
| Sudah Memiliki Anak? · Apakah memiliki Saudara/SIM? · Email Address · Timestamp | – | diabaikan |

**Divisi (akurat, tidak menebak)** — *diganti D-064 (§6) sejak 2026-10-09*: nama harus sama persis (huruf besar/kecil & spasi diabaikan) dengan unit berjenis **Divisi** di Struktur Organisasi. Departemen yang sudah ada harus berada di bawah divisi itu (langsung atau tidak langsung); departemen baru yang dibuat Import ditempatkan di bawah divisi tersebut (PT ikut divisi). Divisi tidak ditemukan / departemen di divisi lain → **error baris** dengan pesan jelas; divisi tidak dibuat otomatis.

**Rincian alamat:** disimpan sebagai teks isian (opsi C, pemilik projek 2026-10-08). Tahap berikutnya (Backlog): tabel wilayah resmi Kemendagri + kolom kode di samping kolom teks, terisi otomatis bila cocok persis.

**Kasus terburuk yang ditangani:** sel unggahan berisi nama file (bukan tautan) → peringatan "Bukan tautan Google Drive", kolom tetap lampiran (bukan "No. KK" yang error); kolom unggahan yang masih kosong tetap dikenali lampiran, kecuali judulnya persis nama field data ("NPWP" = nomor, "NPWP 2" = file); respons uji coba berisi NIK/email/HP tidak valid → error baris, tidak disimpan.

## 6. Data Form asli: NIP boleh kosong & cocokkan unit organisasi (D-063/D-064, 2026-10-09)

Uji xlsx respons Form asli (9 baris, 171 kolom): 6 pengisi belum tahu NIP, isian Departemen/Divisi tidak konsisten (Departemen "Operations" → Divisi "Survey"; "HRGA"/"HR & GA"; "Enginering"/"Engginering"; "Explorasi"/"Eksplorasi"), placeholder `_`, golongan darah `0`, usia "19 tahun"/"Sudah meninggal dunia", NIK 15 digit.

**NIP (D-063):** boleh kosong. Karyawan dikenali lewat **NIP, lalu NIK KTP**; import ulang yang membawa NIP **mengisi** NIP karyawan yang cocok lewat NIK (tidak mengganti NIP yang sudah ada). NIK tidak valid = peringatan (NIK tidak disimpan), kecuali NIP juga kosong → error `NO_IDENTITY`. Langkah Pemetaan cukup memetakan kolom NIP **atau** NIK KTP. Daftar karyawan: tanda "NIP belum ada" + filter; NIP yang sudah terisi tidak bisa dikosongkan; persetujuan onboarding tetap butuh NIP.

**Normalisasi otomatis (D-064):** `_`/`-`/`.` = kosong; golongan darah `0` → O; usia "N tahun" → N; "meninggal/almarhum/alm./wafat" di usia/pekerjaan → anggota keluarga **almarhum** (`family_members.is_deceased`, tampil "(almarhum)" di detail & "(alm.)" di cetak); hubungan (ISTERI → Istri, Kaka/Kakak Kandung → Kakak, Om → Paman); bank (MANDIRI/Mandiri → Bank Mandiri, bca → BCA, …); pekerjaan (Irt → Ibu Rumah Tangga, Wirasuasta → Wiraswasta, HURUF BESAR dirapikan); suku HURUF BESAR dirapikan.

**Cocokkan unit organisasi (Pratinjau):** setiap nilai unik kolom Departemen & Divisi (kunci = huruf & angka saja, jadi "HRGA" = "HR & GA") →
1. pilihan HR (unit apa pun · sama dengan nilai lain di file · buat unit baru dengan jenis & induk), diingat di profil pemetaan;
2. nama persis unit yang ada → **Cocok**;
3. mirip unit/nilai lain (beda keterangan kurung, salah ketik, singkatan, awalan sama) → **Perlu dicek**: baris error `UNIT_UNMATCHED` sampai HR memilih; tombol **Terapkan saran** memilih saran pertama;
4. selain itu → **Unit baru**: nilai kolom Departemen = Departemen (di bawah Divisi/Direktorat pasangannya bila ada); nilai kolom Divisi saja = sub-unit di bawah unit pasangannya (Departemen → Seksi), tanpa pasangan = Divisi.

Karyawan ditempatkan di unit **paling bawah** dari keduanya; tidak segaris → peringatan `UNIT_NOT_IN_LINE` (diambil yang jenjangnya paling bawah). Jabatan dibuat/dicari di unit penempatan.

**PT di Pratinjau:** PT bawaan + PT per baris (mengalahkan kolom PT di file) tanpa kembali ke langkah Unggah.

**Langkah HR untuk data Form asli:** Unggah → Pemetaan → **Lengkapi data** (hanya bila ada pilihan wajib; kartu bernomor, lanjut terkunci sampai selesai): (1) PT bawaan, (2) **Unit organisasi** (Terapkan saran lalu cek satu per satu; "Engineering" vs "Engineering (ACP)" harus dipilih karena unit ACP bisa berbeda PT; unit cocok/baru cukup ringkasan + "Ubah"), (3) status kepegawaian bawaan → **Pratinjau** (ringkasan + "Ubah pengaturan", tabel langsung menampilkan Error dengan petunjuk; PT & status per baris; perbaiki baris `NO_IDENTITY` di Sheet lewat "Unduh baris bermasalah") → Simpan. Tombol **"?"** di halaman membuka panduan langkah-langkah ini. **Per PT (2026-10-09):** satu file boleh berisi beberapa PT; nilai Departemen/Divisi dicocokkan per PT (label "PT ACP · …"), hanya ke unit milik PT itu atau unit grup; unit baru milik PT karyawannya, nama bentrok diberi akhiran kode PT. Daftar unit berurutan tetap (tidak berpindah setelah dipilih); jenis & induk unit baru selalu terlihat.

