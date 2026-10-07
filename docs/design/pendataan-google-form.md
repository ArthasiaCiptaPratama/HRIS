# Desain — Pendataan Karyawan Existing dari Google Form lewat Import (D-059)

> Keputusan: **D-059** di [PLAN §8](../PLAN.md#8-keputusan-adr-ringkas) (dibangun di atas Import D-042, [import-karyawan.md](import-karyawan.md)).
> Status: **[done] lokal 2026-10-07** — Import mengenali Sheet respons "Formulir Data Karyawan". Belum: bagian keluarga, riwayat pendidikan, sertifikasi, kontak darurat lengkap, No. SIM per jenis (rencana berikutnya, §3). Checklist: PROGRESS Fase 4 → "Pendataan karyawan existing lewat Google Form".
> Dokumen ini tidak memuat data asli.

Karyawan existing yang belum ada di HRIS mengisi **Google Form** "Formulir Data Karyawan"; responsnya masuk Google Sheet, lalu HR memasukkannya ke HRIS lewat **Import Data Karyawan** (pratinjau, pemetaan kolom diingat, simpan satu transaksi). Tidak ada integrasi otomatis Form → HRIS.

## 1. Alur: Sheet respons Form → Import Data Karyawan (manual)

Dipilih pemilik projek 2026-10-07: migrasi karyawan existing bersifat satu kali/bertahap; Import (D-042) sudah mendukung lebih banyak field teks (KK, NPWP, BPJS, rekening, kontak darurat, pendidikan) tanpa infrastruktur tambahan.

**Langkah HR**
1. Google Form → tab **Jawaban** → **Tautkan ke Spreadsheet** (sekali).
2. Sheet → **File → Download → Microsoft Excel (.xlsx)**.
3. Tambah kolom data kerja yang tidak ditanyakan Form: **Perusahaan** (kode PT) bila tidak memakai PT bawaan, **Status karyawan**, **Jabatan**, **Departemen/unit**, **Tanggal masuk**.
4. HRIS → **Personal Management › Import Data Karyawan** → unggah → periksa **Pemetaan** (diingat per susunan kolom) → **Pratinjau** → Simpan. Kolom "Timestamp"/"Stempel waktu" dan "Alamat email" (akun Google pengisi) otomatis diabaikan.
5. Foto & dokumen di Sheet hanya **tautan Drive** (kolom tautan otomatis diabaikan Import) → unggah manual di tab Dokumen karyawan.
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

Data keluarga (pasangan, anak, orang tua, saudara), sertifikasi, dan dokumen belum didukung Import (tidak dipetakan) — tahap berikutnya.


## 2. Riwayat keputusan

- 2026-10-07 (grill): rencana awal = Apps Script di Form mengirim ke API (antrean review, foto ke Storage, token per Form). Dibangun & diuji lokal, lalu **dihapus total** atas keputusan pemilik projek: untuk pendataan yang dilakukan HR secara manual/bertahap, jalur itu menambah 3 tabel, ±7 endpoint, 3 halaman, cron, token, dan URL publik/tunnel tanpa dipakai. Bila kelak dibutuhkan pendataan otomatis, rancang ulang dari kebutuhan saat itu.
- Yang dipertahankan dari pekerjaan itu: kolom data pribadi baru (`nickname`, `nationality`, `ethnicity`, `blood_type`, `driving_license_types`, `driving_license_number` — migrasi `20261007100618_add_employee_personal_form_fields`), perluasan Import, istilah layar **NIP** (D-048).

## 3. Rencana berikutnya (menunggu persetujuan)

Keputusan pemilik projek 2026-10-07: semua bagian Form ikut Import.

| Bagian Form | Tujuan | Perubahan skema |
|---|---|---|
| Pasangan, anak (1–5), orang tua, saudara (1–5) | `family_members` | + jenis kelamin, tempat lahir, pendidikan, pekerjaan, usia, alamat kerja |
| Pendidikan terakhir 1–3 | `educations` | + tahun masuk |
| Sertifikasi (K3 Umum, POP, POM, POU, SMKP, SMK3, PROPER, ISO …) + No. & Tahun | `trainings` (Arsip › Pelatihan) | + nomor sertifikat |
| Kontak darurat | kolom `employees` | + alamat kontak darurat |
| No. SIM A / C / … | `employee_personal` | nomor per jenis SIM (jsonb) |

Kolom generik berulang ("Usia", "Pendidikan", "Pekerjaan" ayah/ibu; "Nama Lengkap"/"No. HP" kontak darurat) dikenali dari kolom penanda sebelumnya (mis. setelah "Nama Lengkap Ayah"). Dokumen (KTP, KK, ijazah, buku rekening, file sertifikat) tetap diunggah manual.
