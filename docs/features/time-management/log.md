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

