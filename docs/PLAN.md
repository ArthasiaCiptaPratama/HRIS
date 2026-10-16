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
| Dasar         | Sesi grill 2026-09-25 (keputusan D-001 s.d. D-022), revisi 2026-09-28 (D-023 s.d. D-034), 2026-09-29 (D-035 s.d. D-037), 2026-09-30 (D-038 s.d. D-042), 2026-10-01 (D-043 s.d. D-049), 2026-10-02 (D-050), 2026-10-05 (D-051 s.d. D-058), 2026-10-07 (D-059), 2026-10-08 (D-060, D-061), 2026-10-09 (D-062 s.d. D-064) |
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
5. **Siap untuk aplikasi mobile.** Absensi & pengajuan dari HP memakai **PWA** di web yang sama (D-067); aplikasi native (projek terpisah, API yang sama) tetap backlog.

### 1.2 Modul (Ruang Lingkup v1)

| Modul          | Ringkasan                                                                                             |
| -------------- | ----------------------------------------------------------------------------------------------------- |
| `iam`          | Akun (terhubung ke Supabase Auth), role, Super Admin Utama, grant izin per akun.                      |
| `organization` | Perusahaan dalam grup (entitas, D-039), profil perusahaan, pengaturan sistem, departemen, jabatan, status kepegawaian, grade, lokasi kerja (geofence), hari libur. |
| `employee`     | Data induk karyawan, atasan langsung (`manager_id`), data sensitif, rekening, keluarga, pendidikan, pelatihan, dokumen, kontak darurat, riwayat, import CSV/Excel. |
| `attendance`   | Shift, **roster tambang** (pola siklus, crew, grid, import, tukar shift — D-069), absen PWA (geofence + selfie + waktu server), approval setiap hari absen (D-068), koreksi absensi, lembur, penutupan periode absensi + surat pernyataan (D-071). |
| `leave`        | Cuti tahunan (jatah Januari + prorata, sisa s.d. 31 Maret, hutang cuti — D-072, hold) dan izin/sakit (melahirkan, menikah, duka, sakit, dll.). |
| `approval`     | Mesin approval paralel yang dipakai attendance dan leave.                                             |
| `contract`     | Jenis kontrak, kontrak kerja, perpanjangan, terminasi, pengingat habis kontrak.                       |
| `payroll`      | Komponen & struktur gaji, periode, BPJS, PPh 21 (TER), lock, slip gaji.                               |
| `notification` | Notifikasi in-app dan email.                                                                          |
| `audit` (core) | Audit log untuk semua aksi sensitif.                                                                  |

### 1.3 Di Luar Ruang Lingkup v1 (Backlog)
- Aplikasi mobile **native** (projek terpisah; backend v1 sudah menyiapkan API-nya). Absensi dari HP v1 = PWA (D-067).
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
- **Staging (D-036):** project `hris-staging-api` & `hris-staging-web` di team Vercel **Pro "Arthasia Akselerasi"** (FND-D1, pindah 2026-10-16 dari akun pribadi `oatse` Hobby), dideploy oleh GitHub Actions lewat Vercel CLI setelah migrasi. Api dibundel `bun build` (`hono` external) ke `apps/api/dist/index.js` sebelum diunggah; builder Vercel tidak mengompilasi TS per file.
- Paket Vercel **Hobby hanya untuk non-komersial**. Sebelum ada data karyawan sungguhan, projek harus berada di **akun/team milik kantor dengan paket berbayar** (lihat OD-4). ✔ Vercel sudah di team Pro kantor (FND-D1); Supabase produksi masih menunggu OD-4.

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
| `asset.manage`                   | Kelola aset per unit & pembagian APD di PT yang ditugaskan: tambah/ubah aset, serah-terima, pengembalian, tandai hilang, BAST, harga aset (ARS-D3) | HR_ADMIN              |
| `employee.discipline.read`       | Lihat surat peringatan karyawan di PT yang ditugaskan (aktif + riwayat; tanpa draft) termasuk scan `WARNING_LETTER` (ARS-D13/D14) | HR_ADMIN              |
| `employee.discipline.write`      | Buat, terbitkan & cabut surat peringatan, unggah scan, kelola jenis pelanggaran di PT yang ditugaskan (ARS-D10/D14) | HR_ADMIN              |

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
| Template shift & jam kerja, toleransi telat | ✅ | ✅ PT ditugaskan (D-069) | 👁 | ❌ |
| Pola roster, crew & anggota, grid roster, import Excel roster (D-069) | ✅ | ✅ PT ditugaskan | 👁 tim | 👁 roster sendiri |
| Master Cuti per tahun (kuota) (D-072) | ✅ | 👁 | 👁 | 👁 |
| Jenis cuti/izin, kuota, akrual, carry-over | ✅ | 👁 | 👁 | 👁 |
| Aturan lembur | ✅ | 👁 | 👁 | 👁 |
| Definisi komponen gaji, tarif BPJS/PPh 21/PTKP | ✅ | ❌ | ❌ | ❌ |
| **Karyawan** | | | | |
| Direktori (nama, jabatan, departemen, email kantor) | ✅ | ✅ | 👁 | 👁 |
| Dashboard agregat karyawan (jumlah per kategori, lokasi, departemen, jabatan, tahun masuk, pendidikan; pivot bebas atur D-065; tanpa data per orang) | ✅ semua PT | ✅ PT ditugaskan (D-040) | ❌ (sapaan) | ❌ (sapaan) |
| Pivot dashboard dimensi pribadi (agama, status nikah, umur — jumlah saja, D-065) | ✅ | 🔑 `employee.personal.read` | ❌ | ❌ |
| Susunan widget Dashboard milik sendiri (D-065) | ✅ | ✅ | ❌ | ❌ |
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
| Lihat aset & pembagian APD (ARS-D3) | ✅ | ✅ PT sendiri (harga hanya ber-grant) | 👁 tim, tanpa harga | 👁 milik sendiri, tanpa harga |
| Kelola aset, serah-terima, pengembalian, APD, BAST (ARS-D3) | ✅ | 🔑 `asset.manage` (PT sendiri) | ❌ | ✅ konfirmasi terima milik sendiri |
| Lihat surat peringatan (aktif + riwayat; draft hanya penulis) (ARS-D13) | ✅ | 🔑 `employee.discipline.read`/`.write` (PT sendiri) | 👁 tim (tanpa alasan eskalasi & bukti) | 👁 milik sendiri |
| Buat, terbitkan, cabut SP; jenis pelanggaran (ARS-D10/D12) | ✅ (+ masa berlaku bawaan, ARS-D8) | 🔑 `employee.discipline.write` (PT sendiri) | ✅ "Sudah disampaikan" (tim) | ✅ "Sudah menerima" milik sendiri |
| Isi data pribadi, keluarga, rekening, pendidikan & dokumen **milik sendiri** saat onboarding (D-046) | – | – | – | ✅ hanya saat status mengisi / perlu revisi |
| Laporan (headcount & turnover, dokumen kedaluwarsa, kelengkapan data, SP aktif; ekspor Excel) (ARS-D16) | ✅ | ✅ PT ditugaskan (daftar per orang jenis sensitif butuh grant terkait) | ❌ | ❌ |
| **Kontrak** | | | | |
| Kelola kontrak & lihat kontrak akan habis | ✅ | 🔑 | ❌ | ❌ |
| Lihat kontrak sendiri | ✅ | ✅ | ✅ | ✅ |
| **Absensi** | | | | |
| Absen (clock-in/out) | ✅* | ✅ | ✅ | ✅ |
| Lihat absensi & foto selfie | ✅ semua | ✅ semua | 👁 tim | 👁 sendiri |
| Tugaskan shift/jadwal ke karyawan | ✅ | ✅ | ✅ tim | ❌ |
| Tandai "boleh absen di luar lokasi" | ✅ | ✅ | ❌ | ❌ |
| Keputusan hari absen (masuk + pulang) (D-068) | override | ✅ (paralel) | ✅ tim (paralel) | ❌ |
| Ajukan perubahan / tukar shift roster (D-069) | ✅* | ✅ | ✅ (sendiri & atas nama tim) | ✅ sendiri |
| Keputusan perubahan / tukar shift (D-069) | override | ✅ | ✅ tim | ✅ persetujuan rekan yang ditukar |
| Surat pernyataan absensi untuk hari ALPHA (D-071) | 👁 semua | 👁 | 👁 tim | ✅ buat sendiri |
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
| **Hari absen** (masuk + pulang, D-068) | MANAGER + HR_ADMIN (persetujuan massal)  | **Paralel**  |
| **Perubahan / tukar shift roster** (D-069) | MANAGER + HR_ADMIN (rekan yang ditukar setuju lebih dulu) | **Paralel** |
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
- Saldo cuti tahunan **di-hold** saat pengajuan dibuat, lalu dikembalikan jika ditolak atau dibatalkan, dan menjadi terpakai jika disetujui. ~~Saldo tidak boleh negatif.~~ **Hutang cuti diperbolehkan** dan dilunasi akhir Januari dari jatah baru (D-072).
- Jatah diberikan **1 Januari** (karyawan baru: prorata 1 hari per bulan kerja penuh); sisa tahun lalu hangus **31 Maret** (D-072).
- Hari cuti dihitung dalam **hari kerja roster** (hari OFF roster, tanggal merah, dan cuti bersama tidak dihitung; cuti bersama yang jatuh pada hari kerja roster dan tidak masuk = 1 hari cuti) (D-072).

### 5.4 Absensi
- Absen lewat **PWA** di HP (route `/absen` di web yang sama, D-067); aplikasi native nanti memakai API yang sama. **Wajib online.** Masuk & pulang sama-sama selfie + GPS.
- Absen mengikuti **roster** (D-069); absen di luar roster/radius **tetap tercatat dengan label + alasan wajib** (D-070). **Setiap hari absen disetujui MANAGER + HR** (D-068). Saat tutup periode, hari yang belum disetujui keduanya = **ALPHA** + surat pernyataan absensi (D-071). Desain: [time-management.md](features/time-management/design.md).
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
- Fitur **import CSV/Excel** disediakan untuk data karyawan dan saldo cuti (untuk migrasi data asli nanti). Desain import karyawan: D-042 dan [docs/features/import-karyawan/design.md](features/import-karyawan/design.md).
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
| 5 | Attendance | Tahap A–D & F [time-management.md](features/time-management/design.md): approval, roster tambang (D-069), absen PWA (D-067, D-070), approval hari absen (D-068), koreksi, lembur, rekap, tutup periode + surat pernyataan (D-071), retensi selfie | Rekap bulanan akurat untuk skenario roster (termasuk shift malam), libur & cuti (teruji) |
| 6 | Leave | Tahap E: cuti tahunan (jatah Januari + prorata, sisa s.d. 31 Maret, hutang, hold — D-072), izin & sakit, approval paralel, integrasi roster | Skenario saldo (prorata, hangus, hutang, cuti bersama) & approve/tolak/batal benar (teruji) |
| — | **Rilis 1** | Fase 1–6 ke produksi | Setelah OD-4 & OD-5 terjawab |
| 7 | Contract | Jenis kontrak, kontrak, perpanjangan, terminasi, pengingat habis | Aturan 1 kontrak aktif per karyawan, overlap, perpanjangan teruji |
| — | **Rilis 2** | Kontrak ke produksi | – |
| 8 | Payroll | Konfigurasi tarif, komponen, struktur gaji, periode, BPJS, PPh 21 TER, lock, slip | Semua **golden cases** terverifikasi lulus; periode lock tidak bisa diubah |
| 9 | Hardening | E2E Playwright alur utama, review keamanan, performa, cron & retensi, runbook | Checklist keamanan lulus |
| — | **Rilis 3** | Payroll ke produksi | Setelah OD-1, OD-2, OD-3 terjawab dan fase 9 selesai |

---

## 8. Keputusan (ADR Ringkas)

Isi lengkap D-001–D-073 (alasan, rincian, riwayat penggantian): **[decisions.md](decisions.md)**. Tabel di bawah hanya indeks. Keputusan baru ditulis di README fitur dengan prefix (`TM-D1`, `ARS-D1`; lintas fitur `X-D1`) lalu ditambahkan ke indeks ini saat digabung ke develop ([PROMPT §12](PROMPT.md#12-mencatat-keputusan)).

| ID | Keputusan | Fitur |
|---|---|---|
| [D-001](decisions.md#d-001) | Modular monolith | lintas |
| [D-002](decisions.md#d-002) | Single company (diganti D-039) | lintas |
| [D-003](decisions.md#d-003) | Prisma 7 satu-satunya ORM | [FND](features/fondasi/README.md) |
| [D-004](decisions.md#d-004) | Satu skema Postgres per modul; lintas modul via index.ts | lintas |
| [D-005](decisions.md#d-005) | Supabase DB + Auth + Storage; modul iam | [FND](features/fondasi/README.md) |
| [D-006](decisions.md#d-006) | Akun dari undangan, tanpa self sign-up | [IAM](features/iam/README.md) |
| [D-007](decisions.md#d-007) | Role tetap SA/HR/MGR/EMP (sebagian diganti D-028) | [IAM](features/iam/README.md) |
| [D-008](decisions.md#d-008) | Role & grant dicek dari DB tiap request | [IAM](features/iam/README.md) |
| [D-009](decisions.md#d-009) | Tim MANAGER = bawahan langsung | [IAM](features/iam/README.md) |
| [D-010](decisions.md#d-010) | Approval paralel MANAGER + HR | [TM](features/time-management/README.md) |
| [D-011](decisions.md#d-011) | Gaji hanya SA; HR ber-grant tutup periode absensi | [PAY](features/payroll/README.md) |
| [D-012](decisions.md#d-012) | BPJS + PPh 21 TER otomatis, tarif dari tabel | [PAY](features/payroll/README.md) |
| [D-013](decisions.md#d-013) | Absensi geofence + selfie + waktu server | [TM](features/time-management/README.md) |
| [D-014](decisions.md#d-014) | TypeScript di seluruh kode | lintas |
| [D-015](decisions.md#d-015) | Stack frontend React + Vite | [FND](features/fondasi/README.md) |
| [D-016](decisions.md#d-016) | Vercel web & api; Docker lokal | [FND](features/fondasi/README.md) |
| [D-017](decisions.md#d-017) | Monorepo apps/web, apps/api, packages/shared | [FND](features/fondasi/README.md) |
| [D-018](decisions.md#d-018) | Strategi testing; TDD akses & payroll | lintas |
| [D-019](decisions.md#d-019) | Alur Git debug/database → debug/fe-be → main | [FND](features/fondasi/README.md) |
| [D-020](decisions.md#d-020) | Rilis bertahap (3 rilis) | lintas |
| [D-021](decisions.md#d-021) | Notifikasi in-app + email tanpa data sensitif | [IAM](features/iam/README.md) |
| [D-022](decisions.md#d-022) | Import CSV/Excel karyawan & saldo cuti | [IMP](features/import-karyawan/README.md) |
| [D-023](decisions.md#d-023) | PostgreSQL lokal di Docker | [FND](features/fondasi/README.md) |
| [D-024](decisions.md#d-024) | Email lewat Resend (diganti D-025) | [IAM](features/iam/README.md) |
| [D-025](decisions.md#d-025) | Email lewat SMTP Google Workspace | [IAM](features/iam/README.md) |
| [D-026](decisions.md#d-026) | ERD employee management jadi model data | [EMP](features/karyawan/README.md) |
| [D-027](decisions.md#d-027) | Target mingguan bertahap | lintas |
| [D-028](decisions.md#d-028) | Satu akun satu role | [IAM](features/iam/README.md) |
| [D-029](decisions.md#d-029) | Project Supabase staging | [FND](features/fondasi/README.md) |
| [D-030](decisions.md#d-030) | db:deploy otomatis dari GitHub Actions | [FND](features/fondasi/README.md) |
| [D-031](decisions.md#d-031) | Pengirim email sementara (diganti D-032) | [IAM](features/iam/README.md) |
| [D-032](decisions.md#d-032) | Pengirim email staging admin.arthasia | [IAM](features/iam/README.md) |
| [D-033](decisions.md#d-033) | Konfirmasi password serah-terima Utama | [IAM](features/iam/README.md) |
| [D-034](decisions.md#d-034) | Aturan kelola akun | [IAM](features/iam/README.md) |
| [D-035](decisions.md#d-035) | Personal Management web lebih awal | [EMP](features/karyawan/README.md) |
| [D-036](decisions.md#d-036) | Staging di Vercel | [FND](features/fondasi/README.md) |
| [D-037](decisions.md#d-037) | Foto profil pegawai | [EMP](features/karyawan/README.md) |
| [D-038](decisions.md#d-038) | Kategori & pengelompokan Data Karyawan Aktif | [EMP](features/karyawan/README.md) |
| [D-039](decisions.md#d-039) | Satu sistem, banyak entitas (multi-PT) | [ORG](features/organisasi/README.md) |
| [D-040](decisions.md#d-040) | Akses per perusahaan (account_companies) | [IAM](features/iam/README.md) |
| [D-041](decisions.md#d-041) | Kolom data karyawan tambahan | [EMP](features/karyawan/README.md) |
| [D-042](decisions.md#d-042) | Import karyawan CSV/Excel | [IMP](features/import-karyawan/README.md) |
| [D-043](decisions.md#d-043) | Dua jalur kerja develop & rilis | [FND](features/fondasi/README.md) |
| [D-044](decisions.md#d-044) | Nama aplikasi Akselerasi Arthasia | [FND](features/fondasi/README.md) |
| [D-045](decisions.md#d-045) | Onboarding karyawan baru | [ONB](features/onboarding/README.md) |
| [D-046](decisions.md#d-046) | Pengecualian OD-6 saat onboarding | [ONB](features/onboarding/README.md) |
| [D-047](decisions.md#d-047) | Grant employee.onboarding.review | [ONB](features/onboarding/README.md) |
| [D-048](decisions.md#d-048) | Login dengan nomor induk (NIP) | [ONB](features/onboarding/README.md) |
| [D-049](decisions.md#d-049) | Kelola 6 master data | [ORG](features/organisasi/README.md) |
| [D-050](decisions.md#d-050) | Unit organisasi berjenjang & level jabatan | [ORG](features/organisasi/README.md) |
| [D-051](decisions.md#d-051) | Bagan organisasi berbasis pos jabatan | [ORG](features/organisasi/README.md) |
| [D-052](decisions.md#d-052) | Unit organisasi milik PT | [ORG](features/organisasi/README.md) |
| [D-053](decisions.md#d-053) | Atasan langsung otomatis dari pos | [ORG](features/organisasi/README.md) |
| [D-054](decisions.md#d-054) | Arsip karyawan & perubahan data milik sendiri | [ARS](features/arsip/README.md) |
| [D-055](decisions.md#d-055) | Dokumen karyawan bermasa berlaku | [ARS](features/arsip/README.md) |
| [D-056](decisions.md#d-056) | Aset karyawan (rencana) | [ARS](features/arsip/README.md) |
| [D-057](decisions.md#d-057) | Surat peringatan (rencana) | [ARS](features/arsip/README.md) |
| [D-058](decisions.md#d-058) | Ekspor, impor, cetak & laporan Arsip | [ARS](features/arsip/README.md) |
| [D-059](decisions.md#d-059) | Pendataan karyawan existing dari Google Form | [IMP](features/import-karyawan/README.md) |
| [D-060](decisions.md#d-060) | Lampiran Google Drive di Import | [IMP](features/import-karyawan/README.md) |
| [D-061](decisions.md#d-061) | Import Form versi 171 kolom | [IMP](features/import-karyawan/README.md) |
| [D-062](decisions.md#d-062) | Status kepegawaian bawaan & per baris di Import | [IMP](features/import-karyawan/README.md) |
| [D-063](decisions.md#d-063) | NIP boleh kosong | [IMP](features/import-karyawan/README.md) |
| [D-064](decisions.md#d-064) | Penyesuaian nilai Form saat Import | [IMP](features/import-karyawan/README.md) |
| [D-065](decisions.md#d-065) | Dashboard SA/HR yang bisa diatur | [DSB](features/dashboard/README.md) |
| [D-066](decisions.md#d-066) | Nama asli bagan organisasi di staging | [ORG](features/organisasi/README.md) |
| [D-067](decisions.md#d-067) | Absensi dari HP lewat PWA | [TM](features/time-management/README.md) |
| [D-068](decisions.md#d-068) | Setiap hari absen disetujui MANAGER + HR | [TM](features/time-management/README.md) |
| [D-069](decisions.md#d-069) | Roster tambang | [TM](features/time-management/README.md) |
| [D-070](decisions.md#d-070) | Validasi absen tidak memblokir | [TM](features/time-management/README.md) |
| [D-071](decisions.md#d-071) | Tutup periode → ALPHA + surat pernyataan | [TM](features/time-management/README.md) |
| [D-072](decisions.md#d-072) | Aturan cuti tahunan | [TM](features/time-management/README.md) |
| [D-073](decisions.md#d-073) | Approval per absen + cegah salah pencet + absen manual | [TM](features/time-management/README.md) |

### Keputusan baru (berprefix fitur)

| ID | Keputusan | Fitur |
|---|---|---|
| [ARS-D1](features/arsip/README.md#keputusan) | Aset per unit + APD berbasis jumlah (pembagian, tanpa stok) | [ARS](features/arsip/README.md) |
| [ARS-D2](features/arsip/README.md#keputusan) | BAST PDF otomatis + scan bertanda tangan + konfirmasi terima di Layanan Mandiri | [ARS](features/arsip/README.md) |
| [ARS-D3](features/arsip/README.md#keputusan) | Akses aset: SA + HR ber-grant `asset.manage`; MANAGER tim & karyawan sendiri lihat tanpa harga | [ARS](features/arsip/README.md) |
| [ARS-D4](features/arsip/README.md#keputusan) | Kode aset otomatis `<PT>-<KATEGORI>-<NNNN>`, boleh diganti; harga & tanggal beli opsional | [ARS](features/arsip/README.md) |
| [ARS-D5](features/arsip/README.md#keputusan) | Jatuh tempo pinjaman & masa ganti APD + cron harian `asset-daily` | [ARS](features/arsip/README.md) |
| [ARS-D6](features/arsip/README.md#keputusan) | Karyawan keluar: peringatan aset terbuka, tidak memblokir; daftar belum kembali + notifikasi | [ARS](features/arsip/README.md) |
| [ARS-D7](features/arsip/README.md#keputusan) | Surat SP = template sistem (PDF) + scan bertanda tangan sebagai dokumen `WARNING_LETTER` | [ARS](features/arsip/README.md) |
| [ARS-D8](features/arsip/README.md#keputusan) | Masa berlaku SP bawaan 6 bulan (diubah SA); cron menandai kedaluwarsa, riwayat tetap | [ARS](features/arsip/README.md) |
| [ARS-D9](features/arsip/README.md#keputusan) | Konfirmasi atasan "Sudah disampaikan" + karyawan "Sudah menerima"; SP berlaku sejak terbit | [ARS](features/arsip/README.md) |
| [ARS-D10](features/arsip/README.md#keputusan) | Pembuat SP: SA / HR ber-grant `employee.discipline.write`; saran tingkat, eskalasi beralasan, draft vs cabut | [ARS](features/arsip/README.md) |
| [ARS-D11](features/arsip/README.md#keputusan) | Nomor SP otomatis per PT per tahun, boleh manual (unik) | [ARS](features/arsip/README.md) |
| [ARS-D12](features/arsip/README.md#keputusan) | Jenis pelanggaran = master data; SP mangkir boleh menautkan hari ALPHA + surat pernyataan | [ARS](features/arsip/README.md) |
| [ARS-D13](features/arsip/README.md#keputusan) | Visibilitas SP per role + notifikasi in-app & email tanpa isi | [ARS](features/arsip/README.md) |
| [ARS-D14](features/arsip/README.md#keputusan) | Grant SP juga berlaku untuk dokumen jenis `WARNING_LETTER` (pola `BANK_BOOK`) | [ARS](features/arsip/README.md) |
| [ARS-D15](features/arsip/README.md#keputusan) | SP di modul terpisah `discipline` (bukan sub-domain `employee`) | [ARS](features/arsip/README.md) |
| [ARS-D16](features/arsip/README.md#keputusan) | Laporan gel. 3: batch 1 = 4 laporan inti; SA + HR PT; layar + Excel; periode & rinci (Dashboard tetap ringkasan) | [ARS](features/arsip/README.md) |
| [ARS-D17](features/arsip/README.md#keputusan) | Definisi 4 laporan batch 1 (headcount & turnover, dokumen kedaluwarsa, kelengkapan data, SP aktif) | [ARS](features/arsip/README.md) |
| [ARS-D18](features/arsip/README.md#keputusan) | Batasan laporan batch 1: unit/status saat ini, reaktivasi, dokumen wajib SITE belum dihitung | [ARS](features/arsip/README.md) |
| [TM-D1](features/time-management/README.md#keputusan) | Lokasi absen per karyawan: bebas lokasi / 1 lokasi khusus ber-geofence / bawaan (crew → lokasi kerja); diatur SA + HR PT | [TM](features/time-management/README.md) |
| [FND-D1](features/fondasi/README.md#keputusan) | Akun Vercel produksi & staging = team Pro "Arthasia Akselerasi" (staging ditransfer 2026-10-16) | [FND](features/fondasi/README.md) |

## 9. Keputusan Terbuka

Daftar & status terkini: [PROGRESS — Keputusan terbuka](PROGRESS.md#keputusan-terbuka). Pertanyaan lengkap + rekomendasi OD-1–OD-15: [decisions.md](decisions.md#keputusan-terbuka-od-1od-15). OD baru ditulis di README fitur dengan prefix (`TM-OD1`).

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
| Pelanggaran ToS Vercel Hobby untuk penggunaan komersial | Pindah ke team kantor berpaket berbayar sebelum data asli (OD-4). ✔ Selesai untuk Vercel 2026-10-16 (FND-D1). |
| Kebocoran data pribadi (UU No. 27/2022 PDP) | RBAC + grant, audit log, bucket private, email tanpa data sensitif, tidak log PII, retensi selfie. |
| Perbedaan Linux vs Windows (dual boot) | `.gitattributes` LF, script via Bun (bukan bash), verifikasi di kedua OS di Fase 1. |
| GPS palsu (fake GPS) | Diterima di v1 — PWA tidak bisa mendeteksi aplikasi pemalsu lokasi (D-067); mitigasi: selfie, label di luar radius/akurasi rendah, approval MANAGER + HR setiap hari (D-068); bisa diperketat di aplikasi native. |
| Beban approval harian (± 2 keputusan per karyawan per hari, D-068) | Persetujuan massal, filter "hanya yang berlabel", badge & ringkasan harian (bukan notifikasi per absen); batas waktu & pengingat OD-15. |
| Area site tanpa sinyal (absen wajib online) | Karyawan mengajukan koreksi absensi; bila tidak, ALPHA + surat pernyataan saat tutup periode (D-071). |
| Scope creep | Ide baru masuk Backlog PROGRESS, tidak dikerjakan di luar fase aktif. |
