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

