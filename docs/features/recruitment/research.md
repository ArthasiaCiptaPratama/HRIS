# Riset — Rekrutmen / Talent Acquisition

> Diakses 2026-11-24. Riset web dikerjakan worker `agy-research` (Gemini Flash; satu pertanyaan diverifikasi ulang
> dengan Claude Opus), lalu versi & lisensi pustaka dicek langsung ke registry npm. Isi riset = petunjuk, bukan
> fakta final. Klaim yang belum dicek ke sumber primer ditandai **(belum diverifikasi)**.
> Rangkuman keputusan: [README](README.md) · rancangan: [design.md](design.md).

## 1. Tautan rapat otomatis

### Google Meet (Calendar API v3)
- `POST calendars/{calendarId}/events?conferenceDataVersion=1` dengan
  `conferenceData.createRequest = { requestId: <unik>, conferenceSolutionKey: { type: "hangoutsMeet" } }`.
  Tanpa `conferenceDataVersion=1`, data rapat diabaikan.
  ([events.insert](https://developers.google.com/calendar/api/v3/reference/events/insert))
- Scope: `https://www.googleapis.com/auth/calendar.events` (paling sempit). Scope ini termasuk *sensitive*: aplikasi
  OAuth publik butuh verifikasi Google. Aplikasi internal Workspace + service account tidak melewati layar
  persetujuan. ([OAuth scopes](https://developers.google.com/identity/protocols/oauth2/scopes))
- **Service account tanpa domain-wide delegation (DWD) gagal** (`400 Invalid conference type value`): service account
  tidak punya lisensi Meet. Jalur server-ke-server yang bisa membuat Meet = **Google Workspace + DWD** dengan
  impersonasi satu akun (mis. `rekrutmen@<domain>`; klaim `sub` di JWT). OAuth per-HR juga bisa dipakai (termasuk
  Gmail pribadi), tetapi tiap HR harus menghubungkan akunnya dan token refresh harus disimpan terenkripsi.
  ([Service account delegation](https://developers.google.com/workspace/guides/create-credentials#service-account))
- Kuota: 10.000 req/menit/projek, 600 req/menit/pengguna. Jauh di atas kebutuhan.
  ([Quota](https://developers.google.com/calendar/api/guides/quota))
- Alternatif: Meet REST API v2 `spaces.create` (GA 21 Feb 2024, scope `meetings.space.created`, juga butuh Workspace).
  Hasilnya ruang rapat saja, tanpa undangan kalender. Untuk wawancara, Calendar API lebih berguna karena undangan
  kalender + email terkirim ke kandidat & pewawancara sekaligus (`sendUpdates=all`).
  ([spaces.create](https://developers.google.com/workspace/meet/api/reference/rest/v2/spaces/create))
- **Di repo:** `apps/api/src/core/google-auth.ts` sudah menukar JWT service account (jose) menjadi access token
  untuk Drive (D-060) & FCM (MOB-D6). Untuk DWD cukup ditambah klaim `sub` opsional, jadi **tidak perlu pustaka
  `googleapis`**: cukup `fetch` ke REST Calendar.

### Zoom (Server-to-Server OAuth)
- Token: `POST https://zoom.us/oauth/token` (`grant_type=account_credentials&account_id=…`, Basic
  `client_id:client_secret`), berlaku 1 jam, tanpa refresh token. Aplikasi S2S bersifat internal: tidak perlu
  review Marketplace. ([S2S OAuth](https://developers.zoom.us/docs/internal-apps/s2s-oauth/))
- `POST /v2/users/{userId}/meetings`, scope granular `meeting:write:meeting:admin`. Kategori *Light*: 4 req/dtk
  (Basic), 30 (Pro), 80 (Business+). Batas **100 buat/ubah rapat per host per hari**.
  ([Rate limits](https://developers.zoom.us/docs/api/rest/rate-limits/))
- Akun gratis (Basic) bisa memakai API, tetapi **rapat dibatasi 40 menit**.
  ([Time limits](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0065099))
- Webhook bertanda tangan HMAC SHA-256 (`x-zm-signature`) + validasi URL. Belum dibutuhkan di fase awal.

### Implikasi rancangan
Abstraksi `MeetingProvider` (`google-meet` · `zoom` · `manual`). `manual` = HR menempel tautan, selalu tersedia
sebagai cadangan. Kredensial hanya di env (`RECRUITMENT_GOOGLE_*`, `ZOOM_*`), tidak di DB. Pembuatan rapat
dijalankan **inline** saat HR menyimpan jadwal (latensi ±1 dtk, HR menunggu hasil). Gagal → jadwal tetap tersimpan
dengan status "tautan gagal dibuat" + tombol coba lagi. Tidak perlu cron.

## 2. Alur kandidat (pipeline) & iterasi mundur

### Pembanding ATS
| Produk | Template alur | Mundur ke tahap sebelumnya | Aksi otomatis per tahap |
|---|---|---|---|
| Greenhouse | *Interview Plan* per lowongan, disalin dari *Template Job* | *Move Stage* bebas; tercatat di *Activity Feed* | *Stage Transition Rules*: minta jadwal, tautan self-schedule, take-home test, e-sign |
| Lever | Tahap global; *Interview Plan* per posting | *Change Stage*; tercatat di *Candidate Story* | *Automation Workflows*: email, arsip, tag |
| Ashby | *Shared Interview Plans* sebagai template, atau kustom per lowongan | *Change Stage*; *Candidate Feed* | *Stage Activities*: email, tautan booking, asesmen, form (bersyarat) |

Sumber: [Greenhouse activity feed](https://support.greenhouse.io/hc/en-us/articles/360037386272-Candidate-activity-feed),
[stage transition rules](https://support.greenhouse.io/hc/en-us/articles/360053129752-Stage-transition-rules-overview),
[interview plan](https://support.greenhouse.io/hc/en-us/articles/115002194903-Interview-plan-overview);
[Lever change stage](https://help.lever.co/s/article/Changing-the-stage-of-an-opportunity),
[automation](https://help.lever.co/s/article/Create-and-Manage-Automation-Workflows);
[Ashby feed](https://docs.ashbyhq.com/candidate-profile-candidate-feed), [activities](https://docs.ashbyhq.com/activities),
[interview plans](https://docs.ashbyhq.com/interview-plans).
Pola umum: **template → disalin per lowongan → kandidat bergerak maju/mundur dengan riwayat**. Aksi melekat pada
*masuk tahap*. Produk lokal (Talenta/Mekari, Glints, Kalibrr) tidak sempat diriset (timeout); pola di atas cukup
sebagai acuan.

### Mesin status
- **Rekomendasi riset:** tabel transisi berbasis data + guard di service (Prisma `$transaction`), bukan XState.
  XState v5 (`xstate` 5.33.4, MIT) bisa menyimpan snapshot, tetapi mengompilasi JSON buatan admin menjadi mesin
  XState rapuh terhadap perubahan skema. `@xstate/store` hanya event store, bukan statechart.
  ([persistence](https://stately.ai/docs/persistence), [xstate-store](https://stately.ai/docs/xstate-store))
- Workflow engine (Temporal butuh worker tetap; Inngest/Trigger.dev/Vercel Workflow = eksekusi tahan lama untuk efek
  samping). Tidak cocok sebagai penyimpan status kanban; tidak diperlukan karena efek samping (email) sudah lewat
  outbox `notification` + cron `email-retry`.
- **Versi template = salin saat terbit (copy-on-publish):** lamaran terikat ke `template_version_id`. Template diubah
  → versi baru; lamaran berjalan tidak rusak.
- **Konkurensi optimistis:** kolom `version` + `WHERE id AND version` (Prisma `P2025` bila bentrok).
  ([Prisma OCC](https://www.prisma.io/docs/orm/prisma-client/queries/transactions#optimistic-concurrency-control))
- **Riwayat append-only** per perpindahan (dari, ke, arah maju/mundur, alasan, aktor). Ditambah `writeAudit` yang
  sudah ada.

## 3. Form kandidat yang bisa dikustom (form builder)

| Opsi | Versi (npm, 2026-11-24) | Lisensi | Catatan |
|---|---|---|---|
| SurveyJS Form Library | `survey-core` 3.2.7 | MIT | Renderer gratis; **Survey Creator (builder) berbayar** €499–€1.998+/dev; ±440 kB gzip; gaya sendiri, bukan Tailwind |
| Form.io | `@formio/react` 6.2.2 | MIT | Skema & CSS sendiri, bentrok dengan shadcn |
| react-jsonschema-form | `@rjsf/core` 6.11.1 | Apache-2.0 | Ada tema `@rjsf/shadcn`; tanpa builder drag & drop; JSON Schema (bukan zod) |
| JSON Forms | `@jsonforms/core` 3.8.0 (belum diverifikasi) | MIT | Tanpa renderer shadcn resmi |
| Puck | `@measured/puck` 0.20.2 | MIT | Editor drag & drop komponen React (pra-1.0) |
| dnd-kit | `@dnd-kit/core` 6.3.1 (**sudah dipakai repo**, dashboard) · `@dnd-kit/react` 0.5.3 | MIT | `@dnd-kit/react` pra-1.0 |
| Formbricks | – | AGPLv3 / EE | Untuk survei umpan balik, bukan form data; AGPL tidak cocok |

Sumber: [surveyjs pricing](https://surveyjs.io/pricing), npm registry (dicek langsung), [formbricks](https://github.com/formbricks/formbricks).

**Rekomendasi:** bangun sendiri. Definisi form = JSON berversi di Postgres (JSONB), divalidasi skema zod di
`packages/shared`. Renderer memakai komponen shadcn yang ada + react-hook-form, dengan validasi zod yang dibangkitkan
dari definisi (dipakai sama di api & web). Editor memakai `@dnd-kit/core` + `@dnd-kit/sortable` yang **sudah
terpasang**. **Tidak ada pustaka baru**, tanpa lisensi berbayar, gaya konsisten. Risiko: kerja editor lebih banyak;
dibatasi ke jenis field yang dibutuhkan (lihat design §5).

## 4. Portal kandidat publik (tautan bertoken)
- Token CSPRNG ≥128 bit; DB hanya menyimpan **hash SHA-256**; kedaluwarsa (form lamaran 3–14 hari); dicabut saat
  form dikirim atau tahap berubah; dibandingkan constant-time.
  ([OWASP Forgot Password CS](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html))
- Rate limit di serverless: `@upstash/ratelimit` 2.2.1 (MIT) butuh Redis Upstash (layanan baru + env). Alternatif
  tanpa layanan baru: tabel hitungan per token/IP di Postgres (cukup untuk volume rendah). Repo belum punya rate limit
  umum; batas undangan onboarding/jam memakai hitungan DB.
- CAPTCHA (hanya bila ada halaman lamaran publik terbuka): Cloudflare Turnstile gratis tanpa cookie pelacak;
  reCAPTCHA gratis dipotong jadi 10.000/bulan (Apr 2024). Tautan bertoken (tanpa halaman lowongan publik) tidak butuh
  CAPTCHA. ([Turnstile](https://developers.cloudflare.com/turnstile/), [reCAPTCHA pricing](https://cloud.google.com/recaptcha/pricing))
- Unggah CV: signed upload URL langsung ke bucket private Supabase (pola `onboarding.routes.ts` + `getObjectInfo`
  untuk cek ukuran/MIME setelah unggah), nama file = UUID, PDF/DOCX/JPG ≤ 5–10 MB, cek magic bytes. Pemindaian virus
  (ClamAV) tidak tersedia di Supabase; dicatat sebagai risiko, bukan fase awal.
  ([OWASP File Upload CS](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html),
  [createSignedUploadUrl](https://supabase.com/docs/reference/javascript/storage-createsigneduploadurl))

## 5. "Scraping LinkedIn"
- **User Agreement §8.2** melarang scraper, bot, plugin/ekstensi browser yang menyalin data profil, termasuk profil
  publik. ([User Agreement](https://www.linkedin.com/legal/user-agreement))
- **hiQ Labs v. LinkedIn:** CFAA tidak berlaku untuk data publik (9th Cir., Apr 2022), tetapi pengadilan memutus hiQ
  melanggar kontrak (Nov 2022); consent judgment US$500.000, larangan permanen, dan pemusnahan data (Des 2022).
  ([9th Cir.](https://law.justia.com/cases/federal/appellate-courts/ca9/17-16786/17-16786-2022-04-18.html),
  [docket](https://www.courtlistener.com/docket/6064434/hiq-labs-inc-v-linkedin-corporation/))
- **LinkedIn v. Nubela (Proxycurl):** digugat 24 Jan 2025 (N.D. Cal. 3:25-cv-00828); Proxycurl tutup 4 Jul 2025.
  ([pengumuman](https://nubela.co/blog/proxycurl-is-shutting-down/))
- API resmi (Recruiter System Connect, Apply Connect) hanya untuk partner + lisensi LinkedIn Recruiter.
  ([RSC](https://learn.microsoft.com/en-us/linkedin/talent/recruiter-system-connect/overview),
  [Apply Connect](https://learn.microsoft.com/en-us/linkedin/talent/apply-connect/overview))
- Ekstensi "klip profil" ATS ikut dilarang §8.2; akun pemakai berisiko dibatasi. Cara deteksi LinkedIn
  (belum diverifikasi).
- Aspek UU PDP: mengumpulkan data pribadi tanpa dasar pemrosesan/persetujuan subjek berisiko.
- **Alternatif aman:** tempel URL profil sebagai tautan + isi manual; unggah CV; impor CSV/Excel ekspor portal
  lowongan; kandidat mengisi sendiri lewat tautan form.

## 6. Isi otomatis dari CV
- Ekstraksi teks lokal: `unpdf` 2.2.2 (MIT), `mammoth` 1.13.0 (BSD-2-Clause) untuk DOCX.
- Parser open source (OpenResume AGPL-3.0, pyresparser GPLv3 diarsipkan) lemah untuk CV berbahasa Indonesia; lisensi
  copyleft.
- API komersial (Affinda ±US$0,10/dok, RChilli, Textkernel): biaya berulang.
- LLM + structured output: ±2k token masuk/800 keluar per CV. Biayanya sangat kecil (harga per model berubah; angka
  di riset memakai model lama, **cek ulang saat fase itu**).
- **UU PDP Pasal 56:** transfer data pribadi ke luar negeri butuh negara tujuan setara / perlindungan mengikat /
  persetujuan subjek. Perlu persetujuan kandidat + DPA vendor (zero data retention).

## 7. UU PDP No. 27/2022 (relevan untuk rekrutmen)
- Dasar pemrosesan: persetujuan eksplisit pelamar (Pasal 20). **Data pribadi spesifik** (Pasal 4 ayat 2) yang muncul
  di rekrutmen: kesehatan/MCU, catatan kejahatan/SKCK, biometrik, keuangan pribadi.
- Hapus/musnahkan setelah tujuan selesai atau masa retensi habis (Pasal 43–44). Simpan untuk talent pool butuh
  persetujuan terpisah.
- Hak subjek data: koreksi (Pasal 30), akses/salinan (Pasal 32), tarik persetujuan/hentikan pemrosesan (Pasal 40);
  dipenuhi **≤ 3×24 jam**.
- Kebocoran: pemberitahuan tertulis ke subjek & lembaga ≤ 3×24 jam (Pasal 46). DPO wajib bila pemrosesan berskala
  besar / data spesifik sistematis (Pasal 53).
- Sanksi administratif hingga 2% pendapatan tahunan (Pasal 57); pidana Pasal 65–68.
- Sumber primer: [UU 27/2022, JDIH BPK](https://peraturan.bpk.go.id/Details/229798/uu-no-27-tahun-2022).
- **PP pelaksana:** dua worker riset menyebut **PP No. 33 Tahun 2026** (diundangkan 16 Jul 2026, transisi s.d. 16 Jan
  2027) dan Perpres Lembaga PDP belum terbit. **(belum diverifikasi ke sumber primer: cari "PP 33 Tahun 2026" di
  peraturan.bpk.go.id sebelum dijadikan rujukan.)**

## 7a. Letak onboarding terhadap rekrutmen (produk lain)
| Produk | Letak onboarding | Serah-terima | Onboarding tanpa ATS |
|---|---|---|---|
| Mekari Talenta | Employees › Onboarding (Recruitment modul terpisah) | "Set up onboarding" | ya |
| BambooHR | Hiring (ATS) terpisah; New Hire Packet di profil/pengaturan | "Hire Candidate" | ya |
| Workable | Employees › Onboarding | tahap Hired → "Onboard" | tidak (ATS dulu) |
| Personio | Recruiting terpisah; onboarding di People/profil | "Create employee profile" | ya |
| Rippling | Recruiting (app) terpisah; onboarding di HR inti | "Hire" | ya |

Pola umum: **onboarding berada di grup Karyawan/People**, rekrutmen grup sendiri, disambung oleh satu aksi "Hire".
Sumber: [Talenta](https://help-center.talenta.co/hc/en-us/articles/360060935531-Sekilas-tentang-Onboarding-pada-Talenta),
[Workable](https://help.workable.com/hc/en-us/articles/31873259155991-Onboarding-new-hires), help center BambooHR,
Personio, Rippling (URL artikel tidak spesifik; **belum diverifikasi** per halaman).

## 8. Pustaka baru — ringkasan
| Kebutuhan | Keputusan | Alasan |
|---|---|---|
| Google Meet | **tidak ada** (fetch + `core/google-auth.ts`) | jose sudah ada; hindari `googleapis` yang besar |
| Zoom | **tidak ada** (fetch) | REST sederhana |
| Mesin status | **tidak ada** | tabel transisi + guard |
| Form builder | **tidak ada** (`@dnd-kit/core`/`sortable` sudah terpasang) | gaya shadcn, tanpa lisensi |
| Rate limit portal | **tidak ada** di fase awal (hitungan Postgres) | `@upstash/ratelimit` + Redis bila portal lowongan publik dibuka |
| Ekstraksi CV | `unpdf` + `mammoth` **hanya bila** fase isi otomatis disetujui | MIT/BSD, kecil |
| CAPTCHA | Turnstile **hanya bila** halaman lowongan publik dibuka | gratis, privat |
