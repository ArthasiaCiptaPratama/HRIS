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
