# Log — IAM — akun, role, grant, audit, notifikasi

Entri terbaru di **atas**. Format satu entri (salin):

```
### YYYY-MM-DD — <judul singkat> (<PIC>)
- **Dikerjakan:** … (rujuk item checklist README)
- **Keputusan:** <PREFIX>-Dn baru / OD terjawab
- **Verifikasi:** perintah + hasil nyata
- **Masalah / catatan:** …
- **Berikutnya:** …
```

### 2026-11-27 — Tanpa akses karyawan Head Office (IAM-D3) (Oatse)
- **Permintaan:** pengguna via supervisor-af ±10:2x WIB (admin site tidak melihat/mengubah karyawan HO, termasuk absensi); keputusan kecil A–D persetujuan supervisor.
- **Skema:** migrasi `20261127033900_iam_d3_head_office_restriction` (`work_locations.is_head_office` + backfill "Kantor Head Office", `accounts.restrict_head_office`).
- **API:** `Actor.hiddenEmployeeIds` dimuat per request di `loadActor`; `isInCompanyScope` kini wajib `employeeId`; penyaring `hiddenFilter` dipasang di daftar karyawan, direktori, absensi/lembur/cuti/approval/roster, aset, SP, onboarding, laporan, analitik, akun, export; tulis/pindah/import ke lokasi HO → 422; tutup periode → 403; penerima notifikasi HR mengecualikan akun dibatasi untuk karyawan HO. SA mengatur lewat `PUT /accounts/:id/companies` (`restrictHeadOffice`, audit `iam.account.restrict_head_office`); ganti role ke non-HR mematikannya; master lokasi kerja punya `isHeadOffice`.
- **Web:** dialog Atur PT (centang "Tanpa akses karyawan Head Office") + badge "Tanpa Head Office"; master Lokasi kerja (centang + kolom Head Office).
- **Pengerjaan:** inti & API SA oleh Claude; pemasangan mekanis oleh Codex sol-high (berhenti di tengah karena kuota, diff diterapkan lalu ditinjau penuh); perbaikan review: data karyawan milik akun sendiri tidak pernah disembunyikan, pengingat untuk diri sendiri tidak dilewati, sinkron atasan bagan tidak melewati karyawan HO, tutup periode ditolak walau tanpa karyawan HO.
- **Review independen (subagen Claude):** diperbaiki — notifikasi pengajuan lembur & perubahan roster tidak lagi ke HR dibatasi untuk karyawan HO; karyawan HO tidak bisa dipilih sebagai atasan (create/update, pesan sama dengan "tidak ada"); pola/crew yang dipakai karyawan HO tidak bisa diubah/diarsipkan akun dibatasi (422). Dicatat (Backlog): akun dibatasi yang menjadi atasan langsung karyawan HO masih menerima notifikasi atasan & langkah atasannya macet sampai HR/SA mengambil alih; sinkron atasan bagan oleh akun dibatasi ikut menghitung ulang atasan karyawan HO (sengaja, konsistensi data); nama atasan HO tetap tampil pada karyawan yang terlihat; hitungan agregat master (jumlah karyawan per lokasi/jabatan/status, anggota template, pemegang pos) masih termasuk HO; tukar shift layanan diri dengan rekan HO ditolak.
- **Keputusan:** IAM-D3.
- **Verifikasi:** lihat laporan akhir sesi (typecheck, biome, boundaries, test shared/api/web, `head-office-restriction.test.ts` 16 test termasuk kinerja ±100 karyawan HO).
- **Berikutnya:** rilis staging + set opsi akun admin.site (kata pengguna, oleh supervisor).

### 2026-11-27 — Grant & cabut banyak sekaligus (IAM-D2) (Oatse)
- **Permintaan:** pengguna via supervisor (26 Nov 17:4x, "Setuju dialog ini"; "Cabut terpilih" ikut sekarang).
- **API:** `POST /iam/grants/batch` (akun × izin, `dryRun`, status per kombinasi `created`/`skipped_active`/`skipped_not_grantable`/`skipped_inactive`), `POST /iam/grants/revoke-batch`; satu transaksi, audit per grant + `batchId`, notifikasi digabung per penerima; filter `GET /grants?accountIds=&permissions=` (dipisah koma).
- **Web:** `components/grant-batch-dialog.tsx` (pilih akun + filter PT + "Semua HR Admin/Manager", izin dengan peringatan role, berlaku sampai + alasan untuk semua, pratinjau server, tabel hasil); halaman Grant izin: kolom centang, filter akun & izin, "Cabut terpilih" + dialog konfirmasi + alasan.
- **Keputusan:** IAM-D2.
- **Verifikasi:** `tests/integration/iam/grants-batch.test.ts` (campuran, pratinjau tak menulis, audit + notifikasi, 400/401/403/404/422, atomik, batas 50 akun/15 izin, revoke batch); web `tests/grants-batch.test.tsx` 3 test; verifikasi penuh + screenshot `QA/2026-11-26-ux-kontrak/grant-*`.
- **Berikutnya:** rilis staging (butuh kata pengguna).

### 2026-10-28 — Reset sandi Auth akun QA `hr.arthasia` di staging (Oatse, sesi HRIS-mobile)
- **Dikerjakan:** login `hr.arthasia@gmail.com` ditolak di web staging (temuan supervisor; akun aktif, terkonfirmasi, tidak dibanned). Atas kutipan pengguna 16:13 WIB "reset sandi hr.arthasia di staging ke …" (sandi tidak dicatat di repo), 16:14 WIB sandi Auth diganti lewat Supabase Auth Admin API `updateUserById` (service role dari `.env` lokal, tidak dicetak) di project staging `iwgzuwcxsxnbjibhbqgh`.
- **Keputusan:** —
- **Verifikasi:** id, email, role, app/user metadata, status konfirmasi & ban sama persis sebelum/sesudah; `signInWithPassword` (anon key) OK, user cocok; sesi uji di-sign out.
- **Masalah / catatan:** tidak ada data aplikasi yang diubah; hanya sandi satu user Auth.
- **Berikutnya:** —

### 2026-10-26 — Gabung `HRIS/Mat/Mac` (IAM-D1, TM-D13 fase A) ke develop (Oatse)
- **Dikerjakan:** merge `origin/HRIS/Mat/Mac` (`e76bd16` switcher akun uji dev, `92b8f5b` tombol muat ulang persetujuan, `1f66690` role HR Kepegawaian IAM-D1, `5df7538` absen per shift TM-D13 fase A) → develop `d3c1ebc`, tanpa konflik; induk: PLAN §4.1/§4.3 + indeks §8 (TM-D11–D13, IAM-D1), RELEASE antrean #62, PROGRESS.
- **Keputusan:** — (TM-D13 & IAM-D1 sudah diputuskan pemilik projek 2026-10-23)
- **Verifikasi:** `db:deploy` 2 migrasi (`20261023080413_role_hr_personnel`, `20261023084227_shift_starts_next_day`) · `db:check` tanpa selisih · typecheck ✔ · biome ✔ 653 file · boundaries ✔ 526 modul · test shared 335 · api 928 · web 323 (`--maxWorkers=4`); simulasi CI DB kosong `hris_ci`: 45 migrasi + api 928 lulus (DB dihapus lagi).
- **Masalah / catatan:** endpoint `/api/v1/dev/test-*` (login akun uji tanpa password) hanya terdaftar saat `NODE_ENV=development` dan ditolak di luar itu; web hanya `import.meta.env.DEV`. Branch Mat sebelumnya belum memuat develop `9b43cc8`.
- **Berikutnya:** push develop (izin) → Mat pull develop → rilis gel. 14 (2 migrasi) bila diminta, lalu ganti role akun QA HR di staging.

### 2026-10-23 — Role HR Kepegawaian (IAM-D1) (Mat)
- **Dikerjakan:**
  - Role `HR_PERSONNEL` (shared `ROLES`, `COMPANY_ASSIGNED_ROLES`/`usesAssignedCompanies`; enum Prisma + migrasi `role_hr_personnel`).
  - iam: `loadActor`, Atur PT, ganti role mempertahankan PT antar-role HR.
  - employee: `employeeListScope`/`canViewEmployee` untuk role ini; `isEmploymentOnly` → detail tanpa kontak darurat, pendidikan, pelatihan, riwayat kerja; dokumen & Arsip tertutup.
  - Web: `access.employmentOnly`/`readArchive`/`viewInactiveEmployees`, menu, guard route Arsip & Tidak Aktif, tab detail, halaman Akun/Profil, label.
  - Akun uji lokal `hr.kepegawaian@arthasia.test` (ikut `db:seed:acceptance`).
- **Staging (data saja, audit atas nama SA Utama):** akun QA `hr.arthasia@gmail.com` (HR_ADMIN, ACP)
  - Grant onboarding/perubahan data/SP dicabut.
  - Grant data pribadi diberikan lalu dicabut lagi sesuai keputusan akhir.
  - Password diganti atas permintaan pemilik projek.
  - Role diganti ke HR Kepegawaian **setelah** migrasi dirilis.
  - Keadaan awal dicatat untuk dikembalikan bila diminta.
- **Keputusan:** IAM-D1.
- **Verifikasi:**
  - `hr-personnel.test.ts` 6/6, termasuk sweep semua endpoint OpenAPI: di luar allowlist yang ditinjau, tidak ada 2xx; kotak masuk keputusan kosong.
  - Web: `navigation`/`employee-detail` (HR Kepegawaian); browser lokal: aset, laporan, lembur, arsip → "Akses ditolak"; detail hanya Kepegawaian + Riwayat.
- **Berikutnya:**
  - Rilis migrasi ke staging lewat workflow.
  - Ganti role akun QA.
  - Perbarui PLAN §4.1/§4.3 saat merge ke develop.


Log sebelum 2026-10-13 ada di [archive/log-2026-09.md](../../archive/log-2026-09.md) dan [archive/log-2026-10.md](../../archive/log-2026-10.md) (cari judul atau D-xxx fitur ini).

