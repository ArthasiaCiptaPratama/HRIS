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
| Dasar         | Sesi grill 2026-09-25 (keputusan D-001 s.d. D-022), revisi 2026-09-28 (D-023 s.d. D-034), 2026-09-29 (D-035 s.d. D-037), 2026-09-30 (D-038 s.d. D-042) |
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
| **Kebijakan (policy)** | | | | |
| Struktur organisasi: departemen, jabatan, level, lokasi & geofence | ✅ | 👁 (+ tambah baru lewat import, D-042) | 👁 | 👁 |
| Kalender libur | ✅ | 👁 | 👁 | 👁 |
| Template shift & jam kerja, toleransi telat | ✅ | 👁 | 👁 | ❌ |
| Jenis cuti/izin, kuota, akrual, carry-over | ✅ | 👁 | 👁 | 👁 |
| Aturan lembur | ✅ | 👁 | 👁 | 👁 |
| Definisi komponen gaji, tarif BPJS/PPh 21/PTKP | ✅ | ❌ | ❌ | ❌ |
| **Karyawan** | | | | |
| Direktori (nama, jabatan, departemen, email kantor) | ✅ | ✅ | 👁 | 👁 |
| Data kerja (jabatan, tgl masuk, status, atasan) | ✅ | ✅ | 👁 tim | 👁 sendiri |
| Tambah/ubah/nonaktifkan karyawan, tempatkan jabatan, isi `manager_id` | ✅ | ✅ | ❌ | ❌ |
| Data pribadi sensitif (NIK, NPWP, KK, alamat, PTKP) | ✅ | 🔑 | 🔑 tim | 👁 sendiri |
| Rekening bank | ✅ | 🔑 | 🔑 tim | 👁 sendiri |
| Dokumen karyawan | ✅ | 🔑 | 🔑 tim | ✅ sendiri |
| Ubah data diri sendiri: no. HP, alamat domisili, kontak darurat, foto | ✅ | ✅ | ✅ | ✅ |
| Import karyawan (CSV/Excel) (D-042) | ✅ | ✅ PT sendiri; kolom sensitif hanya dengan grant `*.write` | ❌ | ❌ |
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
| D-040 | **Akses per perusahaan (2026-09-30):** tabel `iam.account_companies` (akun ↔ perusahaan). HR_ADMIN hanya melihat & mengelola karyawan di perusahaan yang ditugaskan (daftar, ringkasan, detail, struktur, ubah status, import, undangan); karyawan di luar cakupan → **404** (tidak boleh diketahui keberadaannya). Grant HR berlaku di dalam cakupan itu. SUPER_ADMIN: semua perusahaan. MANAGER: tetap tim (bawahan langsung, D-009) lintas PT. EMPLOYEE: diri sendiri. HR_ADMIN tanpa penugasan = tidak melihat karyawan mana pun. Penugasan diatur SUPER_ADMIN (audit + notifikasi). | Keputusan pemilik projek 2026-09-30. |
| D-041 | **Kolom data karyawan tambahan (2026-09-30, untuk import):** `employee_personal`: `bpjs_employment_number` (BPJS Ketenagakerjaan), `bpjs_health_number` (BPJS Kesehatan), `ptkp_status` (enum TK/0–TK/3, K/0–K/3), `origin_city` — **sensitif**, di bawah grant `employee.personal.*`. `employees`: `emergency_contact_name`, `emergency_contact_relationship`. `educations`: `level` (enum SD, SMP, SMA/SMK, D1–D4, S1–S3, lainnya). Data kontrak (tanggal akhir, PKWT ke-n, durasi, nomor offering) disimpan di modul `contract` **Fase 7**; sampai itu diisi lewat import ulang mode "perbarui". | Keputusan pemilik projek 2026-09-30: kolom file master data kantor diberi tempat resmi, bukan JSON bebas. |
| D-042 | **Import karyawan CSV/Excel (2026-09-30):** (1) File **diurai di browser** dan **tidak disimpan**; hanya baris terpetakan yang dikirim ke API dan **divalidasi ulang di server** (Zod + normalizer bersama di `@hris/shared`). (2) **Deteksi otomatis**: sheet, baris header, pemetaan kolom (kamus sinonim ID/EN + kemiripan teks + tebakan dari isi kolom, dengan skor keyakinan; bisa dikoreksi pengguna; profil pemetaan diingat per susunan header), kolom turunan/formula diabaikan. (3) **Mode per import**: "tambah saja" atau "tambah + perbarui" (kunci = nomor induk karyawan; sel kosong **tidak** menimpa). (4) **Master data baru** (departemen, jabatan, grade, site, status) dibuat otomatis setelah tampil di pratinjau dan bisa dipetakan ke yang sudah ada; HR_ADMIN boleh **menambah** (bukan mengubah/menghapus) lewat import, tercatat di audit. (5) **Kolom sensitif** (KTP, NPWP, KK, alamat, agama, PTKP, BPJS, rekening) hanya ditulis bila aktor SUPER_ADMIN atau ber-grant `employee.personal.write` / `employee.bank.write`; bila tidak, kolom itu dilewati dan diberitahukan di pratinjau. Baris milik akun pengimpor sendiri tidak memperbarui data sensitif sampai OD-6 diputuskan. (6) Baris **RESIGN** (+ tanggal) diimpor sebagai karyawan **nonaktif** (alasan Mengundurkan diri, riwayat HIRED + DEACTIVATED, tanpa akun). (7) Disimpan hanya jejak `employee.import_jobs` (aktor, waktu, nama & hash file, mode, jumlah, error per baris **tanpa nilai**) + audit per karyawan bersumber `import`. (8) Batas 2.000 baris / 5 MB per import, satu transaksi. (9) Library: `read-excel-file` (xlsx) + `papaparse` (csv); SheetJS npm (0.18.5, CVE) tidak dipakai. (10) Data asli tidak pernah masuk repo; test memakai template dummy berstruktur sama. Desain rinci: [design/import-karyawan.md](./design/import-karyawan.md). | Keputusan pemilik projek 2026-09-30 (semua opsi yang direkomendasikan dipilih); risiko kebocoran PII (UU PDP) ditekan dengan tidak menyimpan file. |

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
| OD-6 | Bolehkan seseorang (termasuk SUPER_ADMIN) mengubah **data sensitif/gaji miliknya sendiri**? | Tidak, harus akun lain. Jika hanya ada satu SUPER_ADMIN, diizinkan dengan penanda khusus di audit log. | Fase 4 |
| OD-8 | **Strategi rollback migrasi & backup produksi** (Prisma tidak punya migrasi turun). | Migrasi *expand → contract* yang kompatibel mundur + perbaikan maju; backup harian Supabase, PITR bila paket memungkinkan (terkait OD-4). | Rilis 1 |
| OD-9 | **Proteksi branch `main`** (§6) ditolak GitHub: organisasi `ArthasiaCiptaPratama` memakai paket **Free**, dan branch protection/rulesets untuk repo **private** butuh **GitHub Team**. GitHub Pro milik akun pribadi pemilik projek tidak berlaku untuk repo milik organisasi (dicoba ulang 2026-09-28: tetap 403). Pilihan: upgrade organisasi ke Team, jadikan repo public (tidak disarankan: kode HRIS internal), atau sementara hanya disiplin alur (tanpa penegakan). | Upgrade ke GitHub Team (bisa diputuskan bersama OD-4). Sampai itu, `main` hanya dijaga disiplin: tidak push langsung, merge lewat PR yang di-review. | Rilis 1 |

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
