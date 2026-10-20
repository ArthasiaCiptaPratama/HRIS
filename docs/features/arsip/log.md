# Log — Arsip karyawan & Layanan Mandiri

Entri terbaru di **atas**. Format satu entri (salin):

```
### YYYY-MM-DD — <judul singkat> (<PIC>)
- **Dikerjakan:** … (rujuk item checklist README)
- **Keputusan:** <PREFIX>-Dn baru / OD terjawab
- **Verifikasi:** perintah + hasil nyata
- **Masalah / catatan:** …
- **Berikutnya:** …
```

Log sebelum 2026-10-13 ada di [archive/log-2026-09.md](../../archive/log-2026-09.md) dan [archive/log-2026-10.md](../../archive/log-2026-10.md) (cari judul atau D-xxx fitur ini).

### 2026-10-20 — Rilis gel. 12: Laporan batch 2 ke staging (Oatse)
- **Dikerjakan:** commit `9f7f4e9` (batch 2 + perbaikan audit) & `8cda6b8` (docs QA), merge `HRIS/Mat/Mac` (`69b20a5`), push develop, rilis `e2485b6` → PR #59/#60 → Deploy staging #39390300300 (checklist "Rilis staging + QA staging").
- **Keputusan:** saklar rilis `timeManagement` tetap `false` (pemilik projek: "lokal dulu"); commit/PR tanpa baris atribusi (permintaan pemilik projek).
- **Verifikasi:** CI develop #39389385376 ✔ · CI PR #59/#60 ✔ · verifikasi rilis shared 268 · api 840 · web 285 (+5 dilewati) · deploy ✔ (staging 38 migrasi, 0 gagal) · smoke health/web 200, 6 endpoint baru 401 tanpa token · advisor tanpa temuan baru.
- **Masalah / catatan:** QA staging belum jalan — token sesi Zen staging kedaluwarsa (refresh token tidak dipakai).
- **Berikutnya:** QA staging batch 2 (script `qa-laporan-batch2.ts` dengan `QA_WEB`/`QA_API` staging), lalu Fase 5 Time Management.

### 2026-10-20 — Audit Laporan: bilah filter sticky, 10 tab, tanggal WIB pengajuan (Oatse)
- **Dikerjakan:** audit ulang batch 2 atas temuan pemilik projek (bilah filter menutupi isi). (1) `reports-page.tsx` bilah filter `md:top-14` → `md:top-0` — sejak `bdf869e` (header tetap, 2026-10-19) yang digulir `<main>`, offset lama menyisakan celah 56px (bug sejak batch 1); halaman lain tidak memakai offset itu. (2) 10 tab tidak muat di 1440px (Ulang tahun terpotong, Aset & Pengajuan data tersembunyi) → `md:flex-wrap`, HP tetap geser + tab aktif digulir masuk layar. (3) Pengajuan data: tahun/bulan/umur antrean dari tanggal WIB (sebelumnya potongan tanggal UTC). (4) Mutasi: `historyId` sebagai kunci baris. (5) Catatan batasan mutasi (hanya karyawan yang saat ini di PT/unit terpilih) di halaman, Excel, codemap; CODEMAP.md & indeks qa/README.md diperbarui.
- **Keputusan:** –
- **Verifikasi:** typecheck ✔ · biome ✔ · boundaries ✔ · build ✔ · shared 268 · api 826 (integration batch 2: kasus 31 Des 20.00 UTC = 1 Jan WIB) · web 281 (`--maxWorkers=2`). QA ulang: lihat `docs/qa/runs/2026-10-20-laporan-batch2-lokal.md` putaran audit.
- **Masalah / catatan:** bug (1) & (2) sebenarnya terlihat di screenshot QA putaran 1 (Q-04, Q-05) tetapi terlewat saat ditinjau → script QA ditambah cek posisi sticky & visibilitas tab.
- **Berikutnya:** commit (izin), rilis staging.

### 2026-10-20 — Laporan batch 2: masa kerja, demografi, mutasi & promosi, ulang tahun, aset, pengajuan data (Oatse)
- **Dikerjakan:** checklist "Batch 2" gel. 3 Laporan. Shared `report.ts` (`fullYears`, `tenureBucket`/`ageBucket` memakai kelompok Dashboard, `jubileeYears`, `movementKind`, `averageDays`, `monthQuerySchema`, 6 jenis laporan baru); employee `report-data` (`listDemographicFacts` — tanggal lahir tidak keluar modul, hanya kelompok usia; `listBirthdaysInMonth` — `MM-DD` saja; `listMovements`; `listDataChangeFacts` tanpa nilai); asset `report-data.service.ts` baru (`listAssetsForReport` tanpa harga, `listUnreturnedPpeForReport`); report: `report-common.ts` (cakupan + pembantu ekspor dipindah dari `report.service.ts`), `report-batch2.service.ts` (6 laporan + sheet Excel), `canListDataChanges`, 12 route baru. Web: 6 tab di `features/reports/components/tabs/`, filter Bulan (`?bulan=`), pembantu dipisah ke `report-helpers.ts` & `components/report-state.tsx`.
- **Keputusan:** ARS-D21 (definisi & akses batch 2, grill 2026-10-20 semua rekomendasi).
- **Verifikasi:** typecheck ✔ · `bunx biome ci .` ✔ · boundaries ✔ (480 modul) · build ✔ · test shared **268** · api **826** · web **281** (`--maxWorkers=2`; suite penuh paralel sambil dev server jalan: 2–3 test lama timeout acak — arsip/company-scope/dashboard/import-attachments — lulus saat diulang) · QA lokal Playwright **12/12**, 0 error JS/5xx (`docs/qa/runs/2026-10-20-laporan-batch2-lokal.md`).
- **Masalah / catatan:** konstanta `TENURE_BUCKETS`/`AGE_BUCKETS` sudah ada di `dashboard.ts` (rentang sama) → dipakai ulang, bukan dibuat baru. Tabel rincian 7 kolom terpotong di panel 7/12 → grafik 4/12 + tabel 8/12; KPI Aset 6 → 5 kartu. Data lokal tidak punya mutasi 2026 (keadaan kosong teruji, angka diuji di integration).
- **Berikutnya:** commit ke `HRIS/Oatse/Linux-Windows` (izin), rilis staging + QA staging; Fase 5 Time Management.

### 2026-10-19 — Perbaikan: setuju pengajuan Keluarga tidak lagi menghapus kolom lain (Oatse)
- **Dikerjakan:** `onboarding-wizard.repository.ts` `replaceFamily` (dipakai pengajuan FAMILY & wizard onboarding): anggota dengan hubungan + nama sama diperbarui (kolom Import/HR seperti pendidikan, pekerjaan, almarhum tetap), yang hilang dihapus, yang baru dibuat.
- **Keputusan:** –
- **Verifikasi:** integration `data-changes.test.ts` 11 (+1).
- **Masalah / catatan:** ditemukan saat memetakan form Ubah data (EMP-D4, karyawan/log).
- **Berikutnya:** ikut rilis bersama EMP-D4.

### 2026-10-19 — Perbaikan UI/UX Surat Peringatan + SP massal (Oatse)
- **Dikerjakan:** detail Riwayat Peringatan dikelompokkan (kartu Karyawan · Pelanggaran · Proses & dokumen; label alasan eskalasi tanpa "(—)"); kolom Tingkat/Jenis/Tanggal rata, tanggal kejadian wajib; Buat SP untuk banyak karyawan (`POST /warning-letters/bulk`, chip terpilih, "Ikuti saran sistem"); dialog form SP header & tombol tetap, isi scroll (checklist "Perbaikan UI/UX Surat Peringatan").
- **Keputusan:** ARS-D19 (tanggal kejadian wajib), ARS-D20 (draft SP massal satu transaksi).
- **Verifikasi:** typecheck ✔ 3 workspace · `bunx biome ci .` ✔ (1 warning lama `employee-print.test.ts`) · boundaries ✔ (473 modul) · test shared **250** · api **813** · web **294** + 5 dilewati (`--maxWorkers=4`; suite 12 worker: 5 gagal acak karena batas waktu, termasuk Backlog flaky lama); integration SP 22, web SP 8.
- **Masalah / catatan:** dialog tidak bisa di-scroll di staging karena `EmployeePicker` punya `min-h-[420px]` yang menimpa `h-56`; dialog aset (`asset-forms.tsx`) memakai pola sama (belum diubah, lihat Temuan laporan). QA visual Playwright lokal 11/11 (`docs/qa/runs/2026-10-19-ui-ux-lokal.md`).
- **Berikutnya:** izin commit.


### 2026-10-16 — Arsip gel. 3 Laporan batch 1: API, web, QA lokal (Oatse)
- **Dikerjakan (rencana disetujui pemilik projek):** checklist "Gel. 3 Laporan" batch 1. Shared `report.ts` (rumus turnover, kelompok kedaluwarsa, % lengkap); fungsi baca-saja `employee` (`report-data.*`) & `discipline` (`listWarningLettersForReport`) lewat `index.ts`; modul baru `report` (policy, 4 laporan + 4 ekspor xlsx, audit `report.export`); web `features/reports/` (menu Laporan tidak lagi Maintenance, 4 tab, filter unit/tahun, grafik ECharts palet Dashboard, tabel, ekspor), saklar `FEATURES.reports`, `access.viewReports`; 2 test web lama "Laporan = Maintenance" diubah jadi "mengikuti `FEATURES.reports`".
- **Keputusan:** ARS-D18 (batasan: unit/status saat ini, reaktivasi, dokumen wajib SITE belum dihitung).
- **Verifikasi:** typecheck ✔ · biome ✔ (1 warning lama) · boundaries ✔ (457 modul) · `db:check` ✔ · test shared **243** · api **792** (integration laporan 8, policy 7) · web **289** (laporan 6; 2× berturut-turut) · build ✔ · Playwright lokal **11/11** (`docs/qa/runs/2026-10-16-laporan-lokal.md`).
- **Masalah / catatan:** Docker lokal mati di awal (dinyalakan pemilik projek); data uji integration sempat salah enum (`RESIGNED`); judul halaman Laporan lazy + ECharts → batas tunggu test 5 detik.
- **Berikutnya:** izin commit → push → rilis staging batch 1 (tanpa migrasi; saklar `reports` di rilis) → QA staging; batch 2.

### 2026-10-16 — Grill Arsip gel. 3 Laporan (Oatse)
- **Dikerjakan:** grill 2 putaran (8 pertanyaan) atas design §10 / D-058 → keputusan ARS-D16 (cakupan batch 1, akses, format, hubungan dengan Dashboard) & ARS-D17 (definisi 4 laporan); rencana tahap disetujui pemilik projek.
- **Keputusan:** ARS-D16, ARS-D17 (semua pilihan = rekomendasi).
- **Verifikasi:** dokumen saja — README, PLAN §4.3 (baris Laporan) & §8, catatan D-058, PROGRESS.
- **Masalah / catatan:** asumsi rencana: headcount per unit/status memakai atribut karyawan saat ini (belum ada snapshot historis); masuk/keluar dari tanggal masuk & tanggal keluar.
- **Berikutnya:** kerjakan batch 1 (shared → agregat employee/discipline → modul `report` → web → QA lokal).

### 2026-10-15 — Rilis gel. 8: Surat Peringatan tampil di staging (Oatse)
- **Dikerjakan (rencana disetujui pemilik projek; "ikuti flow"):** checklist "Rilis staging" gel. 2b. Folder `HRIS-rilis`: merge develop `7de4d1f` (konflik hanya `feature-flags.ts` → `discipline` true, `timeManagement` tetap false) → commit `905649a` → PR #51 (`HRIS/debug/database`, CI ✔, merge `d2a70b6`) → PR #52 (`HRIS/debug/fe-be`, CI ✔, merge `3e31d9d`) → `Deploy staging` #38718943479 ✔ (2 migrasi). Grant `employee.discipline.write` untuk HR uji lewat API sebagai SA (audit, dipertahankan). QA staging Playwright + MCP → arsip Drive.
- **Keputusan:** tidak ada.
- **Verifikasi:** rilis lokal: test shared 230 · api 777 · web 279 + 4 dilewati (TM) · build ✔ (DB `hris_release` perlu `db:deploy` 2 migrasi dulu); staging MCP: 37 migrasi, 0 gagal, skema `discipline` + 5 jenis + 6 bulan, advisor tanpa temuan baru; health 200; cron `discipline-daily` 401 tanpa secret; QA TC-STG-088…102 **15/15** (S-12 diulang karena selector script) → LEGIT, Drive `hris-qa:2026-10-15-staging-sp` (39 file).
- **Masalah / catatan:** pendaftaran cron di dashboard Vercel belum diverifikasi (MCP Vercel 403 scope tim) — masuk dokumen pindah akun Vercel. Data uji staging: SP Rizky `001/SP1/HRD-ACP/X/2026` (berlaku) & `QA/9549/SP3` (dicabut).
- **Berikutnya:** dokumen pemindahan deployment ke akun Vercel Pro (permintaan pemilik projek); gel. 3 Laporan.

### 2026-10-15 — Audit gel. 2b Surat Peringatan (Oatse)
- **Dikerjakan (permintaan pemilik projek "audit perubahan"):** code-review tingkat high atas `03e8416` + audit alur akses. Diperbaiki dengan test gagal-dulu: (1) **bocor akses** — `GET /warning-letters?employeeId=` membuat MANAGER melihat SP karyawan mana pun (filter kini AND di dalam cakupan tim / atasan saat terbit); (2) nomor manual yang sama dengan nomor otomatis berikutnya memblokir penomoran otomatis → urutan yang terpakai dilompati; (3) tanggal terbit mundur menurunkan saran tingkat → SP berlaku dihitung dari tanggal terbit ke depan; (4) atasan saat terbit tidak aktif → tidak ada yang boleh menandai disampaikan → penulis SP PT itu boleh (`canDeliver` + atasan terjangkau, sama dengan penerima pengingat cron); (5) kegagalan notifikasi setelah terbit/cabut tidak lagi membuat respons 500; (6) masa berlaku 6 bulan + 1 hari → hari terakhir = terbit + N bulan − 1 hari; (7) tautan notifikasi `/ess?tab=sp` tidak memindah tab bila sudah di `/ess` → tab ESS terkontrol URL. Efisiensi: `alphaDaysForEvidence` hanya membuat signed URL saat detail SP ditampilkan.
- **Keputusan:** ARS-D8 & ARS-D9 diperjelas (lihat README). Temuan "atasan ber-role selain MANAGER" tidak berlaku (PLAN §4.1: `manager_id` wajib akun MANAGER/SA). Duplikasi helper tanggal/P2002 lintas modul → Backlog.
- **Verifikasi:** typecheck ✔ · biome ✔ (1 warning lama) · boundaries ✔ · test shared 227 · api **764** (integration SP 18, policy SP 28) · web **271** · Playwright lokal ulang **12/12** RUN 1126 (PDF: berlaku 15 Okt 2026 s/d 14 Apr 2027).
- **Masalah / catatan:** di-commit lokal (tidak di-push, permintaan pemilik projek).
- **Berikutnya:** izin commit perbaikan audit → push develop → rilis staging.

### 2026-10-15 — Arsip gel. 2b Surat Peringatan: API, web, QA lokal (Oatse)
- **Dikerjakan (rencana disetujui pemilik projek; grill ARS-D7–D13 sudah 2026-10-14):** checklist "Gel. 2b Surat peringatan" tahap A–C. **A** shared `discipline.ts` + permission `employee.discipline.read/write`; migrasi `20261015071500_add_discipline_module` (skema `discipline`, 4 tabel, 5 jenis pelanggaran awal, masa berlaku 6 bulan, CHECK); modul `discipline` (policy TDD, draft → terbit → konfirmasi / cabut, saran tingkat + alasan eskalasi, nomor otomatis per PT per tahun / manual, PDF template, scan, bukti ALPHA lewat `attendance/index.ts` `alphaDaysForEvidence`, notifikasi in-app + email tanpa isi, cron `discipline-daily`); `iam` `listDisciplineWriters`; logo kop PDF dipindah ke `core/brand-logo.ts` (dipakai BAST & SP). **B** web `features/discipline/`: Arsip › Riwayat Peringatan (menu yang sebelumnya Maintenance), Master Data › Jenis Pelanggaran + masa berlaku (SA), tab SP di detail karyawan, Layanan Mandiri › Surat peringatan (`/ess?tab=sp`), saklar `FEATURES.discipline`. **C** QA lokal Playwright 12/12.
- **Keputusan:** ARS-D14 (grant SP berlaku untuk dokumen `WARNING_LETTER`, temuan tahap B), ARS-D15 (modul `discipline` terpisah, dari rencana yang disetujui).
- **Verifikasi:** `bun run typecheck` ✔ · `bunx biome ci .` ✔ (1 warning lama `employee-print.test.ts`) · `bun run check:boundaries` ✔ (435 modul) · `db:migrate` + `db:generate` + rerun "Already in sync" + `db:check` "No difference detected" · `bun run test` shared **227** · api **759** (integration SP 14, policy SP 27, employee policy +1) · web **270** (SP 6; 3 test lama "Riwayat Peringatan = Maintenance" disesuaikan) · build ✔ · Playwright lokal **12/12** RUN 0216 (`docs/qa/runs/2026-10-15-sp-lokal.md`).
- **Masalah / catatan:** nomor draf di PDF "(draf — …)" tercetak "?" (font standar PDF) → diganti koma saat QA. Jenis dokumen `WARNING_LETTER` punya pengingat kedaluwarsa 60/30/7 hari (D-055) → HR akan menerima pengingat dokumen untuk scan SP; dapat dikosongkan SA di Master Data › Jenis dokumen. Data uji tersisa di DB lokal (hari ALPHA uji 30 Sep 2026 Rizky, SP & jenis QA). Belum di-push / dirilis.
- **Berikutnya:** izin commit → push develop → rilis staging (migrasi + cron + saklar `discipline` + grant SP HR uji) → QA staging; gel. 3 Laporan.

### 2026-10-14 — Perbaikan PT bawaan form aset + 3 Backlog tampilan (Oatse)
- **Dikerjakan (permintaan pemilik projek "lanjut 1–3"):** (1) form Tambah aset: PT bawaan kini menyusul bila `/master-data` baru termuat setelah dialog dibuka (`asset-forms.tsx`; temuan QA staging gel. 7). (2) Backlog tampilan: top bar tidak lagi melebar 34 px untuk SA di 1440 px (grup kanan `min-w-0`, kotak cari boleh menyempit, ikon tidak menyusut — `app-layout.tsx`); teks kosong Kalender Libur untuk yang tidak mengelola tidak lagi menyebut "tombol di bawah" (`time-management/pages/calendar-settings-pages.tsx`); badge dev "DB · Lokal" bawaan kanan-bawah agar tidak menumpuk teks kaki sidebar (`dev-db-switcher.tsx`, posisi tersimpan tetap dipakai).
- **Keputusan:** tidak ada.
- **Verifikasi:** test web baru gagal dulu (PT kosong) lalu lulus; Playwright lokal SA `/`, `/personal`, `/time/kalender` di 1440/1280/1024 px: `scrollWidth` = lebar layar (sebelumnya 1474 di 1440); HR Kalender Libur 2026 kosong → "Hari libur tahun ini belum diisi pengelola kalender."; typecheck ✔ · biome ✔ (1 warning lama) · boundaries ✔ · test shared 215 · api 717 · web 263 · build ✔.
- **Masalah / catatan:** teks Kalender Libur ada di modul Time Management (Mat) — perubahan teks saja. Belum dirilis ke staging.
- **Berikutnya:** gel. 2b Surat peringatan (grill).

### 2026-10-14 — Aset & APD tampil di staging (rilis gel. 7) (Oatse)
- **Dikerjakan (permintaan pemilik projek "1 dan 2"):** (1) verifikasi penuh develop lalu push `5750a50` + `5859111` (CI #38509210626 ✔). (2) folder `HRIS-rilis`: merge develop `5859111` (`df9776e`, tanpa konflik; ikut membawa Time Management + 8 migrasi) → saklar `assets` `true`, `timeManagement` `false` (`219b372`) → PR #49 ke `HRIS/debug/database` (CI ✔, merge `6864a1a`) → PR #50 ke `HRIS/debug/fe-be` (CI ✔, merge `03dac3b`) → `Deploy staging` #38509894453 ✔ (migrasi, api, web). QA staging Playwright → arsip Drive.
- **Keputusan:** tidak ada keputusan baru.
- **Verifikasi:** develop & rilis: typecheck ✔ · biome ✔ (1 warning lama) · boundaries ✔ (418 modul) · `db:check` ✔ · test shared 215 · api 717 · web 262 · build ✔; staging (MCP): 27 → **35 migrasi**, 0 gagal, skema `asset` 5 tabel; health 200, web 200; cron & endpoint aset tanpa kredensial 401; advisor security tanpa temuan baru; QA TC-STG-073…087 **15/15 LULUS** (`docs/qa/runs/2026-10-14-staging-aset.md`) → **LEGIT**; Drive `hris-qa:2026-10-14-staging-aset` 21 file.
- **Masalah / catatan:** putaran 1 3/12 — form Tambah aset di staging tidak mengisi PT bawaan karena data master belum termuat saat dialog dibuka → 400 (temuan P3, Backlog; pengguna tetap bisa memilih PT). Time Management terpasang di staging tetapi tersembunyi; cron TM belum terdaftar. Data uji `Q1134`/`Q1440` tersisa di staging.
- **Berikutnya:** gel. 2b Surat peringatan (grill dulu); perbaikan PT bawaan form aset (kecil).

### 2026-10-13 — Arsip gel. 1 + Layanan Mandiri tampil di staging (rilis gel. 6) (Oatse)
- **Dikerjakan (rencana disetujui; setiap aksi keluar ditanya):** folder `HRIS-rilis`: saklar `FEATURES.archive` + `FEATURES.selfService` → `true` (commit `42df46e`, tanpa merge develop → Time Management tidak ikut, tanpa migrasi) → PR #47 ke `HRIS/debug/database` (CI ✔, merge `62632e2`) → PR #48 ke `HRIS/debug/fe-be` (CI ✔, merge `d0e652b`) → `Deploy staging` #38374784477 ✔. Grant `employee.changes.review` untuk HR uji (izin pemilik projek, lewat API sebagai SA, tercatat audit). QA staging Playwright + API → arsip Drive.
- **Keputusan:** tidak ada keputusan baru.
- **Verifikasi:** rilis (DB `hris_release`): typecheck ✔ · biome ✔ · boundaries ✔ · `db:check` ✔ · test shared 200 · api 600 · web 233 (0 dilewati) · build ✔; staging: health 200, web 200, advisor security tanpa temuan baru; QA TC-STG-059…072 **14/14 LULUS** (`docs/qa/runs/2026-10-13-staging-arsip.md`) → **LEGIT**; Drive `hris-qa:2026-10-13-staging-arsip` 13 file.
- **Masalah / catatan:** 2 kegagalan putaran 1 = asumsi script (ekspor memang JSON base64; kata "Maintenance" cocok dengan jabatan staging) — aplikasi tidak diubah. Screenshot yang memuat nama asli (D-066) dihapus; screenshot daftar kini disaring ke akun uji. Kontak darurat karyawan uji kini berisi data QA. Bucket `attendance-selfies` sudah ada di staging sebelum Time Management dirilis.
- **Berikutnya:** gel. 2a Aset / 2b Surat peringatan (grill dulu), OD-11 sebelum produksi.

### 2026-10-13 — Aset & APD gel. 2a: grill + tahap A API (Oatse)
- **Dikerjakan (grill 3 putaran → rencana disetujui):** keputusan ARS-D1–D6 (README fitur + indeks PLAN §8, PLAN §4.2 grant `asset.manage`, §4.3 dua baris matriks). Shared `asset.ts` (kode aset, status pinjaman, masa ganti, skema input; harga string desimal). Migrasi `20261013095006_add_asset_module` (skema `asset`, 3 enum, nilai `Permission`, 5 tabel, unik parsial satu pemegang aktif, CHECK). Modul `asset`: policy (TDD), repository, service (audit, harga hanya pengelola, notifikasi in-app tanpa data sensitif), PDF BAST pdf-lib, 23 path OpenAPI, cron `asset-daily` (app.ts + `apps/api/vercel.json`, 00:30 UTC). Pendukung lintas modul lewat `index.ts`: `employee` direktori baca-saja (bisa dipakai juga untuk mengganti adapter `attendance/directory.ts`), `iam.listAssetManagers`.
- **Keputusan:** ARS-D1–D6. Keputusan kecil: master kategori/jenis APD dikelola SA + HR ber-grant (tanpa batas PT); aset hanya diserahkan ke karyawan PT pemilik aset; kembali kondisi Rusak → status Perbaikan; pembagian APD boleh dihapus hanya bila belum dikonfirmasi & tanpa BAST; route dialog nonaktifkan memakai API asset (bukan employee → asset, aturan no-circular).
- **Verifikasi:** `db:migrate` + rerun "Already in sync" · `db:generate` · `db:check` ✔ · typecheck ✔ · `biome ci` ✔ (499 file, 1 warning lama) · boundaries ✔ (408 modul) · test shared **215** · api **710** · web 253 ✔ · build ✔ · uji mutasi (MANAGER = semua) → 2 test gagal → aturan benar-benar dijaga test · server lokal: 23 path baru di OpenAPI, semua 401 tanpa token; cron tanpa secret 401.
- **Masalah / catatan:** run integration pertama gagal di `beforeAll` (dua akun ke satu karyawan) dan `afterAll` ikut berhenti → sisa data uji RUN 16CC dihapus manual dari DB **lokal**; pembersihan test kini tahan setup yang gagal. `prisma format` sempat merapikan `attendance.prisma` milik Mat → dikembalikan (hindari konflik).
- **Berikutnya:** tahap B web, lalu tahap C QA lokal; rilis ke staging terpisah (migrasi + cron baru).

### 2026-10-14 — Aset & APD gel. 2a: tahap B web (Oatse)
- **Dikerjakan:** fitur web `features/assets/` (halaman Data Assets 3 tab + panel detail, form & dialog transaksi, BAST unduh/unggah scan, Master Data › Aset & APD, tab Aset detail karyawan, peringatan di form nonaktifkan, Layanan Mandiri › Aset saya), pemasangan route/menu/saklar/akses. Dua test web lama yang memakai menu Aset sebagai contoh "Maintenance" dipindah ke Riwayat Peringatan (masih Maintenance).
- **Keputusan:** tidak ada keputusan baru. Keputusan kecil: komponen aset yang dipakai fitur employee/ESS tidak mengimpor fitur employee (cegah siklus); tabel master tanpa `useMemo` (kecil).
- **Verifikasi:** typecheck ✔ · `biome ci` ✔ (1 warning lama) · boundaries ✔ (416 modul) · test shared 215 · api 710 · web **262** (+9: 8 aset + formatPrice) ✔ · build ✔ · smoke Playwright lokal (`/mnt/winD/WORK/Magang/QA/2026-10-14-aset-web-smoke/`): 6 halaman × 4 role × desktop/HP — tanpa error JS/5xx, halaman sesuai hak (MGR: Data Assets ya, Master Data tidak; EMP: Akses ditolak, Layanan Mandiri ya).
- **Masalah / catatan:** smoke menemukan halaman Personal Management untuk SA di 1440 px melebar 34 px — **masalah lama** (juga di Data Karyawan Aktif & Data Kontak), dari top bar (tab Time Management + pemilih PT + email panjang) → Backlog. Belum diuji: alur simpan di browser (tambah/serah/kembali/BAST) dan isi PDF BAST secara visual → tahap C.
- **Berikutnya:** tahap C QA lokal (alur penuh di browser + dokumen QA), lalu rilis staging terpisah.

### 2026-10-14 — Aset & APD gel. 2a: tahap C QA lokal (Oatse)
- **Dikerjakan:** script Playwright alur penuh (`/mnt/winD/WORK/Magang/QA/2026-10-14-aset-lokal/qa-aset.ts`): master → tambah aset (kode otomatis, seri wajib) → serahkan ke Rizky → PDF BAST (isi dicek `pdftotext`, dirender `pdftoppm`) → unggah scan → MGR atasan & HR tanpa grant lihat saja → pembagian Helm → karyawan konfirmasi terima (desktop & HP) → peringatan di form nonaktifkan → pengembalian Rusak + BAST pengembalian. Dokumen QA TC-EMP-215…226, plan/run `2026-10-14-aset-lokal`.
- **Keputusan:** tidak ada.
- **Verifikasi:** putaran akhir **12/12**, 0 error JS/5xx · typecheck ✔ · biome ✔ · boundaries ✔ (417) · `db:check` ✔ · test shared 215 · api **713** · web 262 ✔ · build ✔.
- **Masalah / catatan:** **bug (P3) ditemukan & diperbaiki:** nomor BAST serah = kembali di hari yang sama, dan BAST APD sejenis antar-karyawan bentrok → `bastNumber` (jenis + kode + tanggal + id transaksi), test gagal-dulu `asset-bast.test.ts`. Badge "—" (tanpa masa ganti) disembunyikan di daftar pegangan. Kegagalan putaran 1–2 = selector script & sisa data run sebelumnya (bukan aplikasi). Pihak Pertama BAST memakai email bila pengelola tidak tertaut data karyawan. Data uji Q6967/Q7013/Q7069/Q7175 tersisa di DB lokal; scan BAST di storage staging berawalan `dev/oatse/`.
- **Berikutnya:** commit, lalu (izin) push develop dan rilis staging Aset + QA staging + arsip Drive.

### 2026-10-14 — Audit ulang Aset & APD tahap A–C + perbaikan (Oatse)
- **Dikerjakan (permintaan pemilik projek):** baca ulang seluruh service/policy/repository/cron/BAST API + halaman & dialog web. Temuan ditulis sebagai test yang **gagal dulu** (4 test integration baru di `assets.test.ts`, termasuk pembaca teks PDF), lalu diperbaiki:
  - **F1 (P2) Pihak Pertama BAST = pengunduh**, bukan pelaku → MANAGER yang mengunduh BAST bawahannya tercetak sebagai pengelola. Kini dari akun pelaku (`assignedBy` / `closedBy` / `issuedBy`) lewat `iam.getAccountSummaries`.
  - **F2 (P2) race condition:** kembalikan & tandai hilang bersamaan sama-sama lolos (status aset bisa tidak konsisten, audit ganda); juga ubah status saat diserahkan, kembali APD dua kali, hapus APD yang baru dikonfirmasi, konfirmasi ganda. Kini update bersyarat atomik di repository (`closeAssignmentIfOpen`, `setAssetStatusIf`, `returnPpeIfOpen`, `deletePpeIfUnconfirmed`, `acknowledge…IfPending`) di dalam transaksi.
  - **F3 (P3)** tanggal serah/kembali/hilang/terima & kembali APD di masa depan ditolak (422).
  - **F4 (P3)** penentuan "APD sudah diganti" memakai `createdAt % 1000` sebagai pemecah seri → urutan bisa terbalik; kini `issuedAt` lalu `createdAt` utuh.
  - **F5 (P3, web)** dialog Serahkan menyebut penerima harus karyawan aktif PT pemilik aset.
- **Keputusan:** tidak ada keputusan baru (penolakan tanggal masa depan = aturan validasi).
- **Verifikasi:** typecheck ✔ · biome ✔ · boundaries ✔ (417) · `db:check` ✔ · test shared 215 · api **717** (+4) ✔ · integration aset diulang 4× stabil (17/17) · web **262/262** (dijalankan berurutan) · build ✔ · Playwright QA alur penuh diulang di kode baru **12/12** (RUN 7848).
- **Masalah / catatan:** run web paralel sempat gagal 5–7 test **lama** (Arsip, Dokumen, Import, Dashboard, Master Data) karena timeout saat beban mesin tinggi (load ±16; dua proses `claude` + browser) — lulus semua saat berurutan; sejenis dengan Backlog test flaky `documents.test.tsx`.
- **Berikutnya:** commit; rilis staging Aset (rencana tersendiri).

### 2026-10-14 — Logo Arthasia di kop PDF BAST (Oatse)
- **Dikerjakan (permintaan pemilik projek):** kop BAST kini memuat logo Arthasia yang sama dengan email (`docs/email-templates/logo-arthasia-email.png`, 264×265) di kiri nama PT. Logo ditanam base64 di `apps/api/src/modules/asset/bast-logo.ts` (ikut bundel api Vercel/Docker; PDF tidak bergantung jaringan/bucket publik).
- **Verifikasi:** typecheck ✔ · biome ✔ · boundaries ✔ (418) · test shared 215 · api 717 (test `asset-bast.test.ts` + cek gambar tertanam) ✔ · build ✔ · contoh PDF dirender (`/mnt/winD/WORK/Magang/QA/2026-10-14-aset-lokal/kop-logo/`).


### 2026-10-16 — Laporan batch 1: perbaikan UI/UX + Excel bergaya (Oatse)
- **Dikerjakan (permintaan pemilik projek):** susunan kartu (bilah filter menempel: PT, unit, tahun, reset, ekspor; KPI berikon dengan satu KPI utama per tab; grid 12 kolom grafik 8 + samping 4); keterbacaan (angka rata kanan, 0 diredupkan, bilah data di sel, progres % berambang < 60 / < 85 / ≥ 85, ⓘ rumus/definisi, titik penanda bulan ada yang keluar, catatan batasan ARS-D18 dilipat); interaksi (klik kolom bulan / baris bulan / alasan keluar / kelompok kedaluwarsa / jenis dokumen / item kosong / tingkat SP / pelanggaran → daftar tersaring dengan chip yang bisa dihapus; klik baris karyawan membuka panel profil di halaman yang sama `?pegawai=&tab=` ke tab terkait; tautan "Buka SP"); daftar per orang memakai **bentuk tabel Data Karyawan Aktif** (ListPanel/DataTable/SearchField/TablePagination bersama, avatar inisial; permintaan pemilik projek: konsistensi desain). URL tab laporan diganti `?laporan=` (bentrok dengan `?tab=` panel profil), unit & tahun ikut URL. API: `joiners` (headcount) dan `missingKeys` (kelengkapan), tanpa migrasi. Excel: penulis xlsx bersama mendapat tata letak laporan (judul, filter terbaca, waktu ekspor + pengekspor, label RAHASIA, header berwarna, baris belang, format ribuan/persen/tanggal, baris total, autofilter, beku NIP+Nama, siap cetak A4 lanskap + nomor halaman, properti berkas); tiap laporan = sheet Ringkasan + rincian (headcount 8 sheet, dokumen 3 + kolom sisa hari, kelengkapan 4, SP 5).
- **Keputusan:** tidak ada keputusan baru. Keputusan kecil: saringan hasil klik hanya di tampilan (ekspor tetap seluruh data sesuai filter PT/unit/tahun, dijelaskan di keterangan tombol); ekspor SP tanpa grant tetap 403.
- **Verifikasi:** typecheck ✔ · biome ✔ (1 warning lama) · boundaries ✔ (460) · `db:check` ✔ · test shared **246** (+3 xlsx) · api **792** (integration laporan +joiners/missingKeys/isi xlsx) · web **291** (+2) ✔ · build ✔ · berkas Excel dibaca openpyxl (format, beku, autofilter, judul cetak) ✔ · QA Playwright `/mnt/winD/WORK/Magang/QA/2026-10-16-laporan-ui/` **19/19**, 0 error JS/5xx (1440 terang/gelap, 1024, 390 terang/gelap tanpa geser samping).
- **Berikutnya:** commit + push (izin); usulan laporan kehadiran (modul attendance) & performa (perlu keputusan: penilaian kinerja di luar cakupan v1, PLAN §1).
- **Revisi kartu (permintaan pemilik projek, 2026-10-16):** sorotan hijau di kartu utama dihapus (semua kartu netral; kartu penyaring aktif cukup bergaris tepi tegas + latar abu tipis); ubin SP 1/2/3 berisi angka tingkat (bukan ikon perisai yang sama), warna mengikuti jumlah (SP1 kuning, SP2/SP3 merah bila ada). Test web laporan 8/8, tangkapan `/mnt/winD/WORK/Magang/QA/2026-10-16-laporan-ui/kartu/`.
- **Saklar (2026-10-16):** atas permintaan pemilik projek `FEATURES.reports` = **false** di develop sebelum commit/push (menu Laporan kembali "Maintenance"; test `reports.test.tsx` dilewati saat saklar mati, test menu mengikuti saklar).
- **Arahan pemilik projek (2026-10-16):** laporan **kehadiran** (batch 2, data modul attendance/leave sudah ada) dan **performa** (penilaian kinerja di luar cakupan v1, PLAN §1) **ditunda sampai ada instruksi mentor**. Push commit Laporan `78b1a90` sudah dilakukan (CI ✔); saklar `reports` mengikuti pengaturan pemilik projek.
