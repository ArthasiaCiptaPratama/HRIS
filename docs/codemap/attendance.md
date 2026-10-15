# Codemap — `attendance`

> Detail modul `attendance`, dipindah utuh dari `CODEMAP.md` §2/§3/§6 pada 2026-10-13. Struktur standar modul: [CODEMAP §4](../CODEMAP.md#4-struktur-standar-modul-appsapisrcmodulesmodul) · peta modul: [CODEMAP §5](../CODEMAP.md#5-peta-modul). Fitur pemakai: [time-management](../features/time-management/README.md).

## Web (`apps/web/src/features/`)

```
│       ├── time-management/          [wip] 2026-10-13 (gabung `HRIS/Mat/windows`, saklar `FEATURES.timeManagement`): PWA `/absen` (`pages/absen-page.tsx` shell HP + beranda; `pages/mobile-pages.tsx` aplikasi HP mandiri `/absen/{riwayat,roster,cuti,koreksi,tukar-shift,kalender,approval,notifikasi,profil}`, 2026-10-13; `capture.ts` kamera+GPS, `public/absen.webmanifest` + `absen-sw.js` tanpa cache), `/time/*` (absen harian, rekap & tutup periode, roster + pengaturan shift/pola/crew, perubahan roster, cuti, persetujuan cuti, saldo, master cuti, kalender libur, pengaturan, koreksi & surat pernyataan); `access.ts`, `api.ts`/`leave-api.ts`/`period-api.ts`, `roster-file.ts` (import Excel roster); **TM-D1 (2026-10-15):** `/time/lokasi-absen` (`pages/location-settings-page.tsx` + `location-api.ts`, akses `tmAccess.manageAttendanceLocations`)
```

## Tabel & rincian

### `attendance`

**[wip] 2026-10-13:** tabel nyata di `attendance.prisma` (lihat §2); file: `calendar.*` (libur + pengaturan), `roster.*` + `roster-engine.ts` + `roster-change.service.ts` (shift/pola/crew/grid/import/tukar shift, D-069), `attendance.*` + `attendance-engine.ts` + `attendance-day.routes.ts` (absen PWA selfie+GPS+label tanpa blokir D-070, hari absen, koreksi, absen manual), `period.*` (rekap, tutup periode → ALPHA + surat pernyataan, D-071), `leave-bridge.ts`, **TM-D1 (2026-10-15)** `location-setting.{repository,service,routes}.ts` (tabel `employee_location_settings`; `GET`/`PUT /attendance-locations`; `resolveAttendanceLocation` dipakai mesin absen: bebas lokasi → lokasi khusus → crew → lokasi kerja; `checkGeofence(..., anywhere)`), **`directory.ts` adapter baca sementara** ke tabel employee/organization (ganti dengan `index.ts` modul tersebut). Selfie di bucket private `attendance-selfies`, path wajib `attendance/<employeeId>/`. Tabel di bawah = rancangan awal (sudah digantikan).

| Tabel | Isi penting |
|---|---|
| `shift_templates` | Jam masuk/pulang, toleransi (policy SUPER_ADMIN) |
| `work_schedules` | Penugasan shift ke karyawan per tanggal/pola |
| `attendance_records` | `employee_id`, `date`, `clock_in_at`, `clock_out_at` (waktu server), koordinat, `is_outside_geofence`, `selfie_in_path`, `selfie_out_path`, `selfie_purged_at?`, status (tepat/telat/pulang cepat/izin/cuti/alpha) |
| `attendance_corrections` | Koreksi + referensi approval |
| `overtime_requests` | Lembur + referensi approval |
| `attendance_periods` | `period` (YYYY-MM), `status` (`OPEN`/`CLOSED`), `closed_by`, `closed_at` |
