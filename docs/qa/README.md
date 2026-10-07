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
| Kasus | [cases/staging.md](cases/staging.md) | TC-STG-001 s.d. TC-STG-058 |
| Kasus | [cases/employee.md](cases/employee.md) | TC-EMP-001 s.d. TC-EMP-172 |
| Kasus | [cases/administrasi.md](cases/administrasi.md) | TC-ADM-001 s.d. TC-ADM-052 |
| Hasil | [runs/2026-09-29-staging.md](runs/2026-09-29-staging.md) | Staging `43b2b69`: API 43/43, UI 31/31 LULUS; BUG-001 (P3) |
| Hasil | [runs/2026-09-29-personal-management.md](runs/2026-09-29-personal-management.md) | Lokal, Linux; semua P1 & P2 LULUS; + sesi akun HR (18/18) |
| Hasil | [runs/2026-09-29-detail-print.md](runs/2026-09-29-detail-print.md) | Lokal, Linux: test api 248 · web 54, Playwright lokal 31/31 + staging 18/18 LULUS; 3 temuan diperbaiki saat uji |
| Hasil | [runs/2026-09-29-foto-profil.md](runs/2026-09-29-foto-profil.md) | Lokal + Storage staging: api 265 · web 64, smoke Storage, Playwright lokal 9/9 + staging 6/6 LULUS |
| Hasil | [runs/2026-09-30-seragam-admin.md](runs/2026-09-30-seragam-admin.md) | Lokal: api 271 · web 72 (SMTP terisi), Playwright 31/31; staging `b7828a0` 31/31; unggah foto berprefix sungguhan ✔ — LULUS |
| Hasil | [runs/2026-09-30-grup-kategori.md](runs/2026-09-30-grup-kategori.md) | Lokal: api 272 · web 82, Playwright 19/19; staging `1da5e2d` 19/19 (seed ulang master data) — LULUS |
| Hasil | [runs/2026-09-30-menu-be.md](runs/2026-09-30-menu-be.md) | Lokal: web 84 (+1 dilewati), Playwright 15/15 (alur tulis sungguhan, data dikembalikan); staging `c30ef30` 9/9 (hanya baca); menu c–e aktif di staging 2026-10-05 — LULUS |
| Hasil | [runs/2026-09-30-multi-pt.md](runs/2026-09-30-multi-pt.md) | Lokal: api 318 · web 88, Playwright 16/16; bug CORS PUT diperbaiki; staging 2026-10-05 (gelombang 1) LULUS — **LEGIT** |
| Hasil | [runs/2026-09-30-audit-ui.md](runs/2026-09-30-audit-ui.md) | Audit UI menyeluruh 106 keadaan (axe + keluar wadah + konsol): 90 → 0 temuan setelah Paket A |
| Hasil | [runs/2026-09-30-import-karyawan.md](runs/2026-09-30-import-karyawan.md) | Lokal: shared 63 · api 341 · web 96, Playwright 13/13 (template dummy, data dibersihkan); staging 2026-10-05 s.d. pratinjau LULUS — **LEGIT** |
| Hasil | [runs/2026-09-30-rilis-import.md](runs/2026-09-30-rilis-import.md) | Lokal (DB `hris_release`): shared 63 · api 301 · web 93, Playwright 15/15 — LULUS; staging menyusul |
| Hasil | [runs/2026-10-01-master-data.md](runs/2026-10-01-master-data.md) | Lokal: shared 73 · api 370 · web 105 (+1 dilewati), mutasi 3 perbaikan terkait tertangkap; + D-050 & peta; staging 2026-10-05 browser 4 role LULUS (BUG-002 P3 terbuka) — **LEGIT** |
| Hasil | [runs/2026-10-02-onboarding-a.md](runs/2026-10-02-onboarding-a.md) | Lokal a+b: shared 98 · api 416 · web 117 — LULUS otomatis; browser, email sungguhan & bucket dokumen belum |
| Hasil | [runs/2026-10-05-org-chart.md](runs/2026-10-05-org-chart.md) | Lokal: shared 118 · api 458 · web 179, Playwright 21/21 (4 temuan diperbaiki, termasuk tombol kotak bagan tak bisa diklik) — LULUS lokal (staging belum) |
| Hasil | [runs/2026-10-05-arsip-1a.md](runs/2026-10-05-arsip-1a.md) | Lokal: shared 125 · api 474 · web 184, Playwright 22/22 (bug dialog tambah saat daftar kosong diperbaiki) — LULUS lokal |
| Hasil | [runs/2026-10-05-arsip-1b.md](runs/2026-10-05-arsip-1b.md) | Lokal: shared 133 · api 493 · web 190, Playwright 19/19 — LULUS lokal |
| Hasil | [runs/2026-10-07-arsip-1c.md](runs/2026-10-07-arsip-1c.md) | Lokal: shared 140 · api 521 · web 199, Playwright 19/19 — LULUS lokal |
| Hasil | [runs/2026-10-07-import-form.md](runs/2026-10-07-import-form.md) | Lokal: Playwright Import 4/4 + ekspor Sheet sungguhan (24 kolom terpetakan) — LULUS lokal |
| Bukti visual | `/mnt/winD/WORK/Magang/QA/<tanggal>-<target>/` | Di luar repo (skill hris-qa-docs) |
| Bug | [bugs/BUG-002-peta-tanpa-label-aksesibel.md](bugs/BUG-002-peta-tanpa-label-aksesibel.md) | P3 DIPERBAIKI di develop `d4d66f1` (staging menyusul): elemen peta geofence tanpa `aria-label` |
| Bug | [bugs/BUG-001-hydratefallback-warning.md](bugs/BUG-001-hydratefallback-warning.md) | P3 DIPERBAIKI: warning konsol `HydrateFallback` (test `router-hydration.test.tsx`) |
