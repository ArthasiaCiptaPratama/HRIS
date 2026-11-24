# Rancangan — Rekrutmen / Talent Acquisition

> Status: **rencana, menunggu persetujuan pengguna** (belum ada kode). Keputusan: [README](README.md#keputusan) ·
> riset & sumber: [research.md](research.md) · log: [log.md](log.md).
> Bagian bertanda **(usulan)** belum dikunci; bertanda **REC-ODn** menunggu jawaban pengguna.

## 1. Tujuan & prinsip

HR mengelola kandidat dari sumber sampai diterima dalam satu alur yang bisa disusun sendiri:
- **Template alur modular:** tahap = blok berjenis (form, screening, tes, wawancara, …) yang disusun HR.
- **Form kandidat bisa dikustom penuh:** HR memakai template form bawaan atau membuat form sendiri.
- **Iterasi mundur:** kandidat bisa dikembalikan ke tahap sebelumnya, atau diminta melengkapi data tanpa pindah tahap.
- **Tautan rapat otomatis:** jadwal wawancara langsung membuat tautan Google Meet (Zoom/manual sebagai pilihan).

Prinsip:
1. Ikut aturan repo: modul `recruitment` (skema Postgres sendiri, D-004), lintas modul via `index.ts`, kontrak OpenAPI
   bernama, policy murni, audit untuk aksi sensitif.
2. **Pakai yang sudah ada:** email + notifikasi (`notify`), storage signed URL, audit, cron, Google service account
   (`core/google-auth.ts`), dnd-kit, react-hook-form + zod. **Tanpa pustaka baru** di fase awal ([research §8](research.md#8-pustaka-baru--ringkasan)).
3. **UU PDP sejak awal:** persetujuan kandidat, data spesifik terbatas, masa simpan, hapus atas permintaan.
4. Di balik saklar `FEATURES.recruitment` (mati di staging/produksi) sampai disetujui rilis.

## 2. Istilah

| Istilah | Arti | Bukan |
|---|---|---|
| **Lowongan** | Posisi yang dibuka di satu PT: jabatan, lokasi, jumlah orang, status. Memegang **salinan alur** sendiri. | Bukan iklan publik (fase lanjut) |
| **Kandidat** | Orang yang dipertimbangkan (identitas + kontak + CV). Satu kandidat bisa melamar beberapa lowongan. | Bukan "calon karyawan" Penerimaan (D-045) |
| **Lamaran** | Kandidat × lowongan. Berada di tepat satu **tahap**; hasil: aktif / diterima / ditolak / mundur. | – |
| **Template alur** | Susunan **blok tahap** yang bisa dipakai ulang (mis. "Staf kantor", "Operator site", "Magang"). | – |
| **Blok tahap** | Satu tahap berjenis (lihat §4.2) dengan pengaturan (mis. form mana yang dikirim, durasi wawancara). | – |
| **Template form** | Definisi field berversi yang diisi kandidat (lewat tautan) atau HR/pewawancara. | – |
| **Permintaan form** | Tautan bertoken ke satu versi form untuk satu lamaran. Ditutup setelah dikirim, kedaluwarsa, atau dicabut. | – |
| **Wawancara** | Jadwal + pewawancara + tautan rapat (Meet/Zoom/manual/tatap muka). | – |
| **Penilaian** (scorecard) | Nilai & rekomendasi satu pewawancara untuk satu wawancara. | – |
| **Talent pool** | Kandidat yang **setuju** datanya disimpan untuk lowongan lain. | – |

"Penerimaan Karyawan Baru" (D-045) tetap berarti onboarding setelah diterima; Rekrutmen berakhir dengan menyerahkan
kandidat ke sana ([REC-D10](README.md#rec-d10)). Menu Penerimaan pindah ke **Personalia › Pengelolaan Karyawan**.

## 3. Peran & alur besar

```
HR: buat Lowongan (pilih Template alur → alur disalin ke lowongan)
 → tambah Kandidat (manual / unggah CV / impor CSV / URL LinkedIn sebagai tautan; tanpa scraping, REC-D7)
 → Lamaran masuk tahap pertama → blok tahap menjalankan aksinya:
      Form      : kirim tautan form ke kandidat (tanpa login) → kandidat mengisi → HR meninjau
      Screening : HR menilai kelayakan (checklist) → lanjut / tolak
      Tes       : catat hasil psikotes/teknis + lampiran
      Wawancara : jadwal → tautan Meet otomatis + undangan → pewawancara mengisi Penilaian
      Penawaran : catat penawaran (gaji di luar sistem, lihat §11) → diterima/ditolak kandidat
      Diterima  : "Kirim ke Penerimaan" → calon karyawan D-045 (tanpa ketik ulang)
 ↺ Mundur kapan saja ke tahap yang sudah dilewati, atau "Minta data tambahan" (form) tanpa pindah tahap
 ✕ Tolak / Mundur (kandidat) dari tahap mana pun → retensi PDP berjalan
```

### 3.1 Alur lintas menu: Rekrutmen → Personalia › Penerimaan (REC-D10)

```
 Rekrutmen › Lowongan › papan                          Personalia › Pengelolaan Karyawan › Penerimaan Karyawan Baru
 ┌──────────────────────────────────────┐              ┌──────────────────────────────────────────────────────────┐
 │ … │ Penawaran │ Diterima            │              │  calon karyawan (D-045)                                  │
 │   │  [Rina]   │                     │              │                                                          │
 │   │   ①──────►│ dialog "Kirim ke    │  ② membuat   │  Rina · INVITED → FILLING → SUBMITTED → APPROVED        │
 │   │           │ Penerimaan"         │─────────────►│  (undangan email → wizard 7 langkah → review HR)        │
 │   │           │ [Rina ● Diundang]③  │◄─── status ──│                                                          │
 │   │           │   └ "Buka di        │─── ④ klik ──►│  /penerimaan/<id> (detail/review calon)                 │
 │   │           │      Penerimaan ↗"  │              │                                                          │
 └──────────────────────────────────────┘              └──────────────────────────────────────────────────────────┘
```
Titik klik HR:
1. Di papan Rekrutmen, kartu lamaran di tahap **Penawaran** (penawaran diterima kandidat) → tombol **"Terima & kirim ke
   Penerimaan"** (atau pindahkan kartu ke kolom Diterima, lalu dialog yang sama terbuka).
2. **Dialog** berisi data yang sudah terisi otomatis (tidak diketik ulang): nama, email, telepon, jenis kelamin (field
   ber-`mapsTo`), PT, jabatan, lokasi (dari lowongan). HR melengkapi yang hanya ia tahu: **status kepegawaian, tanggal
   masuk, atasan**, lalu pilih **"Kirim undangan sekarang"** atau "Simpan dulu, undang nanti". API memanggil fungsi
   publik modul employee (`createBatch`/setara, lewat `index.ts`): calon karyawan + undangan. Lamaran jadi `HIRED`
   dan `hired_employee_id` terisi.
3. **Kembali di papan**, kolom Diterima menampilkan chip status Penerimaan (Belum diundang · Diundang · Mengisi ·
   Menunggu review · Perlu revisi · Disetujui · Dibatalkan), dibaca dari modul employee lewat `index.ts`.
4. **Pintasan:** chip/kartu punya tautan **"Buka di Penerimaan ↗"** ke `/penerimaan/<employeeId>` (halaman detail/review
   yang sudah ada), jadi HR tidak perlu mencari lewat menu. Sebaliknya, detail calon di Penerimaan menampilkan
   "Asal: Rekrutmen › <lowongan>" dengan tautan balik.
- Penerimaan tetap bisa dipakai **tanpa** Rekrutmen (impor calon dari portal MagangHub, D-045). Saklar recruitment mati
  → tombol & chip tidak ada; Penerimaan berjalan seperti sekarang.
- Pindah menu Penerimaan ke Personalia: alamat `/penerimaan` **tetap** (tautan notifikasi tersimpan di DB); grup
  Personalia `match` ditambah `/penerimaan`, dihapus dari Administrasi; item tetap `visible: access.runOnboarding`
  (HR_PERSONNEL tidak melihatnya). Seksi Administrasi ber-id `recruitment` (sisa Pengajuan Perubahan Data) diganti
  nama agar tidak bentrok dengan grup Rekrutmen. Perubahan tata letak ini ditunjukkan (screenshot) sebelum commit.

Aktor (jawaban Q2 = a):
- **SUPER_ADMIN**: semua.
- **HR_ADMIN** (PT yang ditugaskan): lowongan, kandidat, lamaran, template, jadwal.
- **Pewawancara** = akun mana pun yang tertaut karyawan, **hanya** untuk lamaran yang ia wawancarai: ringkasan kandidat
  + CV + jawaban form (tanpa field sensitif) + penilaian miliknya.
- **Kandidat**: tanpa akun, lewat tautan bertoken (jawaban Q3 = b).
- MANAGER sebagai peminta tenaga kerja (MPP + approval) = fase lanjut (R6).
- Pewawancara eksternal tanpa akun (pengguna 2026-11-24: "harusnya tidak ada"). Bila suatu saat ada, ia cukup
  dicantumkan sebagai **tamu undangan** (email): menerima undangan kalender + tautan rapat, tanpa akun dan tanpa
  form penilaian (§7). Penilaiannya dicatat HR.

## 4. Alur kandidat & mesin status

### 4.1 Model
- Template alur **disalin** ke lowongan saat lowongan dibuat (`job_opening_stages`), seperti *Interview Plan* per job di
  Greenhouse/Ashby. Template boleh diubah bebas tanpa merusak lowongan berjalan, jadi **tidak perlu versi template alur**.
- Tahap lowongan boleh ditambah/diganti nama/diurutkan ulang. **Menghapus** tahap yang masih berisi lamaran ditolak (409).
- Status lamaran: `ACTIVE` → `HIRED` | `REJECTED` | `WITHDRAWN`. `REJECTED`/`WITHDRAWN` bisa **dibuka lagi**
  (kembali `ACTIVE` di tahap terakhir) dengan alasan.

### 4.2 Jenis blok tahap (katalog tetap di kode; pengaturannya data)
| Jenis | Aksi saat masuk tahap | Syarat keluar (guard) |
|---|---|---|
| `INTAKE` (Sumber) | – | data minimum kandidat ada (nama + email/telepon) |
| `FORM` | kirim permintaan form ke kandidat (otomatis atau tombol) | form sudah dikirim, atau HR melewati dengan alasan |
| `SCREENING` | – | keputusan HR (lanjut/tolak) + catatan |
| `ASSESSMENT` (Tes) | opsional: kirim form/tautan tes | hasil dicatat |
| `INTERVIEW` | ajakan menjadwalkan | ≥1 wawancara selesai + penilaian masuk |
| `REFERENCE` | form reference check (diisi HR) | – |
| `OFFER` | – | hasil penawaran: diterima / ditolak kandidat |
| `DOCUMENTS` | kirim form unggah dokumen | – |
| `HIRED` (terminal) | tombol "Kirim ke Penerimaan" (R4) | – |

Guard tidak memblokir mutlak: HR boleh **melewati** guard dengan alasan (tercatat), kecuali `HIRED` yang butuh
data minimum untuk Penerimaan.

### 4.3 Perpindahan (tabel transisi = aturan kode, bukan konfigurasi)
| Perpindahan | Diizinkan | Catatan |
|---|---|---|
| maju ke tahap berikutnya | ya | guard tahap asal |
| maju melompati tahap | ya, **wajib alasan** | dicatat `SKIP` |
| **mundur** ke tahap mana pun yang lebih awal | ya, **wajib alasan** | dicatat `BACK`; aksi masuk tahap dijalankan lagi (mis. form dikirim ulang, jawaban lama terisi sebagai nilai awal) |
| ke `REJECTED`/`WITHDRAWN` | dari tahap mana pun | alasan (daftar + bebas) |
| buka lagi | dari `REJECTED`/`WITHDRAWN` | alasan |

**Minta data tambahan** (tanpa pindah tahap): HR memilih form (atau field tertentu dari form yang ada) → permintaan
form baru → kandidat mengisi → jawaban digabung ke profil. Ini mewujudkan contoh pengguna "setelah wawancara HR ingin
data tambahan / data yang belum terisi".

Implementasi (riset §2): fungsi murni `pipeline-engine.ts` (`canMove(from, to, stages) → {kind, needsReason}`) + service
dalam `$transaction`: cek kolom `version` (konkurensi optimistis, 409 bila bentrok) → tulis `application_events`
(append-only) → `writeAudit`. **Tanpa XState/workflow engine.**

## 5. Form kandidat yang bisa dikustom

### 5.1 Definisi form (JSON berversi, skema zod di `packages/shared/src/recruitment/form-definition.ts`)
```ts
{ version: 1,
  sections: [{ id, title, description?,
    fields: [{ id, key, label, type, required, help?, options?, validation?, sensitive?, showIf?, mapsTo? }] }] }
```
- `type`: `short_text` · `long_text` · `email` · `phone` · `number` · `date` · `single_choice` · `multi_choice` ·
  `dropdown` · `yes_no` · `file` (PDF/DOCX/JPG/PNG, ukuran per field) · `section_note` (teks keterangan).
  Tanda tangan, tabel berulang (riwayat kerja), dan rating = **(usulan) fase lanjut**.
- `key` stabil antarversi → jawaban beberapa form tergabung per kandidat.
- `mapsTo` (opsional): field inti kandidat (`fullName`, `email`, `phone`, `birthDate`, `nik`, …). Inilah jembatan ke
  Penerimaan, karena hanya field ber-`mapsTo` yang dibawa ke calon karyawan.
- `sensitive: true`: data spesifik UU PDP (kesehatan, SKCK, …) hanya terlihat oleh pemegang grant (§8).
- `showIf`: satu kondisi sederhana (`field = nilai`) di fase awal; logika bertingkat = fase lanjut.

### 5.2 Validasi satu sumber
`buildAnswerSchema(definition) → z.object(...)` di `packages/shared`, dipakai **renderer web** (react-hook-form +
zodResolver) dan **api** (validasi kiriman portal). Jawaban disimpan JSONB per kiriman + versi form yang dipakai.

### 5.3 Editor (builder)
Daftar seksi & field dengan seret-urut (`@dnd-kit/core` + `sortable`, sudah dipakai dashboard), panel properti field,
pratinjau langsung memakai renderer yang sama. **Terbitkan** = versi baru yang tidak bisa diubah. Draf hanya satu per
template. Template bawaan (seed) bisa disalin, tidak diubah langsung.

### 5.4 Template form bawaan (REC-D11)
1. **Formulir lamaran umum**: identitas, kontak, pendidikan terakhir, pengalaman singkat, CV, ekspektasi gaji, sumber info.
2. **Data lengkap pra-onboarding**: field ber-`mapsTo` yang dibutuhkan Penerimaan (NIK, TTL, alamat, rekening = sensitif).
3. **Pengumpulan dokumen**: KTP, ijazah, SKCK (sensitif), surat sehat/MCU (sensitif), sertifikat (mis. SIO alat berat).
4. **Reference check** (diisi HR saat menelepon referensi).
5. **Penilaian wawancara** (kriteria 1–5 + rekomendasi; dipakai sebagai template penilaian).
6. **Data tambahan cepat**: kosong, untuk "minta data tambahan" ad hoc.

### 5.5 Template alur bawaan (REC-D11)
- **Staf kantor:** Sumber → Form lamaran → Screening → Wawancara HR → Wawancara user → Penawaran → Dokumen → Diterima.
- **Operator/site (massal):** Sumber (impor) → Form singkat → Tes praktik → MCU (Dokumen) → Diterima.
- **Magang:** Sumber → Form + CV → Wawancara → Diterima.

## 6. Portal kandidat (tanpa login)

- Rute publik terpisah dari `protect`: `GET /api/v1/public/recruitment/forms/{token}`, `POST …/{token}/submit`,
  `POST …/{token}/upload-url`. Halaman web `/f/:token` di luar `AppLayout` (seperti `/absen` memakai shell sendiri).
- Token 32 byte acak (base64url); DB menyimpan **SHA-256** saja; kedaluwarsa bawaan 7 hari (bisa diatur 1–30);
  **sekali kirim**. Tautan baru mencabut tautan lama untuk form yang sama.
- Batas: per token ≤ 30 req/menit, per IP ≤ 120 req/menit. Dihitung di tabel Postgres (`portal_hits`, dibersihkan
  cron); tanpa Redis di fase awal (riset §4).
- Unggah: signed upload URL ke bucket private baru `recruitment-files` (≤ 10 MB; PDF/DOCX/JPG/PNG), path
  `<prefix>/<applicationId>/<uuid>.<ext>`, diverifikasi `getObjectInfo` saat kirim; cek magic bytes di server.
- **Persetujuan PDP** wajib dicentang sebelum kirim (teks + versi disimpan), dengan centang terpisah untuk talent pool.
- Tidak ada halaman lowongan publik di fase awal, jadi CAPTCHA tidak dibutuhkan (riset §4).
- Email ke kandidat lewat `notify`/outbox yang sudah ada (pengirim SMTP Workspace, D-025). Isi: nama PT, tujuan,
  tautan, batas waktu.

## 7. Wawancara & tautan rapat

```ts
interface MeetingProvider {            // apps/api/src/modules/recruitment/meeting/
  readonly kind: "google_meet" | "zoom" | "manual";
  create(input: { title; startsAt; endsAt; timezone; attendees: string[]; description }): Promise<{ url; externalId? }>;
  update(...); cancel(externalId): Promise<void>;
}
```
- `google-meet.ts`: Calendar API `events.insert?conferenceDataVersion=1&sendUpdates=all` pada kalender akun
  rekrutmen, lewat service account + domain-wide delegation (perlu `sub` di `core/google-auth.ts`). Undangan kalender
  otomatis ke kandidat & pewawancara. **Butuh REC-OD2** (Workspace + izin admin).
- **Tamu tanpa akun (kandidat, pewawancara eksternal):** di Calendar API cukup dimasukkan ke `attendees[].email`.
  Dengan `sendUpdates=all`, Google mengirim email undangan (berisi tautan Meet + tombol tambah ke kalender) ke alamat
  mana pun, termasuk di luar domain kantor, dan ikut mengirim pemberitahuan saat jadwal diubah/dibatalkan
  ([events.insert `sendUpdates`](https://developers.google.com/calendar/api/v3/reference/events/insert)).
  Dengan provider `manual`/`zoom`, undangan dikirim lewat email aplikasi (outbox `notification`) berisi tautan +
  lampiran `.ics` agar bisa ditambahkan ke kalender.
- `zoom.ts` (fase lanjut, REC-OD3): S2S OAuth, `POST /users/{host}/meetings`.
- `manual.ts`: HR menempel tautan (atau "tatap muka" + lokasi). Selalu tersedia.
- Dijalankan **inline** saat jadwal disimpan. Gagal → jadwal tersimpan, status tautan `FAILED` + tombol coba lagi.
  Ubah/batal jadwal memperbarui event.
- Pengingat (H-1 & 1 jam sebelum) lewat `notify`. Cron pengingat bergantung jadwal Vercel (CODEMAP §7).
- Kredensial hanya di env: `RECRUITMENT_GOOGLE_SA_KEY` (atau pakai kunci SA yang ada + scope baru),
  `RECRUITMENT_GOOGLE_CALENDAR_USER`, `ZOOM_ACCOUNT_ID`/`ZOOM_CLIENT_ID`/`ZOOM_CLIENT_SECRET`.

## 8. Akses (tambahan PLAN §4.3, usulan)

| Aksi | SA | HR_ADMIN (PT-nya) | Pewawancara (lamaran yang diwawancarai) | HR_PERSONNEL / MGR / EMP |
|---|---|---|---|---|
| Lowongan, kandidat, lamaran, pindah tahap | ✔ | ✔ | – | – |
| Template alur & form (global, dipakai semua PT) | ✔ | ✔ | – | – |
| Lihat ringkasan kandidat + CV + jawaban non-sensitif | ✔ | ✔ | ✔ | – |
| Lihat field `sensitive` (MCU, SKCK, rekening) | ✔ | grant `recruitment.sensitive` | – | – |
| Jadwal wawancara | ✔ | ✔ | lihat miliknya | – |
| Isi penilaian | ✔ | ✔ | ✔ miliknya | – |
| Lihat penilaian orang lain | ✔ | ✔ | **setelah** mengirim penilaiannya sendiri (cegah bias) | – |
| Hapus/anonimkan data kandidat | ✔ | ✔ | – | – |

- Policy murni `recruitment.policy.ts` (`canManageOpening(actor, opening)`, `canViewApplication(actor, app, interviewerIds)`, …).
- Permission baru di `packages/shared/src/permissions.ts`: `recruitment.sensitive` (grantable ke HR_ADMIN).
- Semua aksi tulis → `writeAudit("recruitment.<entity>.<action>")`. Field `sensitive` ikut redaksi audit.

## 9. Model data (skema Postgres `recruitment`; ringkas, detail saat migrasi)

```
job_openings          id, company_id→organization.companies, position_id→organization.positions?, work_location_id?,
                      title, headcount, status(DRAFT|OPEN|ON_HOLD|CLOSED|FILLED), source_template_id, owner_account_id,
                      opened_at, closed_at, created_by, timestamps
job_opening_stages    id, job_opening_id, order, name, type(enum §4.2), config jsonb      -- salinan template alur
pipeline_templates    id, name, description, stages jsonb[{name,type,config}], archived_at, is_system
candidates            id, full_name, email, phone, source(MANUAL|CV|IMPORT|LINKEDIN_URL|REFERRAL|PORTAL), source_url,
                      profile jsonb (gabungan jawaban per key), consent_at, consent_text_version,
                      talent_pool_consent_at, anonymized_at, created_by, timestamps
applications          id, candidate_id, job_opening_id, current_stage_id, status(ACTIVE|HIRED|REJECTED|WITHDRAWN),
                      outcome_reason, version int, hired_employee_id→employee.employees?, closed_at, timestamps
                      unique(candidate_id, job_opening_id)
application_events    id, application_id, kind(CREATED|MOVED|SKIPPED|MOVED_BACK|REJECTED|WITHDRAWN|REOPENED|HIRED|
                      FORM_SENT|FORM_SUBMITTED|NOTE), from_stage_id, to_stage_id, reason, actor_account_id, at  -- append-only
form_templates        id, name, purpose(CANDIDATE|INTERNAL|SCORECARD), is_system, archived_at
form_template_versions id, form_template_id, version, definition jsonb, published_at, published_by   unique(template, version)
form_requests         id, application_id, stage_id?, form_version_id, field_keys text[]? (subset "data tambahan"),
                      token_hash unique, expires_at, status(SENT|OPENED|SUBMITTED|EXPIRED|REVOKED), sent_by, sent_at,
                      submitted_at
form_submissions      id, form_request_id? (null = diisi HR), application_id, form_version_id, answers jsonb,
                      consent_snapshot jsonb, submitted_at, submitted_by_account_id?
candidate_files       id, candidate_id, application_id?, field_key?, object_path, mime, size, created_at
interviews            id, application_id, stage_id, title, starts_at, ends_at, timezone, mode(ONLINE|ONSITE),
                      provider(GOOGLE_MEET|ZOOM|MANUAL), meeting_url, external_event_id, meeting_status(OK|FAILED|NONE),
                      location, status(SCHEDULED|DONE|CANCELLED|NO_SHOW), created_by
interview_interviewers interview_id, employee_id→employee.employees, account_id   pk(interview_id, employee_id)
scorecards            id, interview_id, interviewer_employee_id, form_version_id, answers jsonb,
                      recommendation(STRONG_YES|YES|NO|STRONG_NO), submitted_at   unique(interview, interviewer)
portal_hits           key(token_hash|ip), window_start, count                      -- rate limit, dibersihkan cron
```
- FK hanya ke modul inti (`organization`, `employee`), sesuai PLAN §3.2. `account_id` disimpan sebagai UUID biasa
  (iam bukan modul inti).
- Field `sensitive` disimpan di `answers` yang sama. Penyaringan ada di serializer per actor (bukan di DB).
- ERD dbml ditambahkan ke `docs/erd/` saat R0.

## 10. API (ringkas; kontrak `recruitment.contract.ts`, OpenAPI bernama)

```
/api/v1/recruitment
  job-openings            GET, POST · /{id} GET, PATCH · /{id}/stages PUT · /{id}/close POST
  candidates              GET, POST · /{id} GET, PATCH, DELETE(anonimkan) · /{id}/files/upload-url POST
  applications            GET(?jobOpeningId → papan) , POST · /{id} GET
  applications/{id}/move  POST {toStageId, reason?, version}        -- maju/lompat/mundur
  applications/{id}/reject|withdraw|reopen  POST {reason, version}
  applications/{id}/form-requests  POST {formTemplateId|fieldKeys, expiresInDays} · /{rid}/revoke POST
  applications/{id}/hire  POST → calon karyawan Penerimaan (R4)
  interviews              POST · /{id} PATCH, DELETE · /{id}/meeting/retry POST · /{id}/scorecards POST
  me/interviews           GET                                          -- tampilan pewawancara
  pipeline-templates      CRUD
  form-templates          CRUD · /{id}/versions POST (terbitkan) · /{id}/versions/{v} GET
/api/v1/public/recruitment/forms/{token}   GET · /submit POST · /upload-url POST      -- tanpa protect, token + rate limit
```
Galat: 400 validasi, 401, 403 policy, 404, 409 (`version` bentrok / tahap berisi lamaran), 410 (token kedaluwarsa/dicabut), 429.

## 11. Batas cakupan (fase awal)
- Tidak ada scraping LinkedIn (riset §5).
- Gaji penawaran **tidak** disimpan nominalnya di modul ini (nominal gaji hanya SUPER_ADMIN, PLAN §4.1). Tahap
  Penawaran hanya mencatat status + lampiran surat bila ada (REC-D14). Surat PDF otomatis + approval = fase lanjut.
- Tidak ada halaman lowongan publik, AI parsing CV, Zoom, MPP + approval: fase lanjut.

## 12. Struktur folder

```
apps/api/src/modules/recruitment/
  index.ts                         registerRecruitmentRoutes, runRecruitmentRetention (cron), hireHook
  recruitment.policy.ts            murni
  recruitment.contract.ts          skema respons OpenAPI bernama
  openings.{routes,service,repository}.ts
  candidates.{routes,service,repository}.ts
  applications.{routes,service,repository}.ts
  pipeline-engine.ts               murni: canMove, guard per jenis tahap
  templates.{routes,service,repository}.ts      template alur + form
  portal.{routes,service}.ts       rute publik bertoken + rate limit
  interviews.{routes,service,repository}.ts
  meeting/{provider,google-meet,zoom,manual}.ts
  retention.service.ts             anonimisasi + cron
  __tests__/                       policy, pipeline-engine, form-definition
apps/api/prisma/schema/recruitment.prisma     (+ "recruitment" di _base.prisma schemas)
packages/shared/src/recruitment/{form-definition,answers,enums,inputs}.ts
apps/web/src/features/recruitment/
  openings/ candidates/ board/ (kanban + panel lamaran + riwayat) templates/ form-builder/ form-renderer/
  interviews/ portal/ (halaman publik /f/:token) api.ts access.ts
apps/api/tests/integration/recruitment/        alur + matriks akses (skill hris-flow-testing)
```

## 13. Fase pengiriman (usulan; ukuran S ≈ 1–2 hari, M ≈ 3–5, L ≈ 6–10)

| Fase | Isi | Ukuran | Bergantung |
|---|---|---|---|
| **R0 Fondasi** | skema + migrasi, lowongan, kandidat (manual, unggah CV, URL LinkedIn), grup nav "Rekrutmen" + saklar, policy + matriks akses, audit | M | – |
| **R1 Alur** | template alur + blok tahap, salin ke lowongan, papan kanban, maju/lompat/mundur + riwayat, tolak/mundur/buka lagi | M | R0 |
| **R2 Form + portal** | definisi form + versi, builder dnd, renderer, tautan bertoken, unggah file, minta data tambahan, persetujuan PDP | L | R1 |
| **R3 Wawancara** | jadwal, provider manual → Google Meet, undangan & pengingat, penilaian, tampilan pewawancara | M | R1; Meet butuh REC-OD2 |
| **R4 Diterima → Penerimaan** | dialog "Terima & kirim ke Penerimaan" (§3.1), chip status + pintasan di papan, tautan balik di Penerimaan; **pindah menu Penerimaan ke Personalia** (boleh dikerjakan lebih awal, tidak bergantung saklar; screenshot dulu) | S | R1, ONB |
| **R5 PDP & talent pool** | retensi + anonimisasi otomatis (cron), hapus atas permintaan, talent pool | S–M | R2 |
| R6 lanjut (opsional) | impor CSV kandidat, MPP + approval, lowongan publik + CAPTCHA, isi otomatis CV (AI), Zoom, laporan (time-to-hire, sumber) | – | per keputusan |

Setiap fase: backend + web + test (policy, integration sukses/400/401/403/409) + docs, di balik `FEATURES.recruitment`.

## 14. Risiko
| Risiko | Mitigasi |
|---|---|
| Form builder melebar | Batasi jenis field (§5.1); field lanjut setelah dipakai HR |
| Tautan publik disalahgunakan / bocor | Token hash, kedaluwarsa, sekali kirim, rate limit, tanpa daftar lowongan publik |
| Meet tidak bisa dibuat (bukan Workspace / izin admin belum ada) | Provider `manual` sebagai bawaan; Meet dinyalakan per env |
| Data spesifik bocor ke pewawancara | Field `sensitive` + grant + serializer per actor + test matriks |
| Retensi PDP terlupa | Cron anonimisasi + tes; tampilan "akan dianonimkan pada …" |
| Mengganggu antrean Rilis 1 | Saklar mati di rilis; implementasi setelah Paket 1 (Q5 = a) |
| Unggahan berbahaya (tanpa antivirus) | Batas MIME/ukuran + magic bytes + bucket private + signed URL; ClamAV dicatat sebagai backlog |
