# Log — Time Management — absensi, roster, cuti, approval

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

### 2026-10-21 — Gabung `HRIS/Mat/Mac` ke develop (Oatse)
- **Dikerjakan:** merge 9 commit Mat (lembur/istirahat/upah grade TM-D6–D8, aturan cuti TM-D9, dashboard DSB-D1, saklar per fitur TM). Konflik `attendance/directory.ts`: fungsi baru Mat (`activeGrades`, `activeLocations`, `exitedEmployees`, `exitStatusOf`, `analyticsEmployees`) dipindah dari query Prisma langsung ke interface publik — employee `listExitedEmployees`, `getEmployeeExitStatuses`, `listAnalyticsEmployees`, `EmployeeBrief.gradeId`; organization `listActiveGrades`, `listActiveWorkLocations`, `getEmploymentStatusCategories` (aturan emas #3). Bentuk fungsi `directory.ts` tetap, pemanggil tidak berubah.
- **Catatan untuk Mat:** merge develop ke branch sendiri sebelum lanjut; data karyawan/PT/lokasi untuk TM hanya lewat `employee/index.ts` & `organization/index.ts` (tambah fungsi di sana bila perlu); rute TM baru wajib skema bertipe untuk app mobile (MOB-D10, `features/mobile`).

### 2026-10-21 — Paket 2: aturan cuti TM-D9 (Mat, `HRIS/Mat/Mac`)
- **Dikerjakan ("lanjut", mode ultracode):** workflow pemetaan (4 pembaca + kritikus kelengkapan: 5 klaim keliru dikoreksi, 10 area terlewat) → 4 keputusan pemilik projek (tolak pengajuan ke tahun hangus; tanpa roster ÷21; tanpa prorata; disetujui setelah tutup periode → CUTI berlabel) → implementasi API (engine tahun mulai, tolak tahun hangus, ajukan ulang, pelepasan setelah hangus, pelunasan hutang nyata, urutan cron, hak cuti keluar `leave-exit.service.ts`, Alpha tidak lagi untuk cuti bersama, label `LEAVE_AFTER_CLOSE`) → agen web (form ajukan ulang, kartu saldo hangus 31 Des, tab Saldo Cuti › Karyawan keluar, badge pengajuan ulang) + reviewer → review adversarial 4 dimensi (20 temuan, **12 terkonfirmasi** setelah skeptis, semua diperbaiki: hak keluar tidak terhapus hangus 1 Jan & mengembalikan cuti setelah tanggal keluar, tidak bayar ganda setelah PAID, pembatalan berdasarkan status karyawan (bukan daftar terpotong), kunci advisory hangus vs pelepasan, cuti bersama setelah hangus diambil dari sisa hangus, kunci baris pengajuan ulang serentak, koreksi APPROVED tidak ditimpa cuti, rekam jejak Alpha tanpa hari yang jadi cuti, jendela cuti bersama 62 hari, snapshot grade).
- **Verifikasi (DB lokal):** migrasi `leave_resubmit_exit` hanya lokal · typecheck ✔ · lint ✔ · boundaries ✔ · shared **309** · api **859** (leave 20: 8 baru TM-D9) · web **305** (6 baru `leave.test.tsx`).
- **Masalah / catatan:** payroll belum ada → hak keluar = catatan HR (OPEN/PAID). Hutang yang muncul setelah pelunasan 31 Jan (mis. penyesuaian HR ke tahun lama) tetap manual. `vercel.json` belum memuat cron `leave-daily`/`attendance-daily` (antrean rilis).
- **Berikutnya:** uji di HP; Paket 3 dashboard (DSB-D1).

### 2026-10-21 — Gabung HRIS/Oatse/Linux-Windows, saklar per fitur, uji E2E lembur & istirahat (Mat, `HRIS/Mat/Mac`)
- **Dikerjakan:** merge `origin/HRIS/Oatse/Linux-Windows` (`8cda6b8`, 25 commit, tanpa konflik & tanpa migrasi baru); sub-saklar `tm*` per fitur Time Management + `tmOn()` di `feature-flags.ts` (induk `timeManagement` tetap); donut dashboard: angka tengah & persen mengikuti legenda yang dimatikan; HP: tombol Pulang saat masih istirahat langsung memberi pesan (tanpa membuka kamera); JT = **Jetty & Loading team** (bukan pelabuhan).
- **Uji E2E Playwright (lokal, akun demo, kamera & GPS palsu) 29/29 PASS:** SA upah grade (Rp41.618/jam), lokasi wajib istirahat, template JT; Rina Clock In → Mulai istirahat → Clock Out ditolak saat istirahat → Selesai → Clock Out; lembur hari OFF 9 j 30 m (18,5 jam setara, lewat 4 jam) → Budi setuju tanpa alasan ditolak, dengan alasan diterima → HR setuju → SA Rp769.942 per orang & di rekap; HR tanpa grant & atasan tanpa kolom rupiah, menu Upah Grade tersembunyi; donut 200 → 139 setelah satu legenda dimatikan. Bukti: screenshot di scratchpad sesi (folder QA `/mnt/winD/...` tidak ada di Mac).
- **Bug ditemukan & diperbaiki:** Clock In jauh sebelum shift lalu Clock Out sebelum shift mulai diusulkan "datang awal 8 j 41 m" → datang awal kini dibatasi jam pulang (dan pulang lewat dibatasi jam masuk); 2 unit test + langkah E2E B9.
- **Verifikasi:** typecheck ✔ · lint ✔ · boundaries ✔ (493 modul) · shared 300 · api 849 · web 299 (dengan batas tunggu longgar; laptop lambat).

### 2026-10-21 — Lembur, absen istirahat, upah grade & template JT, TM-D6–TM-D8 (Mat, `HRIS/Mat/Mac`)
- **Dikerjakan (grill pemilik projek 2026-10-20/21, "yessur run it"):** keputusan TM-D6–TM-D10 + DSB-D1 ditulis; OD-14 terjawab. Paket 1: mesin lembur murni (`packages/shared/src/overtime.ts`), `overtime.service.ts` (sinkron usulan saat Clock Out / keputusan absen / input manual / batal, label `BREAK_OVER`/`NO_BREAK_PUNCH`/`REGULAR_OT_SHORT`, handler & guard approval `OVERTIME`, daftar + rekap dengan rupiah sesuai hak), `roster-template.service.ts` (JT), route `overtime.routes.ts`; approval `registerApprovalGuard`; antrean menu `overtime`; web: halaman Lembur & Upah Grade, kartu lokasi wajib istirahat, field shift + dialog template, tombol istirahat HP, jam istirahat di Data Absen Harian.
- **Keputusan:** TM-D6 (lembur), TM-D7 (istirahat), TM-D8 (template JT), TM-D9 (cuti — rencana Paket 2), TM-D10 + DSB-D1 (kompensasi & dashboard — rencana Paket 3); OD-14 → TM-D6.
- **Verifikasi (Mac, DB lokal):** migrasi `overtime_break_wage` hanya ke Postgres lokal · typecheck ✔ · lint ✔ (1 warning lama) · boundaries ✔ (473 modul) · shared **276** (baru 30 di `overtime.test.ts`) · api **815** (baru 9 di `overtime.test.ts`) · web **301** lulus + 8 skipped (baru 6 di `overtime.test.tsx`; 8 test lama sempat timeout 5 dtk saat semua file paralel, lulus 65/65 saat diulang `--maxWorkers=2`) · build ✔.
- **Masalah / catatan:** migrasi belum diterapkan ke Supabase (jangan disentuh; ikut alur rilis). Rupiah memakai upah grade saat dibaca (bukan snapshot). Batas mingguan menghitung lembur rutin + tambahan (menunggu/disetujui) di luar tanggal merah. Karyawan tanpa crew memakai rumus pola 6 hari.
- **Berikutnya:** uji di HP (tombol istirahat); Paket 2 aturan cuti (TM-D9); Paket 3 dashboard (DSB-D1); izin commit + push.
### 2026-10-21 — Adapter `directory.ts` lewat interface publik + cron TM di `vercel.json` (Oatse)
- **Dikerjakan:** `attendance/directory.ts` jadi fasad tanpa Prisma (aturan emas #3): karyawan lewat `employee/index.ts` (`getEmployeeBriefs`, `listEmployeeBriefs` + filter baru `employeeNumbers`, fungsi baru `listActiveEmployeeJoinDates`), lokasi & PT lewat `organization/index.ts` (baru: `directory.service.ts` → `getWorkLocationBriefs`, `listGeofencedWorkLocations`, `companyExists`; query di `organization.repository.ts`). Bentuk `DirectoryEmployee`/`DirectoryLocation` tetap, ±50 pemanggil di attendance & leave tidak diubah. Cron `roster-extend` (00:15 WIB), `attendance-daily` (00:30), `leave-daily` (00:45), `attendance-reminders` (tiap 30 menit), `approval-digest` (07:00) di `apps/api/vercel.json` (Vercel Pro, FND-D1).
- **Keputusan:** —
- **Verifikasi:** typecheck ✔ · `biome ci` ✔ · boundaries ✔ (488 modul) · shared **268** · api **840** · web **290**, 0 gagal (DB lokal docker) · 11 cron di `vercel.json` = nama job di `app.ts`/`cron.ts`.
- **Masalah / catatan:** begitu `vercel.json` ini dirilis, cron TM jalan di staging walau saklar web `timeManagement` `false` (bisa memunculkan Alpha & notifikasi untuk karyawan staging) — putuskan ditahan/ikut saat persiapan rilis. `employeesByNumbers` kini dibatasi 5000 nomor per panggilan (batas `listEmployeeBriefs`). Mat perlu pull develop sebelum lanjut di `attendance/*`.
- **Berikutnya:** uji HP kamera/GPS; OD-13–OD-15; konfirmasi contoh prorata (D-072).

### 2026-10-20 — Paket UX: notifikasi, pengingat absen (TM-D2), antrean menu, beranda HP (Mat, `HRIS/Mat/Mac`)
- **Dikerjakan:** uji coba (smoke API 4 role: semua 4–106 ms, tanpa 5xx; temuan utama: modul absensi/cuti/approval tanpa notifikasi) → `time-notify.service.ts` (penerima via `iam`, `queueFor`, `runAttendanceReminders`, `runApprovalDigest`), `time-notify.routes.ts` (`GET /time/queue`), pemicu di keputusan absen/koreksi/cuti, pengajuan baru, penandaan Alpha; `iam.listApproverAccounts`; cron `attendance-reminders` & `approval-digest` (app.ts). Web: `queue-api.ts` + `queueKey` di menu (Data Absen Harian, Koreksi, Perubahan Roster, Persetujuan Cuti), badge tile Approval HP, `home-insights.tsx` (banner belum Clock In/waktunya Clock Out, banner Alpha bisa dikoreksi, kartu saldo cuti & status kemarin).
- **Keputusan:** TM-D2 (README).
- **Verifikasi:** test dijalankan ke DB lokal (server pengguna sedang mode Supabase, tidak diubah) · api **806** (baru: `time-notify.test.ts` 3) · web **293** (baru: `home-insights.test.tsx` 3; 8 dilewati saklar) · typecheck · lint (1 warning lama) · boundaries ✔. Uji tampilan Playwright ditunda (perlu mode Lokal).
- **Masalah / catatan:** cron `attendance-daily`, `attendance-reminders`, `approval-digest` belum di `vercel.json` (tambahkan saat rilis Time Management). Uji fixture "pengingat belum Clock In" memakai shift yang mulai 2 jam lalu — bisa meleset bila dijalankan sekitar tengah malam.
- **Berikutnya:** izin commit + push; uji tampilan di mode Lokal.

### 2026-10-19 — Keterangan & berkas per jenis izin (TM-D5) (Mat, `HRIS/Mat/Mac`)
- **Dikerjakan:** kolom `description` & `document_label` di `leave.leave_types` (migrasi `20261019071235_leave_type_description` + isian bawaan 9 jenis), DTO & simpan jenis, dialog Master Cuti (Keterangan, Berkas yang diperlukan), daftar jenis menampilkan keduanya, form pengajuan menampilkan keterangan + aturan berkas dan label lampiran sesuai jenis (teks lama "mis. surat dokter" dihapus).
- **Keputusan:** TM-D5 (README).
- **Verifikasi:** migrasi lokal saja · `db:check` ✔ · api **803** (baru: 1 test keterangan & berkas, SA ubah, lampiran tetap opsional) · shared 246 · web 75 (subset time-management/navigasi/riwayat) · boundaries ✔ · lint (1 warning lama).
- **Berikutnya:** izin commit + push.

### 2026-10-19 — Izin melebihi jatah memotong cuti tahunan (TM-D4) & Master Cuti bukan untuk karyawan (Mat, `HRIS/Mat/Mac`)
- **Dikerjakan:** `annualChargedDates` (cuti tahunan = semua hari; izin = kelebihan dari jatah), tahanan saldo untuk kelebihan izin, `annualDays` di pratinjau & DTO (dari buku besar HOLD), form web tidak lagi memblokir izin melebihi jatah (sakit tetap), label "X hari memotong cuti tahunan" di daftar & inbox. Master Cuti: `canViewLeaveYears` (SA/HR/MANAGER), `tmAccess.viewLeaveMaster`, menu & route dijaga.
- **Keputusan:** TM-D4 (README).
- **Verifikasi:** api **802** (baru: 2 izin melebihi jatah, 1 akses Master Cuti) · shared 246 · web navigasi + time-management 70 · lint (1 warning lama) · boundaries ✔.
- **Berikutnya:** izin commit + push.

### 2026-10-19 — Alpha harian & koreksi maks. 3 hari, TM-D3 (Mat, branch `HRIS/Mat/Mac`)
- **Dikerjakan:** checklist "Alpha harian & koreksi maks. 3 hari (TM-D3)". Keputusan pemilik projek: batas dari tanggal kerja; hari yang batasnya lewat saat aktif langsung permanen; batas berlaku untuk semua koreksi; rekam jejak di halaman Koreksi, detail karyawan, rekap. Juga hari ini: hari OPEN lama lewat batas ditutup saat aplikasi dibuka (tombol Clock In tidak lagi tertahan), tabel Data Absen Harian diringkas (16 → 7 kolom), lokasi pada input manual HR, nama lokasi pada label "Di lokasi lain".
- **Keputusan:** TM-D3 (README); D-071 ditandai "sebagian diubah oleh TM-D3".
- **Verifikasi (Mac, DB & Auth lokal):** test api **798** (baru: `alpha.test.ts` 4; `period.test.ts` disesuaikan — koreksi 2001 kini ditolak batas H+3, alur koreksi memakai tanggal baru-baru ini) · shared **246** · web: `attendance-record.test.tsx` 3 baru + detail karyawan lulus · typecheck · lint (1 warning lama) · boundaries ✔. Data lokal: karyawan demo (roster mulai 14 Okt) mendapat 4–5 Alpha; 16–18 Okt masih bisa dikoreksi.
- **Masalah / catatan:** judul test lama di `period.test.ts` berisi karakter rusak "â†’" (dari merge Windows) — dibiarkan. Penandaan memanggil `markNoAttendanceAlpha()` tanpa filter dari Data Absen Harian (ringan di lokal; produksi mengandalkan cron).
- **Berikutnya:** izin commit + push; pengingat absen harian (TM-D2) memakai aturan ini.

### 2026-10-15 — Lokasi absen per karyawan, TM-D1 (Mat, branch `HRIS/Mat/Mac`)
- **Dikerjakan:** checklist "Lokasi absen per karyawan (TM-D1)". Permintaan pemilik projek: lokasi absen tiap user bisa dipilih lewat UI, bukan diubah manual di DB. Pilihan pemilik projek: 1 lokasi per karyawan, ada opsi bebas lokasi (PLAN §5.4), diatur SA + HR PT. API: tabel `attendance.employee_location_settings` (migrasi `20261015064508_employee_location_setting`, hanya `CREATE TABLE`), `location-setting.{repository,service,routes}.ts`, `GET`/`PUT /attendance-locations`, policy `canManageAttendanceLocation`; `attendance.service` memakai `resolveAttendanceLocation` (masuk, pulang, `me/today` + `anywhere`/`locationSource`); `checkGeofence` dapat parameter `anywhere`. Web: halaman `/time/lokasi-absen` + menu Roster › Lokasi Absen; HP menampilkan "Bebas lokasi" di kepala, hasil pra-cek, cap foto & profil.
- **Keputusan:** TM-D1 (lihat README).
- **Verifikasi (Mac, DB & Auth lokal):** migrasi diterapkan ke Postgres lokal saja · `db:check` ✔ · typecheck ✔ · lint ✔ (1 warning lama) · boundaries ✔ (423 modul) · test shared **218** · api **728** (baru: 6 integration `location-setting.test.ts` + 1 unit geofence bebas lokasi; 46 test Time Management lama tetap lulus) · web **267** (baru: 4 di `attendance-locations.test.tsx`) — 0 gagal. Catatan: di laptop Intel ini beberapa test web lama sesekali gagal di batas tunggu `findBy` 1 detik (berganti-ganti tiap run); dengan batas 5 detik sementara (tidak di-commit) seluruhnya lulus.
- **Masalah / catatan:** daftar karyawan dibatasi 500 per PT (pakai pencarian untuk sisanya). Lokasi tanpa titik/radius tidak bisa dipilih sebagai lokasi khusus (422). Fungsi `roster.repository.crewOfEmployeeOn` kini tidak dipakai, tapi sengaja dibiarkan supaya file roster tidak berubah (aman-merge).
- **Berikutnya:** izin commit + push `HRIS/Mat/Mac`; uji di HP; daftarkan TM-D1 di indeks PLAN §8 saat digabung ke develop.

### 2026-10-13 — Gabung Time Management dari `HRIS/Mat/windows` ke develop (Oatse, merge `e31e934`)
- **Dikerjakan (rencana disetujui pemilik projek: "kerjakan dengan teliti"):** merge `origin/HRIS/Mat/windows` (`82a5dce`, `e8ebbb2`; basis `bfe9e50`, tertinggal 29 commit) ke develop tanpa commit dulu. Konflik: `dashboard-page.tsx` (digabung: sapaan nama karyawan BUG-004 + parameter `description` & widget pribadi Mat), PLAN §8/§9 & PROGRESS §1/§2/§6 (kedua sisi dipertahankan; butir §2 Mat soal dashboard yang sudah usang dibuang). **Nomor bentrok:** D-066 (bagan nama asli) & OD-12 (repo publik) sudah dipakai develop → keputusan Mat **D-066–D-072 → D-067–D-073**, **OD-12–OD-14 → OD-13–OD-15** (264 rujukan di kode/test/dokumen; hanya baris yang berasal dari Mat, dicek baris per baris terhadap HEAD; catatan asal nomor di PLAN D-067 & OD-13). OD-13–OD-15 ditambahkan ke §4.
- **Verifikasi:** `db:migrate` lokal (7 migrasi) → rerun "Already in sync" · `db:generate` ✔ · `db:check` ✔ · typecheck ✔ · `biome ci` ✔ (484 file; 1 warning lama `employee-print.test.ts:485`) · boundaries ✔ (395 modul) · test shared **200** · api **676** · web **253** — 0 gagal · build api & web ✔ · server lokal: 51 path baru di OpenAPI, semua memuat respons 401, tanpa token → 401 · Playwright lokal 4 role × dashboard + 12 halaman `/time/*` + `/absen` = **56/56** tanpa error konsol/5xx; halaman di luar hak role menampilkan "Akses ditolak" (bukti `/mnt/winD/WORK/Magang/QA/2026-10-13-merge-time-management/`).
- **Pull ulang (sesi sama):** commit Mat baru `1ed1471` (aplikasi HP mandiri `/absen/*`: riwayat, roster, cuti, koreksi, tukar shift, kalender, approval, notifikasi, profil; kalender libur bergaya kalender dinding; zona waktu dari pengaturan) dimasukkan ke merge yang sama (patch 3-way, `MERGE_HEAD` → `1ed1471`); 2 konflik komentar nomor keputusan + 1 rujukan D-066 → D-067. **Perbaikan bug** `calendar-settings-pages.tsx`: pembungkus pesan "Belum ada hari libur" memakai `xl:col-span-2` (breakpoint layar) di grid yang 2 kolomnya lewat container query `@[72rem]` → di layar 1280–~1500 px terbentuk kolom implisit dan 12 bulan terjepit 334 px satu kolom; diganti `@[72rem]:col-span-2` (diukur ulang 1280/1440/1920/390 px ✔). Verifikasi ulang: typecheck ✔ · biome ✔ (485 file, 1 warning lama) · boundaries ✔ (396 modul) · test shared 200 · api 676 · web 253 ✔ · build ✔ · `db:check` ✔ (tanpa migrasi baru) · Playwright 4 role **92/92** (tambah 9 halaman `/absen/*` di viewport HP; SA tanpa data karyawan → "Akses ditolak").
- **Pull ulang ke-2 (sesi sama):** `a77d848` (alasan absen boleh diisi walau tanpa label = opsional; tetap wajib bila berlabel — server masih menolak absen berlabel tanpa alasan, D-070; HP menampilkan menit telat & jadwal masuk) dimasukkan ke merge yang sama tanpa konflik (`MERGE_HEAD` → `a77d848`). Verifikasi ulang: typecheck ✔ · biome ✔ · boundaries ✔ · test 200/676/253 ✔ · build ✔ · Playwright 92/92 ✔.
- **Tinjauan aturan emas:** absen tanpa jam dari perangkat (waktu server, #9) ✔ · `selfiePath` wajib berawalan `attendance/<employeeId>/` ✔ · migrasi tanpa objek Supabase/`CREATE EXTENSION` ✔ · tidak ada log data sensitif di modul baru ✔ · **⚠ #3 batas modul:** `attendance/directory.ts` membaca tabel `employee`/`organization` langsung (adapter sementara, ditandai Mat) → Backlog.
- **Berikutnya:** izin commit merge + push develop; lalu tindak lanjut Backlog (adapter → `index.ts`, cron `vercel.json`), uji HP, dan jawaban OD-13–OD-15 sebelum rilis Time Management.

## 2026-10-21 (lanjutan) — template 13+1 & 5+2, akun & rencana uji
- **Dikerjakan:** `ROSTER_TEMPLATES` = JT, ROT_13_1, WEEK_5_2 (`roster-template.service.ts`, dialog "Pakai template" dengan pilihan template) — `c664054`.
- **Data & akun uji (lokal saja):** script `apps/api/scripts/seed-qa-time.ts` (`bun run db:seed:qa`, dijaga `guard-local-db`, idempoten): upah grade Staf, lokasi demo wajib istirahat, shift uji `QA` 08–17, karyawan Dimas (TMDEMO-LAP, tim Budi, roster 14 hari), karyawan keluar Sari (TMDEMO-EXIT, sisa cuti 9 hari), akun `hr.biaya@arthasia.test` & `lapangan.lokal@arthasia.test`. Dicek: dijalankan 2× (kedua kali "unchanged"), login kedua akun, `/dashboard/analytics` 200 (hr.biaya, ada laborCost & liability) · 403 (lapangan) · hr.lokal tanpa rupiah.
- **QA:** `docs/qa/cases/time-management.md` (TC-TM-001…027) + rencana `docs/qa/plans/2026-10-21-tm-paket-lokal.md`.
- **Berikutnya:** eksekusi rencana uji manual; izin push `HRIS/Mat/Mac`; cron `leave-daily`/`attendance-daily` ke `vercel.json`.

## 2026-10-21 (lanjutan) — merge develop, lapisan repository, OpenAPI bertipe
- **Merge:** `HRIS/Oatse/Linux-Windows` (`a3135d7`, fast-forward, tanpa konflik) → `HRIS/Mat/Mac`; migrasi `push_devices_and_notification_target` diterapkan ke DB lokal saja.
- **Temuan develop #3 (PROMPT §4):** `leave-exit.service.ts`, `leave-analytics.ts`, `overtime.service.ts`, `analytics-facts.ts` tidak lagi memanggil `getPrisma()` — query lewat `leave.repository.ts` / `overtime.repository.ts` baru. Masih memanggil langsung (bukan dari paket Mat, dicatat): `alpha.service`, `period.service`, `leave-bridge`, `time-notify.service`, `asset/report-data.service`.
- **MOB-D10:** rute baru Mat bertipe di OpenAPI — lembur, upah grade, lokasi istirahat, template roster, `GET /dashboard/analytics`, `/leave-exit-settlements*` (file sendiri `leave-exit.routes.ts`). Skema dicek sama dengan DTO service saat typecheck; test integrasi mem-parse respons sungguhan dan memastikan spec tanpa skema kosong.
- **Verifikasi:** typecheck ✔ · biome ✔ · boundaries ✔ (514 modul) · test shared 335 · api 882 · web 310 ✔ · smoke API lokal (hr.biaya) 5 endpoint ✔.


## 2026-10-22 — merge develop (kontrak OpenAPI TM, operationId app) — Mat

- Merge `HRIS/Oatse/Linux-Windows` (790557a) ke `HRIS/Mat/Mac`. Konflik: `overtime.routes.ts`, `leave.routes.ts`, `codemap/attendance.md`.
- Ikut konvensi develop (MOB-D7 #1/MOB-D17): `overtime.schema.ts` dihapus → `overtime.contract.ts` milik develop; `leave-exit.routes.ts` dihapus → rute `/leave-exit-settlements*` kembali ke `leave.routes.ts` (skema `leave.contract.ts`); `analytics.schema.ts` → `analytics.contract.ts` dengan `assertExact`.
- Temuan develop #5: `leave-exit.service.ts` sudah lewat `leave.repository.ts` (12722b1); recalculate/paid melempar 404, jadi `leaveExitSettlementResultSchema` (`.optional()`) dihapus — respons selalu `LeaveExitSettlement`. `formula` di kontrak jadi enum `OVERTIME_FORMULAS`.
- Path/method endpoint tidak berubah (APP_OPERATION_IDS aman).

## 2026-10-22 — TM-D12 batas waktu Clock Out, istirahat, & hari OFF — Mat

- Permintaan pemilik projek: absen pulang & istirahat mengikuti waktunya; absen datang bebas (telat tetap ditandai); hari OFF tidak boleh absen kecuali lembur hari libur.
- Jawaban grill: toleransi Clock Out 30 menit; jam mulai & selesai istirahat di shift, selesai istirahat bebas (aturan lembur/utang istirahat tetap); pulang darurat boleh dengan alasan.
- API: `breakWindow`, `checkOutOpensAt`, `CheckInPlan.offDay` (`attendance-engine.ts`); `openDayTimes` + penolakan Mulai istirahat di luar jendela & Clock In OFF tanpa `offDayOvertime` (`attendance.service.ts`); validasi jam istirahat di `validateShift`; pengaturan `checkOutEarlyMin`. Kontrak `AttendanceToday`/`AttendancePrecheck`/`Shift`/`TimeSettings` bertambah field (path/method/operationId tetap) — **kabari tim mobile**.
- Migrasi `20261022030522_shift_break_window` (dua kolom nullable, lokal saja). Seed QA: shift QA Mulai istirahat 12.00–13.00.
- Web: tombol Lembur hari libur, Pulang darurat + jam buka, tombol istirahat terkunci di luar jendela; form shift jam istirahat (jatah otomatis dari selisih); pengaturan TM "Clock Out dibuka".
- Test: `punch-window.test.ts` (API, 9), `punch-window.test.tsx` (web, 6), unit mesin absen.

## 2026-10-22 — UAT Rina, Joko (jetty), Atasan, HR — Mat

- Script `apps/api/scripts/seed-qa-acceptance.ts` (`bun run db:seed:acceptance`, lokal saja, dijaga guard + cek URL lokal):
  - Reset data Rina, Budi, Joko serta notifikasi & dashboard 5 akun.
  - Isi tanggal merah uji, shift UQA/UJT, dan riwayat absen lewat service asli (approval & lembur terbentuk), plus cuti menunggu.
  - Akun baru `jetty.lokal` (Joko Jetty, TMDEMO-JT, aturan JT) dengan password sama dengan akun uji lain (hash disalin di Auth lokal).
  - Membersihkan usulan lembur & approval yatim sisa test.
- Foto contoh `scripts/assets/qa-selfie.jpg` (siluet buatan sendiri).
- Hasil: [docs/qa/runs/2026-10-22-acceptance-rina.md](../../qa/runs/2026-10-22-acceptance-rina.md), 28/28 lulus. Sekuens manual HR & atasan: [plans/2026-10-22-acceptance-rina.md](../../qa/plans/2026-10-22-acceptance-rina.md).
- Temuan:
  - Cleanup `attendance.test.ts`/`mobile-punch.test.ts` meninggalkan lembur & approval yatim.
  - Pembulatan JT (+30 mnt dari kelebihan beberapa menit) perlu keputusan.
  - Label "Tanpa absen istirahat" di hari OFF.
- Upah grade lokal mengikuti kisaran umum industri tambang (di atas UMSP batubara Kalsel 2026 Rp3,77 jt):
  - Staf 5,7+1,5 jt, Staf Senior 8+2 jt, Supervisor 14+4 jt, Manajer 30+8 jt, Direktur 100+25 jt.
  - Jabatan demo disesuaikan: Rina Administrasi, Joko Checker Jetty, Dimas Helper Bor, Sari GA Staff, Budi Operations Manager (Manajer).
  - Ikut `db:seed:acceptance`.

## 2026-10-22 — Switcher akun uji per tab & tombol Muat ulang persetujuan — Mat

- **Switcher akun uji (dev saja)** di panel "DB · Lokal":
  - Sekali klik masuk sebagai akun `@arthasia.test` tanpa password, satu akun per tab.
  - Pengaman: hanya `NODE_ENV=development`, DB & Auth lokal, akun uji aktif.
  - Rincian: skill `hris-db-switch`.
  - Panel DB tidak lagi terpotong di tepi kanan.
- **Tombol Muat ulang** di halaman persetujuan: Lembur, Data Absen Harian, Persetujuan Cuti, dan Approval HP. Mengambil ulang antrean tanpa memuat ulang halaman (`components/refresh-button.tsx`).

## 2026-10-23 — TM-D13 Fase A: absen per shift — Mat

- Masalah dari pemilik projek: shift 3 roster tgl 27 (00:00–08:00) lalu shift 2 roster 28 (16:00–24:00) → absen jatuh ke tgl 28, tgl 27 Alpha.
  - Akar masalah: pencocokan Clock In memakai tanggal kalender, plus aturan sekali Clock In per tanggal kalender.
- Keputusan grill:
  - Shift 3 = malam setelah tanggal roster.
  - Tap-out ikut shift yang di-tap-in.
  - Jeda < 8 jam ditandai.
  - Alpha → notif + verifikasi atasan (Fase B).
- Kode:
  - Engine: `startsNextDay` di `shiftWindow`/`breakWindow`, `planCheckIn(…, taken)` memilih shift terdekat yang belum di-Clock In, `restShortfall`.
  - Service: `openDayTimes(…, locked)` memakai jadwal tersimpan; `checkedInAlready` per tanggal roster; `next` beranda per shift.
  - Kolom `shifts.starts_next_day`; label `SHORT_REST`; pengaturan `minRestHours`.
  - Web: master shift & pengaturan.
- Test:
  - `__tests__/shift-instance.test.ts` (engine, kasus 27→28, shift 3 dua malam, jendela tumpang tindih, jeda).
  - `tests/integration/time-management/shift-instance.test.ts` (service asli dengan jam terkontrol: tap-in 23:50, tap-out 08:05, tap-in 15:45 + SHORT_REST, tanpa Alpha, jadwal terkunci walau master diubah).
- Kontrak API berubah: `Shift.startsNextDay`, `TimeSettings.minRestHours`, label `SHORT_REST`. Path & operationId tetap. **Kabari tim mobile.**

## 2026-10-23 — TM-D13 Fase C: notifikasi perubahan jadwal — Mat

- Poin 12 "memperjelas mekanisme pertukaran shift agar karyawan mengetahui perubahan jadwalnya".
- `roster-notify.service.ts`:
  - Jadwal lama vs baru dibandingkan di `applyCells` (edit grid & import), `regenerateCrew` (pola/crew/anggota berubah) dan handler approval `ROSTER_CHANGE`.
  - Satu notifikasi per karyawan, hanya tanggal hari ini ke depan, isi "tanggal: lama → baru".
  - Tukar shift ditolak/dibatalkan → pengaju diberi tahu.
  - Cron `roster-extend` tidak mengirim notifikasi (`regenerateCrew(…, notify=false)`).
- Target notifikasi baru `ROSTER` (id = tanggal) dan `TodayView.roster[].changed` → titik "Jadwal berubah" di roster 7 hari. **Kabari tim mobile.**
- Test:
  - `roster-notify.test.ts`: edit HR → notifikasi; tanpa perubahan / tanggal lewat → tidak ada; cron perpanjangan → tidak ada.
  - `roster.test.ts`: tukar shift disetujui → pengaju & rekan diberi tahu.

## 2026-10-23 — TM-D13 Fase D: template 3 shift & jeda pola — Mat

- Poin 15 "meninjau pengaturan shift agar jadwal kerja dan absensi sesuai ketentuan operasional".
- Template baru `SHIFT_3X8`:
  - S1 08–16, S2 16–24, S3 24–08 (malam setelah tanggal roster); istirahat 60 mnt dibayar; tanpa lembur rutin.
  - Pola S1 S1 S2 S2 S3 S3 OFF OFF; 4 crew bergeser 2 hari → tiap shift selalu dijaga satu crew.
  - Jam shift diasumsikan (pertanyaan ke pemilik projek belum dijawab).
- `patternRestWarnings` di `@hris/shared`: jeda antarlangkah pola melingkar < `minRestHours` → peringatan langsung di form Pola dan `restWarnings` di hasil `POST /roster/templates` (kontrak bertambah; **kabari tim mobile**). Tidak menolak.
- Test: shared `overtime.test.ts` (2-2-2 aman, S2→S1 8 jam, malam→pagi 0 jam); API `overtime.test.ts` (template 3 shift).

## 2026-10-23 — TM-D13 Fase B: verifikasi Alpha oleh atasan — Mat

- Poin 16 "notifikasi dan verifikasi atasan apabila karyawan tidak masuk atau tidak melakukan absensi".
- Pilihan pemilik projek: notifikasi ke atasan + atasan memverifikasi; tutup periode ditolak bila belum (rekomendasi, "gas").
- Kode:
  - Migrasi `alpha_verification` (kolom `alpha_verification`, `alpha_verified_by`, `alpha_verified_at`, `alpha_verification_note` + enum).
  - `markNoAttendanceAlpha` menandai PENDING + notifikasi `attendance.alpha_verify` ke atasan.
  - `alpha.service`: `listAlphaVerifications`, `verifyAlpha` (audit `attendance.alpha.verify`, notifikasi karyawan), `pendingAlphaVerifications`.
  - `period.service`: pratinjau `unverifiedAlpha`, tutup periode 422.
  - Policy `canVerifyAlpha`/`canViewAlphaVerifications`.
  - Web: tab Alpha di Approval HP (`alpha-verification-list.tsx`) & peringatan di pratinjau tutup periode.
- **Beda dari usulan awal:** Izin/Sakit/Tugas luar tidak membuat pengajuan otomatis. Karyawan diminta mengajukan izin/sakit/koreksi (alur resmi diputus HR), karena modul cuti & koreksi belum punya pengajuan atas nama karyawan dan surat dokter/saldo harus tetap lewat alur cuti.
- Test:
  - API `alpha-verification.test.ts`: Alpha → PENDING + notif atasan; antrean atasan; karyawan 403; tutup periode 422; verifikasi Sakit + notif karyawan.
  - Web `alpha-verification.test.tsx`.
  - Browser lokal: Budi memverifikasi Alpha Dimas → tersimpan "Izin".
- Kontrak API baru: `GET/POST /attendance/alpha-verifications`, `AttendancePeriodPreview.unverifiedAlpha`. **Kabari tim mobile.**
