# Indeks kartu fitur

Kartu = cache untuk agent (lihat `../KARTU-TEMPLATE.md`); sumber kebenaran tetap README fitur, `docs/codemap/` dan kode.

Cara pakai:
1. Cocokkan kata kunci permintaan dengan kolom "Kata kunci"; pilih 1–2 kartu.
2. Ambil sha dari kolom "Diverifikasi" (atau baris `diverifikasi:` di kartu), lalu `git cat-file -e <sha>^{commit}` dan `git diff --stat <sha> -- <jalur yang dipantau di kartu>`; baca ulang hanya file yang berubah dan file yang akan diubah.
3. `—` = kartu belum ada atau belum diverifikasi; sha tidak dikenal, lebih dari 10 file berubah, atau file/simbol hilang = kartu usang. Keduanya → buat/segarkan dulu lewat `quick-worker` `MODE: KARTU`.
4. Setiap tugas yang memakai kartu ikut memperbarui kartu itu dan kolom "Diverifikasi" di sini (sha HEAD awal + tanggal).
5. Kartu untuk fitur lain dibuat saat pertama dipakai (bagian dari rencana tugas itu), lalu ditambahkan sebagai baris baru.

| Kartu | Area | Kata kunci | Modul/folder utama | Diverifikasi |
|---|---|---|---|---|
| `tm-absen.md` | Absensi & punch | absen, punch, clock-in, clock-out, istirahat, precheck, today, absen manual, Data Absen Harian, /attendance/days, lokasi absen, TM-D1, TM-D26, pulang darurat, attendance-daily, TM-D32, standalone, layar utama, PWA, manifest, install, TM-D33, per karyawan, kartu karyawan, attendance/people, foto profil absen | `apps/api/src/modules/attendance/` (attendance, attendance-day, location-setting) · `apps/web/src/features/time-management/` | `73f52bb 2026-11-25` |
| `tm-jadwal.md` | Jadwal & roster | jadwal, roster, shift, pola, crew, template roster, work-roster, pola kerja, homebase, tukar shift, roster-edits, kalender, libur, holidays, time-settings, roster-extend | `apps/api/src/modules/attendance/` (roster, work-roster, roster-edit, calendar) · `apps/web/src/features/time-management/` | `99bd49a 2026-11-24` |
| `tm-lembur.md` | Lembur | lembur, SPL, surat perintah lembur, pengajuan lembur, klaim lembur, overtime, istirahat, upah grade, usulan lembur | `apps/api/src/modules/attendance/` (overtime, overtime-order, overtime-claim) · `apps/web/src/features/time-management/` | `99bd49a 2026-11-24` |
| `tm-cuti.md` | Cuti, izin & sakit | cuti, izin, sakit, saldo cuti, Master Cuti, hak cuti keluar, carry-over, hangus, ajukan ulang, cuti bersama, leave-daily | `apps/api/src/modules/leave/` · `apps/web/src/features/time-management/` | `99bd49a 2026-11-24` |
| `tm-rekap.md` | Rekap & tutup periode | rekap, tutup periode, Alpha, verifikasi Alpha, surat pernyataan, koreksi absen, koreksi, export, Excel, Flash, TM-D31, TM-D3, TM-D13 | `apps/api/src/modules/attendance/` (period, alpha, attendance-export) · `apps/web/src/features/time-management/` | `2777822 2026-11-24` |
| `tm-approval.md` | Approval & notifikasi | approval, persetujuan, inbox, antrean, /time/queue, notifikasi, lonceng, pengingat, attendance-reminders, approval-digest, override, massal, afterCommit | `apps/api/src/modules/approval/` · `apps/api/src/modules/notification/` · `apps/api/src/modules/attendance/` (time-notify) · `apps/web/src/features/time-management/` | `99bd49a 2026-11-24` |
| `dashboard.md` | Dashboard & analitik | dashboard, analitik, widget, pivot, headcount, turnover, tim, labor cost, DSB | `apps/api/src/modules/analytics/` + `/dashboard` & pivot di `employee`, layout di `iam` · `apps/web/src/features/dashboard/` | `99bd49a 2026-11-24` |
