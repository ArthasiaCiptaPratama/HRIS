# Aplikasi mobile (Flutter)

> **Kode prefix:** `MOB` · **Fase:** – (di luar PLAN §7; backlog "Aplikasi mobile") · **PIC:** Oatse · **Branch BE:** `HRIS/mobile-app` (folder `/mnt/winD/WORK/Magang/HRIS-mobile`, DB `hris_mobile`, MOB-D16; tahap 1 terlanjur di develop) · **Repo app:** `/mnt/winD/WORK/Magang/Arthasia-Mobile` → `ArthasiaCiptaPratama/Arthasia-Mobile` (private, belum dibuat; MOB-D8) · **Saklar `FEATURES`:** –
> **Status:** Berjalan — tahap 1 BE ✔ commit `f99f0c9` 2026-10-21 (belum push); app: scaffold ✔ jalan di HP, dokumen & skill repo app ✔ (status app: `Arthasia-Mobile/docs/PROGRESS.md`); berikutnya tahap 2 (gabung branch Mat)

Aplikasi Flutter untuk **karyawan** (layanan mandiri: absen, roster, cuti/izin, koreksi, approval atasan, notifikasi, profil & pengajuan data, aset, SP, dokumen) di **repo & folder terpisah**, memakai API HRIS yang sama (`/api/v1`). **Dokumen ini hanya sisi BE** (kesiapan BE, checklist celah BE, status). **Keputusan `MOB-D*`, roadmap app (M0–M6), dan dokumen app ada di repo app** — `Arthasia-Mobile/docs/decisions.md` adalah sumber kebenaran keputusan (MOB-D13); tabel di bawah hanya indeks.

Dokumen fitur ini: **README** (status BE, checklist, indeks keputusan) · [log.md](log.md). Induk: [PROGRESS](../../PROGRESS.md). Terkait: [PLAN §1/§2](../../PLAN.md) (native = backlog, API sama), [D-017](../../decisions.md) (zod-openapi = kontrak API untuk mobile), [D-067](../../decisions.md) (absen lewat PWA; Flutter berarti meninjau ulang), [time-management](../time-management/README.md).

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
- [x] **Tahap 1 — BE non-TM** (`HRIS/Oatse/Linux-Windows`) — commit `f99f0c9` 2026-10-21, belum push
  - [x] Versi minimum: header `X-App-Version` → 426 `APP_UPDATE_REQUIRED` + URL unduh APK (MOB-D7 #4) — `core/app-version.ts`, env `MOBILE_MIN_VERSION`/`MOBILE_APK_URL`, test 8 kasus (2026-10-21)
  - [x] Push FCM sisi notifikasi: tabel token perangkat, `POST/DELETE /me/devices`, pengirim FCM HTTP v1 (no-op tanpa kredensial), kolom target terstruktur di notifikasi (MOB-D6) — migrasi `20261021045348_push_devices_and_notification_target`, `core/push.ts` + `core/google-auth.ts`, env `FCM_SERVICE_ACCOUNT_JSON`; uji kirim sungguhan menunggu project Firebase (2026-10-21)
- [x] **Tahap 1 — Repo app** `Arthasia-Mobile` — scaffold, jalan di HP, dokumen & skill (2026-10-21); sisa (commit awal, repo GitHub, CI, SDK Windows) dilacak di `Arthasia-Mobile/docs/phases/m0-fondasi.md`
- [x] **Tahap 2 — Gabung branch Mat** (`HRIS/Mat/Mac`, 9 commit s.d. `0e12481`) ke develop (MOB-D10) — urutan migrasi diuji di salinan DB, `directory.ts` lewat interface publik, verifikasi penuh ✔ (2026-10-21)
- [x] Branch `HRIS/mobile-app` + worktree `HRIS-mobile` + DB `hris_mobile` (MOB-D16): `db:deploy` 39 migrasi, verifikasi penuh ✔ (2026-10-21)
- [ ] **Tahap 3 — BE TM** (setelah tahap 2; di `HRIS/mobile-app`, lalu digabung ke develop)
  - [ ] OpenAPI TM & Leave bertipe (MOB-D7 #1)
  - [ ] Punch: kanal `APP`/`PWA`, versi app, label `MOCK_LOCATION` (MOB-D3)
  - [ ] Idempotency punch `Idempotency-Key` (MOB-D7 #5)
  - [ ] Notifikasi TM mengisi target terstruktur (MOB-D6)
- [ ] **Tahap 4 — App v1** → dilacak di repo app (`Arthasia-Mobile/docs/PROGRESS.md`, fase M1–M6); di sini hanya kebutuhan BE baru yang muncul
- [ ] Penyesuaian induk saat digabung ke develop: D-067, PLAN §1/§10, indeks PLAN §8

## Keputusan (indeks — isi lengkap di repo app)

Sumber kebenaran: **`Arthasia-Mobile/docs/decisions.md`** (MOB-D13). Keputusan baru ditulis di sana; bila mengubah BE, item kerjanya ditambahkan ke checklist di atas. Saat digabung ke develop, daftarkan di indeks [PLAN §8](../../PLAN.md#8-keputusan-adr-ringkas).

| ID | Ringkas | Dampak ke BE |
|---|---|---|
| MOB-D1 | v1 = paritas PWA `/absen` + approval MANAGER/HR; Arsip v1.1 | Endpoint yang ada |
| MOB-D2 | Android saja; PWA `/absen` tetap hidup (meninjau D-067) | Penyesuaian D-067/PLAN saat merge |
| MOB-D3 | Lokasi palsu → label `MOCK_LOCATION`, tidak blokir; kanal + versi dicatat | Tahap 3 |
| MOB-D4 | Distribusi APK sideload | Versi minimum (tahap 1 ✔) |
| MOB-D5 | Set/lupa password di browser | Tidak ada |
| MOB-D6 | Push FCM v1 + target terstruktur | Tahap 1 ✔ + target TM (tahap 3) |
| MOB-D7 | 5 celah BE wajib v1 | Tahap 1 & 3 |
| MOB-D8 | Identitas app & repo | — |
| MOB-D9 | Snapshot OpenAPI + `swagger_parser` | OpenAPI bertipe (tahap 3) |
| MOB-D10 | Urutan kerja BE & koordinasi branch Mat | Tahap 2–3 |
| MOB-D11–D12 | Flavor & stack app | — |
| MOB-D13 | Dokumen app dipisah; keputusan di repo app | Dokumen ini |
| MOB-D14–D15 | Skill & branch app; roadmap M0–M6 + CI ringan | — |
| MOB-D16 | Branch BE `HRIS/mobile-app` + worktree `HRIS-mobile` + DB `hris_mobile` | Tempat kerja tahap 3 |
