# Aplikasi mobile (Flutter)

> **Kode prefix:** `MOB` · **Fase:** – (di luar PLAN §7; backlog "Aplikasi mobile") · **PIC:** Oatse · **Branch BE:** `HRIS/Oatse/Linux-Windows` · **Repo app:** `ArthasiaCiptaPratama/Arthasia-Mobile` (private, belum dibuat; MOB-D8) · **Saklar `FEATURES`:** –
> **Status:** Berjalan — grill MOB-D1–D12 ✔; tahap 1 BE (versi minimum, push FCM) ✔ lokal 2026-10-21; scaffold app menunggu Flutter/Android SDK

Aplikasi Flutter untuk **karyawan** (layanan mandiri: absen, roster, cuti/izin, koreksi, approval atasan, notifikasi, profil & pengajuan data, aset, SP, dokumen) di **repo & folder terpisah**, memakai API HRIS yang sama (`/api/v1`). Dokumen ini hanya mencatat sisi HRIS: kesiapan BE, perbaikan celah BE, dan keputusan; kode app tinggal di repo app.

Dokumen fitur ini: **README** (status, checklist, keputusan) · [log.md](log.md). Induk: [PROGRESS](../../PROGRESS.md). Terkait: [PLAN §1/§2](../../PLAN.md) (native = backlog, API sama), [D-017](../../decisions.md) (zod-openapi = kontrak API untuk mobile), [D-067](../../decisions.md) (absen lewat PWA; Flutter berarti meninjau ulang), [time-management](../time-management/README.md).

## Analisis kesiapan BE (2026-10-21, read-only)

**Kesimpulan: siap dengan celah.** BE bisa melayani app native hari ini; celah terbesar = kontrak OpenAPI Time Management & Leave belum bertipe (codegen Dart tidak berguna untuk layar utama), lalu fitur khas native (push, cek versi, integritas perangkat).

**Sudah siap**
- Auth: `Authorization: Bearer <JWT Supabase>` saja (`core/auth/middleware.ts`, verifikasi JWKS); tanpa cookie/CSRF; CORS hanya allowlist origin (klien native tanpa `Origin` tidak terdampak). Login di klien: NIP → email login `resolveLoginEmail` (`packages/shared/src/login.ts`, env `LOGIN_EMAIL_DOMAIN`) → Supabase Auth (Flutter: `supabase_flutter`, refresh token oleh SDK).
- Kontrak: semua rute di `/api/v1` lewat zod-openapi; spec `GET /api/v1/openapi.json` (OpenAPI 3.1), UI `GET /api/v1/docs`. Envelope `{data}` / `{data, meta}`; galat `{error:{code,message,details?,requestId}}`, pesan bahasa Indonesia.
- Endpoint karyawan lengkap (PWA `/absen/*` memakai endpoint yang sama, tidak ada yang khusus PWA):
  - Absen: `GET /attendance/me/today`, `POST /attendance/precheck`, `POST /attendance/selfie-upload` (signed upload URL Supabase Storage, ≤ 1 MB jpeg/webp), `POST /attendance/punch`, `POST /attendance/punches/{id}/cancel`, `GET /attendance/me/history`. Jam = jam server; geofence & label dihitung server.
  - Koreksi/Alpha: `/attendance/record/me`, `/attendance/statements*`, `/attendance/corrections*`.
  - Roster: `GET /roster`, `/roster-changes*` (tukar shift), `GET /holidays`.
  - Cuti: `GET /leave-types`, `GET /leave/me`, `POST /leave/preview`, `POST /leave/attachment-upload`, `/leave-requests*`.
  - Approval atasan: `GET /time/queue`, inbox per modul (`scope=inbox`), `POST /approvals/{id}/decision`, `POST /approvals/decisions`.
  - Notifikasi: `GET /notifications`, `POST /notifications/{id}/read`, `POST /notifications/read-all`.
  - Profil & pengajuan: `GET /me`, `GET /self/employee-data`, `/data-changes*`, `POST /self/documents/upload-url`.
  - Aset: `GET /self/assets` + konfirmasi; SP: `GET /self/warning-letters` + konfirmasi + PDF; dokumen: `GET /employees/{id}/documents/{documentId}/url`.
- Saklar `FEATURES` hanya di web; API tidak dibatasi saklar (TM selalu terdaftar, dijaga role/policy).

**Celah (urut prioritas; diputuskan di MOB-D7: wajib v1 = P0 OpenAPI, P1 push/anti-kecurangan/versi, idempotency punch)**
1. **P0** — Rute Time Management & Leave memakai body `z.record(string, unknown)` + respons `dataEnvelope(z.unknown())` (±35 rute: `attendance-day`, `period`, `roster`, `location-setting`, `time-notify`, `leave.routes.ts`); skema Zod aslinya sudah ada di `packages/shared/src/time-management.ts` → sambungkan ke OpenAPI.
2. **P0** — Set password (undangan) & reset hanya lewat web `${APP_URL}/auth/callback`; tidak ada deep link ke app. Pilih: tetap di browser, atau `redirectTo` / deep link per klien.
3. **P1** — Push notification: tabel token perangkat + endpoint daftar/hapus, kirim FCM dari layanan notifikasi & cron pengingat; tautan notifikasi masih path web (`/absen/cuti`, …) → perlu target terstruktur.
4. **P1** — Anti-kecurangan absen: flag mock location, ID/ikatan perangkat, versi app di punch (D-067 menerima risiko fake GPS untuk PWA, "bisa diperketat di app native").
5. **P1** — Cek versi / paksa update (`X-App-Version` + galat khusus, atau endpoint versi minimum).
6. **P2** — Rate limit (punch, precheck, upload URL, keputusan) & idempotency punch (retry OUT setelah respons hilang bisa galat).
7. **P2** — Paginasi daftar TM tidak seragam (`/leave-requests`, `/attendance/days`, `/attendance/corrections`, `/roster-changes` tanpa `meta`).
8. **P3** — Saklar/kill switch modul di sisi server bila rilis mobile perlu dipisah dari web.

**Lingkungan build (Windows, dicek 2026-10-21):** Flutter 3.38.9 (scoop, `C:\Users\ASUS\scoop\apps\flutter`) ✔ · Android Studio 2025.3.3 (`D:\Program Files\Android\Android Studio`, JDK `jbr`) ✔ · **Android SDK ✘** (tercatat `C:\Users\ASUS\AppData\Local\Android\Sdk` tetapi folder tidak ada) → pasang lewat SDK Manager (Platform 35/36, Build-Tools, Platform-Tools, Command-line Tools) lalu `flutter doctor --android-licenses`. Linux: tidak ada flutter/adb. C: ter-mount read-only di Linux.

## Checklist

Legenda: `[ ]` belum · `[~]` sedang · `[x]` selesai · `[-]` dibatalkan/ditunda. Langkah baru: sub-item `(tambahan YYYY-MM-DD) alasan`.

- [x] Analisis kesiapan BE + cek lingkungan build (2026-10-21)
- [x] Sesi grill: cakupan v1 app, peran, nasib PWA `/absen` (D-067), celah wajib v1, repo, codegen, push, anti-fake-GPS, password → MOB-D1–D12 (2026-10-21)
- [x] Rencana perbaikan celah BE disetujui (2026-10-21; urutan MOB-D10)
- [x] **Tahap 1 — BE non-TM** (`HRIS/Oatse/Linux-Windows`) — lokal 2026-10-21, belum di-commit
  - [x] Versi minimum: header `X-App-Version` → 426 `APP_UPDATE_REQUIRED` + URL unduh APK (MOB-D7 #4) — `core/app-version.ts`, env `MOBILE_MIN_VERSION`/`MOBILE_APK_URL`, test 8 kasus (2026-10-21)
  - [x] Push FCM sisi notifikasi: tabel token perangkat, `POST/DELETE /me/devices`, pengirim FCM HTTP v1 (no-op tanpa kredensial), kolom target terstruktur di notifikasi (MOB-D6) — migrasi `20261021045348_push_devices_and_notification_target`, `core/push.ts` + `core/google-auth.ts`, env `FCM_SERVICE_ACCOUNT_JSON`; uji kirim sungguhan menunggu project Firebase (2026-10-21)
- [ ] **Tahap 1 — Repo app** `Arthasia-Mobile` (MOB-D8/D11/D12)
  - [ ] Android SDK terpasang di Windows + `flutter doctor` bersih
  - [ ] Scaffold: flavor dev/staging, struktur per fitur, login NIP → Supabase, layar "Perbarui aplikasi"
  - [ ] Repo GitHub private dibuat + commit awal
- [ ] **Tahap 2 — Gabung branch Mat** (`HRIS/Mat/Mac`) setelah Mat push (MOB-D10)
- [ ] **Tahap 3 — BE TM** (setelah tahap 2)
  - [ ] OpenAPI TM & Leave bertipe (MOB-D7 #1)
  - [ ] Punch: kanal `APP`/`PWA`, versi app, label `MOCK_LOCATION` (MOB-D3)
  - [ ] Idempotency punch `Idempotency-Key` (MOB-D7 #5)
  - [ ] Notifikasi TM mengisi target terstruktur (MOB-D6)
- [ ] **Tahap 4 — App v1** (layar paritas MOB-D1, codegen MOB-D9, push, cek versi)
- [ ] Penyesuaian induk saat digabung ke develop: D-067, PLAN §1/§10, indeks PLAN §8

## Keputusan

**Keputusan baru** (prefix `MOB-D1`, `MOB-D2`, …; tulis lengkap di sini, lalu daftarkan di indeks [PLAN §8](../../PLAN.md#8-keputusan-adr-ringkas) saat digabung ke develop):

| ID | Keputusan | Alasan / sumber |
|---|---|---|
| MOB-D1 | **Cakupan v1 app Flutter = paritas fitur dengan PWA `/absen`:** absen (selfie + GPS), riwayat, roster, cuti & izin, koreksi & pernyataan, tukar shift, kalender libur, approval, notifikasi, profil. Pengguna = semua akun yang terhubung ke data karyawan (EMPLOYEE, MANAGER, HR_ADMIN; hak layanan diri PLAN §4.1); **approval untuk MANAGER/HR ikut v1**. SUPER_ADMIN tanpa data karyawan ditolak dengan pesan "gunakan web". Layanan diri Arsip (pengajuan data, aset, SP, dokumen) → v1.1. | Pemilik projek 2026-10-21 (grill; opsi: karyawan saja / paritas PWA / + Arsip). Approval harian MANAGER + HR (D-068) paling dibutuhkan atasan di lapangan; endpoint sudah ada. |
| MOB-D2 | **Platform v1 = Android saja; PWA `/absen` tetap hidup berdampingan** (cadangan & untuk pengguna non-Android). iOS dikesampingkan sampai benar-benar dibutuhkan (butuh Mac + akun Apple Developer). Meninjau D-067: absen dari HP = PWA **dan** app Android, API sama. | Pemilik projek 2026-10-21 (grill; opsi: Android + PWA tetap / Android + iOS lalu PWA pensiun / Android + PWA mati). |
| MOB-D3 | **Anti-fake-GPS v1 = tandai, tidak blokir:** app mengirim status lokasi palsu (`isMock` Android); server menambah label `MOCK_LOCATION` pada punch (tetap `PENDING`, dinilai approver seperti label lain D-068). Server mencatat **kanal** punch (`APP`/`PWA`) + versi app supaya approver tahu punch PWA tidak dicek fake GPS. PWA tidak diberi label tambahan. Play Integrity API (cek APK asli/perangkat tidak di-root) = kandidat v1.x. | Pemilik projek 2026-10-21 (grill; opsi: tandai / blokir / + Play Integrity). Konsisten dengan pola label + approval harian; hindari karyawan terkunci karena salah deteksi. |
| MOB-D4 | **Distribusi v1 = APK langsung (sideload)**, dibagikan lewat tautan; tanpa Play Store. Konsekuensi: update tidak otomatis (app wajib cek versi sendiri & mengarahkan ke tautan unduh APK baru), karyawan harus mengizinkan "sumber tidak dikenal", Play Integrity (MOB-D3) tidak tersedia selama tanpa Play Store. | Pemilik projek 2026-10-21 (grill; opsi: Play Store internal/closed / APK langsung / APK lalu Play Store). Gratis, tanpa akun Play Console. |
| MOB-D5 | **Set password (undangan) & lupa password tetap di browser:** tautan email tetap ke web `${APP_URL}/auth/callback`; tombol "Lupa password?" di app membuka halaman reset web di browser. Tanpa deep link/App Links, tanpa perubahan BE. **Ganti password saat sudah login ada di app** (layar Profil, `supabase.auth.updateUser`, paritas dengan profil web). | Pemilik projek 2026-10-21 (grill; opsi: browser / deep link). Aktivasi hanya sekali per karyawan; deep link butuh `assetlinks.json` + `redirectTo` per klien. Ganti password diputuskan agent (keputusan kecil, paritas web). |
| MOB-D6 | **Push notification FCM ikut v1:** tabel token perangkat + endpoint daftar/hapus (login/logout); setiap notifikasi in-app juga dikirim lewat FCM, termasuk cron pengingat; notifikasi diberi **target terstruktur** (jenis + id) di samping `link` web agar app membuka layar yang tepat. Kunci service account Firebase = env rahasia di server. Pemilik project Firebase: **belum diputuskan** (ikut OD-4). | Pemilik projek 2026-10-21 (grill; opsi: FCM v1 / tarik saja, push v1.1). Pengingat absen & antrean approval = nilai utama app native; FCM jalan untuk APK sideload (butuh Google Play Services). |
| MOB-D7 | **Celah BE wajib sebelum v1 (5):** (1) kontrak OpenAPI TM & Leave bertipe (skema `packages/shared/src/time-management.ts` disambungkan ke rute); (2) push FCM + target terstruktur (MOB-D6); (3) label `MOCK_LOCATION` + kanal + versi app di punch (MOB-D3); (4) versi minimum: header `X-App-Version` → galat `APP_UPDATE_REQUIRED` (426) + URL unduh APK, request tanpa header (web/PWA) tidak terpengaruh; (5) idempotency punch ringan: header `Idempotency-Key`, key sama → punch yang sudah ada dikembalikan 200 (bukan 409). **v1.x:** rate limit, paginasi TM seragam. **Backlog:** kill switch modul di server. Celah set/reset password selesai lewat MOB-D5. | Pemilik projek 2026-10-21 (grill). Retry punch setelah sinyal putus kini 409 walau tersimpan (`attendance.service.ts` ConflictError); paginasi seragam berisiko merusak web; versi minimum lebih penting karena sideload (MOB-D4). |
| MOB-D8 | **Identitas app:** folder `D:\WORK\Magang\Arthasia-Mobile` (`/mnt/winD/WORK/Magang/Arthasia-Mobile/`), repo GitHub `ArthasiaCiptaPratama/Arthasia-Mobile` **private**; package ID Android `com.arthasia.akselerasi` (permanen); nama tampil di HP **"Arthasia Akselerasi"**. | Pemilik projek 2026-10-21 (grill). Di drive D: karena build Android hanya di Windows; private karena OD-12. Pembuatan repo = aksi keluar, ditanyakan saat waktunya. |
| MOB-D9 | **Codegen klien API:** spec OpenAPI 3.1 di-*snapshot* & di-commit di repo app (`openapi/hris.json`, skrip `fetch-spec` dari API lokal/staging); generator **`swagger_parser`** (Dart murni → `retrofit` + `dio` + `freezed`/`json_serializable`); kode hasil generate di-commit (`lib/api/generated/`). Dukungan 3.1 diverifikasi lewat spike setelah OpenAPI TM/Leave bertipe; fallback `openapi-generator` `dart-dio`. | Pemilik projek 2026-10-21 (grill). Perubahan kontrak terlihat sebagai diff di PR app; build tidak bergantung server hidup; tanpa Java. |
| MOB-D10 | **Urutan kerja BE & koordinasi dengan TM (Mat):** (1) bagian yang tidak menyentuh attendance/leave dikerjakan dulu di `HRIS/Oatse/Linux-Windows`: versi minimum (middleware inti), push FCM (modul `notification` + tabel token), scaffold repo app; (2) gabungkan branch Mat (`HRIS/Mat/Mac`, mis. `a3db100` lembur/istirahat/upah grade) ke branch kita **setelah pemilik projek mengabarkan Mat sudah push**, dengan izin per aksi; (3) baru bagian TM: OpenAPI bertipe, kolom kanal/versi/`MOCK_LOCATION`, idempotency punch — migrasi MOB menyusul migrasi Mat; (4) Mat pull branch kita; sejak itu rute TM baru wajib memakai skema bertipe (bukan `z.record`). **Absen istirahat ikut v1 app** (paritas MOB-D1) bila sudah ada di develop saat app dibangun. | Pemilik projek 2026-10-21 (grill). `a3db100` mengubah `attendance.prisma` + migrasi + rute TM; dry-run merge 2026-10-21 konflik di `attendance/directory.ts` & `time-management/log.md`. Mat sedang mengerjakan logika cuti. |
| MOB-D11 | **Flavor build per lingkungan:** `dev` (`com.arthasia.akselerasi.dev`, "Arthasia Akselerasi (Dev)", API lokal) dan `staging` (`com.arthasia.akselerasi.stg`, "Arthasia Akselerasi (Staging)", API Vercel staging + Supabase staging) bisa terpasang berdampingan; `prod` memakai ID bersih `com.arthasia.akselerasi` + "Arthasia Akselerasi" dan ditambahkan setelah OD-4 (akun produksi) terjawab. URL API, URL & anon key Supabase lewat `--dart-define-from-file` per flavor; berkas nilai tidak di-commit (hanya `*.example`). Keystore rilis APK disimpan di luar repo. | Agent 2026-10-21 atas permintaan pemilik projek ("pilih berdasarkan praktik profesional"). |
| MOB-D12 | **Stack app (praktik umum Flutter):** Flutter stable (3.38) · state `flutter_riverpod` · routing `go_router` · HTTP `dio` + `retrofit` + `freezed` (MOB-D9) · auth `supabase_flutter` (sesi di penyimpanan aman) · lokasi `geolocator` (`isMock`) · kamera `camera` (selfie langsung, tanpa galeri, paritas D-067) · push `firebase_messaging` · versi `package_info_plus` · lint `very_good_analysis` · struktur per fitur (`lib/features/<fitur>/`). **Wajib online** (D-067 tetap), tanpa antrean offline. Teks UI bahasa Indonesia. | Agent 2026-10-21 (keputusan kecil, sesuai arahan "praktik profesional"); bisa diganti sebelum scaffold. |
