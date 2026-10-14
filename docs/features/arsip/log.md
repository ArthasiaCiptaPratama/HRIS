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

