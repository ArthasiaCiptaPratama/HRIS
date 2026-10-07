# Rencana Uji — Import Sheet Respons Google Form "Formulir Data Karyawan" (D-059, 2026-10-07)

- **Ruang lingkup:** Import Data Karyawan (D-042) untuk ekspor Sheet respons Google Form: pemetaan otomatis header Form (termasuk header ganda, kolom keluarga, kolom tautan unggahan, kolom otomatis Google), field baru (email pribadi, nama panggilan, kebangsaan, suku, golongan darah, jenis & no. SIM), pilihan Form ("Sudah/Belum Menikah", jenjang pendidikan), format tanggal DD/MM. Item PROGRESS Fase 4 "Pendataan karyawan existing lewat Google Form".
- **Aturan yang diuji:** D-059, D-042 (pratinjau, previewHash, kolom sensitif butuh grant), PLAN §4.2 (data pribadi; bukti tanpa data asli).
- **Di luar lingkup:** bagian keluarga, riwayat pendidikan 2–3, sertifikasi, kontak darurat lengkap, No. SIM per jenis (rencana berikutnya); unggah dokumen; staging.
- **Lingkungan:** lokal Linux — PostgreSQL 17 (DB `hris`, migrasi `20261007100618_add_employee_personal_form_fields`), API + web lokal, login Supabase staging sungguhan (SA); Playwright Chromium.
- **Data uji:** CSV dummy berheader judul pertanyaan Form (`QA-IMPFORM-*`); ekspor Sheet sungguhan dari pemilik projek hanya dipakai untuk pemetaan & pratinjau via API (nilai tidak dicetak/difoto, tidak disimpan).
- **Kriteria lulus:** semua P1 & P2 LULUS; typecheck, lint, boundaries, `db:check`, seluruh test, build hijau; data uji dibersihkan.
- **Suite:** [cases/employee.md](../cases/employee.md) TC-EMP-169, TC-EMP-170 (TC-EMP-161…168, 171, 172 DIHAPUS bersama jalur Apps Script).
