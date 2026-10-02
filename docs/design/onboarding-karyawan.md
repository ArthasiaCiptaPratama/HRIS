# Desain — Onboarding Karyawan Baru (Penerimaan → Aktivasi → Lengkapi Data → Review → Login NIK)

> Keputusan: **D-045** (onboarding), **D-046** (pengecualian OD-6 saat onboarding), **D-047** (grant `employee.onboarding.review`), **D-048** (login dengan NIK) di [PLAN §8](../PLAN.md#8-keputusan-adr-ringkas). Terkait: D-034 (aturan akun), D-037 (pola unggah Storage), D-039/D-040 (multi-PT & cakupan), D-042 (mesin import).
> Status: **bagian a, b & c1 [done] lokal 2026-10-02** (c1: halaman review `/penerimaan/:id`, keputusan setujui/revisi/batalkan + notifikasi/email, revisi membatasi bagian di wizard, `/ess` placeholder; login NIK = c2 [planned]) (b: wizard 7 langkah + draf, dokumen bucket `employee-documents`, kunci akses calon di API + route guard; karyawan existing tidak dikunci & hanya mengisi field kosong — D-046 rincian) (penerimaan & undangan; penyimpangan: template contoh berupa CSV `public/template/Template-calon-karyawan.csv`, pilihan atasan per batch belum ada di UI — API sudah menerima `managerId`); bagian c2–d [planned]. Hasil grill pemilik projek 2026-10-01. Dikerjakan **setelah** Tahap 3 CRUD Master Data; menggantikan Tahap 5 ("undangan akun dari data karyawan"). Checklist: PROGRESS Fase 4 → "Onboarding karyawan".
> Dokumen ini tidak memuat data asli. Contoh nama/nomor fiktif.

## 1. Tujuan & prinsip

1. HR menerima calon karyawan dari portal pihak ke-3 (MagangHub, job portal) yang diekspor **CSV/Excel**, memilah yang lolos, lalu sistem mengundang mereka.
2. Calon **mengisi sendiri** data karyawannya (pribadi wajib, profesional sebagian opsional, dokumen), lalu **HR/SA memverifikasi**. Data resmi hanya masuk ke data karyawan aktif setelah disetujui.
3. Setelah disetujui, karyawan **login dengan Nomor Induk Karyawan (NIK internal) + password** yang dibuat saat aktivasi.
4. **Bukan modul rekrutmen** (PLAN §1.3 tetap): kandidat tidak lolos tidak pernah disimpan; file portal tidak disimpan (prinsip D-042, UU PDP).
5. Aturan akses PLAN §4 berlaku penuh: cakupan PT (D-040), audit, data sensitif tidak pernah ke log/email.

## 2. Alur besar

```
 HR / SA (Administrasi › Penerimaan Karyawan Baru)                 Calon                          Reviewer (SA / HR + grant)
 ──────────────────────────────────────────────────                ─────                          ──────────────────────────
 1 Unggah file portal (.xlsx/.csv) — diurai di browser
 2 Pemetaan kolom otomatis (@hris/shared/import)
 3 Pratinjau: CENTANG kandidat lolos (sisanya dibuang)
 4 Data kerja: default batch + ubah per baris,
   nomor induk otomatis 25.11.ACP.023
 5 KONFIRMASI UNDANGAN: daftar penerima (cek ulang),
   centang dilepas = disimpan "Belum diundang"
 6 Simpan (1 transaksi) → karyawan status onboarding
   + antrean undangan → dikirim bertahap ───────────────▶ 7 Email undangan (Supabase Auth)
                                                            8 /auth/callback → atur password
                                                            9 Login (email pribadi) → DIKUNCI ke /onboarding
                                                           10 Wizard 7 langkah, draf tersimpan
                                                           11 Kirim ─────────────────────────▶ 12 Review: lihat isian + dokumen
                                                                                                  ├ Minta revisi (catatan/bagian) ─▶ kembali ke 10
                                                                                                  ├ Batalkan (alasan) → akun nonaktif, hapus 30 hari
                                                                                                  └ Setujui (+ PTKP)
                                                           13 Email "Data diterima" ◀───────────┘
                                                              email login Supabase → alamat turunan NIK
                                                           14 Login dengan NIK + password → /ess ("Segera hadir")
```

## 3. Status onboarding

Kolom baru `employee.employees.onboarding_status` (enum `OnboardingStatus`). Karyawan yang sudah ada saat migrasi = `APPROVED`.

| Status | Arti | Calon boleh mengisi? | Tampil di Data Karyawan Aktif / dashboard / struktur / pilihan atasan |
|---|---|---|---|
| `NOT_INVITED` | Disimpan, undangan belum dikirim (centang dilepas di konfirmasi) | – | ✘ |
| `INVITED` | Undangan antre/terkirim, password belum dibuat | – | ✘ |
| `FILLING` | Password dibuat (aktivasi), sedang mengisi | ✔ | ✘ |
| `SUBMITTED` | Dikirim, menunggu review | ✘ (terkunci) | ✘ |
| `REVISION_REQUESTED` | Reviewer minta revisi | ✔ hanya bagian yang ditandai | ✘ |
| `APPROVED` | Disetujui → karyawan aktif penuh, login NIK | ✘ (OD-6 berlaku) | ✔ |
| `CANCELLED` | Penerimaan dibatalkan; akun nonaktif; dihapus permanen setelah 30 hari | ✘ | ✘ |

Karyawan **existing** yang diundang (§9) tetap `APPROVED` + penanda `completion_required = true` (hanya diminta melengkapi field wajib yang kosong); tetap tampil sebagai karyawan aktif.

Transisi yang sah: `NOT_INVITED → INVITED → FILLING → SUBMITTED → (REVISION_REQUESTED → SUBMITTED)* → APPROVED`; `CANCELLED` dari status mana pun sebelum `APPROVED`. Setiap transisi → `employment_histories`? **Tidak** — dicatat di tabel `onboarding_events` (§6) + audit; `employment_histories` hanya menerima `HIRED` saat `APPROVED` (tanggal efektif = `join_date`).

## 4. Penerimaan (sisi HR)

### 4.1 Langkah
| # | Langkah | Aturan |
|---|---|---|
| 1 | **Unggah** | `.xlsx`/`.csv` ≤ 5 MB, ≤ 500 baris; diurai di browser (`read-excel-file`/`papaparse`), file tidak dikirim/disimpan |
| 2 | **Pemetaan** | Mesin D-042 (`@hris/shared/import`): sheet, header, sinonim, tebakan isi. Field relevan: nama, email, no. HP, jenis kelamin, tempat/tgl lahir, alamat, pendidikan (jenjang, sekolah, jurusan, tahun), posisi dilamar (opsional, untuk default jabatan). Profil pemetaan diingat per susunan header (`import_mappings`) |
| 3 | **Pilih lolos** | Tabel dengan centang per baris (default tidak dicentang), pencarian & filter kolom. Hanya baris dicentang yang dikirim ke langkah berikut. Error per baris (email tidak valid, email sudah dipakai akun lain, duplikat email dalam file) ditampilkan; baris error tidak bisa dipilih sampai diperbaiki di tabel |
| 4 | **Data kerja** | Default batch: PT, status kepegawaian, jabatan, tanggal masuk, lokasi kerja, atasan (opsional), grade (opsional) → ubah per baris. **Semua dipilih dari master data yang ada** (tidak membuat master baru). PT dibatasi cakupan aktor (D-040). Nomor induk diusulkan otomatis (§4.2), bisa diubah per baris |
| 5 | **Konfirmasi undangan** | Daftar: nama, email tujuan, nomor induk, PT, status, jabatan, tanggal masuk; semua dicentang. Centang dilepas = disimpan `NOT_INVITED`. Peringatan kapasitas kirim (± 30/jam) |
| 6 | **Simpan & kirim** | `POST /onboarding-batches` — server **memvalidasi ulang** semua baris (Zod + normalizer bersama), cek cakupan PT, cek unik nomor induk & email, lalu satu transaksi: buat `onboarding_batches`, karyawan (`onboarding_status`), akun `iam` (role EMPLOYEE, tertaut karyawan, belum punya user Auth), antrean undangan. Audit per karyawan bersumber `onboarding` |
| 7 | **Progres** | Halaman batch menampilkan progres undangan (Antre / Terkirim / Gagal) dan memanggil `POST /onboarding-invitations/process` bertahap (§5) |

### 4.2 Nomor induk otomatis
- Format: **`DD.MM.KODE-PT.NNN`** — tanggal & bulan **join** (2 digit), kode perusahaan (`organization.companies.code`), nomor urut 3 digit (lebih bila > 999). Contoh: join 25 November di ACP, urut ke-23 → `25.11.ACP.023`.
- **Urut berjalan per PT, tidak pernah reset** (tahun tidak ada di nomor, jadi reset per tanggal akan bentrok). Urut berikutnya = angka terbesar segmen terakhir dari nomor induk karyawan PT tersebut (semua format, termasuk pola lama `9999.AAA.999`) + 1; batch memberi urut berurutan.
- Usulan dihitung di server saat pratinjau (`POST /onboarding-batches/preview`) dan **dikunci saat simpan** (dicek ulang di transaksi; bentrok → 409 dengan baris yang bentrok).
- HR boleh menimpa per baris; tetap unik global (`employee_number` unik).

## 5. Undangan & antrean

- Tabel `onboarding_invitations`: `employee_id`, `account_id`, `email`, `status` (`QUEUED`, `SENT`, `FAILED`), `attempts`, `last_error_code` (kode, **tanpa** pesan mentah berisi email), `sent_at`, `expires_hint_at`.
- **Pengirim:** Supabase Admin `inviteUserByEmail(email, redirectTo=<web>/auth/callback)`; `auth_user_id` disimpan ke akun saat berhasil. User Auth yang sudah ada (environment lain, D-023) → tidak dikirim ulang, ditandai `SENT` + catatan.
- **Pemroses:** `POST /onboarding-invitations/process` (SA/HR, cakupan PT) mengambil ≤ 10 antrean tertua, mengirim, dan mengembalikan sisa. Halaman batch memanggilnya berkala selama terbuka. **Cadangan:** cron harian `onboarding-invitations` (Vercel Hobby: maks 1×/hari). Batas per jam dihitung dari `sent_at` 60 menit terakhir (`ONBOARDING_INVITES_PER_HOUR`, default 25 — di bawah limit Supabase).
- **Kirim ulang** (`POST /onboarding/:employeeId/resend-invitation`): untuk `INVITED` (tautan kedaluwarsa) dan `NOT_INVITED` (undang sekarang; satuan & massal). Untuk user Auth yang sudah ada tapi belum pernah login → `generateLink` tipe invite/recovery dikirim ulang.
- **Pengingat:** `INVITED` > 14 hari tanpa aktivasi → notifikasi ke HR/SA PT terkait (cron harian `onboarding-maintenance`), bukan pembatalan otomatis.
- **Aktivasi:** request pertama dengan JWT valid dari akun `INVITED` (setelah atur password) → status `FILLING` (`GET /me`).

## 6. Data (rencana skema)

| Tabel / kolom | Modul | Isi |
|---|---|---|
| `employees.onboarding_status` | employee | enum `OnboardingStatus` (§3), default `APPROVED` untuk data lama, wajib |
| `employees.completion_required` | employee | bool, default false — karyawan existing yang diminta melengkapi |
| `employees.personal_email` | employee | email pribadi (unik, nullable) — tujuan undangan, reset password, email notifikasi setelah login NIK |
| `employees.onboarding_batch_id` | employee | FK `onboarding_batches` (nullable) |
| `employee_personal.npwp_absent`, `bpjs_employment_absent`, `bpjs_health_absent` | employee | bool — "belum punya" (CHECK: nomor kosong bila true) |
| `onboarding_batches` | employee | `name`, `company_id` default, `actor_account_id`, jumlah dipilih/disimpan/diundang, `source_file_name`, `source_file_sha256` (file tidak disimpan) |
| `onboarding_invitations` | employee | §5 |
| `onboarding_reviews` | employee | `employee_id`, `decision` (`REVISION_REQUESTED`, `APPROVED`, `CANCELLED`), `reviewer_account_id`, `section_notes` jsonb (catatan per bagian — **tanpa** nilai data), `reason?`, `decided_at` |
| `onboarding_events` | employee | jejak transisi status: `employee_id`, `from`, `to`, `actor_account_id?`, `at` |
| `employee_documents` | employee | **[planned Fase 4, dibangun di sini]** `type` (enum: `KTP`, `KK`, `DIPLOMA`, `BANK_BOOK`, `NPWP`, `BPJS_EMPLOYMENT`, `BPJS_HEALTH`, `CERTIFICATE`, `CV`, `OTHER`), `storage_path`, `mime_type`, `size_bytes`, `uploaded_by`, `deleted_at?` |
| `work_experiences` | employee | riwayat kerja (opsional di form): `company_name`, `position`, `start_year`, `end_year?`, `description?` (menu Arsip "Riwayat Kerja" memakai tabel ini) |
| `iam.accounts.login_identifier` | iam | `EMAIL` / `EMPLOYEE_NUMBER` — cara login saat ini (D-048) |

**Storage:** bucket private baru `employee-documents` (maks 5 MB, `application/pdf`, `image/jpeg`, `image/png`), path `<STORAGE_PATH_PREFIX>employees/<employee_id>/documents/<uuid>.<ext>`, dibuat lewat `bun run storage:setup` (pola D-037: signed upload URL → konfirmasi API → path disimpan; baca via signed URL 10 menit).

**Draf:** isian wizard disimpan langsung ke tabel resmi (`employee_personal`, `employee_bank_accounts`, `family_members`, `educations`, `trainings`, `work_experiences`, `employee_documents`) selama status `FILLING`/`REVISION_REQUESTED` — aman karena calon tidak tampil di mana pun sampai `APPROVED`, dan hanya pemilik + reviewer yang boleh membaca.

## 7. Form onboarding (calon)

Wizard 7 langkah, **draf tersimpan per langkah** (`PUT /onboarding/me/<bagian>`), boleh keluar & lanjut, **prefill** dari file portal (boleh dikoreksi), mobile-first. Tombol **Kirim** aktif hanya bila semua wajib lengkap; ringkasan menandai yang kurang.

| Langkah | Field | Wajib |
|---|---|---|
| 1 Pribadi | nama lengkap, jenis kelamin, tempat & tgl lahir, NIK KTP (16 digit), No. KK (16 digit), agama, status nikah, alamat KTP, alamat domisili, kota asal, no. HP, foto profil 3:4 | ✔ semua |
| | NPWP (15/16 digit), BPJS Ketenagakerjaan, BPJS Kesehatan | ✔ nomor **atau** centang "belum punya" |
| 2 Kontak darurat | nama, hubungan, no. HP | ✔ |
| 3 Keluarga | pasangan (bila status nikah = menikah): nama, tgl lahir, no. HP | ✔ bila menikah |
| | anak, orang tua | opsional |
| 4 Rekening | bank, no. rekening, nama pemilik | ✔ |
| 5 Profesional | pendidikan terakhir: jenjang, sekolah, jurusan, tahun lulus | ✔ |
| | pendidikan lain, pelatihan, riwayat kerja | opsional |
| 6 Dokumen | KTP, KK, ijazah terakhir, halaman depan buku rekening | ✔ |
| | kartu NPWP / BPJS | ✔ bila nomornya diisi |
| | sertifikat, CV | opsional |
| 7 Ringkasan & kirim | pernyataan kebenaran data (centang) | ✔ |

- **PTKP tidak diisi calon** — ditetapkan reviewer saat menyetujui.
- Validasi format memakai normalizer bersama `@hris/shared` (sama dengan import): NIK/KK 16 digit, NPWP 15/16 digit, HP `08…`, tanggal lahir masuk akal.
- **Revisi:** hanya bagian yang diberi catatan yang bisa diubah; catatan reviewer tampil di atas bagian itu.
- Data milik calon tidak pernah masuk log; pesan error tidak memuat nilai.

## 8. Review (SA / HR + grant)

- Daftar: Administrasi › Penerimaan Karyawan Baru, tab per status (Belum diundang, Diundang, Mengisi data, Menunggu review, Perlu revisi, Selesai, Dibatalkan), filter PT/batch.
- Halaman review: semua bagian + pratinjau dokumen (signed URL), riwayat review sebelumnya. Membuka halaman review = audit `employee.onboarding.review.read` (akses data sensitif, §4.2).
- Keputusan (`POST /onboarding/:employeeId/decision`):

| Keputusan | Wajib | Efek |
|---|---|---|
| **Setujui** | PTKP; konfirmasi data kerja (boleh diubah reviewer) | `APPROVED`, `employment_histories` `HIRED`, email login Supabase → alamat turunan NIK (§10), `login_identifier = EMPLOYEE_NUMBER`, email + notifikasi "Data Anda diterima — login dengan NIK <nomor>" |
| **Minta revisi** | catatan ≥ 1 bagian | `REVISION_REQUESTED`, bagian bertanda terbuka, email + notifikasi berisi daftar **nama bagian** (tanpa nilai) |
| **Batalkan penerimaan** | alasan | `CANCELLED`, akun dinonaktifkan (ban Supabase, D-034), dijadwalkan hapus permanen 30 hari (§11) |

- Reviewer **tidak mengedit** isian calon (kecuali PTKP & data kerja) — jelas siapa yang mengisi. Tidak boleh me-review data miliknya sendiri (§4.5.1).
- Notifikasi ke reviewer saat calon mengirim: SA + HR ber-grant di PT terkait (in-app + email tanpa data sensitif).

## 9. Karyawan existing (pengganti Tahap 5)

- Aksi **Undang karyawan existing** di menu Penerimaan: pilih karyawan aktif tanpa akun (satuan/massal) → isi/konfirmasi email pribadi → konfirmasi undangan (sama dengan §4 langkah 5) → antrean (§5).
- Status tetap `APPROVED` + `completion_required = true`; setelah aktivasi hanya diminta melengkapi **field wajib yang masih kosong** (wizard yang sama, prefill data yang ada) → review yang sama → `completion_required = false`.
- Selama `completion_required`, akses dikunci ke wizard seperti calon (§12), tetapi tetap tampil sebagai karyawan aktif bagi HR.

## 10. Login dengan NIK (D-048)

- **Saat disetujui** (dan untuk karyawan existing saat penyelesaian di-approve): API (service role) mengganti email user Supabase ke **alamat turunan**: `lower(nomor_induk) + "@" + LOGIN_EMAIL_DOMAIN` (mis. `25.11.acp.023@stg.login.akselerasi.invalid`), `email_confirm: true` (tanpa email ke alamat itu). `LOGIN_EMAIL_DOMAIN` **per lingkungan** (`dev-<nama>.…` lokal, `stg.…` staging, produksi sendiri) karena Auth staging dipakai bersama DB lokal & staging (D-023). Domain `.invalid` (RFC 2606) tidak pernah bisa menerima email.
- **Halaman login:** satu kolom **"NIK atau email"**. Masukan berpola nomor induk → web mengubahnya ke alamat turunan (`VITE_LOGIN_EMAIL_DOMAIN`) → `signInWithPassword` langsung ke Supabase (password tidak melewati API, D-033; rate limit Supabase tetap per IP pengguna). Masukan berpola email → login email biasa (calon sebelum disetujui, dan akun tanpa data karyawan seperti Super Admin Utama).
- **Email pribadi tidak lagi bisa dipakai login** setelah disetujui (otomatis, karena email Auth sudah diganti). Pesan gagal login tetap generik.
- **Ubah nomor induk** oleh HR → alamat turunan ikut diperbarui dalam operasi yang sama (gagal update Auth → seluruh perubahan dibatalkan).
- **Lupa password** (`POST /auth/password-reset`, publik): masukan NIK atau email → API mencari akun → bila ada, `generateLink` tipe *recovery* untuk email Auth akun itu lalu **mengirim tautan ke `personal_email`** lewat SMTP aplikasi; respons **selalu sama** ("Bila akun terdaftar, tautan dikirim") — tidak ada enumerasi. Pembatas percobaan per masukan (tabel kecil `iam.password_reset_attempts`, mis. 3/jam).
- Berlaku untuk **semua akun yang tertaut karyawan `APPROVED`** (EMPLOYEE, MANAGER, HR_ADMIN, SA yang punya data karyawan). Akun tanpa data karyawan tetap email.
- **Migrasi akun existing:** akun yang sudah tertaut karyawan (termasuk akun uji `hr/mgr/emp.arthasia@gmail.com`) dipindah ke login NIK lewat script sekali jalan (`bun run auth:migrate-login-nik`, dry-run dulu, izin pemilik projek per lingkungan). Playwright/akun uji menyesuaikan.

## 11. Pembatalan & retensi

- `CANCELLED`: akun di-ban; HR/SA bisa **memulihkan** ke status sebelumnya dalam 30 hari (audit).
- Cron harian `onboarding-maintenance`: (1) hapus **permanen** calon `CANCELLED` > 30 hari — baris karyawan & anak (CASCADE), objek dokumen & foto di Storage, akun `iam`; user Supabase Auth dihapus? **Tidak** (PLAN §3.2.7: user Auth tidak pernah dihapus) → tetap di-ban, email Auth diganti alamat anonim `deleted-<uuid>@…invalid` supaya email pribadi bisa dipakai lagi; audit tanpa nilai tetap. (2) Pengingat undangan > 14 hari (§5). (3) Proses sisa antrean undangan.
- `APPROVED` mengikuti aturan karyawan biasa (tidak pernah dihapus, hanya nonaktif — PLAN §4.5).

## 12. Akses

| Aksi | SUPER_ADMIN | HR_ADMIN | MANAGER | EMPLOYEE / calon |
|---|---|---|---|---|
| Import calon, data kerja, konfirmasi & kirim/kirim ulang undangan | ✅ semua PT | ✅ PT ditugaskan (tanpa grant) | ❌ | ❌ |
| Undang karyawan existing | ✅ | ✅ PT ditugaskan | ❌ | ❌ |
| Lihat daftar penerimaan & status | ✅ | ✅ PT ditugaskan (tanpa data sensitif) | ❌ | ❌ |
| Review: lihat isian sensitif & dokumen calon, putuskan | ✅ | 🔑 `employee.onboarding.review` (PT ditugaskan) | ❌ | ❌ |
| Isi/ubah data sensitif & dokumen **miliknya** | – | – | – | ✅ hanya saat `FILLING` / `REVISION_REQUESTED` (D-046) |
| Endpoint lain selama onboarding | – | – | – | ❌ kecuali `/me`, `/onboarding/me/*`, `/notifications/*`, unggah foto & dokumen sendiri |

- Penguncian onboarding ditegakkan **di API** (middleware akses: aktor dengan karyawan `onboarding_status ≠ APPROVED` atau `completion_required` hanya boleh endpoint daftar putih) + UI (route guard → `/onboarding`).
- Setelah `APPROVED`: role EMPLOYEE diarahkan ke **`/ess`** ("Employee Self Service — segera hadir"; diisi setelah Time Management).
- Grant baru `employee.onboarding.review`: hanya untuk HR_ADMIN (MANAGER tidak), berlaku di cakupan PT (D-040), audit beri/cabut seperti grant lain.

## 13. API (modul `employee`, kecuali disebut lain)

| Endpoint | Siapa | Fungsi |
|---|---|---|
| `POST /onboarding-batches/preview` | SA/HR | Validasi baris terpilih + usulan nomor induk, tanpa menulis |
| `POST /onboarding-batches` | SA/HR | Simpan batch (1 transaksi) + antrean undangan |
| `GET /onboarding-batches`, `GET /onboarding-batches/:id` | SA/HR | Riwayat & progres batch |
| `POST /onboarding-invitations/process` | SA/HR | Proses ≤ 10 antrean (§5) |
| `POST /onboarding/invite-existing` | SA/HR | Undang karyawan existing (§9) |
| `GET /onboarding` | SA/HR | Daftar per status/PT/batch |
| `GET /onboarding/:employeeId` | SA, HR+grant | Detail review (audit baca sensitif) |
| `POST /onboarding/:employeeId/decision` | SA, HR+grant | Setujui / minta revisi / batalkan |
| `POST /onboarding/:employeeId/resend-invitation` | SA/HR | Kirim ulang / undang |
| `POST /onboarding/:employeeId/restore` | SA/HR | Pulihkan `CANCELLED` ≤ 30 hari |
| `GET /onboarding/me`, `PUT /onboarding/me/{personal,emergency,family,bank,professional}`, `POST /onboarding/me/documents/upload-url`, `POST /onboarding/me/documents`, `DELETE /onboarding/me/documents/:id`, `POST /onboarding/me/submit` | calon (diri sendiri) | Wizard |
| `POST /auth/password-reset` (modul `iam`) | publik | Lupa password NIK/email (§10) |
| `/api/cron/onboarding-maintenance` | cron | §5, §11 |

Semua dengan Zod + OpenAPI, policy eksplisit (`onboarding.policy` di modul employee), test akses (boleh & ditolak), audit untuk aksi sensitif.

## 14. Pengujian

- **Policy (TDD, tabel):** baris matriks §12 (role × grant × status onboarding × PT).
- **Shared:** generator nomor induk (urut per PT, pola lama `9999.AAA.999` ikut dihitung, > 999), turunan alamat login, validasi field wajib & "belum punya".
- **Integration:** preview/simpan batch (cakupan PT, duplikat email/nomor, transaksi), antrean (batas per jam, gagal → `FAILED`, kirim ulang) dengan stub Admin Auth, wizard (simpan draf, kirim hanya bila lengkap, terkunci setelah kirim, revisi hanya bagian bertanda), keputusan (approve → email Auth berubah lewat stub, histories `HIRED`; revisi; batal → ban), penguncian endpoint selama onboarding, password reset tanpa enumerasi, cron retensi menghapus data & objek.
- **Web (Vitest):** stepper penerimaan, konfirmasi undangan, wizard (validasi, draf, revisi), login "NIK atau email".
- **E2E (Playwright, staging/lokal):** HR import template portal dummy → pilih → konfirmasi → (email undangan diuji dengan akun plus-addressing pengembang) → calon mengisi → HR minta revisi → calon perbaiki → HR setujui → login NIK.
- **Data uji:** template portal **dummy** (`apps/web/public/template/Template-calon-karyawan.xlsx`), tidak pernah file asli.

## 15. Rencana pengerjaan (setelah Tahap 3 CRUD Master Data)

| Bagian | Isi | Bisa dirilis sendiri? |
|---|---|---|
| a. Penerimaan & undangan | skema status + batch + antrean, nomor induk, menu Penerimaan (unggah → pilih → data kerja → konfirmasi → progres), undang existing, kirim ulang | ✔ (calon berhenti di "Mengisi data") |
| b. Wizard & dokumen | `employee_documents` + bucket, `work_experiences`, kolom "belum punya", wizard 7 langkah, penguncian akses | ✔ |
| c. Review & login NIK | grant baru, halaman review, keputusan + email, login NIK + lupa password + script migrasi akun, halaman `/ess` kosong | ✔ |
| d. Retensi & pemeliharaan | cron `onboarding-maintenance`, pemulihan, pengingat | ✔ |

## 16. Risiko & catatan

| Risiko | Mitigasi |
|---|---|
| Limit email Supabase (± 30/jam) & Gmail (± 500/hari) | Antrean + batas per jam yang bisa diatur; naikkan limit di dashboard; produksi pakai Workspace (OD-5) |
| Vercel Hobby cron 1×/hari | Pemroses dipicu halaman HR; cron hanya cadangan; Vercel Pro (OD-4) memungkinkan cron rapat |
| Calon tidak punya NPWP/BPJS | Centang "belum punya" (tercatat, ditindaklanjuti HR) |
| Pergantian email Auth gagal saat approve | Satu operasi: gagal Auth → approve dibatalkan & bisa diulang |
| Akun uji & Playwright memakai login email | Script migrasi + pembaruan helper uji di bagian c |
| Data sensitif calon yang batal | Hapus permanen 30 hari; file portal tidak disimpan |
| Template email Supabase (undangan/reset) belum bernama Akselerasi Arthasia | Diperbarui di dashboard Supabase (izin pemilik projek) sebelum bagian a dirilis |
