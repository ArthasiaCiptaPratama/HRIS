# Log — Aplikasi mobile (Flutter)

Entri terbaru di **atas**. Format satu entri (salin):

```
### 2026-11-04 — Backlog BE: langkah approval pengajuan batal & log push sent (Oatse)
- **Dikerjakan:** serah-terima supervisor `2026-11-04-1317` (rencana disetujui supervisor atas nama pengguna). Orientasi: `cancelApprovalRequest` sudah membuat request `CANCELLED`, inbox (`listActionable`) & `decide()` sudah menolaknya; yang tertinggal `ApprovalStep.decision` tetap `PENDING` → web/app menampilkan "Menunggu". Enum `ApprovalDecision` + `CANCELLED` (2 migrasi: ADD VALUE, lalu backfill langkah menunggu milik request batal); `repository.cancelPendingSteps` dipanggil `cancelApprovalRequest` (semua subjek); kontrak `steps[].decision` + `CANCELLED` (tetap inline → kelas Dart `Decision2`); web `schemas.ts` + label/ikon "Dibatalkan" (`display.tsx`, `attendance-days-page.tsx`). `pushToAccount`: log info `push sent` {accountId, type, sent, devices}.
- **Verifikasi:** typecheck ✔ 3 workspace · biome ✔ (1 peringatan lama `roster-edit.service.ts:577`) · boundaries ✔ 549 modul · `db:migrate` `hris_mobile` 53 migrasi, `db:check` tanpa selisih · test (DB `hris_mobile`, sesuai backlog DB test): `notification` + `leave` 34 pass (baru: batal → semua langkah `CANCELLED` + `decidedAt`, tidak di inbox atasan, keputusan 409; log `push sent` tanpa token/judul) · `openapi`, approval policy, `period`, `overtime-order`, `roster`, `roster-edit`, `attendance` 82 pass. Suite penuh → CI.
- **Masalah / catatan:** APK lama aman (enum Dart `$unknown`). Migrasi ikut rilis staging berikutnya (butuh kata pengguna). Web/PWA berubah → kabari Mat setelah develop (butuh kata pengguna).
- **Berikutnya:** app regenerate dari spec `.handoff/openapi-mobile-<sha>.json`, chip "Dibatalkan".

### 2026-11-03 — Titik lanjut: ringkasan BE M4/M5, staging gel. 18–19, MOB-OD1, rencana BE M6 (Oatse)
- **Dikerjakan:** permintaan pengguna lewat supervisor (17:01 WIB): docs diperbarui supaya sesi berikutnya cukup "lanjut". README: status, bagian baru §Titik lanjut (BE M4/M5 selesai, staging gel. 18/18.1/19, backlog BE, MOB-OD1, Berikutnya BE M6), 2 backlog baru di checklist, indeks MOB-D20–D22 & MOB-OD1. PROGRESS induk tidak diubah (dikerjakan sesi HRIS setelah FF).
- **Keputusan:** MOB-OD1 terjawab — APK rilis lewat Google Drive (kutipan pengguna 16:59 WIB via supervisor); sumber kebenaran tetap `Arthasia-Mobile/docs/decisions.md`.
- **Verifikasi:** docs saja.
- **Berikutnya:** BE M6 — `MOBILE_MIN_VERSION` + `MOBILE_APK_URL` (Drive) di staging (butuh kata pengguna), cek kebutuhan endpoint profil/ganti password, backlog.

### 2026-11-03 — Jam SPL boleh tidak dikirim dari app (MOB-D18) (Oatse)
- **Dikerjakan:** permintaan supervisor (atas nama pengguna): `overtimeOrderInputSchema.startTime/endTime` `nullable()` → `nullish().transform(v => v ?? null)` (tipe hasil tetap `string | null`). Sapu body semua operasi app di spec: hanya field ini yang nullable-wajib.
- **Verifikasi:** typecheck ✔ · biome ✔ · boundaries ✔ · shared 346 · `openapi.test` 17 (baru: body app tanpa field nullable wajib) · `overtime-order` + `punch-window` 19 (baru: satu jam tanpa key lain → 200 `startsAt` null; tanpa keduanya → 400) di `hris_mobile_test`.
- **Berikutnya:** app regenerate (body SPL: `startTime`/`endTime` opsional).

### 2026-11-03 — Enum bernama untuk klien Dart app (perbaikan kontrak M5d) (Oatse)
- **Dikerjakan:** permintaan supervisor (atas nama pengguna): app gagal kompilasi pada spec `f5ffc98` karena swagger_parser 1.45 merujuk enum yang tidak dibuat (`Kind4` = `LeaveMe.ledger[].kind`, kembar `LeaveLedger.entries[].kind`; juga `Category2` & `Active` di `listEmployees`). Enum generik inline + semua enum query di path app diberi nama (daftar di README). Body `POST /leave-types`, `/attendance/punch`, `/attendance/precheck` didokumentasikan lewat `.extend` dengan enum bernama; validasi tetap `strict` skema @hris/shared. Test kontrak baru di `openapi.test.ts` (memeriksa semua method pada path app, karena generator memfilter per path, plus `LeaveLedger`).
- **Keputusan:** nama skema = nama kelas Dart yang sudah dipakai app bila ada (`AttendancePunchKind`, `HolidayKind`, `ApprovalStatus`, `LeaveTypeCategory`) supaya kode app tidak berubah untuk kelas itu.
- **Verifikasi:** typecheck ✔ · biome ✔ · boundaries ✔ · api 1259 pass di `hris_mobile_test`. Spec lama vs baru dengan `$ref` diurai: identik kecuali `employmentStatus.category` nullable kini `anyOf [$ref, null]` (setara). swagger_parser (salinan sementara): 0 tipe dirujuk tanpa definisi (sebelumnya `Kind4`, `Category2`, `Active`), tidak ada lagi `kind*/scope*/status*/category*` polos.
- **Masalah / catatan:** app perlu mengganti nama kelas polos lama: `Kind`→`AttendancePunchKind`, `Kind2`→`ApprovalStepKind`, `Kind3`→`HolidayKind`, `Scope`→`RosterEditScope`, `Scope2`→`AttendanceCorrectionScope`/`RosterChangeScope`, `Scope3`→`AttendanceDayScope`/`LeaveRequestScope`, `Scope4`→`OvertimeScope`, `Status`→`AttendanceDayStatusFilter`, `Status2`→`LeaveRequestStatus`/`ApprovalStatus`, `Category`→`LeaveTypeCategory`, `LabeledOnly`→`AttendanceDayLabeledOnly`, `UnreadOnly`→`NotificationUnreadOnly`.
- **Berikutnya:** app regenerate dari spec baru.

### 2026-11-03 — Pemilih karyawan SPL atasan (M5d): `listEmployees` + skema bernama; dukungan uji HP M4a/M4b (Oatse)
- **Dikerjakan:** serah-terima supervisor `2026-11-03-0920` (API lokal untuk uji HP) + permintaan lanjutan supervisor: data uji di `hris_mobile` lewat API/service (tolak izin Rina 5 Nov `34999e54…`; koreksi 31 Okt `e00404db…` disetujui MANAGER lalu HR; `mgr.arthasia` → MANAGER lewat UPDATE `iam.accounts.role` karena ganti role API khusus SA dan DB lokal tanpa SA). FF `HRIS/mobile-app` ke develop `5ceda7b` (perbaikan audit keamanan, tanpa migrasi). M5d opsi (a): `APP_OPERATION_IDS` `GET /api/v1/employees` → `listEmployees`; `employee.schema.ts` sub-objek item daftar bernama + default `active` string.
- **Keputusan:** opsi (a) `/employees` alih-alih `GET /me/subordinates` (supervisor atas nama pengguna): cakupan MANAGER sudah bawahan langsung, field = data kerja tanpa bagian sensitif, otorisasi SPL di `canOrderOvertime`.
- **Verifikasi:** typecheck ✔ 3 workspace · biome ✔ (1 peringatan lama `roster-edit.service.ts:577` dari develop) · boundaries ✔ 549 modul · test di `hris_mobile_test`: `openapi.test` 15 · `employee` 442, 0 gagal. swagger_parser app (salinan sementara): dibanding spec develop tanpa perubahan ini, yang berubah hanya model daftar karyawan (`EmployeeListItem` + 3 skema baru; kelas bernomor lama hilang dan tidak dipakai kode app); klien `listEmployees(..., active = Active.valueTrue)`.
- **Masalah / catatan:** push `leave.request_decided` ke HP Rina tidak muncul padahal kredensial FCM & token valid (`validate_only` 200) dan tidak ada log gagal; BE hanya mencatat log push yang gagal, jadi push sukses tak terlihat. Diduga sisi HP/app; diperiksa sesi app lewat logcat. `dev:api` sempat dihentikan Claude Code karena memori rendah, lalu dinyalakan ulang.
- **Berikutnya:** app regenerate klien dari spec `.handoff/openapi-mobile-<sha>.json`; kabar ke Mat digabung supervisor dengan kabar berikutnya.

### 2026-11-02 — Retry aman pengajuan app (Idempotency-Key), batas 5 MB pernyataan, skema LeaveRequestType (Oatse)
- **Dikerjakan:** serah-terima supervisor `2026-11-02-1425` langkah 4a (push docs `d249d8a`) dan 3 + butir 5 (lihat README, dua item 2026-11-02). Migrasi `20261102080000_app_create_idempotency` dibuat lewat `prisma migrate diff` (`migrate dev` menolak berjalan non-interaktif karena peringatan indeks unik) lalu `db:deploy` ke `hris_mobile`.
- **Keputusan:** MOB-D22 (usul; ditulis sesi app di `Arthasia-Mobile/docs/decisions.md`): `Idempotency-Key` untuk tiga POST pengajuan, perilaku = punch MOB-D7, isi body tidak dibandingkan (risiko dicatat).
- **Verifikasi:** `db:check` "No difference detected"; typecheck ✔ · biome ✔ · boundaries ✔ (540 modul) · test di DB lokal terpisah `hris_mobile_test` (bukan `hris_mobile` yang dipakai app): shared 346 · api 1031 · web 331, 0 gagal; test balapan cuti 3× lulus. Develop ternyata maju 3 commit (`a21f9f6`, `22a02c6`, `2b9d923`: TM-D24 transaksi & notifikasi `afterCommit`) → digabung ke `HRIS/mobile-app` (konflik hanya baris RELEASE, baris ini jadi #72); ulang: typecheck ✔ · biome ✔ · boundaries ✔ · `db:check` ✔ · shared 346 · api 1034 · web 331. swagger_parser app (salinan sementara, spec baru) → tidak ada bentrok enum/objek inline; cek yang sama pada spec app lama menemukan `Type` (cara cek tervalidasi).
- **Masalah / catatan:** `bun test` lokal bawaan tetap memakai `hris_mobile` (backlog 2026-10-28); kali ini dijalankan dengan `DATABASE_URL`/`DIRECT_URL` mengarah ke `hris_mobile_test`. Migrasi baru tidak ikut gel. 17, antre gel. 18.
- **Berikutnya:** app regenerate klien dari spec baru; kabar ke Mat lewat supervisor; langkah 5 (bersihkan baris uji lokal).

### YYYY-MM-DD — <judul singkat> (<PIC>)
- **Dikerjakan:** … (rujuk item checklist README)
- **Keputusan:** <PREFIX>-Dn baru / OD terjawab
- **Verifikasi:** perintah + hasil nyata
- **Masalah / catatan:** …
- **Berikutnya:** …
```

### 2026-10-29 — Catatan persiapan uji HP M4: unggah lampiran dari API lokal (Oatse)
- **Dikerjakan:** belum ada kode; hanya penelusuran untuk uji M4 besok. `dev:api` dinyalakan untuk uji Kalender Libur M3 (akun emp, baca saja, FCM kosong), lalu dimatikan.
- **Masalah / catatan:** `POST /leave/attachment-upload`, `POST /attendance/statements/upload` (dan `selfie-upload`) membuat signed upload URL lewat `createSupabaseStorage` (`apps/api/src/core/storage.ts`). Tidak ada storage lokal: API lokal pun memakai `SUPABASE_URL` dari `.env` = project staging `iwgzuwcxsxnbjibhbqgh`, hanya path-nya diberi prefix `dev/oatse/`. Akibatnya:
  - URL unggah mengarah langsung ke `https://iwgzuw….supabase.co`, **tidak lewat** `adb reverse`; HP cukup punya internet. `adb reverse` hanya untuk panggilan ke API lokal (minta URL lalu kirim pengajuan dengan path).
  - Setiap unggahan saat uji = **menulis objek ke bucket Storage staging**, termasuk berkas `dev/oatse/…`. Menurut aturan, itu butuh kata pengguna sendiri sebelum uji. Pembersihannya (hapus objek) juga butuh kata pengguna.
  - Belum diverifikasi: bucket lampiran cuti dan surat pernyataan sudah ada di staging (`ensurePrivateBucket`), dan batas ukuran/MIME cocok dengan berkas dari kamera atau galeri HP.
- **Berikutnya:** sebelum uji M4, minta kata pengguna untuk unggahan uji ke Storage staging (dengan prefix `dev/oatse/`), atau putuskan pakai storage palsu dan lewati unggahan.

### 2026-10-29 — Uji ulang HP M5a + gabung ke develop (Oatse)
- **Dikerjakan:** merge develop `41e7f94` (fix override HR `96b026d` + docs) ke `HRIS/mobile-app` → `bc4b9f3`. Data demo M5a di DB lokal `hris_mobile`, pola 28 Okt: seed tanpa FCM; pemicu U9 dan batch dengan FCM stg (disengaja). Pengajuan dibuat lewat service asli (`setRosterCells`, `requestCrewMembers`, `applyTemplateAssignment`), pengajunya admin.arthasia. Setelah uji, data dihapus dalam 1 transaksi (kutipan pengguna 09:47): 8 pengajuan + approval, 28 notifikasi `roster_edit_new` (termasuk sisa test gate), 1 token push, 7 karyawan `M5A-*`, template demo, akun lokal hr; role mgr → EMPLOYEE. `dev:api` dimatikan. `HRIS/mobile-app` di-FF ke develop.
- **Keputusan:** —
- **Verifikasi:** typecheck ✔ · biome ✔ · boundaries ✔ · shared 346 · api 1023 · web ✔; CI `bc4b9f3` 40806733264 ✔. Uji HP (app): U7 (langkah HR APPROVED `is_override=false`, item hilang dari inbox HR), getToken, U9 saat app mati (notif ROSTER_EDIT diterima), batch (APPROVAL_QUEUE) ✔ 4/4. Setelah bersih-bersih: karyawan `M5A-*` 0, pengajuan 0, notif `roster_edit_new` 0, `push_devices` 0, akun hr lokal 0.
- **Masalah / catatan:** Seed pertama gagal karena Super Admin Lokal (Demo) juga anggota Crew Demo tetapi tidak masuk daftar anggota, sehingga service mengajukan "keluar crew" untuknya. Pengajuan itu dibatalkan dan ikut dihapus. Daftar anggota crew harus lengkap saat seed. Backlog `bun test` memakai DB dev masih berlaku.
- **Berikutnya:** kabari Mat (develop berisi perubahan roster-edit.service/roster.routes); rilis BE ke staging lewat `HRIS-rilis` lalu APK staging. Keduanya diputuskan pengguna.

### 2026-10-28 — Data demo & uji HP M5a (keputusan jadwal dari app) (Oatse)
- **Dikerjakan:** data demo di DB lokal `hris_mobile` (tanpa user Auth baru): 4 karyawan demo bawahan Budi di Crew Demo + "Hana HR" untuk akun lokal `hr.arthasia`; `mgr.arthasia` sementara MANAGER; 4 pengajuan (CELLS ×2, CREW leave, TEMPLATE mundur) + pengajuan U9/U9b/U9c untuk Rina dibuat lewat service dengan FCM aktif (disengaja). API lokal :3000 di `59e7454`. Sesudah uji, semuanya dibersihkan dalam 1 transaksi (7 pengajuan + approval, 50 notifikasi `roster_edit_new` basi termasuk sisa test gate, 372 hari roster demo, template/pola/crew demo, 5 karyawan, akun lokal hr, `push_devices`, role mgr → EMPLOYEE, sel Rina 30–31 Okt → N/PATTERN) dan API dimatikan.
- **Keputusan:** —
- **Verifikasi:** menurut app, U5/U8/U9/U10/U11 dan push foreground lulus; kasus "app mati" ditunda (HyperOS tidak bisa `am kill`). Setelah bersih-bersih: pengajuan 0, notifikasi `roster_edit_new` 0, karyawan `M5A-*` 0, `push_devices` 0.
- **Masalah / catatan (backlog, belum diubah):** (1) `bun test` memakai DB yang sama dengan dev (`--env-file=../../.env` → `DATABASE_URL` = `hris_mobile`); `db-guard-preload` hanya menolak DB non-lokal. Akibatnya test membuat data & notifikasi untuk akun asli di DB dev (mis. ±15 notifikasi ke admin.arthasia). Usul: DB test terpisah (`hris_test`) untuk `bun test` lokal, seperti CI. (2) Temuan app: inbox HR (`listActionable(includeOverride)`) tetap memuat pengajuan yang langkah HR-nya sudah diputus HR itu, karena HR masih punya hak override di langkah Atasan, padahal pemisahan tugas menolaknya (403 "Langkah lain harus diputuskan orang yang berbeda"). Item tampil tetapi tidak bisa diputus; perbaikan di modul approval bersama (develop).
- **Berikutnya:** uji "app mati" besok; temuan (2) sudah diperbaiki di develop `96b026d` → **menunggu** digabung ke `HRIS/mobile-app`; notifikasi hasil ke HR pengaju ditunda (checklist README).

### 2026-10-28 — Kontrak keputusan perubahan jadwal oleh HR + aturan data uji tanpa push (Oatse)
- **Dikerjakan:** BE app untuk TM-D24 (`GET /roster-edits` & `/roster-edits/{id}`, target notifikasi `ROSTER_EDIT`; detail di log Time Management 2026-10-28), push `HRIS/mobile-app` `4733a26` (CI 40667842380 ✔); spec diekspor tanpa server ke `.handoff/openapi-mobile-4733a26.json` (`createApp` + `app.request`, `NODE_ENV=test`).
- **Keputusan:** **aturan data uji lokal** (supervisor atas nama pengguna, 2026-10-28): setiap skrip seed / data uji lokal dijalankan dengan `FCM_SERVICE_ACCOUNT_JSON=` dikosongkan atau `NODE_ENV=test`, kecuali skenario uji push yang memang disengaja. Alasannya: `.env` lokal berisi kredensial Firebase sungguhan dan proses non-test (dev:api, skrip) memakai pengirim FCM sungguhan. `bun test` sudah aman (`NODE_ENV=test` → `UNCONFIGURED_PUSH`).
- **Verifikasi:** `push_devices` DB lokal 0 token → seed uji baterai 28 Okt hanya membuat baris notifikasi, tidak ada push terkirim.
- **Masalah / catatan:** (ralat) `FCM_SERVICE_ACCOUNT_JSON` di `.env` HRIS & HRIS-mobile **sudah** dari project `arthasia-akselerasi-stg` sesuai checklist; dugaan awal "arthasia-hris" keliru karena pengecekan mengambil `project_id` pertama di `.env`, yaitu milik `GOOGLE_SERVICE_ACCOUNT_JSON` (service account Google Drive lampiran Import, D-060). Penggantian ke kunci stg tidak mengubah isi `.env` (byte-identik dengan cadangan; cadangan dihapus). Cek kunci per variabel dengan parse env, bukan grep.
- **Berikutnya:** app regenerate klien dari spec `4733a26`; merge develop lagi setelah perbaikan inbox SA.

### 2026-10-26 — Skema TodayOvertimeOrder + data uji lokal app (Oatse)
- **Dikerjakan:** `attendance.contract.ts` `todayOvertimeOrderSchema` (`.openapi("TodayOvertimeOrder")`, dirujuk `nullableRef`); ff `HRIS/mobile-app` → develop `dccb1e7` (+2 migrasi lokal `overtime_orders`, `overtime_order_retroactive`); data uji lokal `hris_mobile` untuk app (seed + `db:seed:time --demo`, akun emp/mgr/admin ditautkan dengan Auth hanya dibaca, shift `UJI` + SPL uji alarm lewat service).
- **Keputusan:** — (MOB-D9/MOB-D17)
- **Verifikasi:** lihat entri RELEASE §2 baris 68 / laporan sesi; test kontrak `openapi.test.ts` 10 pass.
- **Masalah / catatan:** `dev:account` tidak dipakai untuk akun uji karena membuat user Supabase Auth bila email belum ada; dipakai skrip sekali-pakai yang hanya membaca Auth.
- **Berikutnya:** gabung ke develop (hris-7a) → rilis gel. 14 → app regenerate klien.

### 2026-10-26 — Gabung develop 9796376 + kebutuhan BE app M3 Jadwal (Oatse)
- **Dikerjakan:** serah-terima `.handoff/2026-10-26-0938-HRIS-ke-HRIS-mobile-gabung-develop.md` poin 1–10 (README checklist Tahap 4). Fast-forward `HRIS/mobile-app` → develop `9796376` (memuat Mat `8d3fd76`); `/me` + `employeeCompanyId`; `APP_OPERATION_IDS` + roster karyawan/shift/crew; `EmployeeRosterDay`; enum roster dari shared; `EmployeeImportMasterData`; `lockedEmployeesOn` + `assertDayUnlocked` di perubahan roster (ajukan & handler APPROVED), zona tanggal dari `readTimeSettings`.
- **Keputusan:** — (pelaksanaan MOB-D7/MOB-D9/MOB-D17; aturan kunci roster = D-069 + edit grid yang sudah ada)
- **Verifikasi:** `db:deploy` 3 migrasi, `db:check` no difference; `bun run typecheck` ✔ 3 workspace; `bunx biome ci .` ✔ 661 file; `check:boundaries` ✔ 0 pelanggaran; `bun run test`: shared 339 · api 969 (baru: openapi.test +5, roster.test +2, me-employee-name +1 cek) ✔; web 324 ✔ dengan `--maxWorkers=2` (run penuh default sempat 1 lalu 16 gagal timeout, berbeda tiap run, saat load mesin 16 di 12 core; file yang gagal lulus saat diulang; tidak ada perubahan web).
- **Masalah / catatan:** nama otomatis lama di klien app berubah (`getRosterEmployeesById` → `getEmployeeRoster`, `getShifts` → `listShifts`, `getCrews` → `listCrews`); app regenerate setelah gel. 14 di staging. `roster.service.ts:36` & `period.service.ts:44` masih `Asia/Jakarta` hard-code (di luar cakupan).
- **Berikutnya:** gabung ke develop & rilis gel. 14 (jalur biasa); app M3 uji ke API lokal.

### 2026-10-22 — Project Firebase staging untuk push FCM (Oatse)
- **Dikerjakan (serah-terima `.handoff/2026-10-22-1320-HRIS-mobile-ke-HRIS-firebase-fcm.md`, lewat Zen):** project Firebase `arthasia-akselerasi-stg` milik admin.arthasia@gmail.com (Spark; Analytics, Gemini, Google Developer Program dimatikan); app Android `com.arthasia.akselerasi.dev` (App ID `1:266363554852:android:64ce3d05544b21f661dcb1`) & `com.arthasia.akselerasi.stg`, tanpa SHA-1; FCM API (V1) aktif bawaan (legacy mati). `google-services.json` (kedua app) & kunci service account `firebase-adminsdk-fbsvc@arthasia-akselerasi-stg.iam.gserviceaccount.com` disimpan di `/mnt/winD/WORK/Magang/.secrets/firebase/` (di luar git); `FCM_SERVICE_ACCOUNT_JSON` ditulis ke `.env` HRIS & HRIS-mobile lewat `jq -c` tanpa dicetak.
- **Keputusan:** satu project untuk flavor dev & staging; produksi nanti project terpisah dengan service account khusus peran FCM (ikut OD-4, belum diputuskan).
- **Verifikasi:** `.env` dibaca Bun → `type service_account`, `project_id arthasia-akselerasi-stg`, kunci ada; `git status` kedua worktree bersih. Uji asap `createFcmSender` (script scratchpad, hanya status dicetak): token OAuth **200**, `messages:send` ke token palsu **400 `INVALID_ARGUMENT`** ("not a valid FCM registration token") → autentikasi & izin FCM benar.
- **Masalah / catatan:** `push.ts` memetakan 400 `INVALID_ARGUMENT` (token rusak) ke `failed`, bukan `unregistered` → token rusak tidak terhapus otomatis; dampak kecil karena token dari `firebase_messaging` selalu berformat benar (temuan, tidak diubah). Env Vercel `hris-staging-api` `FCM_SERVICE_ACCOUNT_JSON` diisi lewat dasbor (Secret, Production; ditempel dari clipboard, tidak tercetak), aktif mulai deploy rilis gel. 13. Uji ke HP menunggu M5.
- **Berikutnya:** app M5 memasang `google-services.json` + `firebase_messaging` → uji kirim ke POCO X6 Pro.

### 2026-10-22 — Celah kontrak OpenAPI dari M2 Absen (Oatse)
- **Dikerjakan (`HRIS/mobile-app`, serah-terima sesi app `.handoff/2026-10-22-1110-…-idempotency-key-spec.md`):** helper `route` di `attendance-day.routes.ts` menerima `headers`; `POST /attendance/punch` mendeklarasikan header opsional `Idempotency-Key` (pola `^[A-Za-z0-9_-]{8,64}$`), perilaku runtime tetap (`idempotencyKeyOf`). `core/openapi.ts` → `withInputDates`: `format: date` pada parameter & request body (inline + komponen yang hanya dipakai input, termasuk rujukan bertingkat) diganti `string` + pola `^\d{4}-\d{2}-\d{2}$`; komponen yang juga dipakai respons tidak diubah. Sebelumnya 22 tanggal input inline + 8 komponen input (`CreateEmployee`, `HolidayInput`, …) ber-`format: date`; sesudahnya 0.
- **Keputusan:** MOB-D19 (tanggal input = string + pola) — isi lengkap dicatat sesi app di `Arthasia-Mobile/docs/decisions.md`.
- **Verifikasi:** `core/__tests__/openapi.test.ts` 5 lulus (+2: header punch, tidak ada `format: date` di input & komponen input, `history.from` = string+pola, `AttendanceDay.workDate` tetap `format: date`); `mobile-punch.test.ts` 4 lulus (200/409/400 tetap); typecheck ✔; biome ✔ 640 file; boundaries ✔ 519 modul; shared 335; api 889 lulus 0 gagal; web 313 (`--maxWorkers=3`; run paralel bawaan 16 timeout, load average 20, kode web tidak berubah).
- **Berikutnya:** commit `cecd660` + merge ke develop ✔ 2026-10-22 (push menunggu izin); app: `openapi/fetch-spec.sh` + generate ulang klien.

### 2026-10-21 — Penutup hari: semua BE app di develop, app M1 selesai (Oatse)
- **Dikerjakan:** develop berisi tahap 1 (`f99f0c9`), merge Mat (`247c0fa`, `bc50142`), tahap 3 (`cf9de90`), `operationId` (`c34eb22`) — semua di-push, CI ✔ (terakhir #39582217626). App: klien generate dipakai `core/api`, `Me` generate, config `API_ORIGIN` (M1 selesai).
- **Verifikasi:** CI develop ✔; app `flutter analyze` 0 isu, 12 test, terpasang di POCO X6 Pro tanpa galat log.
- **Berikutnya:** app M2 Absen (2026-10-22) — titik mulai `Arthasia-Mobile/docs/phases/m2-absen.md`; Mat merge develop setelah dikabari.

### 2026-10-21 — operationId OpenAPI untuk klien app (Oatse)
- **Dikerjakan (`HRIS/mobile-app`):** `core/openapi.ts` — dokumen dibuat lewat `getOpenAPI31Document` lalu `withOperationIds`: nama app dari `APP_OPERATION_IDS` (41 endpoint: `getMe`, `getMyAttendanceToday`, `precheckPunch`, `createPunch`, `listLeaveTypes`, `getTimeQueue`, `listNotifications`, …), sisanya otomatis `operationIdFor` (`<method><Path>`, parameter → `By<Nama>`). File rute TM tidak diubah (menghindari bentrok dengan Mat). PROMPT §5 diberi aturannya.
- **Verifikasi:** `core/__tests__/openapi.test.ts` (3: contoh nama, semua operasi punya id unik, setiap nama app menunjuk path yang ada); typecheck ✔; biome ✔ 640 file; boundaries ✔ 519 modul; shared 335; api 887 di DB kosong `hris_ci`; web 313. App: generate ulang → `getMe()`, `getMyAttendanceToday()`, `createPunch()`; `flutter analyze` 0 isu.
- **Berikutnya:** merge ke develop + push → kabari Mat (satu kali merge develop: rute bertipe + operationId); app: sambungkan klien ke `core/api`.

### 2026-10-21 — Tahap 3 BE untuk app: kontrak bertipe, punch app, target notifikasi (Oatse)
- **Dikerjakan (branch `HRIS/mobile-app`):** (3b) migrasi `20261021092441_punch_channel_version_idempotency` (`channel`, `app_version`, `idempotency_key` unik), `isMock` → label `MOCK_LOCATION` tanpa wajib alasan, kanal dari `X-App-Version`, replay `Idempotency-Key`; (3a) 87 operasi TM & Leave bertipe — pola di `attendance-day` lalu leave/roster/period/overtime-lokasi-notify dikerjakan 4 agent paralel (file kontrak terpisah), helper `core/contract.ts` (`assertExact`, `Jsonify`, `nullableRef`); (3c) `notifyEmployees` + 13 titik panggil membawa `target`; web `PunchChannelNote`; spike `swagger_parser` di repo app.
- **Keputusan:** MOB-D17 (kontrak dikunci ke tipe service + `nullableRef`) — isi di repo app.
- **Verifikasi (worktree, DB `hris_mobile`):** typecheck ✔; biome ✔ 639 file; boundaries ✔ 518 modul; `db:check` ✔; test shared 335; api di DB kosong `hris_ci` (simulasi CI) **884 lulus, 0 gagal**; web 313 (`--maxWorkers=3`); OpenAPI: 87 operasi TM/Leave, 0 respons `unknown`. Test baru: `mobile-punch.test.ts` (4), target di `time-notify.test.ts` (+5 cek), `punch-channel-note.test.tsx` (3).
- **Masalah / catatan:** `zod-openapi` mengubah `skemaBernama.nullable()` jadi `allOf:[$ref,{type:[object,null]}]` → `swagger_parser` stack overflow, dan satu field kehilangan `null` → `nullableRef`. Leave: `recalculate`/`paid` kompensasi keluar bisa mengembalikan `data` kosong (service mencari ulang di daftar maks. 500) — temuan, tidak diubah. `RosterGrid.days[].source` & `RosterChange.status` masih `string` (tipe service).
- **Berikutnya:** commit + merge `HRIS/mobile-app` ke develop (izin) → app M1 (pakai klien generate).

### 2026-10-21 — Tahap 2: gabung branch Mat ke develop (Oatse)
- **Dikerjakan:** merge `origin/HRIS/Mat/Mac` (9 commit s.d. `0e12481` → merge `247c0fa`; lalu 2 commit baru `c664054` analitik tim atasan + template roster 13+1 & 5+2, `d7a09a0` seed QA TM — merge kedua tanpa konflik, tanpa migrasi; migrasi `20261021015324_overtime_break_wage`, `20261021042556_leave_resubmit_exit`); konflik `attendance/directory.ts` diselesaikan dengan memindah query Prisma Mat ke interface publik employee/organization; log TM digabung; dokumen induk (PROGRESS, indeks PLAN §8 TM-D2–D10, DSB-D1, MOB-D*) & codemap.
- **Verifikasi:** urutan migrasi diuji di salinan `hris_merge_test` (`migrate deploy` menerapkan 2 migrasi Mat yang bertanggal sebelum migrasi MOB tanpa galat; DB uji dihapus); develop: `db:deploy` 2 migrasi, `db:check` tanpa selisih; typecheck ✔; biome ✔ 627 file; boundaries ✔ 0 pelanggaran (509 modul); test shared 335 · api 879 · web 309 (`--maxWorkers=3`; setelah merge kedua: biome 629 file, boundaries 510 modul, api 880, web 310; run paralel penuh sempat gagal 3–28 test berbeda-beda karena load average 20 — tiap file lulus saat diulang).
- **Masalah / catatan:** `leave-exit.service.ts` (Mat) memanggil `getPrisma()` langsung dari service (aturan layer PROMPT §4) — dilaporkan, tidak diubah. Saklar `FEATURES` Mat (sub-saklar TM, `reports: true`) ikut masuk.
- **Push & CI:** develop di-push `8cda6b8..bc50142` + branch `HRIS/mobile-app`; CI #39573935430 ✘ di job "Migrasi dari DB kosong + test api": `tests/integration/analytics/dashboard-analytics.test.ts` (Mat) memakai `prisma.account.findFirstOrThrow()` → P2025 di DB kosong. Diperbaiki: akun SA dibuat test sendiri; simulasi CI di DB `hris_ci` kosong (migrasi dari nol + test api) 880 lulus.
- **Berikutnya:** Mat merge develop; tahap 3 di `HRIS/mobile-app`.

### 2026-10-21 — Branch BE `HRIS/mobile-app` + worktree `HRIS-mobile` (Oatse)
- **Dikerjakan:** branch `HRIS/mobile-app` dari develop `f99f0c9`, worktree `/mnt/winD/WORK/Magang/HRIS-mobile`, DB lokal `hris_mobile` (`.env` worktree disalin dari HRIS, DB diarahkan ke `hris_mobile`); baris branch di PROMPT §8 & RELEASE §1.
- **Keputusan:** MOB-D16 (isi di `Arthasia-Mobile/docs/decisions.md`).
- **Verifikasi (worktree):** `db:deploy` → `hris_mobile` 39 migrasi (terakhir `20261021045348_push_devices_and_notification_target`, dicek lewat koneksi pg); typecheck ✔ 3 workspace; biome ✔ 603 file; boundaries ✔ 0 pelanggaran; test shared 268 · api 856 · web 276 (+14 dilewati, saklar `reports` false di versi commit). Satu kali `company-scope.test.tsx` gagal saat seluruh suite jalan, lulus saat diulang (flaky karena beban).
- **Berikutnya:** tahap 2 di develop (gabung branch Mat) → merge develop ke `HRIS/mobile-app` → tahap 3.

### 2026-10-21 — Keputusan & dokumen app pindah ke repo Arthasia-Mobile (Oatse)
- **Dikerjakan:** MOB-D1–D12 dipindah utuh ke `Arthasia-Mobile/docs/decisions.md` (+ MOB-D13–D15); README ini diringkas jadi sisi BE + indeks keputusan; scaffold app jalan di POCO X6 Pro; repo app punya CLAUDE.md, docs/ (PROMPT, PLAN, CODEMAP, PROGRESS, decisions, phases) & skill `mob-*`.
- **Keputusan:** MOB-D13 (dokumen dipisah), MOB-D14 (skill & branch), MOB-D15 (roadmap & CI) — isi di repo app.
- **Verifikasi:** grep rujukan MOB-D* & tautan; dokumen saja di HRIS.
- **Masalah / catatan:** branch Mat sudah push (+8 commit, migrasi `20261021042556_leave_resubmit_exit` bertanggal sebelum migrasi MOB `20261021045348`) — perhatikan urutan saat tahap 2.
- **Berikutnya:** tahap 2 (gabung branch Mat).

### 2026-10-21 — Tahap 1 BE: versi minimum app + push FCM (Oatse)
- **Dikerjakan:** checklist dirinci per tahap; `core/app-version.ts` (`X-App-Version` → 426 `APP_UPDATE_REQUIRED`, env `MOBILE_MIN_VERSION`/`MOBILE_APK_URL`, kode galat baru di shared `ERROR_CODES`); push FCM: migrasi `20261021045348_push_devices_and_notification_target` (`notification.push_devices`, `notifications.target_type/target_id`), `core/push.ts` (FCM HTTP v1) + `core/google-auth.ts` (token service account, dipakai ulang `google-drive.ts`), `notify({ target })` mengirim push & menghapus token 404, `POST /me/devices`, `DELETE /me/devices/{token}`, DTO notifikasi + `target`, env `FCM_SERVICE_ACCOUNT_JSON`; `forgetRecipient` ikut menghapus perangkat.
- **Keputusan:** — (pelaksanaan MOB-D6/D7)
- **Verifikasi:** `db:migrate` + `db:generate` + `db:check` exit 0; `bun run typecheck` ✔ 3 workspace; `bunx biome ci .` ✔ 603 file; `check:boundaries` ✔ 0 pelanggaran; `bun run test` ✔ shared 268 · api 856 · web 290 (baru: `core/__tests__/app-version.test.ts` 8, `push.test.ts` 4, `integration/notification.test.ts` +4).
- **Masalah / catatan:** push sungguhan belum diuji (belum ada project Firebase; pemilik ikut OD-4). Pengisian `target` dari notifikasi TM = tahap 3. Belum di-commit.
- **Berikutnya:** Flutter/Android SDK (opsi Linux vs unduh SDK Windows ke D:) → scaffold `Arthasia-Mobile`; tahap 2 setelah Mat push.

### 2026-10-21 — Sesi grill app Flutter: keputusan MOB-D1–D12 (Oatse)
- **Dikerjakan:** sesi grill (checklist "Sesi grill" ✔): cakupan v1, platform & PWA, anti-fake-GPS, distribusi, password, push, celah BE wajib, identitas repo/app, codegen, koordinasi dengan TM (Mat), flavor, stack.
- **Keputusan:** MOB-D1 paritas PWA `/absen` + approval · D2 Android saja, PWA tetap (tinjau D-067) · D3 label `MOCK_LOCATION` + kanal + versi, tidak blokir · D4 APK sideload · D5 password lewat browser, ganti password di app · D6 push FCM v1 · D7 5 celah BE wajib · D8 `Arthasia-Mobile`, `com.arthasia.akselerasi`, "Arthasia Akselerasi" · D9 snapshot spec + `swagger_parser` · D10 urutan kerja & merge branch Mat · D11 flavor dev/staging(/prod) · D12 stack.
- **Verifikasi:** dokumen saja. `git fetch`: branch kita tidak tertinggal (ahead 3); `origin/HRIS/Mat/Mac` +1 commit `a3db100` (migrasi `20261021015324_overtime_break_wage`), dry-run `git merge-tree` konflik di `attendance/directory.ts` & `time-management/log.md` — belum di-merge (menunggu kabar Mat push).
- **Masalah / catatan:** pemilik project Firebase & Play Integrity menunggu OD-4/Play Store; D-067 & PLAN §1/§10 perlu disesuaikan saat digabung ke develop.
- **Berikutnya:** rencana pengerjaan (menunggu persetujuan) → tahap 1 MOB-D10.

### 2026-10-21 — Analisis kesiapan BE untuk app Flutter + cek Android SDK (Oatse)
- **Dikerjakan:** telusur read-only auth, kontrak OpenAPI, endpoint karyawan, celah khas native (README "Analisis kesiapan BE"); cek disk Windows untuk Flutter/Android SDK.
- **Keputusan:** — (menunggu sesi grill)
- **Verifikasi:** baca kode & dokumen saja; tidak ada perubahan kode.
- **Masalah / catatan:** Android SDK belum terpasang di Windows; kontrak OpenAPI TM & Leave belum bertipe.
- **Berikutnya:** sesi grill (sesi Claude terpisah) → keputusan `MOB-D*` → rencana perbaikan celah BE & pembuatan repo app.
