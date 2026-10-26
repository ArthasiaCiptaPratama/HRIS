# Log — Aplikasi mobile (Flutter)

Entri terbaru di **atas**. Format satu entri (salin):

```
### YYYY-MM-DD — <judul singkat> (<PIC>)
- **Dikerjakan:** … (rujuk item checklist README)
- **Keputusan:** <PREFIX>-Dn baru / OD terjawab
- **Verifikasi:** perintah + hasil nyata
- **Masalah / catatan:** …
- **Berikutnya:** …
```

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
