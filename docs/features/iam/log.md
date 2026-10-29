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

