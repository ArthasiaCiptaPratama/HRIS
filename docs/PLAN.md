# PLAN — HRIS Arthasia Cipta Pratama

> **Fungsi file ini:** menjelaskan **apa** yang dibangun dan **kenapa**: tujuan, ruang lingkup, arsitektur, stack, model akses, aturan bisnis kunci, keputusan, dan roadmap per fase.
> Jika file instruksi saling bertentangan, urutan prioritasnya adalah **PLAN > PROMPT > CODEMAP > PROGRESS**. Jika kode bertentangan dengan PLAN, salah satunya diperbaiki **secara sadar** dan dicatat di log PROGRESS. Perbedaan itu tidak boleh dibiarkan.

| Metadata      | Nilai                                                                      |
| ------------- | -------------------------------------------------------------------------- |
| Versi         | 1.1                                                                        |
| Tanggal       | 2026-09-25 (revisi 2026-09-28)                                             |
| Pemilik       | Oatse                                                                      |
| Repo          | https://github.com/ArthasiaCiptaPratama/HRIS.git                           |
| Branch kerja  | `HRIS/Oatse/Linux-Windows`                                                 |
| Dasar         | Sesi grill 2026-09-25 (keputusan D-001 s.d. D-022), revisi 2026-09-28 (D-023 s.d. D-034), 2026-09-29 (D-035 s.d. D-037), 2026-09-30 (D-038 s.d. D-042), 2026-10-01 (D-043 s.d. D-049), 2026-10-02 (D-050), 2026-10-05 (D-051 s.d. D-058), 2026-10-07 (D-059), 2026-10-08 (D-060, D-061), 2026-10-09 (D-062) |
| File terkait  | [CODEMAP](./CODEMAP.md) · [PROGRESS](./PROGRESS.md) · [PROMPT](./PROMPT.md) |

---

## 1. Tujuan & Ruang Lingkup

### 1.1 Tujuan
Membangun HRIS internal untuk **satu grup perusahaan tambang batu bara** (multi-entitas: ACP, PNR, RCE, RDA, AU, NMA, …; banyak site — D-039; awalnya ± < 200 karyawan) yang:
1. **Terpisah jelas per domain**. Setiap domain HR adalah modul dengan batas kode dan batas data yang tegas.
2. **Scalable** dalam dua arti:
   - **Horizontal:** backend stateless, bisa berjalan di banyak instance.
   - **Bisa diekstrak:** batas modul cukup disiplin sehingga modul tertentu bisa dipecah menjadi service sendiri nanti tanpa menulis ulang.
3. **Dibangun dan dirilis bertahap**, modul demi modul.
4. **Satu repository** (monorepo) supaya setup, development, dan deployment tetap sederhana.
5. **Siap untuk aplikasi mobile.** Mobile app dibuat nanti sebagai projek terpisah yang memakai API backend yang sama.

### 1.2 Modul (Ruang Lingkup v1)

| Modul          | Ringkasan                                                                                             |
| -------------- | ----------------------------------------------------------------------------------------------------- |
| `iam`          | Akun (terhubung ke Supabase Auth), role, Super Admin Utama, grant izin per akun.                      |
| `organization` | Perusahaan dalam grup (entitas, D-039), profil perusahaan, pengaturan sistem, departemen, jabatan, status kepegawaian, grade, lokasi kerja (geofence), hari libur. |
| `employee`     | Data induk karyawan, atasan langsung (`manager_id`), data sensitif, rekening, keluarga, pendidikan, pelatihan, dokumen, kontak darurat, riwayat, import CSV/Excel. |
| `attendance`   | Shift, jadwal, absen (geofence + selfie + waktu server), koreksi absensi, lembur, penutupan periode absensi. |
| `leave`        | Cuti tahunan (saldo, akrual, hold) dan izin (melahirkan, menikah, duka, sakit, dll.).               |
| `approval`     | Mesin approval paralel yang dipakai attendance dan leave.                                             |
| `contract`     | Jenis kontrak, kontrak kerja, perpanjangan, terminasi, pengingat habis kontrak.                       |
| `payroll`      | Komponen & struktur gaji, periode, BPJS, PPh 21 (TER), lock, slip gaji.                               |
| `notification` | Notifikasi in-app dan email.                                                                          |
| `audit` (core) | Audit log untuk semua aksi sensitif.                                                                  |

### 1.3 Di Luar Ruang Lingkup v1 (Backlog)
- Aplikasi mobile (projek terpisah; backend v1 sudah menyiapkan API-nya).
- MFA untuk akun SUPER_ADMIN/HR_ADMIN.
- Notifikasi WhatsApp.
- Pencocokan wajah otomatis (face recognition) pada selfie absensi.
- Approval berjenjang lebih dari satu atasan.
- Role builder dinamis (role/izin dibuat dari UI). **Ditolak** untuk v1; role dan izin didefinisikan di kode.
- Rekrutmen, penilaian kinerja, training, integrasi bank, pelaporan pajak otomatis ke DJP.

---

## 2. Tech Stack

| Lapisan                  | Teknologi                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------- |
| Bahasa                   | **TypeScript** (backend & frontend)                                                         |
| Runtime backend          | **Bun** (runtime, package manager, workspaces, test runner)                                  |
| Web framework            | **Hono** + **`@hono/zod-openapi`** (route + validasi + dokumen OpenAPI dari satu skema)      |
| Validasi                 | **Zod** (request, response, env, DTO bersama FE/BE)                                          |
| ORM                      | **Prisma 7**: generator `prisma-client` (`runtime = "bun"`), skema multi-file, multi-schema Postgres, driver adapter |
| Database                 | **PostgreSQL** (lokal: container Docker, versi major = project Supabase, saat ini diperkirakan 17; staging & produksi: Supabase project) |
| Auth                     | **Supabase Auth** (email + password, undangan, self sign-up nonaktif); development lokal memakai project **staging** |
| File storage             | **Supabase Storage** (bucket private + signed URL); development lokal memakai project **staging** |
| Frontend                 | **React + Vite + TypeScript**, SPA                                                           |
| UI                       | **Tailwind CSS** + **shadcn/ui**                                                             |
| Data & form (FE)         | **TanStack Query**, **TanStack Table**, **React Router**, **React Hook Form + Zod**          |
| Hosting                  | **Vercel**: project `web` (statis) dan `api` (Vercel Functions, Bun runtime)                |
| Tugas terjadwal          | **Vercel Cron Jobs**                                                                        |
| Email                    | **SMTP Google Workspace kantor** (`smtp.gmail.com`, D-025) untuk email aplikasi dan sebagai SMTP Supabase Auth (staging & produksi). Akun pengirim: OD-5 |
| Container                | **Docker**: hanya development lokal (PostgreSQL via `docker-compose.yml`) + `Dockerfile` api sebagai jalan keluar dari Vercel |
| Lint & format            | **Biome**                                                                                   |
| Batas modul              | **dependency-cruiser** (dicek di CI)                                                        |
| Test                     | **bun test** (api), **Vitest** + Testing Library (web), **Playwright** (E2E)                |
| CI                       | **GitHub Actions**                                                                          |

**Tidak dipakai:** Drizzle ORM (diganti Prisma), microservice terpisah per domain (diganti modular monolith), Docker di produksi, Supabase CLI lokal (diganti PostgreSQL lokal, D-023).

---

## 3. Arsitektur

### 3.1 Gambaran

```
     Browser (React SPA)                    Mobile app (nanti, repo terpisah)
            │                                            │
            │ HTTPS + Bearer JWT Supabase                │
            ▼                                            ▼
 ┌──────────────────────────────────────────────────────────────────┐
 │  apps/api — Bun + Hono (modular monolith) di Vercel Functions   │
 │                                                                  │
 │  core: verifikasi JWT · RBAC + grant · error · audit · storage   │
 │  ┌─────┐ ┌────────────┐ ┌────────┐ ┌──────────┐ ┌─────┐          │
 │  │ iam │ │organization│ │employee│ │attendance│ │leave│ ...      │
 │  └─────┘ └────────────┘ └────────┘ └──────────┘ └─────┘          │
 │  jobs: endpoint Vercel Cron                                      │
 └───────────────┬──────────────────────────────┬───────────────────┘
                 │ Prisma (transaction pooler)  │ Supabase Admin API
                 ▼                              ▼
 ┌──────────────────────────────────────────────────────────────────┐
 │ Supabase: PostgreSQL (1 skema per modul) · Auth · Storage        │
 └──────────────────────────────────────────────────────────────────┘
```

Diagram di atas menggambarkan staging & produksi. Di lokal, database diganti PostgreSQL di Docker, sedangkan Auth & Storage tetap ke Supabase staging (lihat §3.3, D-023).

- **Frontend login langsung ke Supabase Auth** lewat `supabase-js`, lalu mengirim access token sebagai `Authorization: Bearer <jwt>` ke API.
- **API memverifikasi JWT Supabase** (via JWKS), lalu memuat role & grant pengguna **dari database pada setiap request**. Role tidak disimpan di claim JWT, supaya pencabutan akses langsung berlaku.
- **API netral terhadap client:** REST berversi (`/api/v1`), token Bearer, dan tidak ada logika bisnis yang hanya ada di frontend.

### 3.2 Aturan Batas Modul
1. **Satu skema Postgres per modul:** `iam`, `organization`, `employee`, `attendance`, `leave`, `approval`, `contract`, `payroll`, `notification`, `audit`. Skema `public` tidak dipakai untuk data aplikasi.
2. **Modul inti** = `employee` dan `organization`. Modul lain **boleh** punya foreign key ke tabel modul inti.
3. Modul **non-inti tidak boleh saling FK**. Referensi disimpan sebagai UUID biasa.
4. **Membaca/menulis tabel milik modul lain dilarang**, termasuk lewat relasi Prisma (`include`) walaupun ada FK. FK hanya penjaga integritas, bukan jalan pintas query.
5. Modul lain hanya boleh meng-import **`modules/<modul>/index.ts`** (interface publik). Aturan ini ditegakkan oleh **dependency-cruiser** di CI.
6. Data yang harus "membeku" (mis. jabatan dan nominal di slip gaji) disimpan sebagai **snapshot** di modul yang membutuhkan.
7. **Prisma tidak pernah mengelola skema milik Supabase** (`auth`, `storage`, dll.). Referensi ke `auth.users` disimpan sebagai UUID (`auth_user_id`). **Tidak ada FK ke `auth.users`**, karena database lokal tidak punya skema `auth` (D-023); keterkaitan dijaga oleh API: user Supabase Auth **tidak pernah dihapus**, hanya dinonaktifkan (ban via Admin API), dan API menolak JWT yang tidak punya akun aktif di DB.
8. **Skema modul tidak pernah ditambahkan ke *Exposed schemas* Data API Supabase.** Data aplikasi hanya diakses lewat API kita, bukan lewat PostgREST/anon key.
9. **Migrasi harus bisa jalan di PostgreSQL polos** (lokal & CI) sekaligus di Supabase: tidak bergantung pada objek milik Supabase dan tidak memakai `CREATE EXTENSION` (`gen_random_uuid()` sudah bawaan Postgres).

### 3.3 Environment

| Environment    | Database/Auth/Storage              | Frontend & API                        | Dipicu oleh                         |
| -------------- | ---------------------------------- | ------------------------------------- | ----------------------------------- |
| **Lokal**      | DB: PostgreSQL (Docker, versi = Supabase). Auth & Storage: Supabase project **staging** | `bun run dev`                         | –                                   |
| **Staging**    | Supabase project **staging**       | Vercel project staging `hris-staging-web` & `hris-staging-api` (deployment *production* project staging, D-036) | Push ke `HRIS/debug/fe-be`          |
| **Produksi**   | Supabase project **produksi** (region `ap-southeast-1` Singapura) | Vercel **Production** | Merge ke `main`                     |

Catatan untuk development lokal (D-023):
- Database lokal hanya berisi skema aplikasi (tanpa skema `auth`/`storage`). Versi major PostgreSQL **disamakan dengan project Supabase** (dicek saat project dibuat di Fase 1) dan container memakai `TZ=UTC`.
- Login dan upload saat develop memakai Supabase **staging** (butuh internet). Akun di DB lokal menunjuk `auth_user_id` user staging. Setiap developer menjalankan `bootstrap:super-admin` ke DB lokal; script **mencari user Auth berdasarkan email dan membuatnya jika belum ada**, jadi aman dijalankan ulang ke DB mana pun.
- Satu Auth staging dipakai bersama oleh DB lokal semua developer dan DB staging. Supaya email tidak bentrok antar-environment, akun uji memakai **plus-addressing** milik developer dengan penanda environment, mis. `nama+dev-budi@gmail.com` (lokal) dan `nama+stg-budi@gmail.com` (staging). Alamat fiktif tidak dipakai karena email yang memantul bisa membuat Google membatasi akun pengirim.
- *Redirect URLs* Auth staging mengizinkan `http://localhost:5173` selain URL web staging (`https://hris-staging-web.vercel.app/**`), supaya link undangan & reset password bisa kembali ke web lokal.
- File dari development lokal disimpan di bucket staging dengan prefix `dev/<nama-developer>/` supaya tidak bercampur dengan data uji staging.
- Email **aplikasi** (notifikasi) di lokal tidak dikirim, hanya dicatat ke log (tanpa data sensitif), untuk menghemat kuota harian akun pengirim. Email **Auth** (undangan/reset) tetap dikirim sungguhan oleh Supabase staging lewat SMTP Google Workspace.
- Vercel Cron tidak berjalan di lokal. Job dipicu manual dengan memanggil `/api/cron/<job>` memakai header `Authorization: Bearer ${CRON_SECRET}`.
- Test integration memakai PostgreSQL lokal dan verifier auth pengganti, tanpa memanggil Supabase.

Catatan untuk Vercel:
- Runtime API memakai **transaction pooler** Supabase (port 6543). Migrasi memakai **koneksi direct/session** (port 5432).
- Region function diset ke **Singapura (`sin1`)**.
- Upload selfie dan dokumen dilakukan **langsung dari browser ke Supabase Storage** memakai signed upload URL dari API, jadi file tidak melewati function.
- Bun runtime di Vercel masih **Public Beta**. Kode api tidak boleh memakai API khusus Vercel di logika bisnis, dan `Dockerfile` api tetap dirawat supaya bisa pindah ke VPS.
- **Staging (D-036):** project `hris-staging-api` & `hris-staging-web` di akun pribadi `oatse` (Hobby), dideploy oleh GitHub Actions lewat Vercel CLI setelah migrasi. Api dibundel `bun build` (`hono` external) ke `apps/api/dist/index.js` sebelum diunggah; builder Vercel tidak mengompilasi TS per file.
- Paket Vercel **Hobby hanya untuk non-komersial**. Sebelum ada data karyawan sungguhan, projek harus berada di **akun/team milik kantor dengan paket berbayar** (lihat OD-4).

---

## 4. Model Akses

### 4.1 Role

| Role            | Ringkasan                                                                                             |
| --------------- | ----------------------------------------------------------------------------------------------------- |
| **SUPER_ADMIN** | Akses **penuh**: akses sistem, kebijakan HR, dan operasional. Satu-satunya yang melihat & mengisi nominal gaji. |
| ↳ **Utama**     | Penanda pada **tepat satu** akun SUPER_ADMIN. Punya 4 hak eksklusif (lihat 4.4).                      |
| **HR_ADMIN**    | Operator administrasi seluruh perusahaan. Data sensitif hanya dengan grant.                           |
| **MANAGER**     | Pemilik operasional **tim sendiri** (bawahan langsung). Data sensitif tim hanya dengan grant.         |
| **EMPLOYEE**    | Karyawan biasa (tanpa hak administrasi).                                                             |

- **Satu akun tepat satu role** (D-028): staf HR ber-role `HR_ADMIN`, atasan ber-role `MANAGER`.
- **Hak layanan diri** (absen, ajukan cuti/koreksi/lembur, lihat slip & data sendiri, ubah data diri terbatas) melekat pada **akun yang terhubung ke data karyawan**, apa pun role-nya. Karena itu HR_ADMIN/MANAGER tetap bisa absen & cuti, sedangkan SUPER_ADMIN tanpa data karyawan tidak (tanda \* di §4.3).
- Role **tetap di kode**. SUPER_ADMIN hanya memberi/mencabut role, tidak membuat role baru.
- **Tim MANAGER** = karyawan yang `manager_id`-nya menunjuk ke dia (satu tingkat). `manager_id` wajib menunjuk ke akun ber-role MANAGER atau SUPER_ADMIN.
- Akun SUPER_ADMIN **boleh tanpa data karyawan** (tidak bisa absen, cuti, atau punya slip).

### 4.2 Grant Izin Per Akun
SUPER_ADMIN bisa memberi izin tambahan ke akun **HR_ADMIN** atau **MANAGER** dari daftar tetap berikut:

| Kode izin                        | Artinya                                                                          | Bisa diberikan ke     |
| -------------------------------- | -------------------------------------------------------------------------------- | --------------------- |
| `employee.personal.read`         | Lihat NIK KTP, NPWP, no. KK, tempat/tgl lahir, kota asal, alamat KTP & domisili, status nikah, agama, tanggungan (PTKP), nomor BPJS TK & Kesehatan (D-041), data keluarga | HR_ADMIN, MANAGER     |
| `employee.personal.write`        | Ubah data di atas                                                                | HR_ADMIN, MANAGER     |
| `employee.bank.read`             | Lihat nomor rekening                                                             | HR_ADMIN, MANAGER     |
| `employee.bank.write`            | Ubah nomor rekening                                                              | HR_ADMIN, MANAGER     |
| `employee.documents.read`        | Lihat dokumen karyawan                                                           | HR_ADMIN, MANAGER     |
| `employee.documents.write`       | Unggah/hapus dokumen karyawan                                                    | HR_ADMIN, MANAGER     |
| `contract.manage`                | Buat, perpanjang, terminasi kontrak; lihat daftar kontrak                         | HR_ADMIN              |
| `payroll.period.prepare`         | Menutup periode absensi & menandai input payroll siap (**tanpa** melihat nominal) | HR_ADMIN              |
| `employee.onboarding.review`     | Lihat data sensitif & dokumen calon/karyawan yang sedang onboarding, lalu setujui / minta revisi / batalkan (D-047) | HR_ADMIN              |
| `employee.changes.review`        | Setujui/tolak pengajuan perubahan data karyawan di PT yang ditugaskan; bagian sensitif tetap butuh grant lihat & ubah bagian itu (D-054, Arsip 1c) | HR_ADMIN              |

Sifat grant:
- **Cakupan:** untuk HR_ADMIN berlaku atas **semua karyawan**; untuk MANAGER hanya atas **timnya**.
- **Masa berlaku opsional.** Grant mati otomatis setelah lewat.
- **Alasan** disimpan (opsional diisi di UI).
- **Bisa dicabut kapan saja** dan langsung berlaku di request berikutnya.
- Pemberian, pencabutan, dan **setiap akses data sensitif** tercatat di audit log.
- **Data gaji tidak pernah bisa di-grant.** Gaji mutlak hanya untuk SUPER_ADMIN.

### 4.3 Matriks Akses

Keterangan: ✅ boleh · 👁 lihat saja · 🔑 butuh grant · ❌ tidak · "tim" = bawahan langsung · "sendiri" = data milik akun itu

| Area / Aksi | SUPER_ADMIN | HR_ADMIN | MANAGER | EMPLOYEE |
|---|---|---|---|---|
| **Akun & sistem** | | | | |
| Kelola role SUPER_ADMIN & status Utama | hanya Utama | ❌ | ❌ | ❌ |
| Beri/cabut role HR_ADMIN & MANAGER, beri/cabut grant | ✅ | ❌ | ❌ | ❌ |
| Undang akun karyawan, nonaktifkan akun | ✅ | ✅ | ❌ | ❌ |
| Pengaturan sistem, profil perusahaan, audit log | ✅ | ❌ | ❌ | ❌ |
| Kelola perusahaan dalam grup & penugasan PT ke akun HR_ADMIN (D-039, D-040) | ✅ | ❌ | ❌ | ❌ |
| Direktori karyawan (struktur, pencarian) per perusahaan (D-040) | ✅ semua PT | 👁 PT ditugaskan | 👁 PT sendiri | 👁 PT sendiri |
| **Kebijakan (policy)** | | | | |
| Struktur organisasi: perusahaan, unit organisasi (direktorat/divisi/departemen/seksi, D-050), jabatan + level, status, grade, lokasi & geofence — tambah/ubah/arsip/hapus/gabungkan (D-049) | ✅ | 👁 (+ tambah baru lewat import, D-042) | 👁 | 👁 |
| Pos jabatan (atasan, atasan fungsional, slot), PT pemilik unit, sinkron atasan otomatis (D-051–D-053) | ✅ | 👁 | ❌ | ❌ |
| Bagan organisasi per PT (kanvas; kolom direktori; pemegang pos korporat terlihat lintas PT) (D-051) | ✅ semua PT | 👁 PT ditugaskan | 👁 PT sendiri | 👁 PT sendiri |
| Kalender libur | ✅ | 👁 | 👁 | 👁 |
| Template shift & jam kerja, toleransi telat | ✅ | 👁 | 👁 | ❌ |
| Jenis cuti/izin, kuota, akrual, carry-over | ✅ | 👁 | 👁 | 👁 |
| Aturan lembur | ✅ | 👁 | 👁 | 👁 |
| Definisi komponen gaji, tarif BPJS/PPh 21/PTKP | ✅ | ❌ | ❌ | ❌ |
| **Karyawan** | | | | |
| Direktori (nama, jabatan, departemen, email kantor) | ✅ | ✅ | 👁 | 👁 |
| Dashboard agregat karyawan (jumlah per kategori, lokasi, departemen, jabatan, tahun masuk, pendidikan; tanpa data per orang) | ✅ semua PT | ✅ PT ditugaskan (D-040) | ❌ (sapaan) | ❌ (sapaan) |
| Data kerja (jabatan, tgl masuk, status, atasan) | ✅ | ✅ | 👁 tim | 👁 sendiri |
| Tambah/ubah/nonaktifkan karyawan, tempatkan jabatan, isi `manager_id` | ✅ | ✅ | ❌ | ❌ |
| Data pribadi sensitif (NIK, NPWP, KK, alamat, PTKP) | ✅ | 🔑 | 🔑 tim | 👁 sendiri |
| Rekening bank | ✅ | 🔑 | 🔑 tim | 👁 sendiri |
| Dokumen karyawan | ✅ | 🔑 | 🔑 tim | ✅ sendiri |
| Ubah data diri sendiri: no. HP, alamat domisili, kontak darurat, foto | ✅ | ✅ | ✅ | ✅ |
| Import karyawan (CSV/Excel) (D-042) | ✅ | ✅ PT sendiri; kolom sensitif hanya dengan grant `*.write` | ❌ | ❌ |
| Penerimaan karyawan baru: import calon, kirim undangan, undang karyawan existing (D-045) | ✅ | ✅ PT sendiri | ❌ | ❌ |
| Review & keputusan data onboarding (D-045, D-047) | ✅ | 🔑 `employee.onboarding.review` (PT sendiri) | ❌ | ❌ |
| Setujui pengajuan perubahan data diri (D-054) | ✅ | 🔑 `employee.changes.review` (PT sendiri) + grant bagian sensitif | ❌ | ❌ (mengajukan untuk diri sendiri) |
| Isi data pribadi, keluarga, rekening, pendidikan & dokumen **milik sendiri** saat onboarding (D-046) | – | – | – | ✅ hanya saat status mengisi / perlu revisi |
| **Kontrak** | | | | |
| Kelola kontrak & lihat kontrak akan habis | ✅ | 🔑 | ❌ | ❌ |
| Lihat kontrak sendiri | ✅ | ✅ | ✅ | ✅ |
| **Absensi** | | | | |
| Absen (clock-in/out) | ✅* | ✅ | ✅ | ✅ |
| Lihat absensi & foto selfie | ✅ semua | ✅ semua | 👁 tim | 👁 sendiri |
| Tugaskan shift/jadwal ke karyawan | ✅ | ✅ | ✅ tim | ❌ |
| Tandai "boleh absen di luar lokasi" | ✅ | ✅ | ❌ | ❌ |
| Ajukan koreksi absensi / lembur | ✅* | ✅ | ✅ | ✅ |
| Keputusan koreksi absensi | override | ✅ validasi administrasi | ✅ approval utama (tim) | ❌ |
| Keputusan lembur | override | ❌ | ✅ (tim) | ❌ |
| Tutup periode absensi | ✅ | 🔑 `payroll.period.prepare` | ❌ | ❌ |
| **Cuti & izin** | | | | |
| Ajukan / batalkan pengajuan sendiri | ✅* | ✅ | ✅ | ✅ |
| Lihat saldo | ✅ semua | ✅ semua | 👁 tim | 👁 sendiri |
| Keputusan cuti tahunan & izin | override | ✅ validasi administrasi | ✅ approval utama (tim) | ❌ |
| Penyesuaian saldo individual | ✅ | ✅ | ❌ | ❌ |
| **Payroll** | | | | |
| Nominal & struktur gaji per karyawan | ✅ | ❌ | ❌ | ❌ |
| Hitung, review, lock payroll, terbitkan slip | ✅ | ❌ | ❌ | ❌ |
| Lihat slip gaji semua karyawan | ✅ | ❌ | ❌ | ❌ |
| Lihat & unduh slip gaji sendiri | ✅* | ✅ | ✅ | ✅ |

\* jika akun terhubung ke data karyawan.

**Cakupan perusahaan (D-040):** setiap baris "Karyawan", "Kontrak", "Absensi", dan "Cuti" untuk HR_ADMIN hanya berlaku atas karyawan di **perusahaan yang ditugaskan ke akunnya**; grant HR juga hanya berlaku di cakupan itu. SUPER_ADMIN atas semua perusahaan; MANAGER tetap atas timnya; EMPLOYEE atas dirinya.

### 4.4 Super Admin Utama
- **Tepat satu** akun SUPER_ADMIN berstatus Utama pada setiap saat.
- **Hak eksklusif Utama:** (1) memberi role SUPER_ADMIN, (2) mencabut role SUPER_ADMIN, (3) menyerahkan status Utama ke SUPER_ADMIN lain (wajib konfirmasi password; setelahnya ia menjadi SUPER_ADMIN biasa). (4) Akun Utama **tidak bisa** dinonaktifkan atau diubah oleh akun lain.
- SUPER_ADMIN non-Utama punya **semua hak lain**, termasuk melihat nominal gaji semua orang (termasuk gaji Utama).
- Akun Utama pertama dibuat lewat **script bootstrap** saat instalasi. Tidak ada halaman pendaftaran admin.
- **Pemulihan** jika akun Utama hilang total: script manual oleh developer di server yang memindahkan status Utama ke SUPER_ADMIN lain. Script tercatat di audit dan didokumentasikan di runbook. Tidak bisa dilakukan dari aplikasi.
- Sistem **menolak** aksi apa pun yang membuat jumlah SUPER_ADMIN aktif menjadi nol.
- Setiap perubahan role SUPER_ADMIN atau status Utama → audit log + notifikasi ke semua SUPER_ADMIN.

### 4.5 Aturan Umum Akses
1. **Tidak ada yang bisa memutuskan pengajuannya sendiri.**
2. Karyawan nonaktif (resign/PHK) **tidak bisa login**. Datanya tetap disimpan untuk arsip.
3. Semua aksi atas data sensitif dan payroll **tercatat di audit log**.
4. Data sensitif **tidak pernah** ditulis ke log aplikasi atau dikirim lewat email.

---

## 5. Aturan Bisnis Kunci

### 5.1 Akun Karyawan
1. HR_ADMIN/SUPER_ADMIN membuat data karyawan.
2. API (pakai service role key Supabase) mengirim **undangan email**.
3. Karyawan mengatur password sendiri.
4. `auth_user_id` terhubung ke data karyawan.

**Self sign-up dinonaktifkan.** Metode login v1: **email + password**.

### 5.2 Approval

| Jenis pengajuan               | Pihak yang memutuskan                            | Mode         |
| ----------------------------- | ------------------------------------------------ | ------------ |
| Cuti tahunan                  | MANAGER (approval utama) + HR_ADMIN (validasi administrasi) | **Paralel** |
| Izin (melahirkan, menikah, duka, sakit, dll.) | MANAGER + HR_ADMIN                | **Paralel**  |
| Koreksi absensi               | MANAGER + HR_ADMIN                               | **Paralel**  |
| Lembur                        | MANAGER saja                                     | Tunggal      |

Aturan status (mode paralel):
- `PENDING`: kedua pihak bisa memutuskan kapan saja, urutan bebas.
- Keduanya setuju → `APPROVED`.
- **Salah satu menolak → langsung `REJECTED` final**, walaupun pihak lain sudah setuju.
- Karyawan bisa **membatalkan** selama belum final (`CANCELLED`). Setelah `APPROVED`, pembatalan harus lewat pengajuan pembatalan yang di-approve ulang.

Kasus khusus:

| Kasus                                         | Penentu                                                               |
| --------------------------------------------- | --------------------------------------------------------------------- |
| Pengaju adalah MANAGER                        | Atasannya (`manager_id`) + HR_ADMIN                                    |
| Pengaju adalah HR_ADMIN                       | Atasannya + HR_ADMIN **lain**; jika tidak ada HR_ADMIN lain → SUPER_ADMIN |
| Pengaju tidak punya atasan                    | Langkah atasan diambil SUPER_ADMIN                                     |
| Atasan berhalangan / tidak merespons          | Tidak ada auto-approve. HR_ADMIN/SUPER_ADMIN bisa **override** langkah atasan dengan alasan wajib (tercatat di audit) |

### 5.3 Cuti & Izin
- **Cuti** = cuti tahunan saja. Jenis lain adalah **izin**, yang jenis dan kuotanya diatur SUPER_ADMIN (termasuk apakah wajib lampiran dokumen, mis. surat dokter).
- Saldo cuti tahunan **di-hold** saat pengajuan dibuat, lalu dikembalikan jika ditolak atau dibatalkan, dan menjadi terpakai jika disetujui. Saldo tidak boleh negatif.
- Hari cuti dihitung dalam **hari kerja** (tidak termasuk akhir pekan/hari libur sesuai jadwal & kalender).

### 5.4 Absensi
- Absen lewat **web** (v1) dan **mobile app** (nanti), keduanya ke API yang sama.
- **Verifikasi:** geofence GPS (radius per lokasi kerja, diatur SUPER_ADMIN) + **foto selfie** + **waktu server** (jam perangkat tidak pernah dipakai).
- Karyawan bertanda **"boleh absen di luar lokasi"** tidak dicek geofence, tapi koordinat tetap dicatat.
- **Selfie:** hanya **bukti visual** (tidak ada pencocokan wajah). Diambil dari kamera langsung (bukan galeri), dikompres di client (± 200 KB), disimpan di bucket **private**, diakses via signed URL. Yang bisa melihat: pemilik, MANAGER (tim), HR_ADMIN, SUPER_ADMIN. **Retensi 12 bulan**, lalu dihapus otomatis. Data absensinya tetap disimpan.

### 5.5 Payroll
- **Nominal & struktur gaji** per karyawan hanya dilihat dan diisi SUPER_ADMIN.
- Alur per periode:
  1. HR_ADMIN dengan grant `payroll.period.prepare` (atau SUPER_ADMIN) **menutup periode absensi**: memastikan absensi, koreksi, izin, dan lembur sudah final.
  2. SUPER_ADMIN **menghitung**, **me-review**, lalu **me-lock** payroll.
  3. Setelah lock, **slip terbit** ke karyawan.
- Perhitungan otomatis: **BPJS** (Kesehatan; Ketenagakerjaan JHT, JP, JKK, JKM, porsi perusahaan & karyawan) dan **PPh 21 metode TER** (PP 58/2023), termasuk perhitungan ulang di masa pajak terakhir.
- **Tarif, batas upah, tabel TER, PTKP** disimpan di **tabel konfigurasi** yang diatur SUPER_ADMIN, **tidak di-hardcode**.
- Data yang dipakai perhitungan disimpan sebagai **snapshot**, sehingga slip lama tidak berubah.
- Payroll yang sudah di-lock **tidak bisa diubah**. Koreksi dilakukan lewat penyesuaian di periode berikutnya.
- Perhitungan harus **deterministik**: data yang sama menghasilkan hasil yang sama sampai rupiah terakhir.
- Payroll **langsung dipakai tanpa periode paralel** dengan cara lama (**risiko diterima**, lihat §9). Karena itu **golden cases** yang diverifikasi pihak luar **wajib** sebelum payroll dipakai (OD-3).

### 5.6 Notifikasi
- **In-app + email.** Email **tidak pernah** berisi data sensitif (nominal gaji, NIK, dll.), hanya pemberitahuan dan link ke aplikasi.
- Pemicu: pengajuan baru (ke penentu), keputusan pengajuan (ke pengaju), kontrak habis ≤ 30 hari, slip terbit, grant diberikan/dicabut/akan kedaluwarsa, perubahan SUPER_ADMIN/Utama.
- Email undangan & reset password dikirim oleh Supabase Auth memakai **SMTP Google Workspace** yang sama (D-025), di staging maupun produksi. Sebelum akun pengirim tersedia (OD-5), undangan hanya bisa diuji dengan SMTP bawaan Supabase yang sangat terbatas.

### 5.7 Data Awal
- Development memakai **data dummy** khas Indonesia (script seed): nama, NIK/NPWP berformat valid tapi fiktif, alamat, struktur organisasi contoh.
- Fitur **import CSV/Excel** disediakan untuk data karyawan dan saldo cuti (untuk migrasi data asli nanti). Desain import karyawan: D-042 dan [design/import-karyawan.md](./design/import-karyawan.md).
- **File berisi data asli tidak pernah masuk repo** (disimpan di luar repo, mis. `/mnt/winD/WORK/Magang/DATA-ASLI/`). Test & template memakai file dummy berstruktur sama.

---

## 6. Alur Git

```
HRIS/Oatse/Linux-Windows ──PR──▶ HRIS/debug/database ──PR──▶ HRIS/debug/fe-be ──PR──▶ main
    (kerja harian)             (verifikasi migrasi DB,       (uji integrasi FE+BE,     (stabil,
                                di PostgreSQL lokal)          deploy staging)           produksi)
```

**Dua jalur kerja (D-043):**

```
DEVELOP  /mnt/winD/WORK/Magang/HRIS        HRIS/Oatse/Linux-Windows   commit & push bebas (CI jalan di setiap push HRIS/**)
            │  rilis mengambil develop sampai commit tertentu (git merge <commit>), SATU ARAH
            ▼
RILIS    /mnt/winD/WORK/Magang/HRIS-rilis  HRIS/Oatse/rilis           ──PR──▶ HRIS/debug/database ──PR──▶ HRIS/debug/fe-be ──▶ staging
                                           (git worktree)
```

- **Develop** = tempat kemajuan; tidak wajib PR, tidak pernah langsung ke `HRIS/debug/*`.
- **Rilis** = apa yang dipresentasikan/di-deploy ke staging; pemilik projek menentukan sampai fitur mana yang ditunjukkan.
- Rincian aturan: [PROMPT §8](./PROMPT.md#8-konvensi-git).

- Nama `Linux-Windows` merujuk ke device pengembang yang **dual boot** Linux & Windows. Repo harus berjalan identik di kedua OS.
- **Commit:** Conventional Commits **tanpa scope**, bahasa Indonesia. Contoh: `feat: tambah endpoint daftar karyawan`, `fix: saldo cuti tidak kembali saat dibatalkan`.
- **Approver:** PR ke branch debug disetujui pengembang sendiri; PR ke `main` di-review pembimbing/atasan.
- `main` diproteksi: tidak boleh push langsung. *(Penegakan otomatis oleh GitHub menunggu OD-9; sementara dijaga disiplin alur.)*
- Detail aturan ada di [PROMPT §8](./PROMPT.md).

---

## 7. Roadmap

Setiap fase harus memenuhi **kriteria selesai** sebelum fase berikutnya dimulai. Checklist detail ada di [PROGRESS](./PROGRESS.md). Setiap fase modul mencakup **backend + frontend + test** modul tersebut. Tidak ada tenggat waktu; yang mengikat adalah urutan dan kriteria selesai.

| Fase | Nama | Isi utama | Kriteria selesai |
|---|---|---|---|
| 0 | Instruksi Projek | PLAN, CODEMAP, PROGRESS, PROMPT, CLAUDE.md | Disetujui pemilik projek, di-commit ke branch kerja |
| 1 | Fondasi | Monorepo Bun, TS, Biome, dependency-cruiser, CI, PostgreSQL lokal (Docker) + Supabase project staging, kerangka `apps/api` (core) & `apps/web`, `packages/shared`, Prisma setup, 2 project Vercel staging (D-036) | `bun run dev` jalan di **Linux & Windows**; `/api/v1/health` OK di lokal & staging; CI hijau |
| 2 | IAM | Login Supabase di web, verifikasi JWT di api, role, Super Admin Utama + bootstrap, grant izin, audit log, undangan akun | Test matriks akses (bagian IAM) lulus; login → akses terproteksi → logout teruji |
| 3 | Organization | Profil perusahaan, pengaturan sistem, departemen, jabatan, level, lokasi + geofence, kalender libur | CRUD + policy + test; UI master data |
| 4 | Employee | Data karyawan, `manager_id`, data sensitif (grant), rekening, dokumen, kontak darurat, riwayat, undangan dari data karyawan, import CSV/Excel, seed dummy | Karyawan dibuat end-to-end dari UI; akses data sensitif sesuai matriks (teruji) |
| 5 | Attendance | Shift, jadwal, absen (geofence + selfie), koreksi (approval paralel), lembur, rekap, tutup periode, retensi selfie | Rekap bulanan akurat untuk skenario shift & libur (teruji) |
| 6 | Leave | Cuti tahunan (saldo, akrual, hold), jenis izin, approval paralel, integrasi absensi | Saldo tidak pernah negatif; approve/tolak/batal mengubah saldo dengan benar (teruji) |
| — | **Rilis 1** | Fase 1–6 ke produksi | Setelah OD-4 & OD-5 terjawab |
| 7 | Contract | Jenis kontrak, kontrak, perpanjangan, terminasi, pengingat habis | Aturan 1 kontrak aktif per karyawan, overlap, perpanjangan teruji |
| — | **Rilis 2** | Kontrak ke produksi | – |
| 8 | Payroll | Konfigurasi tarif, komponen, struktur gaji, periode, BPJS, PPh 21 TER, lock, slip | Semua **golden cases** terverifikasi lulus; periode lock tidak bisa diubah |
| 9 | Hardening | E2E Playwright alur utama, review keamanan, performa, cron & retensi, runbook | Checklist keamanan lulus |
| — | **Rilis 3** | Payroll ke produksi | Setelah OD-1, OD-2, OD-3 terjawab dan fase 9 selesai |

---

## 8. Keputusan (ADR Ringkas)

| ID    | Keputusan | Alasan |
|---|---|---|
| D-001 | **Modular monolith** (bukan microservice terpisah). Satu backend, modul dengan batas ketat. | Deployment sederhana; skala < 200 karyawan; modul tetap bisa diekstrak. |
| D-002 | *(diganti oleh D-039)* **Single company**, tanpa `company_id`/`tenant_id`. Profil perusahaan tunggal. | Hanya dipakai satu badan hukum. |
| D-003 | **Prisma 7** satu-satunya ORM (skema, migrasi, query). Drizzle tidak dipakai. | Satu sumber skema, tidak ada drift. |
| D-004 | Satu skema Postgres per modul; FK hanya ke modul inti (`employee`, `organization`); akses lintas modul hanya via `index.ts`. | Integritas data + kemampuan ekstraksi. |
| D-005 | **Supabase** untuk DB + Auth + Storage. Modul role bernama `iam` (skema `auth` milik Supabase). *(DB lokal disesuaikan oleh D-023)* | Login, undangan, dan storage siap pakai. |
| D-006 | Akun lahir dari undangan HR/SUPER_ADMIN; self sign-up nonaktif; email + password. | Setiap user pasti karyawan sah. |
| D-007 | *(bagian "role bersifat tambahan" diganti oleh D-028)* Role tetap: SUPER_ADMIN (+ Utama), HR_ADMIN, MANAGER, EMPLOYEE, ditambah **grant izin per akun**. | Kontrol ketat atas data sensitif tanpa role builder. |
| D-008 | Role & grant dicek **dari DB setiap request**, bukan dari claim JWT. | Pencabutan akses langsung berlaku. |
| D-009 | Tim MANAGER = bawahan langsung (`manager_id`), satu tingkat. | Fleksibel untuk struktur datar maupun berjenjang. |
| D-010 | Approval **paralel** MANAGER + HR_ADMIN untuk cuti tahunan, izin, koreksi; lembur cukup MANAGER. | Atasan tahu kondisi operasional; HR memvalidasi administrasi. |
| D-011 | Gaji hanya SUPER_ADMIN; HR_ADMIN ber-grant menutup periode absensi. | Nominal gaji tidak bocor ke HR. |
| D-012 | BPJS + PPh 21 TER dihitung otomatis; tarif di tabel konfigurasi. | Regulasi berubah; tidak boleh hardcode. |
| D-013 | Absensi: geofence + selfie (bukti visual, retensi 12 bulan) + waktu server. | Mencegah absen dari luar lokasi dan titip absen. |
| D-014 | **TypeScript** di seluruh kode. | Prisma 7 menghasilkan client TS; Zod = validasi + tipe. |
| D-015 | Frontend **React + Vite + TS** SPA, Tailwind, shadcn/ui, TanStack Query/Table, React Router, RHF + Zod. | Aplikasi berat form & tabel. |
| D-016 | **Vercel** untuk web & api; Docker hanya lokal; `Dockerfile` api dirawat sebagai jalan keluar. | Sederhana dioperasikan; Bun runtime masih beta. |
| D-017 | Struktur monorepo `apps/web`, `apps/api`, `packages/shared`; **dependency-cruiser**, **`@hono/zod-openapi`**, **Biome**. | Batas modul ditegakkan otomatis; kontrak API untuk mobile. |
| D-018 | Strategi testing: bun test, Vitest, Playwright; matriks akses & payroll wajib TDD. | Dua area yang tidak boleh salah. |
| D-019 | Alur Git berurutan lewat `HRIS/debug/database` → `HRIS/debug/fe-be` → `main`. | Kode & skema selalu sinkron. |
| D-020 | Rilis bertahap (3 rilis); payroll tanpa periode paralel. | Manfaat lebih cepat; risiko payroll diterima sadar. |
| D-021 | Notifikasi in-app + email; email tanpa data sensitif. | Pengajuan tidak menggantung. |
| D-022 | Import CSV/Excel untuk data karyawan & saldo cuti; development pakai data dummy. | Migrasi data asli nanti tanpa input manual. |
| D-023 | Development lokal memakai **PostgreSQL di container Docker** (versi major sama dengan Supabase; bukan Supabase CLI). Auth & Storage saat develop memakai Supabase project **staging**. Supabase hanya ada di staging & produksi. Tidak ada FK ke `auth.users`. | Setup lokal lebih ringan; alur auth & storage tetap identik dengan produksi. Konsekuensi: develop butuh internet dan project staging harus ada sejak Fase 1. |
| D-024 | *(diganti oleh D-025)* Email lewat **Resend SMTP (free plan)**: dipasang sebagai custom SMTP Supabase Auth (staging & produksi) dan dipakai API untuk email aplikasi. API mengirim lewat SMTP (bukan SDK Resend). | Supabase Auth hanya menerima SMTP; satu jalur SMTP untuk keduanya memudahkan pindah ke SMTP kantor nanti. SMTP bawaan Supabase terlalu terbatas untuk uji undangan. |
| D-025 | Email lewat **SMTP Google Workspace kantor**: `smtp.gmail.com` port 587 (STARTTLS), login dengan **akun pengirim khusus** (mis. `hris@<domain-kantor>`) + **App Password** (akun wajib 2-Step Verification). Dipasang sebagai custom SMTP Supabase Auth (staging & produksi) dan dipakai API untuk email aplikasi via SMTP. Menggantikan D-024. | Kantor sudah memakai Google Workspace: pengirim memakai domain kantor tanpa verifikasi domain tambahan, tanpa layanan pihak ketiga, dan batas ± 2.000 email/hari per akun cukup untuk < 200 karyawan. Jika kurang, pindah ke SMTP relay Workspace (`smtp-relay.gmail.com`) tanpa mengubah kode. |
| D-026 | **ERD employee management** (dbdiagram.io, 2026-09-28) menjadi model data modul `organization` & `employee`, dengan penyesuaian: PK **UUID** (PROMPT §6); `nik` = **Nomor Induk Karyawan** (`employee_number`), NIK KTP = `ktp_number`; data sensitif dipisah ke `employee_personal` (termasuk agama) & `employee_bank_accounts`; `family` → `family_members` (sensitif, `age` → `birth_date`); `grade` menggantikan `job_levels`; `employment_status` jadi tabel master; ditambah `manager_id`, `work_email`, `is_active`, geofence `work_locations` (nullable). Auth tetap **Supabase Auth**: `user_account` tanpa `password_hash`. Pemetaan: `.claude/skills/hris-db-schema/ERD.md`. | Pemilik projek memberi ERD sebagai gambaran database; konvensi & model akses PLAN tetap berlaku. |
| D-027 | **Target mingguan bertahap.** Target minggu 2026-09-28: skema data karyawan (tabel ERD `organization` & `employee`) dibuat lebih awal, sebelum Fase 1 selesai (item akun luar masih menunggu) dan sebelum Fase 2. Endpoint & UI yang butuh cek akses tetap menunggu fondasi IAM (`core/auth`, `core/access`) sesuai PROMPT §3.5. | Pemilik projek meningkatkan sistem sedikit demi sedikit per minggu; skema bisa dibuat tanpa melanggar aturan akses karena belum ada endpoint. |
| D-028 | **Satu akun satu role** (menjawab OD-10). Role tetap di kode (SUPER_ADMIN, HR_ADMIN, MANAGER, EMPLOYEE), disimpan sebagai kolom enum `iam.accounts.role` (tabel `role` di ERD cukup direpresentasikan oleh enum ini). Hak layanan diri berasal dari keterhubungan akun ke data karyawan, bukan dari role EMPLOYEE. Grant izin per akun (§4.2) tetap. | Keputusan pemilik projek, sesuai ERD `user_account.role_id`; lebih sederhana untuk UI & pengecekan akses. |
| D-029 | Project Supabase **`HRIS Project`** (ref `iwgzuwcxsxnbjibhbqgh`, organisasi `Work`, paket Free) ditetapkan sebagai **staging**. Project **produksi** dibuat terpisah menjelang Rilis 1 (bersama OD-4). Label "PRODUCTION" pada branch `main` di dashboard adalah label bawaan Supabase, bukan peran project. Pengaturan staging: sign-up mandiri mati, Redirect URL `http://localhost:5173/**`, *Exposed schemas* hanya `public` & `graphql_public`. Region staging **ap-northeast-2 (Seoul)** (tidak bisa diubah; semula tercatat keliru sebagai ap-southeast-2/Sydney, terbukti dari host pooler `aws-0-ap-northeast-2`; PLAN hanya mewajibkan Singapura untuk produksi): latensi staging lebih tinggi dari Vercel `sin1`, diterima; project **produksi wajib `ap-southeast-1` (Singapura)**. | Keputusan pemilik projek; branching Supabase tidak tersedia di paket Free sehingga staging & produksi harus project berbeda (PLAN §3.3). |
| D-030 | **`db:deploy` otomatis dari GitHub Actions** (menjawab OD-7): workflow `.github/workflows/deploy-staging.yml` berjalan saat push ke `HRIS/debug/fe-be` (atau manual, hanya dari branch itu): `prisma migrate deploy` lalu `db:check`, memakai repository secret `STAGING_DIRECT_URL` (session pooler port 5432, karena runner tanpa IPv6; Environment secrets tidak tersedia di repo private paket Free). Deploy Vercel dipicu lewat Deploy Hook **setelah** migrasi sukses *(cara deploy diganti oleh D-036: Vercel CLI dari GitHub Actions)*, sehingga migrasi selalu mendahului kode baru. Env lokal: `.env` berisi DB lokal + kunci Supabase staging; URL DB staging tidak disimpan di laptop. Produksi: workflow serupa di `main` saat Rilis 1. | Rekomendasi OD-7 dipilih pemilik projek: tercatat, berulang, tidak bergantung laptop. |
| D-031 | *(diganti oleh D-032)* **Pengirim email sementara (staging):** akun Gmail pribadi pemilik projek `rizqy2458@gmail.com` + App Password, lewat `smtp.gmail.com:587` STARTTLS (sesuai mekanisme D-025). Dipakai untuk SMTP Supabase Auth staging (dan email aplikasi staging nanti). **Wajib diganti** akun pengirim kantor sebelum produksi (OD-5 tetap terbuka untuk akun final). Batas kirim Gmail pribadi ± 500 email/hari. | Pemilik projek butuh email staging berjalan sekarang; akun Workspace kantor belum tersedia. |
| D-032 | **Pengirim email staging:** akun Gmail **`admin.arthasia@gmail.com`** + App Password lewat `smtp.gmail.com:587` STARTTLS (mekanisme D-025), untuk SMTP Supabase Auth staging & email aplikasi staging. Menggantikan D-031. Akun final produksi tetap OD-5 (Workspace kantor dianjurkan). Batas kirim Gmail ± 500 email/hari. | Permintaan pemilik projek: memakai akun admin khusus, bukan akun pribadi. |
| D-033 | **Konfirmasi password untuk serah-terima Utama** (PLAN §4.4) = **login ulang di klien**: web meminta password dan login ulang ke Supabase; API menerima `POST /accounts/primary-super-admin/transfer` hanya bila klaim token `amr` metode `password` berumur **≤ 5 menit**. Klaim `iat` tidak dipakai karena berubah saat token di-refresh tanpa password. Password tidak pernah melewati API. | Keputusan pemilik projek 2026-09-28; password tidak menyentuh server kita. |
| D-034 | **Aturan kelola akun (melengkapi §4.3–§4.4, D-028):** (1) HR_ADMIN hanya menonaktifkan/mengaktifkan kembali akun EMPLOYEE & MANAGER; menonaktifkan SUPER_ADMIN hanya oleh Utama; tidak ada yang mengubah role atau menonaktifkan **dirinya sendiri**; akun Utama tidak diubah akun lain. (2) Undangan: HR_ADMIN hanya role EMPLOYEE; SUPER_ADMIN semua role kecuali SUPER_ADMIN (khusus Utama). (3) Saat role berubah, grant yang tidak boleh untuk role baru **dicabut otomatis** (tercatat audit). (4) Nonaktif = `is_active=false` + user Auth di-*ban* (tidak dihapus, §3.2.7); ban & perubahan DB satu transaksi. | Keputusan pemilik projek 2026-09-28 (poin 1) + konsekuensi desain yang disetujui dalam rencana Fase 2. |
| D-035 | **Personal Management web lebih awal (target minggu 2026-09-29)** — item Fase 3–4 (daftar/detail/tambah/ubah karyawan, ubah status, pengaktifan, struktur organisasi baca) dikerjakan sebelum Fase 1–2 ditutup, atas permintaan pemilik projek. Keputusan pemilik projek 2026-09-29: (1) **Navigasi** kelompok besar di top nav (Dashboard, Personal Management, Administrasi) → kelompok kecil & isi di sidebar kontekstual; menu Arsip (f–o) & Laporan (p) tampil sebagai halaman *Maintenance*. (2) **Akses menu**: SUPER_ADMIN & HR_ADMIN penuh; MANAGER hanya baca data kerja **tim** + struktur organisasi; EMPLOYEE tidak memakai menu ini (API tetap mengikuti §4.3). (3) *(bagian "probation bukan kategori" & daftar 5 kategori diganti oleh D-038)* **Kategori pegawai** = kolom enum `employment_statuses.category` (PERMANENT, PKWT, INTERNSHIP, DAILY_WORKER, OUTSOURCING; unik, nullable); status "Masa Percobaan" di seed dihapus (probation bukan kategori). (4) **Ubah Status** = ubah kategori atau **nonaktifkan** dengan tanggal efektif + alasan (`exit_reason`: resign, PHK, kontrak berakhir, pensiun, meninggal, lainnya); **Pengaktifan** = aktifkan kembali pegawai nonaktif. Setiap perubahan tercatat di `employee.employment_histories` + audit. (5) Menonaktifkan pegawai **ikut menonaktifkan akun login** tertaut (ban Supabase, satu transaksi; ditolak bila aktor tidak boleh menonaktifkan akun itu, D-034); mengaktifkan kembali **tidak** mengaktifkan akun. (6) Detail karyawan `?view=work` (default web) tidak membaca/mengaudit data sensitif; bagian sensitif diminta (`view=full`) hanya saat tab Pribadi/Keluarga/Rekening dibuka (*need-to-know*, §4.2 audit). | Pemilik projek ingin progres tampilan HRIS terlihat; model akses & aturan data tetap mengikuti PLAN. |
| D-036 | **Staging di Vercel (2026-09-29, menggantikan bagian Deploy Hook D-030 & "Preview" §3.3 untuk staging):** (1) Akun Vercel pribadi pemilik projek `oatse` (paket **Hobby**) dipakai **hanya untuk staging berdata dummy**; produksi tetap menunggu OD-4 (team kantor berbayar). (2) Dua project khusus staging: `hris-staging-api` (root `apps/api`, framework Hono, Bun runtime, region `sin1`) dan `hris-staging-web` (root `apps/web`, Vite); staging = deployment **production** project tersebut (URL tetap `https://hris-staging-api.vercel.app` & `https://hris-staging-web.vercel.app`, Vercel Cron berjalan; Preview Hobby dilindungi login Vercel dan tidak menjalankan cron). Proteksi Vercel Authentication hanya untuk preview. (3) Deploy dipicu **GitHub Actions + Vercel CLI** (`vercel pull/build/deploy --prebuilt --prod`) di `deploy-staging.yml` **setelah** job migrasi sukses, memakai secret `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID_API`, `VERCEL_PROJECT_ID_WEB`; tanpa integrasi Git Vercel (repo private milik organisasi tidak didukung Hobby). (4) Data staging = seed dummy (`db:seed`) + akun uji per role, bukan salinan DB lokal. | Keputusan pemilik projek; staging bisa diuji dari luar laptop tanpa menunggu OD-4. |
| D-037 | **Foto profil pegawai (2026-09-29, permintaan pemilik projek):** (1) Disimpan di bucket Supabase Storage **private** `employee-photos` (maks 2 MB, hanya `image/jpeg`, `image/png`, `image/webp`), path `employees/<employee_id>/<uuid>.<ext>` di kolom `employee.employees.photo_path` (bukan URL). Bucket dibuat/diselaraskan **hanya** lewat script idempoten `bun run storage:setup` (service role) — staging dijalankan 2026-09-29, produksi dijalankan saat Rilis 1; tanpa policy RLS untuk anon/authenticated. (2) Alur unggah: API menerbitkan signed upload URL (token sekali pakai, terikat path) → browser memotong ke tengah **3:4**, mengompres (maks 600×800, WebP/JPEG) dan mengunggah langsung ke Storage → API mengonfirmasi (objek ada, tipe gambar, ≤ 2 MB), menyimpan path, menghapus foto lama, audit `employee.photo.update`/`delete`. (3) Baca: URL bertanda tangan berumur **10 menit** di daftar & detail untuk siapa pun yang boleh melihat pegawai itu (§4.3 data kerja). (4) Ubah/hapus: SUPER_ADMIN & HR_ADMIN untuk pegawai yang mereka lihat; setiap akun tertaut untuk fotonya sendiri (§4.3 "ubah data diri sendiri: … foto", lewat halaman Profil); MANAGER tidak untuk timnya. (5) Formulir cetak (.xlsx) menyisipkan foto (JPEG) di bingkai B9:J25. | Keputusan pemilik projek 2026-09-29 (akses & rasio 3:4 dipilih dari opsi); bucket private + signed URL sesuai PLAN §2 (file storage) dan D-023 (Storage lokal = staging). |

| D-038 | **Kategori & pengelompokan Data Karyawan Aktif (2026-09-30, permintaan pemilik projek; mengganti D-035 poin 3 bagian "probation bukan kategori"):** (1) Kategori enum `employment_statuses.category` menjadi 7: `PERMANENT` (Karyawan Tetap), `PROBATION` (Karyawan Percobaan), `PKWT`, `DAILY_WORKER` (Pekerja Harian), `INTERNSHIP` (Magang), `OUTSOURCING`, `VENDOR`. Karyawan Percobaan = **kategori sendiri**; setelah lulus, HR/SA memindahkannya lewat Ubah Status (riwayat + audit); aturan durasi percobaan belum diatur sistem. (2) Kategori dikelompokkan (`CATEGORIES_BY_GROUP` di `@hris/shared`): **Karyawan Internal** (Tetap, Percobaan, PKWT, Pekerja Harian), **Program Magang** (Magang), **Tenaga Kerja Eksternal** (Outsourcing, Vendor). (3) Sidebar Personal Management: seksi "Data Karyawan Aktif" = Semua Karyawan Aktif + tiga grup berlipat, grup ber-kategori > 1 punya "Semua …" sendiri; seksi "Pengelolaan Karyawan" = Ubah Status, Pengaktifan, Data Tidak Aktif, Struktur Organisasi. "Semua Karyawan Aktif" tetap ada (tujuan default & satu-satunya tempat status tanpa kategori). (4) API `GET /employees?group=INTERNAL\|INTERNSHIP\|EXTERNAL` (AND dengan `category`); cakupan akses tidak berubah (§4.3, D-035 poin 2). (5) Istilah tampilan Personal Management = **"Karyawan"** (sesuai PLAN), URL tetap (`/personal/pegawai-aktif/<slug>`; slug lama `internship`/`daily-worker` dialihkan). | Keputusan pemilik projek 2026-09-30 (opsi yang direkomendasikan dipilih untuk model percobaan, nama grup, menu semua, dan istilah). |

| D-039 | **Satu sistem, banyak entitas (2026-09-30, mengganti D-002):** HRIS dipakai grup perusahaan tambang batu bara (ACP, PNR, RCE, RDA, AU, NMA, …) dengan banyak site. (1) Tabel `organization.companies` (kode unik mis. `ACP`, nama badan hukum, NPWP badan, alamat, `is_active`, `deleted_at`); dikelola SUPER_ADMIN. (2) `employee.employees.company_id` **wajib** (FK ke modul inti organization); data yang sudah ada dimigrasikan ke **ACP** (migrasi *expand → backfill → contract*). (3) **Master data departemen, jabatan, grade, status, dan site/lokasi kerja berlaku untuk seluruh grup** (dipakai bersama; satu site bisa diisi beberapa PT) — perusahaan hanya menempel di karyawan. (4) Perpindahan karyawan antar-PT dicatat di `employment_histories` (jenis `COMPANY_CHANGED`) + audit. (5) Satu login & satu database untuk seluruh grup; **bukan** multi-tenant terisolasi. (6) Payroll, BPJS, dan pajak nanti dihitung per perusahaan (badan hukum) — dirinci di Fase 8. | Keputusan pemilik projek 2026-09-30: sistem akan melebar ke beberapa perusahaan & site; model multi-entitas memudahkan laporan grup dan mutasi antar-PT tanpa beban multi-tenant. |
| D-040 | **Akses per perusahaan (2026-09-30):** tabel `iam.account_companies` (akun ↔ perusahaan). HR_ADMIN hanya melihat & mengelola karyawan di perusahaan yang ditugaskan (daftar, ringkasan, detail, struktur, ubah status, import, undangan); karyawan di luar cakupan → **404** (tidak boleh diketahui keberadaannya). Grant HR berlaku di dalam cakupan itu. SUPER_ADMIN: semua perusahaan. MANAGER: tetap tim (bawahan langsung, D-009) lintas PT. EMPLOYEE: diri sendiri. HR_ADMIN tanpa penugasan = tidak melihat karyawan mana pun. Penugasan diatur SUPER_ADMIN (audit + notifikasi). **Rincian (Tahap 2, 2026-09-30):** (a) direktori (struktur organisasi, pencarian) MANAGER/EMPLOYEE = **PT tempat ia terdaftar** saja; (b) migrasi hanya membuat **ACP** + menugaskan akun HR_ADMIN yang sudah ada ke ACP; seed dev/staging menambah PT dummy **CD2**; (c) di halaman Akun, HR melihat/menonaktifkan akun yang tertaut karyawan di PT-nya **dan** akun yang belum tertaut karyawan (hasil undangan, belum punya PT); akun di luar cakupan → 404; (d) role berubah dari HR_ADMIN → penugasan PT dicabut otomatis (audit, sejalan D-034 poin 3); (e) web: pemilih perusahaan di top bar & kolom Perusahaan hanya bila pengguna melihat > 1 PT. | Keputusan pemilik projek 2026-09-30 (rincian a–b dipilih dari opsi; c–e konsekuensi desain dalam rencana Tahap 2 yang disetujui). |
| D-041 | **Kolom data karyawan tambahan (2026-09-30, untuk import):** `employee_personal`: `bpjs_employment_number` (BPJS Ketenagakerjaan), `bpjs_health_number` (BPJS Kesehatan), `ptkp_status` (enum TK/0–TK/3, K/0–K/3), `origin_city` — **sensitif**, di bawah grant `employee.personal.*`. `employees`: `emergency_contact_name`, `emergency_contact_relationship`. `educations`: `level` (enum SD, SMP, SMA/SMK, D1–D4, S1–S3, lainnya). Data kontrak (tanggal akhir, PKWT ke-n, durasi, nomor offering) disimpan di modul `contract` **Fase 7**; sampai itu diisi lewat import ulang mode "perbarui". | Keputusan pemilik projek 2026-09-30: kolom file master data kantor diberi tempat resmi, bukan JSON bebas. |
| D-042 | **Import karyawan CSV/Excel (2026-09-30):** (1) File **diurai di browser** dan **tidak disimpan**; hanya baris terpetakan yang dikirim ke API dan **divalidasi ulang di server** (Zod + normalizer bersama di `@hris/shared`). (2) **Deteksi otomatis**: sheet, baris header, pemetaan kolom (kamus sinonim ID/EN + kemiripan teks + tebakan dari isi kolom, dengan skor keyakinan; bisa dikoreksi pengguna; profil pemetaan diingat per susunan header), kolom turunan/formula diabaikan. (3) **Mode per import**: "tambah saja" atau "tambah + perbarui" (kunci = nomor induk karyawan; sel kosong **tidak** menimpa). (4) **Master data baru** (departemen, jabatan, grade, site, status) dibuat otomatis setelah tampil di pratinjau dan bisa dipetakan ke yang sudah ada; HR_ADMIN boleh **menambah** (bukan mengubah/menghapus) lewat import, tercatat di audit. (5) **Kolom sensitif** (KTP, NPWP, KK, alamat, agama, PTKP, BPJS, rekening) hanya ditulis bila aktor SUPER_ADMIN atau ber-grant `employee.personal.write` / `employee.bank.write`; bila tidak, kolom itu dilewati dan diberitahukan di pratinjau. Baris milik akun pengimpor sendiri tidak memperbarui data sensitif sampai OD-6 diputuskan. (6) Baris **RESIGN** (+ tanggal) diimpor sebagai karyawan **nonaktif** (alasan Mengundurkan diri, riwayat HIRED + DEACTIVATED, tanpa akun). (7) Disimpan hanya jejak `employee.import_jobs` (aktor, waktu, nama & hash file, mode, jumlah, error per baris **tanpa nilai**) + audit per karyawan bersumber `import`. (8) Batas 2.000 baris / 5 MB per import, satu transaksi. (9) Library: `read-excel-file` (xlsx) + `papaparse` (csv); SheetJS npm (0.18.5, CVE) tidak dipakai. (10) Data asli tidak pernah masuk repo; test memakai template dummy berstruktur sama. Desain rinci: [design/import-karyawan.md](./design/import-karyawan.md). **Penyempurnaan saat implementasi (2026-09-30, lokal):** nama wajib hanya untuk karyawan baru; baris tanpa nama & nomor induk dilewati (dihitung "baris kosong"); SA/HR multi-PT memilih PT bawaan (tanpa PT → error baris); status keluar karyawan yang **sudah ada** tidak diubah import (peringatan, pakai menu Ubah Status); status kepegawaian tidak dibuat otomatis; import dikerjakan sebelum Tahap 3 atas permintaan pemilik projek — rincian design §10. | Keputusan pemilik projek 2026-09-30 (semua opsi yang direkomendasikan dipilih); risiko kebocoran PII (UU PDP) ditekan dengan tidak menyimpan file. |
| D-043 | **Dua jalur kerja: develop & rilis (2026-10-01, melengkapi D-019):** (1) **Develop** = branch `HRIS/Oatse/Linux-Windows` di folder `/mnt/winD/WORK/Magang/HRIS`: commit & push bebas ke branch sendiri (CI memeriksa setiap push `HRIS/**`), tidak di-PR langsung ke `HRIS/debug/*`. (2) **Rilis** = **satu branch tetap** `HRIS/Oatse/rilis` (git worktree di `/mnt/winD/WORK/Magang/HRIS-rilis`; sebelum 2026-10-05 bernama `HRIS/Oatse/rilis-import`) — **hanya jalur ini** yang naik `HRIS/debug/database` → `HRIS/debug/fe-be` → staging. (3) Fitur dipindah dengan **merge develop sampai commit tertentu** (`git merge <commit>`), **satu arah**; karena itu develop di-commit **per fitur & berurutan**. (4) Perbaikan yang terpaksa dibuat di rilis (mis. persiapan presentasi) **wajib dibawa balik** ke develop sesegera mungkin. (5) **Migrasi selalu lahir di develop**; rilis hanya membawa migrasi develop sesuai urutannya (migrasi yang sudah di staging tidak boleh diubah, PROMPT §3.11). (6) Saklar `FEATURES` (`apps/web/src/app/feature-flags.ts`) **berbeda per jalur**: develop bebas (umumnya semua `true` untuk pengecekan), rilis diatur sesuai materi presentasi; fitur yang mengubah skema/API tidak bisa disembunyikan saklar → cukup tidak di-merge ke rilis. (7) PROGRESS §2 mencatat kedua jalur secara terpisah. | Keputusan pemilik projek 2026-10-01: develop bisa terus maju tanpa mengganggu apa yang dipresentasikan; pelajaran 2026-09-30 (migrasi import dibuat dua kali dengan isi berbeda di develop & rilis). |
| D-044 | **Nama aplikasi yang tampil = "Akselerasi Arthasia"** (2026-10-01): judul tab browser, halaman login & atur password, label logo, subjek & tanda tangan email notifikasi (`[Akselerasi Arthasia] …`), judul OpenAPI. "Akun HRIS" di UI menjadi "Akun login". Nama repo, dokumen, paket (`@hris/*`), dan istilah internal tetap "HRIS". | Permintaan pemilik projek 2026-10-01; dirilis ke staging. |
| D-045 | **Onboarding karyawan baru (2026-10-01, menggantikan Tahap 5 "undangan dari data karyawan"):** (1) Menu **Administrasi › Penerimaan Karyawan Baru** (terpisah dari Import Data Karyawan D-042, memakai mesin deteksi yang sama): unggah file portal (diurai di browser, tidak disimpan) → pemetaan → HR **mencentang kandidat lolos** di pratinjau (yang tidak lolos tidak pernah disimpan; bukan modul rekrutmen, §1.3 tetap) → data kerja **default per batch + ubah per baris**, dipilih dari master data yang ada → **Konfirmasi Undangan** (daftar penerima; centang dilepas = disimpan "belum diundang") → simpan satu transaksi. (2) **Nomor induk otomatis** `DD.MM.KODE-PT.NNN` (tanggal & bulan join, kode PT, urut berjalan per PT tanpa reset; mis. `25.11.ACP.023`), bisa diubah, unik. (3) Login & undangan memakai **email pribadi** (`employees.personal_email`). (4) Undangan lewat **antrean bertahap** (batas per jam Supabase) yang dipicu halaman HR + cron harian cadangan; kirim ulang tersedia. (5) Status `employees.onboarding_status`: belum diundang → diundang → mengisi → menunggu review ⇄ perlu revisi → disetujui / dibatalkan; sebelum disetujui calon **tidak tampil** di data karyawan aktif, dashboard, struktur, pilihan atasan, dan **akses dikunci ke onboarding** (ditegakkan API). (6) Calon mengisi wizard 7 langkah ber-draf: data pribadi wajib semua (NPWP/BPJS: nomor atau "belum punya"), kontak darurat, keluarga (pasangan bila menikah), rekening, pendidikan terakhir wajib (lainnya opsional), **dokumen inti wajib** (KTP, KK, ijazah, buku rekening; bucket private `employee-documents`); PTKP ditetapkan reviewer. (7) Reviewer **setujui / minta revisi (catatan per bagian) / batalkan**, tanpa mengedit isian calon; email + notifikasi tanpa data sensitif. (8) Batal → akun nonaktif, **hapus permanen setelah 30 hari** (bisa dipulihkan sebelumnya); undangan > 14 hari tanpa aktivasi → pengingat HR. (9) Karyawan **existing** tanpa akun diundang lewat mekanisme yang sama dan hanya melengkapi field wajib yang kosong. (10) Setelah disetujui → halaman **ESS** ("segera hadir"; diisi setelah Time Management). Hak: SA semua PT, HR_ADMIN PT ditugaskan (D-040). Desain: [design/onboarding-karyawan.md](./design/onboarding-karyawan.md). | Keputusan pemilik projek 2026-10-01 (grill 18 pertanyaan; semua opsi direkomendasikan dipilih, + langkah Konfirmasi Undangan & format nomor induk dari pemilik projek). |
| D-046 | **Pengecualian OD-6 saat onboarding (2026-10-01):** calon/karyawan boleh **menulis data sensitif & dokumen miliknya sendiri hanya** saat status onboarding "mengisi" atau "perlu revisi"; setelah dikirim terkunci, setelah disetujui terkunci permanen (perubahan berikutnya lewat HR, nanti lewat pengajuan perubahan di ESS). OD-6 untuk karyawan yang sudah disetujui **tetap terbuka**. Semua penulisan tercatat audit. **Rincian 2026-10-02 (bagian b, keputusan pemilik projek):** karyawan existing yang diundang melengkapi data (D-045 poin 9) **tidak dikunci** dari aplikasi (banner "Lengkapi data Anda") dan **hanya mengisi field yang masih kosong** — field/daftar yang sudah terisi (keluarga, rekening, pendidikan, dokumen lama) terkunci, koreksi lewat HR. | Keputusan pemilik projek; data harus diisi pemiliknya tetapi diverifikasi pihak lain. |
| D-047 | **Grant `employee.onboarding.review` (2026-10-01):** HR_ADMIN dengan grant ini (di PT yang ditugaskan, D-040) boleh melihat data sensitif & dokumen calon yang sedang onboarding dan memutuskan; SUPER_ADMIN selalu boleh. Grant `employee.personal.read`/`bank.read` tetap untuk karyawan yang sudah disetujui. Membuka halaman review = audit akses sensitif. | Keputusan pemilik projek; memisahkan hak verifikasi dari hak melihat seluruh data karyawan. |
| D-048 | **Login dengan Nomor Induk Karyawan (2026-10-01; istilah di layar **NIP** sejak 2026-10-07, D-059 — "NIK" hanya NIK KTP):** setelah data onboarding disetujui, akun yang tertaut karyawan login dengan **NIK internal + password aktivasi**; login email tidak berlaku lagi. Mekanisme: email user Supabase diganti ke **alamat turunan** `lower(nomor_induk)@<LOGIN_EMAIL_DOMAIN>` (domain `.invalid`, **per lingkungan** karena Auth staging dipakai bersama, D-023), sehingga web cukup memetakan NIK → alamat lalu login langsung ke Supabase (password tidak melewati API, D-033; tidak ada endpoint yang membocorkan email dari NIK). Ubah nomor induk → alamat ikut diperbarui. **Lupa password** lewat API: NIK/email → tautan *recovery* dikirim ke email pribadi, respons selalu sama. Akun tanpa data karyawan (mis. Super Admin Utama) tetap login email. Akun existing dipindah lewat script sekali jalan (izin per lingkungan). | Keputusan pemilik projek 2026-10-01 (mekanisme alamat turunan & cakupan semua akun bertautan karyawan dipilih dari opsi). |
| D-049 | **Kelola master data (Tahap 3, 2026-10-01):** (1) 6 master data — perusahaan, departemen (berhierarki), jabatan, status kepegawaian, grade, site/lokasi — dikelola **SUPER_ADMIN** di Administrasi › Master Data; **HR_ADMIN melihat** (daftar + jumlah karyawan, perusahaan sebatas cakupan D-040) dan tetap bisa menambah lewat import (D-042); MANAGER/EMPLOYEE hanya pilihan aktif (`/master-data`). (2) **Hapus permanen** hanya bila belum pernah dirujuk data mana pun (ditegakkan FK `RESTRICT` → 409); selain itu **arsip** (`deleted_at`): hilang dari pilihan form/import, nama tetap tampil di data & riwayat lama, bisa dipulihkan; item terarsip tidak bisa diubah (pulihkan dulu); nama unik termasuk arsip. (3) **Gabungkan** (kecuali perusahaan): karyawan & riwayat (jabatan/status) dipindah ke tujuan dalam satu transaksi lalu sumber diarsipkan; departemen: jabatan bernama sama digabung, lainnya & sub-departemen dipindah; tidak menambah baris riwayat kepegawaian (koreksi data, bukan mutasi). (4) Aturan: kode perusahaan terkunci setelah dipakai karyawan (nomor induk, D-045); perusahaan tidak bisa diarsipkan selama ada karyawan aktif; departemen tanpa siklus induk dan tidak bisa diarsipkan selama punya jabatan/sub-departemen aktif; status yang mewakili kategori tidak bisa diarsipkan/digabung (D-038). (5) Geofence lokasi diisi angka (latitude, longitude, radius ~~10~~ **1**–10.000 m *(minimal 1 m sejak 2026-10-05, permintaan pemilik projek)*; lengkap atau kosong); ~~pemilih peta di Fase 5~~ *(diganti 2026-10-01, permintaan pemilik projek: pemilih peta **Leaflet + tile OpenStreetMap** sekarang — klik/geser pin, lingkaran radius, "Pakai lokasi saya" (GPS browser), cari tempat via Nominatim hanya saat tombol Cari ditekan (maks 1/detik, hanya teks pencarian dikirim); dimuat lazy di dialog lokasi; tile OSM hanya untuk halaman admin — absensi karyawan (Fase 5) memakai penyedia tile sendiri)*. (6) Organization tidak membaca tabel employee: jumlah karyawan & pemindahan rujukan disuntik dari employee lewat `configureOrganization` (app.ts). (7) Dampak: ubah karyawan hanya memvalidasi rujukan yang **berubah**; import menandai nama terarsip sebagai error baris `MASTER_ARCHIVED` dan baris "perbarui" hanya menyumbang master data dari field yang berubah; dialog "Atur PT" melepas PT terarsip. Kalender libur & pengaturan sistem dipindah ke Fase 5. | Keputusan pemilik projek 2026-10-01 (hapus-atau-arsip, gabungkan, geofence angka dipilih dari opsi); aturan (4)–(7) konsekuensi desain dalam rencana Tahap 3 yang disetujui. |
| D-050 | **Unit organisasi berjenjang & level jabatan (2026-10-02, dari org chart site ACP):** (1) Tabel `organization.departments` menyimpan **semua unit organisasi** (nama tabel & API `/departments` tetap) dengan kolom `unit_type`: **Direktorat, Divisi, Departemen, Seksi** (data lama = Departemen). (2) Induk opsional; bila diisi harus sah: Direktorat ⊂ Direktorat, Divisi ⊂ Direktorat, **Departemen ⊂ Direktorat atau Divisi** (boleh tanpa divisi), Seksi ⊂ Divisi atau Departemen; mengubah jenis ditolak bila induk/sub-unit jadi tidak sah; gabungkan hanya antar unit sejenis. (3) **Jabatan boleh menempel di unit jenis apa pun** — jabatan direksi (Direktur, Sekretaris, Admin Generalist) cukup di unit Direktorat, tanpa "jabatan khusus". (4) `positions.level` opsional: Direksi, GM/VP, Manager, Superintendent, Supervisor, Foreman, Staf/Operator, Helper/Non-staf — untuk urutan bagan & laporan; **berbeda dari Grade** (golongan, D-026). (5) Berlaku untuk **seluruh grup** (D-039), bukan per PT. (6) Di layar: "Unit organisasi" (Master Data, form/filter/detail karyawan, dashboard); Struktur Organisasi menampilkan jenis unit & urut jabatan menurut level. (7) Di luar cakupan (Backlog): atasan fungsional (garis putus-putus), slot posisi kosong/headcount, unit per PT. | Keputusan pemilik projek 2026-10-01 (model unit berhierarki + jenis, seluruh grup, level opsional dipilih dari opsi), menggantikan usulan "jabatan khusus tanpa departemen". |
| D-051 | **Bagan organisasi berbasis pos jabatan (2026-10-05, grill pemilik projek; desain [org-chart.md](design/org-chart.md)):** (1) Tabel baru `organization.org_posts` = **kursi** di bagan (job vs position): jabatan (master, katalog nama — tidak berubah), atasan pos (garis tegas), atasan fungsional (garis putus-putus), jumlah slot 1–50 (slot tanpa pemegang = **Vacant/Kosong**), urutan, kode stabil opsional. Satu jabatan boleh banyak pos. (2) Karyawan menempati pos lewat `employees.org_post_id`; jabatan karyawan = jabatan pos; slot penuh ditolak; nonaktif → slot dilepas. (3) Halaman Struktur Organisasi: **kanvas interaktif** `@xyflow/react` (geser/zoom dalam kanvas, lipat/buka cabang, cari → fokus, minimap, layar penuh, ekspor PNG), tampilan awal ringkas sampai tingkat ke-3; tata letak pohon tanpa pustaka (elkjs dilepas karena 512 kB gzip). (4) Klik orang: SA/HR detail karyawan; role lain **kartu profil kerja** (kolom direktori). (5) SA kelola di Master Data › Pos jabatan, HR lihat. (6) Seed = replika **bentuk** bagan kantor dengan nama fiktif; nama asli hanya DB lokal (`org:import-local`, file di luar repo). |
| D-052 | **Unit organisasi milik PT (2026-10-05):** `departments.company_id` (nullable): unit milik satu PT tampil di bagan PT itu; **unit tanpa PT = fungsi korporat grup** (panel "Corporate Function" di bagan semua PT; pemegangnya terlihat lintas PT). Garis tegas hanya dalam PT yang sama; garis fungsional boleh ke fungsi korporat. Unit di bawah induk ber-PT harus PT yang sama; jabatan unit PT lain tidak bisa dipakai karyawan PT ini. Nama unit tetap unik di seluruh grup (pencocokan nama import D-042). |
| D-053 | **Atasan langsung otomatis dari pos (2026-10-05):** `manager_id` = pemegang pos atasan terdekat ke atas yang **ber-akun MANAGER/SUPER_ADMIN aktif** (PLAN §4.1, dipakai approval Fase 5); pos kosong & pemegang tanpa akun Manager dilewati; pos berisi banyak orang → pemegang pertama (nomor induk). Dihitung ulang saat penempatan/pindah jabatan-PT, nonaktif, dan perubahan struktur pos; perubahan role akun → tombol/endpoint **Sinkronkan atasan** (SA). `employees.manager_override = true` = atasan diatur manual (tidak disentuh sinkron). |
| D-054 | **Arsip karyawan & perubahan data milik sendiri (2026-10-05, grill; menjawab OD-6; desain [arsip-karyawan.md](design/arsip-karyawan.md)):** (1) Menu Arsip = tabel lintas karyawan per kategori + tab yang sama di detail karyawan (satu sumber data). (2) Setelah disetujui, karyawan mengubah data dirinya (keluarga, pendidikan, pelatihan, riwayat kerja, rekening, dokumen, data pribadi) **lewat pengajuan** (`data_change_requests`) yang disetujui HR ber-grant (grant baru `employee.changes.review` + grant section sensitif); no. HP, domisili, kontak darurat, foto tetap langsung (§4.3). Berlaku juga untuk SUPER_ADMIN atas data dirinya (disetujui akun lain). (3) Rekening: pengajuan wajib buku tabungan; setiap perubahan rekening menotifikasi karyawan. (4) Urutan: gelombang 1 data yang tabelnya sudah ada, 2 Aset & SP, 3 Laporan. *(Dikodekan lokal: gelombang 1a–1c 2026-10-05; pengajuan = 1c.)* |
| D-055 | **Dokumen karyawan bermasa berlaku (2026-10-05, rencana):** jenis dokumen jadi master data `document_types` (dikelola SA: wajib per lingkup, masa berlaku, pengingat, siapa mengunggah, sensitif); dokumen berversi (versi lama tetap bisa dilihat), nomor & tanggal terbit/kedaluwarsa, status verifikasi; cron `document-expiry` mengingatkan karyawan & HR (60/30/7 hari bawaan); katalog awal termasuk SIMPER, SIO, sertifikat K3/POP/POM/POU, MCU. Pelatihan bisa melampirkan sertifikat yang tercatat di Data File. |
| D-056 | **Aset karyawan (2026-10-05, rencana):** modul baru `asset` (skema `asset`): kategori, inventaris (kode, merek/tipe, no. seri, kondisi, status, lokasi, PT), serah-terima & pengembalian dengan BAST; satu pemegang aktif per aset; saat karyawan dinonaktifkan sistem memperingatkan aset yang belum kembali. Grant baru `asset.manage`. |
| D-057 | **Surat peringatan (2026-10-05, rencana):** HR (grant `employee.discipline.write`) menerbitkan SP1/SP2/SP3 dengan nomor, pelanggaran, surat PDF dari template; berlaku **6 bulan** (PP 35/2021; dapat diubah SA bila PKB/PP perusahaan berbeda); atasan & karyawan mengonfirmasi; cron menandai kedaluwarsa; SP berikutnya menyarankan tingkat lanjut bila SP sebelumnya masih berlaku. Karyawan melihat SP sendiri, manajer melihat tim. |
| D-058 | **Ekspor, impor, cetak & laporan Arsip (2026-10-05; ekspor & cetak dikerjakan 2026-10-08 — gelombang 1d, impor per kategori **ditunda** sampai ada contoh file lama dari HR; ekspor = isi yang boleh dilihat aktor di layar, SA/HR saja, maks 10.000 baris):** ekspor Excel per kategori mengikuti filter (server, tidak disimpan, kolom sensitif hanya bila berhak, diaudit); impor massal memakai mesin D-042 (pratinjau, `previewHash`, laporan baris bermasalah, file tidak disimpan); kategori Arsip ikut Print data per karyawan; laporan awal: headcount & turnover, masa kerja, demografi, dokumen kedaluwarsa, kontrak & SP aktif, kelengkapan data, mutasi, ulang tahun, aset, antrean pengajuan. |
| D-059 | **Pendataan karyawan existing dari Google Form lewat Import (2026-10-07, grill pemilik projek; desain [pendataan-google-form.md](design/pendataan-google-form.md)):** (1) Karyawan existing yang belum ada di HRIS mengisi Google Form "Formulir Data Karyawan"; HR mengunduh Sheet respons (.xlsx) → menambah kolom data kerja (PT, status, jabatan, unit, tanggal masuk) → **Import Data Karyawan** (D-042: pemetaan, pratinjau, simpan satu transaksi). Tidak ada integrasi otomatis Form → HRIS. (2) Import ditambah email pribadi (unik), nama panggilan, kebangsaan, suku, golongan darah, jenis SIM (jamak, daftar baku) & no. SIM (kolom baru di `employee_personal`) serta deteksi kolom Sheet Form (kolom tautan, keluarga, akun Google, header ganda). (3) Foto & dokumen: lihat D-060. (4) Bagian berulang ikut Import (2026-10-07): keluarga (pasangan, anak 1–5, orang tua, saudara 1–5 → `family_members` + jenis kelamin/tempat lahir/pendidikan/pekerjaan/usia saat didata/alamat kerja), pendidikan 1–3 (+ tahun masuk), sertifikasi → Pelatihan + nomor sertifikat, alamat kontak darurat, No. SIM per jenis; kolom generik dikenali dari kolom penandanya; impor ulang = tambah yang belum ada; dropdown pemetaan berkelompok. (5) Jalur Apps Script → API (antrean review otomatis) sempat dibangun lalu **dihapus total** — terlalu banyak komponen untuk proses manual. | Keputusan pemilik projek 2026-10-07 (grill; jalur otomatis dibandingkan dengan Import lalu dibuang). |
| D-060 | **Lampiran Google Drive di Import (2026-10-08; desain [pendataan-google-form.md §4](design/pendataan-google-form.md#4-lampiran-google-drive-d-060)):** kolom unggahan Form (foto, KTP, KK, ijazah, NPWP, sertifikat, buku rekening) dipetakan ke field Import grup "Lampiran (Google Drive)". Simpan import mencatat **antrean** (`import_job_attachments`); setelah data tersimpan, layar Import memproses antrean bertahap (±20 dtk per panggilan, batas fungsi serverless): server mengunduh lewat **service account Google** (`drive.readonly`, hanya folder yang dibagikan ke email service account; env `GOOGLE_SERVICE_ACCOUNT_JSON`), mengompres (foto JPEG ≤ 1024 px; gambar dokumen besar dikecilkan; beberapa gambar → satu PDF; library JS murni), lalu menyimpan lewat layanan foto/dokumen yang sama dengan layar (hak tulis dokumen sensitif, cakupan PT, versi, audit tetap berlaku). **Sidik jari** SHA-256 file Drive: sama dengan lampiran yang sudah masuk → dilewati; berbeda → versi dokumen baru (foto: diganti). Jenis bermasa berlaku (POP/POM/POU) dan HEIC/WebP dilewati dengan alasan (unggah manual). Excel tetap diurai di browser (D-042). Menggantikan script rclone yang sempat dibuat (dihapus). | Keputusan pemilik projek 2026-10-08 (dibandingkan dengan script rclone; hybrid sidik jari dipilih untuk impor ulang). |
| D-061 | **Import Form versi 171 kolom (2026-10-08; desain [pendataan-google-form.md §5](design/pendataan-google-form.md#5-form-versi-baru-171-kolom-d-061)):** Form direvisi di tengah pengisian sehingga Sheet respons memuat pertanyaan versi lama & baru (judul kembar berakhiran " 2", judul berdeskripsi setelah baris baru). Import (1) mencocokkan **judul pertanyaan** (baris pertama, tanpa akhiran kembar) dan memetakan kolom versi lama & baru ke field yang sama — **nilai pertama yang terisi dipakai** (badge "Digabung"); (2) field baru: **rincian alamat** kelurahan/kecamatan/kab-kota/provinsi untuk domisili & KTP (set pertama = domisili, set kedua = KTP) disimpan sebagai **teks isian** (kode wilayah resmi Kemendagri = tahap berikutnya, expand-only, Backlog), **kontak darurat ke-2** (tetap 2 kontak), status hubungan saudara (Kakak/Adik), pekerjaan anak, file SIM A/C — semua data pribadi (grant `employee.personal.*`); (3) **Divisi** dicocokkan **persis** (tanpa peka huruf besar/spasi) ke unit berjenis DIVISION (D-050), tidak disimpan di karyawan dan tidak dibuat otomatis: departemen yang ada harus di bawah divisi itu, departemen baru ditempatkan di bawahnya (PT ikut divisi), selain itu error baris; (4) jenis dokumen **SIM tanpa masa berlaku** (masa berlaku tanggung jawab pemegang; Form tidak menanyakannya) sehingga file SIM dari Form ikut diimpor; (5) kolom unggahan berjudul Form tetap lampiran walau sebagian sel berisi nama file (peringatan per baris) atau kolomnya kosong, kecuali judulnya persis nama field data ("NPWP" = nomor). Migrasi `20261008085810_add_form_v2_address_emergency2_relation` (hanya menambah + UPDATE data jenis SIM). | Keputusan pemilik projek 2026-10-08 (Divisi: dicocokkan bila akurat; kontak darurat cukup 2; alamat opsi C teks dulu; SIM tanpa masa berlaku). |
| D-062 | **Status kepegawaian bawaan & per baris di Import (2026-10-09, pilihan pemilik projek opsi B):** Import Data Karyawan juga dipakai untuk karyawan lama yang belum ada di sistem (Sheet Google Form tidak menanyakan status kepegawaian); rekrutan baru tetap lewat Penerimaan (D-045) — tidak ada pilihan "karyawan lama/baru". Untuk baris yang **belum ada di sistem**, status ditentukan: (1) pilihan per baris di Pratinjau (`employmentStatusOverrides`, nomor baris → id status) > (2) kolom status di file > (3) **status bawaan** (`defaultEmploymentStatusId`, dipilih di langkah Unggah atau di Pratinjau). Karyawan yang sudah ada hanya berubah status lewat kolom file. Status tidak ditemukan/diarsipkan → error baris `STATUS_INVALID`. Pesan "wajib untuk karyawan baru" diganti "untuk karyawan yang belum ada di sistem". Sekaligus: dropdown pemetaan kolom diganti pemilih ringan yang daftar pilihannya baru dipasang saat dibuka (`components/lazy-select.tsx`) — Radix Select memasang semua item walau tertutup sehingga file 171 kolom × ±200 field membuat halaman tersendat. |

Keputusan baru ditambahkan dengan ID berikutnya **dan** dicatat di log PROGRESS.

---

## 9. Keputusan Terbuka

| ID   | Pertanyaan | Rekomendasi | Harus terjawab sebelum |
|---|---|---|---|
| OD-1 | Metode PPh 21: **gross**, **gross-up**, atau **net**? | Ikuti kebijakan kantor saat ini (tanyakan HR/finance). | Fase 8 |
| OD-2 | Apakah **THR** dihitung sistem (termasuk proporsional masa kerja < 12 bulan) sebagai payroll run khusus? | Ya; THR wajib hukum dan rumusnya jelas. | Fase 8 |
| OD-3 | Siapa (HR/finance/konsultan pajak) yang **memverifikasi golden cases** payroll? | Wajib ada. Tanpa ini payroll tidak boleh rilis. | Fase 8 |
| OD-4 | **Kepemilikan akun** Vercel & Supabase dan **paket berbayar** (Vercel Pro)? | Akun/team milik kantor, berbayar sebelum ada data asli. | Rilis 1 |
| OD-5 | Penyedia sudah diputuskan (Google Workspace, D-025). Staging memakai Gmail `admin.arthasia@gmail.com` (D-032). Sisa pertanyaan (untuk produksi): **akun pengirim** mana yang dipakai, dan apakah admin Workspace kantor mengizinkan App Password untuk akun itu? Staging & produksi memakai akun yang sama atau berbeda? | Akun khusus (bukan akun pribadi karyawan), mis. `hris@<domain-kantor>`, dibuat oleh admin IT; satu akun untuk staging & produksi. | Sebelum uji undangan Fase 2 |
| OD-6 | ~~Bolehkan seseorang mengubah data sensitif/gaji miliknya sendiri setelah disetujui?~~ **Terjawab 2026-10-05 → D-054** (lewat pengajuan yang disetujui akun lain/HR ber-grant; gaji tetap hanya SA dan bukan bagian pengajuan). | – | – |
| OD-8 | **Strategi rollback migrasi & backup produksi** (Prisma tidak punya migrasi turun). | Migrasi *expand → contract* yang kompatibel mundur + perbaikan maju; backup harian Supabase, PITR bila paket memungkinkan (terkait OD-4). | Rilis 1 |
| OD-9 | **Proteksi branch `main`** (§6) ditolak GitHub: organisasi `ArthasiaCiptaPratama` memakai paket **Free**, dan branch protection/rulesets untuk repo **private** butuh **GitHub Team**. GitHub Pro milik akun pribadi pemilik projek tidak berlaku untuk repo milik organisasi (dicoba ulang 2026-09-28: tetap 403). Pilihan: upgrade organisasi ke Team, jadikan repo public (tidak disarankan: kode HRIS internal), atau sementara hanya disiplin alur (tanpa penegakan). | Upgrade ke GitHub Team (bisa diputuskan bersama OD-4). Sampai itu, `main` hanya dijaga disiplin: tidak push langsung, merge lewat PR yang di-review. | Rilis 1 |
| OD-11 | **Masa simpan data karyawan yang sudah keluar** (dokumen kepegawaian, pajak, identitas, kesehatan) & kapan dianonimkan/dihapus (UU PDP). | Usulan: kepegawaian & pajak 10 tahun setelah keluar, identitas/kesehatan 5 tahun, lalu anonimisasi terjadwal dengan laporan pra-eksekusi; putuskan bersama HR/legal. Sampai diputuskan: tidak ada penghapusan otomatis. | Gelombang Arsip 1 rilis produksi |

Jika sebuah OD diputuskan: pindahkan ke §8 sebagai `D-xxx` dan catat di log PROGRESS.

---

## 10. Risiko & Mitigasi

| Risiko | Mitigasi |
|---|---|
| Batas modul bocor seiring waktu | dependency-cruiser di CI; review PR memeriksa import lintas modul. |
| Salah hitung payroll tanpa periode paralel | Golden cases terverifikasi pihak luar (OD-3), TDD, perhitungan deterministik, snapshot. |
| Hanya SUPER_ADMIN yang memegang gaji (tidak ada maker–checker) | Diterima untuk skala ini; semua aksi payroll diaudit; dianjurkan > 1 SUPER_ADMIN. |
| Bun runtime Vercel masih beta | Tanpa API khusus Vercel di logika bisnis; `Dockerfile` api siap untuk pindah host. |
| Batas koneksi database dari serverless | Transaction pooler Supabase + pool kecil per instance. |
| Development bergantung pada Supabase staging (D-023): internet, dan project Free di-pause setelah ± 7 hari tidak aktif | Staging dipakai rutin; jika ter-pause, pulihkan dari dashboard. Pertimbangkan staging di paket berbayar saat OD-4 diputuskan. Test otomatis tidak bergantung pada staging. |
| Batas kirim Google Workspace (± 2.000 email/hari per akun; cek ulang) terlampaui, atau akun pengirim dikunci Google | Email aplikasi lokal hanya ke log; tidak ada email massal; tidak mengirim ke alamat fiktif; `email_outbox` + cron `email-retry` menampung email gagal; pindah ke SMTP relay Workspace bila perlu. |
| Pelanggaran ToS Vercel Hobby untuk penggunaan komersial | Pindah ke team kantor berpaket berbayar sebelum data asli (OD-4). |
| Kebocoran data pribadi (UU No. 27/2022 PDP) | RBAC + grant, audit log, bucket private, email tanpa data sensitif, tidak log PII, retensi selfie. |
| Perbedaan Linux vs Windows (dual boot) | `.gitattributes` LF, script via Bun (bukan bash), verifikasi di kedua OS di Fase 1. |
| GPS palsu (fake GPS) | Diterima di v1; selfie sebagai bukti tambahan; bisa diperketat di mobile app. |
| Scope creep | Ide baru masuk Backlog PROGRESS, tidak dikerjakan di luar fase aktif. |
