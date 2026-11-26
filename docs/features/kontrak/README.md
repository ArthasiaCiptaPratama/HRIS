# Kontrak

> **Kode prefix:** `KTR` · **Fase:** 7 (ditarik maju 2026-11-25) · **PIC:** Oatse · **Branch:** `HRIS/Oatse/Linux-Windows` · **Saklar `FEATURES`:** –
> **Status:** Berjalan — K1 & K2 di develop (2026-11-25); **K1–K4 di develop 2026-11-26** (K4 `48e1741`); **K5 ditunda pengguna 2026-11-26**; tulis staging S1…Sn menunggu kata pengguna; KTR-OD1 terbuka

Status kepegawaian PKWT / PKWTT / THL, tahap kontrak PKWT 1–3 & masa percobaan PKWTT, masa kerja kontrak, perpanjangan, pengangkatan, pengakhiran, pengingat kontrak habis, upah harian & evaluasi pengangkatan THL.

**Prioritas:** di luar arah MVP Rilis 1 (PROGRESS "Arah: MVP Rilis 1", 2026-11-03), tetapi **diminta eksplisit pengguna 2026-11-25** (dua pesan ke supervisor-82, grill G1–G13). Rekrutmen R0 dijeda (WIP lokal `249e1df` di branch `HRIS/Oatse/rekrutmen-r0`) dan dilanjutkan setelah paket ini (KTR-D10).

Dokumen fitur ini: **README** (status, checklist, keputusan) · [log.md](log.md). Induk: [PROGRESS](../../PROGRESS.md).

## Istilah

| Istilah | Arti di HRIS |
|---|---|
| **Status kepegawaian** | Tingkat pertama hubungan kerja: **PKWT** (Perjanjian Kerja Waktu Tertentu / kontrak), **PKWTT** (Perjanjian Kerja Waktu Tidak Tertentu / tetap), **THL** (Tenaga Harian Lepas). Di menu & daftar tampil dengan nama biasa: Karyawan Tetap & Karyawan Percobaan (= PKWTT), PKWT, Harian Lepas (THL). Magang, Outsourcing, Vendor tetap kelompok terpisah di luar tiga status ini (KTR-D2). |
| **Tahap** | Tingkat kedua di dalam status: PKWT → **PKWT 1 / PKWT 2 / PKWT 3**; PKWTT → **Masa Percobaan / Permanen**; THL tanpa tahap. |
| **PKWT ke-n** | Satu tahap kontrak PKWT = satu baris kontrak (mulai, akhir, kontrak sebelumnya). "Lv 1/2/3" di pesan pengguna = PKWT ke-1/2/3, **bukan** level jabatan (KTR-D1). |
| **Masa kerja di perusahaan** | Sejak tanggal masuk pertama (`join_date`); dipakai cuti, laporan, jubilee. Tidak berubah saat status/tahap berganti. |
| **Masa kerja kontrak (tahap ini)** | Sejak tanggal mulai tahap PKWT yang berjalan; diperbarui setiap pindah tahap. |
| **Total masa PKWT** | Sejak mulai PKWT 1 sampai sekarang/akhir; dibandingkan batas maksimal 4 tahun. |
| **Masa kerja PKWTT** | Sejak tanggal awal masuk PKWTT (termasuk masa percobaan), atau sejak tanggal pengangkatan bila dari PKWT/THL; lulus percobaan → Permanen **tidak** mengulang hitungan (KTR-D6, KTR-D7). |
| **THL** | Tenaga Harian Lepas: dibayar per hari hadir (upah harian); dievaluasi untuk diangkat PKWTT bila ≥ 21 hari hadir per bulan selama 3 bulan berturut-turut (KTR-D8). |

## Checklist

Legenda: `[ ]` belum · `[~]` sedang · `[x]` selesai · `[-]` dibatalkan/ditunda. Langkah baru: sub-item `(tambahan YYYY-MM-DD) alasan`.

Urutan paket (KTR-D10). Tiap paket: rencana → persetujuan → kerja (Codex `codex-worker` + review) → screenshot → commit/push develop; rilis staging = kata pengguna.

- [x] Langkah 0 — WIP Rekrutmen R0 di-commit lokal `249e1df` (`HRIS/Oatse/rekrutmen-r0`, tanpa push); develop di-pull FF ke `e2a9431` (2026-11-25)
- [x] Keputusan G1–G13 dicatat (KTR-D1–D10, TM-D35–D37, catatan D-038) (2026-11-25)
- [~] **K1** — status 2 tingkat + migrasi data lama + tab Kepegawaian + aksi (KTR-D2–D4, D6, D7) — kode, test & screenshot ✔ lokal 2026-11-25; sisa: commit/push (izin)
  - [x] Poin 0 DB lokal: skema `recruitment` R0 kosong dihapus, migrasi develop diterapkan
  - [x] Skema + migrasi `20261125065315_ktr_k1_employment_contracts` (tabel `contract.contracts`, `pkwtt_start_date` + backfill, rename 4 status) + seed dummy `KTR-DMY-*`
  - [x] Shared `contract.ts`: label/tier, aturan blokir/peringatan, ringkasan & masa kerja
  - [x] API modul `contract` (GET + 5 aksi, `access`), `status-change` dijaga; test policy + integration
  - [x] Web: kartu Status kepegawaian, dialog aksi, riwayat kontrak di tab Kepegawaian & Riwayat, Ubah Status
  - [x] Verifikasi: typecheck · biome · boundaries · shared 432 · api 1514 · web 527 ✔
  - [x] (tambahan 2026-11-25: revisi KTR-D2, kutipan pengguna "setuju sidebar biasa + filter") nama status & sidebar kembali biasa (Karyawan Tetap, Karyawan Percobaan, PKWT, Harian Lepas (THL)); daftar PKWT: filter Tahap (`?tahap=1|2|3|belum`, API `pkwtStage`) ber-jumlah (`summary.active.pkwtStages`) + kolom Tahap & Akhir kontrak (urut); badge detail istilah resmi (`employmentStatusDisplay`); salinan `employees.contract_stage/contract_end_date` (sumber kebenaran `contract.contracts`, dijaga tiap aksi kontrak; test konsistensi termasuk nonaktif/aktif kembali) — shared 433 · api 1516 · web 529 ✔
  - [x] (tambahan 2026-11-25: temuan review, persetujuan supervisor) Pengaktifan tidak jadi jalan pintas ke/dari PKWT/Percobaan (API 422 + dialog web)
  - [ ] Kewajiban K2/K3: setiap jalur baru yang menulis kontrak (pengingat/aksi K2, import K3) wajib memperbarui salinan `contract_stage/contract_end_date` di transaksi yang sama + test konsistensi
  - [x] Screenshot lokal `QA/2026-11-25-ktr-k1/01–07` (SA: PKWT 3, PKWT lama, dialog blokir, Riwayat, Ubah Status; HR tanpa grant: PKWT 1, masa percobaan) — perbaikan kecil setelah tinjau: masa kerja < 1 bulan tampil hari, label "Sisa masa percobaan"
- [~] **K2** — pengingat & daftar "Kontrak akan habis" (KTR-D5, D6, D11) — kode, test, review & screenshot ✔ lokal 2026-11-25; sisa: commit/push (izin)
  - [x] Cron `contract-daily` (00:15 UTC = 07:15 WIB, `apps/api/vercel.json`): PKWT H-30 & H-7, masa percobaan H-14, lewat = pengingat harian; ke HR_ADMIN PT (tanpa HR → SA) + atasan langsung; notifikasi web, tanpa nonaktif otomatis
  - [x] API `GET /employees?contractEndsWithin=N` (≤ N hari + yang lewat) & `summary.active.contractsEnding {soon, overdue}`; cakupan = daftar karyawan
  - [x] Web menu "Kontrak Akan Habis" (badge soon+overdue, saklar `FEATURES.contractExpiring`), chip Semua/PKWT/Masa Percobaan, urut akhir terdekat, kolom sisa hari/lewat, peringatan jumlah yang lewat
  - [x] Review kode subagen (cron & akses): tanpa temuan berat; catatan ringan diperbaiki (summary paralel, notifikasi atasan tanpa tautan, test bersih & cakupan atasan/summary)
  - [x] Screenshot `QA/2026-11-25-ktr-k1/12–14`
- [~] **K3** — audit data + kolom import kontrak (KTR-D9, KTR-D12) — kode lokal berjalan 2026-11-25; tulis staging (S1…Sn) menunggu rilis & kata pengguna
  - [x] API + UI "Koreksi data kontrak" (`POST …/contracts/{id}/correct`; riwayat per field + audit)
  - [x] Skrip audit `apps/api/scripts/audit-employee-data.ts` (READ ONLY, xlsx Audit/Ringkasan/Cek daftar HR; DB non-lokal hanya dengan `--allow-remote` + kata pengguna)
  - [x] Kolom import: Tahap PKWT, Mulai kontrak, Akhir kontrak, Durasi (bulan), Mulai PKWT 1, Mulai/Akhir percobaan — pratinjau + simpan dalam transaksi import (salinan `contract_stage/contract_end_date` ikut), test `import-contracts.test.ts`
  - [x] Import menolak ubah status ke/dari PKWT/Percobaan (`STATUS_CONTRACT_CATEGORY`); karyawan baru Tetap/Percobaan lewat import → `pkwtt_start_date` = tanggal masuk; THL→Tetap lewat import → mulai hari ini (tambahan 2026-11-25: celah lama, konsisten KTR-D4/D7)
  - [x] KTR-OD1 "Koreksi status (salah input)" dicatat (diputus setelah S7/S9)
  - [x] Screenshot `QA/2026-11-25-ktr-k1/15` (pratinjau import kolom kontrak) & `16` (dialog Koreksi data kontrak)
  - [ ] Daftar tulis staging S1–S15 (PDF PKWT baru) + S16…Sn dari audit — butuh: rilis K1–K3, audit staging (kata pengguna), jawaban Q-A/S6/S9/data S3·S5·S8/jabatan S4·S14
- [x] **K4** — THL: upah harian, rekap hari hadir × upah, evaluasi "Mendekati batas" / "Wajib diangkat PKWTT" (KTR-D8, KTR-D13) — develop 2026-11-26
  - [x] Migrasi `20261126042252_ktr_k4_daily_wages` (`contract.daily_wages`, tanggal berlaku, CHECK > 0); akses upah SA + HR ber-grant `labor.cost.read` (KTR-D13), audit `contract.daily_wage.set` tanpa nominal
  - [x] Hari hadir = absen APPROVED per bulan kalender WIB (pending terpisah); evaluasi 3 bulan penuh terakhir (≥ 21 hari), bulan berjalan tidak dievaluasi
  - [x] Notifikasi "Wajib diangkat PKWTT" lewat cron `contract-daily` ke HR_ADMIN PT + atasan (sekali per bulan evaluasi); "Mendekati batas" tanpa notifikasi
  - [x] API `PUT /employees/{id}/daily-wage`, `thl` di respons tab Kepegawaian, `GET /employees?thlStatus=` + summary `thlStatuses`, laporan `thl-attendance-wage` + ekspor (perkiraan memakai upah yang berlaku tiap hari hadir)
  - [x] Kolom import "Upah harian" (dipindah dari K3; tanpa hak / bukan THL → peringatan)
  - [x] Web: kartu THL di tab Kepegawaian + dialog ubah upah, chip & kolom di daftar Harian Lepas (THL), tab laporan "Rekap Kehadiran & Upah THL", pratinjau & template import; saklar `FEATURES.thlEvaluation`; seed dummy `KTR-DMY-THL-REQ/APP`
  - [x] Rekap: bila upah berubah dalam bulan itu, kolom Upah harian menampilkan rentang "Rp 140.000 → Rp 160.000 (15 Okt)" (layar) + kolom "Perubahan upah" (ekspor) (tambahan 2026-11-26: masukan supervisor atas screenshot 03)
  - [x] Screenshot `QA/2026-11-26-ktr-k4/01–03`
- [ ] **K5** — DITUNDA (kutipan pengguna 26 Nov 12:1x WIB via supervisor: "jika sudah selesai stop dlu di K4") — pola kerja site (master 2 shift / 3 shift, saran saat menyusun jadwal) + saklar HO fleksibel (TM-D35–D37; Mat dikabari dulu, wilayah TM)

Item lama Fase 7 (jenis kontrak, CRUD, perpanjangan, terminasi, 1 kontrak aktif + cek overlap, cron `contract-expiry`, policy + test, tab & daftar akan habis) tercakup oleh K1–K2.

## Keputusan

Sumber semua keputusan di bawah: grill supervisor-82 dengan pengguna 2026-11-25 (G1–G13; G1 dari pesan 2 pengguna §3, lainnya kutipan pengguna "a, sesuai rekomendasi"). Serah-terima: `/mnt/winD/WORK/Magang/.handoff/2026-11-25-supervisor-ke-HRIS-status-kepegawaian-pkwt-pola-kerja.md`.

| ID | Keputusan | Alasan / sumber |
|---|---|---|
| KTR-D1 | **Aturan tahap PKWT.** "Lv 1/2/3" = PKWT ke-1/2/3 (bukan level jabatan). PKWT 1 maks **2 tahun**; perpanjangan maks **2 kali @ 1 tahun** (PKWT 2, PKWT 3); total maks **4 tahun**. Setelah batas: **angkat ke PKWTT** atau **akhiri hubungan kerja**. Setiap pindah tahap memperbarui periode & masa kerja kontrak. | G1 — pesan 2 pengguna §3 |
| KTR-D2 | **Status kepegawaian 2 tingkat** (mengubah [D-038](../../decisions.md#d-038) poin 1–2): **PKWT** (tahap PKWT 1/2/3), **PKWTT** (tahap Masa Percobaan / Permanen), **THL** (tanpa tahap). Magang, Outsourcing, Vendor tetap kelompok terpisah di luar tiga status; navigasi grup tetap. Migrasi data: Tetap → PKWTT Permanen, Percobaan → PKWTT Masa Percobaan, PKWT → PKWT (tahap diisi HR), Pekerja Harian → THL. **Revisi tampilan 2026-11-25:** nama status & sidebar memakai nama yang biasa dipakai HR — **Karyawan Tetap**, **Karyawan Percobaan**, **PKWT**, **Harian Lepas (THL)** (hanya "Pekerja Harian" yang berganti nama), tanpa sub-menu; halaman daftar **PKWT** punya filter **Tahap** (Semua · PKWT 1 · PKWT 2 · PKWT 3 · Tahap belum diisi, berdasar kontrak aktif) + kolom **Tahap** & **Akhir kontrak** yang bisa diurutkan; kartu/badge detail memakai istilah resmi: "Karyawan Tetap · PKWTT", "Karyawan Percobaan · PKWTT – Masa Percobaan", "PKWT 2", "Harian Lepas (THL)". Label "PKWTT – Permanen/Masa Percobaan" di sidebar dibatalkan. | G2 — kutipan pengguna 25 Nov "a, sesuai rekomendasi"; revisi: kutipan pengguna 25 Nov 14:5x WIB via supervisor "setuju sidebar biasa + filter" (sebelumnya "Atau sebaiknya seperti biasa tapi bisa di filter gitu??") |
| KTR-D3 | **Satu baris kontrak per tahap PKWT** (mulai, akhir, kontrak sebelumnya). Tab **Kepegawaian** menampilkan: (1) tahap & periode sekarang, (2) sisa kontrak + warna peringatan, (3) masa kerja tahap ini, (4) total masa PKWT sejak PKWT 1 vs maks 4 tahun, (5) riwayat kontrak PKWT 1–3. Riwayat kontrak juga tampil di tab **Riwayat**. | G3 — kutipan pengguna 25 Nov "a, sesuai rekomendasi (bisa kelihat juga di tab riwayat)" |
| KTR-D4 | **Diblokir:** PKWT 1 > 2 tahun, PKWT 2/3 > 1 tahun, total > 4 tahun, tahap setelah PKWT 3 (aksi yang tersedia hanya **Jadikan Karyawan Tetap** / Akhiri kontrak). **Peringatan saja:** jeda antar-tahap / tanggal mulai tidak tepat H+1 dari akhir tahap sebelumnya. **Setiap perpanjangan = tahap berikutnya** (maks 2× perpanjangan; tidak ada perpanjangan di dalam tahap yang sama), batas PKWT 2/3 ≤ 1 tahun per tahap. Contoh kontrak nyata: PKWT 1 3 bulan → diperpanjang = PKWT 2 (≤ 1 thn) → diperpanjang = PKWT 3 (≤ 1 thn) → angkat PKWTT atau akhiri. | G4 — kutipan pengguna 25 Nov; aturan perpanjangan: kutipan pengguna 25 Nov 15:0x WIB via supervisor "Q-B: Perpanjangan PKWT itu maksimal 2x perpanjangan jadinya B" (kontrak nyata PKWT 1 = 3/6 bulan, PDF PKWT baru dari pengguna) |
| KTR-D5 | **Pengingat kontrak habis** H-30 & H-7 ke HR_ADMIN PT + atasan langsung (notifikasi web) + daftar **"Kontrak akan habis"** 60 hari. Lewat tanggal akhir tanpa tindakan: **tidak** nonaktif otomatis; tanda merah **"Kontrak lewat"** + pengingat harian sampai HR memilih Perpanjang / Jadikan Karyawan Tetap / Akhiri. | G5 — kutipan pengguna 25 Nov |
| KTR-D6 | **Masa percobaan PKWTT:** bawaan 3 bulan sejak masuk PKWTT, boleh lebih pendek, > 3 bulan diblokir. Pengingat H-14 ke HR PT + atasan. Akhir: HR memilih **Lulus → Permanen** (masa kerja PKWTT tetap sejak awal masuk PKWTT) atau **Tidak lulus → Akhiri** (alasan keluar baru **"Tidak lulus masa percobaan"**). Tanpa aksi otomatis; tanda **"Masa percobaan lewat"**. Karyawan Percobaan lama: tanggal mulai diisi HR saat pembersihan data (K3). | G6 — kutipan pengguna 25 Nov |
| KTR-D7 | **PKWT → PKWTT = langsung Permanen tanpa masa percobaan.** Dua angka masa kerja: **masa kerja di perusahaan** sejak tanggal masuk pertama (tetap dipakai cuti, laporan, jubilee) + **masa kerja PKWTT** sejak tanggal pengangkatan (tampil di tab Kepegawaian). **Istilah di layar (2026-11-25):** aksi pengangkatan dari PKWT 1–3 maupun THL bernama **"Jadikan Karyawan Tetap"** (bukan "Angkat ke PKWTT"); status kontrak yang ditutup karenanya tampil "Dijadikan Karyawan Tetap". Fungsi sama: langsung Karyawan Tetap (PKWTT Permanen) tanpa masa percobaan. | G7 — kutipan pengguna 25 Nov; istilah: kutipan pengguna 25 Nov 15:2x WIB via supervisor "Untuk PKWT jika sudah tahap 3, itu tidak bisa diangkat jadi PKWTT tapi opsinya jadi Karyawan Tetap atau Akhiri Kontrak" |
| KTR-D8 | **THL:** kolom **upah harian** (tab Kepegawaian) + rekap hari hadir/bulan × upah harian (laporan/export; perkiraan, **bukan** payroll). Hari hadir = hari absen sah (hadir/telat yang disetujui; bukan Alpha/izin/libur). Cek akhir bulan: ≥ 21 hari hadir **3 bulan berturut-turut** → tanda **"Wajib diangkat PKWTT"** + notifikasi HR PT & atasan (dasar PP 35/2021 Ps. 10); 2 bulan berturut → **"Mendekati batas"**. Pengangkatan diklik HR → PKWTT Permanen tanpa percobaan. | G8 — kutipan pengguna 25 Nov |
| KTR-D9 | **Perbaikan data karyawan (poin 11 pengguna):** pekerja membuat **laporan audit kualitas data** staging (read-only, Excel per karyawan: status/tahap/periode kontrak kosong, level kosong, tanggal masuk janggal, atasan kosong, dll.). HR memperbaiki lewat **import mode "perbarui"** + kolom baru (tahap PKWT, mulai/akhir kontrak, mulai percobaan, upah harian THL) atau UI. Daftar salah dari pengguna/HR digabung. Tulis staging tetap butuh kata pengguna. | G12 — kutipan pengguna 25 Nov |
| KTR-D10 | **Urutan kerja:** Langkah 0 (simpan WIP R0 Rekrutmen di branch lokal, pull develop) → **K1** status 2 tingkat + migrasi + tab Kepegawaian + aksi → **K2** pengingat + daftar akan habis → **K3** audit data + kolom import → **K4** THL → **K5** pola kerja site + HO fleksibel (Mat dikabari dulu). Tiap paket: rencana → screenshot → commit/push develop; rilis staging = kata pengguna. Implementasi lewat Codex (`codex-worker`). R0 dilanjutkan setelah paket ini. | G13 — kutipan pengguna 25 Nov |
| KTR-D11 | **Akses daftar & pengingat kontrak (mengubah PLAN §4.3 baris Kontrak).** Daftar **"Kontrak akan habis"** (Personal Management › Pengelolaan Karyawan; PKWT & masa percobaan berakhir ≤ 60 hari atau sudah lewat) dan pengingat kontrak terlihat oleh **SUPER_ADMIN + semua HR_ADMIN dalam cakupan PT-nya**, tanpa grant; grant `contract.manage` hanya untuk **aksi** kontrak. Atasan langsung menerima pengingat bawahannya (tanpa tautan, karena bisa berakun Karyawan). Dasar: G5 (pengingat ke HR_ADMIN PT + daftar akan habis) dan HR sudah melihat tanggal akhir di daftar PKWT & tab Kepegawaian. | Persetujuan supervisor atas nama pengguna 2026-11-25 (opsi a, rujuk G5) |
| KTR-D12 | **Koreksi data kontrak (bukan perpanjangan).** Tanggal kontrak **aktif** (mulai, akhir, dan Mulai PKWT 1 untuk tahap lama tanpa riwayat) boleh dikoreksi **tanpa pindah tahap**: lewat aksi "Koreksi data kontrak" di tab Kepegawaian (SA / HR ber-grant `contract.manage`, alasan wajib) dan lewat **import mode "Perbarui"** (tahap sama + tanggal beda). Aturan batas KTR-D4/D6 tetap dicek terhadap tahap sebelumnya. Tercatat di riwayat per field (tab Riwayat › Data kerja) + audit `contract.contract.correct`. Import dengan **tahap berbeda** dari kontrak aktif → error baris (pindah tahap hanya lewat aksi). Mode "Isi yang kosong saja" tidak mengoreksi kontrak yang sudah ada. Kolom import upah harian THL dipindah ke K4 (bersama skemanya). | Persetujuan supervisor atas nama pengguna 2026-11-25 (keputusan kecil rencana K3 no. 1–2) |
| KTR-D13 | **Akses upah harian THL (mengubah PLAN §4.2 & §4.3).** Upah harian THL dan kolom rupiah rekap kehadiran & upah THL dilihat & diisi **SUPER_ADMIN** dan **HR_ADMIN ber-grant `labor.cost.read`** di PT yang ditugaskan (pengecualian khusus THL dari "data gaji tidak pernah bisa di-grant"). HR tanpa grant tetap melihat hari hadir, tanda "Mendekati batas"/"Wajib diangkat PKWTT", menerima notifikasi, dan rekap tanpa kolom rupiah. Perubahan upah dicatat di audit tanpa nominal mentah. Hari hadir = hari absen berstatus disetujui (APPROVED) per bulan kalender WIB; bulan berjalan tidak dievaluasi. | Kutipan pengguna 26 Nov 11:2x WIB via supervisor: "HR + grant labor.cost.read"; keputusan kecil (bulan kalender WIB, hanya APPROVED) persetujuan supervisor atas nama pengguna |

Keputusan terkait di fitur lain: [TM-D35–D37](../time-management/README.md#keputusan) (pola kerja site & HO fleksibel, G9–G11) · [D-038](../../decisions.md#d-038) diubah oleh KTR-D2.

## Keputusan terbuka

| ID | Pertanyaan | Opsi | Status |
|---|---|---|---|
| KTR-OD1 | **Koreksi status (salah input):** karyawan yang statusnya tercatat salah sejak awal (mis. PKWT tercatat Karyawan Tetap, atau sebaliknya) tidak bisa dibetulkan lewat import "Perbarui" (ubah status ke/dari PKWT/Percobaan ditolak, KTR-D4), sedangkan Ubah Status/aksi kontrak mencatatnya sebagai peristiwa kepegawaian baru (riwayat & masa kerja ikut bergeser). Perlu aksi khusus "Koreksi status (salah input)" yang menimpa status + kontrak tanpa dianggap pengangkatan/pengakhiran? | (a) aksi koreksi khusus SA/HR ber-grant, alasan wajib, riwayat ditandai "koreksi"; (b) cukup lewat Ubah Status/aksi biasa + catatan; (c) koreksi manual oleh developer per kasus | Menunggu — diputus setelah data S7/S9 jelas (persetujuan supervisor atas nama pengguna 2026-11-25 16:4x) |

OD baru: `KTR-OD1`, … (tulis di sini + ringkasan di [PROGRESS](../../PROGRESS.md#keputusan-terbuka)).

## Kode

Detail modul: [contract](../../codemap/contract.md).

## QA

Belum ada dokumen QA.

Aturan & templat QA: skill `hris-qa-docs` ([docs/qa/README.md](../../qa/README.md)).
