# TM-D29 — Absen Mandiri (STAGING, fitur sementara)

> **Status:** sementara untuk staging, atas permintaan Mat (2026-11-18). Dibuat agar **mudah dilacak dan dihapus**.
> Semua titik sentuh diberi penanda `TM-D29` — `grep -rn "TM-D29"` di repo HRIS dan Arthasia-Mobile menemukan semuanya.

## Aturan

| Hal | Aturan |
|---|---|
| Siapa | Anggota crew yang diizinkan HR/SA (tabel `attendance.self_report_crews`). Awalnya: **The Intern's**. Karyawan lain → 403. |
| Isi dari HP | Tanggal, Masuk/Pulang, jam (HH:mm), foto **dari galeri**. |
| Batas tanggal | **Tidak ada** — tanggal lampau maupun mendatang diterima. |
| Lokasi | Lokasi acuan **tetap = lokasi kerja crew**; koordinat dari **GPS HP** (izin lokasi wajib). Jarak & label "di luar radius" / "lokasi palsu" dihitung apa adanya. |
| Persetujuan | Wajib — approval `ATTENDANCE_PUNCH` biasa (atasan + HR). |
| Alpha | Hari Alpha "tidak absen" / "tidak absen pulang" dibuka lagi tanpa koreksi & tanpa batas waktu; hari terisi tidak menjadi Alpha. Alpha tutup periode & cuti → ditolak. |
| Ganti jam | Hanya punch mandiri sendiri yang **masih menunggu**; selain itu lewat HR. |
| Penanda | Punch disimpan sebagai sumber `MANUAL` (tanpa nilai enum baru) dengan `manual_by_account_id` = akun karyawan sendiri dan label **`SELF_REPORT`** ("Absen mandiri") + **`GALLERY_PHOTO`** ("Foto galeri"). Web menampilkan badge **"Mandiri"** dan titik GPS. Audit: `attendance.punch.self_report`, `attendance.self_report.enable/disable`. |
| Periode tertutup | Ditolak. |

## Mematikan cepat (tanpa menghapus kode)

1. Server: `packages/shared/src/self-report.ts` → `SELF_REPORT_ENABLED = false` (endpoint 403, HP menyembunyikan tombol). Perlu rilis API.
2. Web: `apps/web/src/app/feature-flags.ts` → `tmSelfReport: false` (menu jadi Maintenance).
3. Data saja (tanpa rilis): `DELETE FROM attendance.self_report_crews;` → tidak ada crew yang berhak, tombol HP hilang.

## Menghapus total

### 1. Database (staging & lokal)

```sql
-- Punch mandiri yang sudah tercatat TETAP valid (sumber MANUAL + label); tidak perlu dihapus.
DROP TABLE IF EXISTS "attendance"."self_report_crews";
DELETE FROM public._prisma_migrations WHERE migration_name = '20261118024040_tm_d29_self_report_crews';
```

Lalu hapus folder migrasi `apps/api/prisma/migrations/20261118024040_tm_d29_self_report_crews/` dan model `SelfReportCrew` + relasi `Crew.selfReport` di `apps/api/prisma/schema/attendance.prisma`, `bun run db:generate`.
(Alternatif yang lebih rapi untuk rilis: buat migrasi baru `DROP TABLE` alih-alih menghapus catatan migrasi.)

Untuk mencari punch mandiri yang sudah ada: `SELECT * FROM attendance.attendance_punches WHERE 'SELF_REPORT' = ANY(labels);`

### 2. HRIS — file baru (hapus)

| File | Isi |
|---|---|
| `packages/shared/src/self-report.ts` | `SELF_REPORT_ENABLED`, `selfReportPunchInputSchema`, `selfReportCrewInputSchema` |
| `apps/api/src/modules/attendance/self-report.repository.ts` | query crew berizin |
| `apps/api/src/modules/attendance/self-report.service.ts` | `myStatus`, `selfPunch`, `listCrews`, `setCrew` |
| `apps/api/src/modules/attendance/self-report.contract.ts` | skema respons |
| `apps/api/src/modules/attendance/self-report.routes.ts` | `GET /attendance/self-report/me`, `POST /attendance/self-report`, `GET/PUT /attendance/self-report/crews` |
| `apps/api/tests/integration/time-management/self-report.test.ts` | test API |
| `apps/web/src/features/time-management/self-report-api.ts` | hook web |
| `apps/web/src/features/time-management/pages/self-report-page.tsx` | halaman `/time/absen-mandiri` |
| `apps/web/tests/self-report.test.tsx` | test web |
| `docs/features/time-management/tm-d29-absen-mandiri.md` | dokumen ini |

### 3. HRIS — file yang disentuh (hapus baris bertanda `TM-D29`)

| File | Sentuhan |
|---|---|
| `packages/shared/src/index.ts` | `export * from "./self-report.ts"` |
| `packages/shared/src/time-management.ts` | label `SELF_REPORT`, `GALLERY_PHOTO` (+ teks, + `LABELS_WITHOUT_REASON`). **Biarkan** bila masih ada punch berlabel ini di DB (agar tetap tampil). |
| `apps/api/prisma/schema/attendance.prisma` | model `SelfReportCrew`, relasi `Crew.selfReport` |
| `apps/api/src/modules/attendance/attendance.routes.ts` | import + `registerSelfReportRoutes` |
| `apps/api/src/modules/attendance/attendance.service.ts` | `assertUploadedPhoto` (refaktor netral dari `recordPunch`, **boleh dibiarkan**) |
| `apps/web/src/app/feature-flags.ts` | `tmSelfReport` |
| `apps/web/src/app/navigation.ts` | menu "Absen Mandiri" |
| `apps/web/src/app/router.tsx` | route `absen-mandiri` |
| `apps/web/src/app/route-preload.ts` | `selfReport` + entri `/time/absen-mandiri` |
| `apps/web/src/features/time-management/pages/attendance-days-page.tsx` | badge "Mandiri" & GPS untuk punch `SELF_REPORT` |
| `apps/web/src/features/time-management/pages/absen-page.tsx` | teks "· mandiri" |
| `apps/web/src/features/time-management/pages/period-pages.tsx` | badge "Mandiri" |
| `docs/features/time-management/README.md`, `log.md`, `docs/codemap/attendance.md` | baris TM-D29 |

### 4. Arthasia-Mobile

Lihat bagian "Mobile" di bawah (diisi setelah app selesai). Hapus file/baris bertanda `TM-D29 (STAGING)`.

## Mobile

_(diisi setelah pengerjaan app)_
