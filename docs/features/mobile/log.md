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
