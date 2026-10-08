# Hasil Uji — Staging Rilis Gelombang 2: Import Data Karyawan + Struktur Organisasi (2026-10-08)

- **Commit:** rilis `cca191e` (develop `f092efe` + saklar `c226230`) · **Env:** staging (`hris-staging-web` / `hris-staging-api`, Supabase staging), `Deploy staging` #37762327378 & #37764701481 ✔ · login akun uji SA/HR/EMP.
- **Staging (MCP):** 25 migrasi, 0 bermasalah; jenis dokumen SIM tanpa masa berlaku; advisor security/performance tanpa temuan baru; health api 200, web 200.
- **Data:** seed ulang + pembersihan → 69 karyawan (66 pemegang pos bagan + 3 karyawan akun uji). Data QA (karyawan `QA-STG-*`, dokumen & foto Storage, jabatan uji, job import, profil pemetaan, audit) **dihapus** setelah uji (`QA/2026-10-08-staging-gel2/cleanup-qa.ts`).
- **Playwright staging:** `/mnt/winD/WORK/Magang/QA/2026-10-08-staging-gel2/staging-ui.ts` (xlsx dummy 171 kolom + Perusahaan + Status).

| ID | Hasil | Bukti / catatan |
|---|---|---|
| SG-01 | LULUS | Pemetaan otomatis 167 kolom (Divisi, rincian alamat, kontak darurat 2, status saudara, Perusahaan, Status, badge Digabung) — `sg-01-pemetaan.png`, `sg-mapping.txt` |
| SG-02 | LULUS | Pratinjau: 2 dibuat; baris asal-isi (NIK/HP/email) & Divisi tidak cocok → error dengan pesan — `sg-02-pratinjau.png` |
| SG-03/04/05 | LULUS | Simpan 2 karyawan; tampil di daftar; detail Pribadi: alamat + rincian, kontak darurat 2, SIM per jenis |
| SG-06 | LULUS (kriteria dikoreksi) | Bagan pos jabatan tampil (cabang terlipat bertahap; 22 kotak awal, sama dengan dev) — `sg-06-bagan.png` |
| SG-07 | LULUS | Penerimaan, Arsip, Layanan Mandiri, Pengajuan Data, Jenis dokumen → "sedang disiapkan" |
| SG-08 | LULUS | 0 error konsol (SA) |
| SG-09 | LULUS | HR membuka Import ✔; EMPLOYEE ditolak ✔ |
| SG-10 | LULUS (run 2) | File Form **asli** (salinan sementara, data kerja diganti dummy): **8/8 lampiran masuk** (foto + KTP, KK, NPWP, ijazah, buku rekening, SIM A, SIM C) lewat service account staging; data & file dihapus sesudahnya — `sg-10-lampiran-panel.png` |

**Temuan (diperbaiki):** run 1 SG-10 — kolom "Kartu Keluarga" berisi tautan dibaca No. KK karena **profil pemetaan** tersimpan saat kolom itu kosong (QA SG-01) → `f092efe` (kolom berisi tautan Drive mengalahkan field data dari profil) + test regresi, dirilis PR #37/#38.
