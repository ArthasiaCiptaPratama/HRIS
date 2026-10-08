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
3. Tambah kolom data kerja yang tidak ditanyakan Form: **Perusahaan** (kode PT) bila tidak memakai PT bawaan, **Status karyawan**, **Jabatan**, **Departemen/unit**, **Tanggal masuk**.
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
