# QA HRIS — Indeks

Jejak **aturan (PLAN) → kasus uji → test otomatis/manual → hasil**. Format: skill `hris-qa-docs`.

| Jenis | File | Keterangan |
|---|---|---|
| Rencana | [plans/2026-09-29-staging.md](plans/2026-09-29-staging.md) | Staging Vercel (D-036): smoke, auth sungguhan, matriks akses, UI per role |
| Rencana | [plans/2026-09-29-personal-management.md](plans/2026-09-29-personal-management.md) | Target D-035: web Personal Management + API employee/organization |
| Rencana | [plans/2026-09-29-detail-print.md](plans/2026-09-29-detail-print.md) | Detail pegawai layar penuh, riwayat "diubah oleh", Print data (.xlsx) |
| Rencana | [plans/2026-09-29-foto-profil.md](plans/2026-09-29-foto-profil.md) | Foto profil + bucket Supabase `employee-photos` (D-037), foto ikut ter-print |
| Rencana | [plans/2026-09-30-seragam-admin.md](plans/2026-09-30-seragam-admin.md) | Seragam halaman Administrasi & Akun Saya, prefix Storage lokal, SMTP di test |
| Rencana | [plans/2026-09-30-grup-kategori.md](plans/2026-09-30-grup-kategori.md) | D-038: sidebar Data Karyawan Aktif per grup (Internal / Magang / Eksternal), kategori Percobaan & Vendor, istilah Karyawan |
| Rencana | [plans/2026-09-30-menu-be.md](plans/2026-09-30-menu-be.md) | Menu Ubah Status Karyawan (ubah kategori & nonaktifkan) |
| Rencana | [plans/2026-09-30-multi-pt.md](plans/2026-09-30-multi-pt.md) | Tahap 2: multi-perusahaan & cakupan PT (D-039/D-040) |
| Rencana | [plans/2026-09-30-import-karyawan.md](plans/2026-09-30-import-karyawan.md) | Import Data Karyawan CSV/Excel (D-041/D-042) dari Data Karyawan Aktif |
| Rencana | [plans/2026-09-30-rilis-import.md](plans/2026-09-30-rilis-import.md) | Rilis import data karyawan (tanpa multi-PT) + dashboard SA/HR |
| Rencana | [plans/2026-10-01-master-data.md](plans/2026-10-01-master-data.md) | Tahap 3: CRUD Master Data (D-049) + dampak ke form karyawan, import, Atur PT |
| Rencana | [plans/2026-10-02-onboarding-a.md](plans/2026-10-02-onboarding-a.md) | Onboarding bagian a: penerimaan calon & undangan aktivasi (D-045); bagian b (wizard) ditambahkan di file yang sama |
| Rencana | [plans/2026-10-05-org-chart.md](plans/2026-10-05-org-chart.md) | Bagan organisasi interaktif: pos jabatan, unit per PT, atasan otomatis (D-051–D-053) |
| Rencana | [plans/2026-10-05-arsip-1a.md](plans/2026-10-05-arsip-1a.md) | Arsip karyawan gelombang 1a: Kontak, Pendidikan, Riwayat Jabatan, Pelatihan, Riwayat Kerja (D-054) |
| Rencana | [plans/2026-10-05-arsip-1b.md](plans/2026-10-05-arsip-1b.md) | Arsip karyawan gelombang 1b: dokumen, jenis dokumen, Data File, pengingat kedaluwarsa (D-055) |
| Rencana | [plans/2026-10-07-arsip-1c.md](plans/2026-10-07-arsip-1c.md) | Arsip karyawan gelombang 1c: pengajuan perubahan data ESS, antrean HR, Data Keluarga & Bank (D-054) |
| Rencana | [plans/2026-10-07-import-form.md](plans/2026-10-07-import-form.md) | Import Sheet respons Google Form "Formulir Data Karyawan" (D-059) |
| Rencana | [plans/2026-10-08-lampiran-drive.md](plans/2026-10-08-lampiran-drive.md) | Lampiran Google Drive di Import (D-060) |
| Rencana | [plans/2026-10-08-arsip-1d.md](plans/2026-10-08-arsip-1d.md) | Arsip gelombang 1d: ekspor Excel & cetak (D-058) |
| Rencana | [plans/2026-10-08-import-form-v2.md](plans/2026-10-08-import-form-v2.md) | Import Form versi 171 kolom (D-061) |
| Rencana | [plans/2026-10-12-import-lengkapi.md](plans/2026-10-12-import-lengkapi.md) | Import data Form asli: NIP opsional, unit organisasi, status bawaan, Lengkapi data (D-062–D-064) |
| Rencana | [plans/2026-10-12-dashboard.md](plans/2026-10-12-dashboard.md) | Dashboard yang bisa diatur (D-065) + ringkasan SA/HR |
| Rencana | [plans/2026-10-12-istilah-nip.md](plans/2026-10-12-istilah-nip.md) | Istilah NIP di seluruh tampilan |
| Rencana | [plans/2026-10-12-lampiran-ui.md](plans/2026-10-12-lampiran-ui.md) | Tampilan proses lampiran Drive & ketahanan koneksi (TC-EMP-207/208) |
| Rencana | [plans/2026-10-12-onboarding-e2e.md](plans/2026-10-12-onboarding-e2e.md) | Alur onboarding ujung ke ujung: admin → calon → review → login NIP (D-045–D-048) |
| Rencana | [plans/2026-10-12-email-template.md](plans/2026-10-12-email-template.md) | Template email Invite & Reset bermerek + alur atur password (TC-ADM-053…057) |
| Rencana | [plans/2026-10-13-staging-arsip.md](plans/2026-10-13-staging-arsip.md) | Arsip gel. 1 & Layanan Mandiri di staging, rilis gel. 6 (TC-STG-059…072) |
| Rencana | [plans/2026-10-14-aset-lokal.md](plans/2026-10-14-aset-lokal.md) | Aset & APD gel. 2a lokal (TC-EMP-215…226) |
| Rencana | [plans/2026-10-15-sp-lokal.md](plans/2026-10-15-sp-lokal.md) | Surat Peringatan gel. 2b lokal (TC-EMP-227…238) |
| Kasus | [cases/staging.md](cases/staging.md) | TC-STG-001 s.d. TC-STG-058 |
| Kasus | [cases/employee.md](cases/employee.md) | TC-EMP-001 s.d. TC-EMP-238 |
| Kasus | [cases/administrasi.md](cases/administrasi.md) | TC-ADM-001 s.d. TC-ADM-057 |
| Hasil | [runs/2026-09-29-staging.md](runs/2026-09-29-staging.md) | Staging `43b2b69`: API 43/43, UI 31/31 LULUS; BUG-001 (P3) |
| Hasil | [runs/2026-09-29-personal-management.md](runs/2026-09-29-personal-management.md) | Lokal, Linux; semua P1 & P2 LULUS; + sesi akun HR (18/18); staging 2026-10-12 E-01/E-02 — **LEGIT** |
| Hasil | [runs/2026-09-29-detail-print.md](runs/2026-09-29-detail-print.md) | Lokal, Linux: test api 248 · web 54, Playwright lokal 31/31 + staging 18/18 LULUS; 3 temuan diperbaiki saat uji |
| Hasil | [runs/2026-09-29-foto-profil.md](runs/2026-09-29-foto-profil.md) | Lokal + Storage staging: api 265 · web 64, smoke Storage, Playwright lokal 9/9 + staging 6/6 LULUS |
| Hasil | [runs/2026-09-30-seragam-admin.md](runs/2026-09-30-seragam-admin.md) | Lokal: api 271 · web 72 (SMTP terisi), Playwright 31/31; staging `b7828a0` 31/31; unggah foto berprefix sungguhan ✔ — LULUS |
| Hasil | [runs/2026-09-30-grup-kategori.md](runs/2026-09-30-grup-kategori.md) | Lokal: api 272 · web 82, Playwright 19/19; staging `1da5e2d` 19/19 (seed ulang master data) — LULUS |
| Hasil | [runs/2026-09-30-menu-be.md](runs/2026-09-30-menu-be.md) | Lokal: web 84 (+1 dilewati), Playwright 15/15 (alur tulis sungguhan, data dikembalikan); staging `c30ef30` 9/9 (hanya baca); menu c–e aktif di staging 2026-10-05 — LULUS |
| Hasil | [runs/2026-09-30-multi-pt.md](runs/2026-09-30-multi-pt.md) | Lokal: api 318 · web 88, Playwright 16/16; bug CORS PUT diperbaiki; staging 2026-10-05 (gelombang 1) LULUS — **LEGIT** |
| Hasil | [runs/2026-09-30-audit-ui.md](runs/2026-09-30-audit-ui.md) | Audit UI menyeluruh 106 keadaan (axe + keluar wadah + konsol): 90 → 0 temuan setelah Paket A |
| Hasil | [runs/2026-09-30-import-karyawan.md](runs/2026-09-30-import-karyawan.md) | Lokal: shared 63 · api 341 · web 96, Playwright 13/13 (template dummy, data dibersihkan); staging 2026-10-05 s.d. pratinjau LULUS — **LEGIT** |
| Hasil | [runs/2026-09-30-rilis-import.md](runs/2026-09-30-rilis-import.md) | Lokal (DB `hris_release`): shared 63 · api 301 · web 93, Playwright 15/15 — LULUS lokal; bukti staging tanpa catatan hasil (tidak diarsipkan; dashboard diuji ulang bersama D-065) |
| Hasil | [runs/2026-10-01-master-data.md](runs/2026-10-01-master-data.md) | Lokal: shared 73 · api 370 · web 105 (+1 dilewati), mutasi 3 perbaikan terkait tertangkap; + D-050 & peta; staging 2026-10-05 browser 4 role LULUS (BUG-002 P3 terbuka) — **LEGIT** |
| Hasil | [runs/2026-10-02-onboarding-a.md](runs/2026-10-02-onboarding-a.md) | Lokal a+b: shared 98 · api 416 · web 117 — LULUS otomatis; browser, email sungguhan & bucket dokumen belum |
| Hasil | [runs/2026-10-05-org-chart.md](runs/2026-10-05-org-chart.md) | Lokal: shared 118 · api 458 · web 179, Playwright 21/21 (4 temuan diperbaiki, termasuk tombol kotak bagan tak bisa diklik); staging gel. 2 SG-06 ✔ — **LEGIT** |
| Hasil | [runs/2026-10-05-arsip-1a.md](runs/2026-10-05-arsip-1a.md) | Lokal: shared 125 · api 474 · web 184, Playwright 22/22 (bug dialog tambah saat daftar kosong diperbaiki) — LULUS lokal |
| Hasil | [runs/2026-10-05-arsip-1b.md](runs/2026-10-05-arsip-1b.md) | Lokal: shared 133 · api 493 · web 190, Playwright 19/19 — LULUS lokal |
| Hasil | [runs/2026-10-07-arsip-1c.md](runs/2026-10-07-arsip-1c.md) | Lokal: shared 140 · api 521 · web 199, Playwright 19/19 — LULUS lokal |
| Hasil | [runs/2026-10-07-import-form.md](runs/2026-10-07-import-form.md) | Lokal: Playwright Import 4/4 + Import lengkap 8/8; ekspor Sheet sungguhan 119/138 kolom terpetakan; staging gel. 2 SG-01–05, SG-09 ✔ — **LEGIT** |
| Hasil | [runs/2026-10-08-lampiran-drive.md](runs/2026-10-08-lampiran-drive.md) | Lokal: test shared 166 · api 539 · web 202; Playwright lampiran 7/7; staging gel. 2 SG-10 file asli 8/8 ✔ — **LEGIT** |
| Hasil | [runs/2026-10-08-arsip-1d.md](runs/2026-10-08-arsip-1d.md) | Lokal: test shared 169 · api 544 · web 206; Playwright 7/7 — LULUS lokal |
| Hasil | [runs/2026-10-08-import-form-v2.md](runs/2026-10-08-import-form-v2.md) | Lokal: test shared 175 · api 547 · web 206; Playwright 8/8; staging gel. 2 (TC-EMP-192 SIM A/C ✔) — **LEGIT** |
| Hasil | [runs/2026-10-08-staging-gel2.md](runs/2026-10-08-staging-gel2.md) | Staging rilis gel. 2: Playwright 10/10 + lampiran file asli 8/8 — LULUS staging |
| Hasil | [runs/2026-10-12-import-lengkapi.md](runs/2026-10-12-import-lengkapi.md) | Lokal 2026-10-09 + staging gel. 4 A-01–A-07 7/7 — **LEGIT** |
| Hasil | [runs/2026-10-12-dashboard.md](runs/2026-10-12-dashboard.md) | Lokal (api 598 · web 206) + staging C-01–C-07 (C-05a/b) LULUS — **LEGIT** |
| Hasil | [runs/2026-10-12-istilah-nip.md](runs/2026-10-12-istilah-nip.md) | Staging D-01 LULUS — **LEGIT** |
| Hasil | [runs/2026-10-12-lampiran-ui.md](runs/2026-10-12-lampiran-ui.md) | Lokal 8/8; staging gel. 4 B-04 GAGAL → BUG-003 → staging 4.1 8/8 — **LEGIT** |
| Hasil | [runs/2026-10-12-onboarding-e2e.md](runs/2026-10-12-onboarding-e2e.md) | Lokal 15 langkah + staging gel. 5 (S/C/H/L 10 langkah, HR ber-grant) LULUS — **LEGIT** |
| Hasil | [runs/2026-10-12-email-template.md](runs/2026-10-12-email-template.md) | Render lokal + staging alur atur password 14/14 + email diterima (dikonfirmasi pemilik projek) — **LEGIT** |
| Hasil | [runs/2026-10-13-staging-arsip.md](runs/2026-10-13-staging-arsip.md) | Staging rilis gel. 6: rilis web 233 (0 dilewati), API & UI 14/14 — Arsip gel. 1 + Layanan Mandiri **LEGIT** |
| Hasil | [runs/2026-10-14-aset-lokal.md](runs/2026-10-14-aset-lokal.md) | Lokal: shared 215 · api 713 · web 262, Playwright 12/12 (nomor BAST unik diperbaiki saat uji) — LULUS lokal |
| Hasil | [runs/2026-10-15-sp-lokal.md](runs/2026-10-15-sp-lokal.md) | Lokal: shared 227 · api 759 · web 270, Playwright 12/12 — LULUS lokal |
| Bukti visual | `/mnt/winD/WORK/Magang/QA/<tanggal>-<target>/` | Di luar repo (skill hris-qa-docs) |
| Bug | [bugs/BUG-004-sapaan-dashboard-pakai-email.md](bugs/BUG-004-sapaan-dashboard-pakai-email.md) | P3 DITUTUP 2026-10-12 (staging gel. 5): sapaan Dashboard memakai email akun, bukan nama karyawan |
| Bug | [bugs/BUG-003-lampiran-macet-koneksi-menggantung.md](bugs/BUG-003-lampiran-macet-koneksi-menggantung.md) | P2 DITUTUP 2026-10-12 (staging 4.1): panel lampiran macet saat koneksi menggantung |
| Bug | [bugs/BUG-002-peta-tanpa-label-aksesibel.md](bugs/BUG-002-peta-tanpa-label-aksesibel.md) | P3 DITUTUP 2026-10-12 (terverifikasi staging): elemen peta geofence tanpa `aria-label` |
| Bug | [bugs/BUG-001-hydratefallback-warning.md](bugs/BUG-001-hydratefallback-warning.md) | P3 DIPERBAIKI: warning konsol `HydrateFallback` (test `router-hydration.test.tsx`) |
