# Pemindahan deployment ke akun Vercel Pro

> **Status:** panduan (2026-10-15, permintaan pemilik projek) — belum dijalankan. Berlaku untuk **staging** (`hris-staging-api`, `hris-staging-web`) yang sekarang ada di akun pribadi `oatse` paket **Hobby** (D-036). Produksi tetap menunggu **OD-4** (kepemilikan akun kantor); panduan ini bisa dipakai ulang untuk produksi.
> **Aturan:** setiap langkah yang menulis ke Vercel / GitHub / Supabase adalah aksi keluar — ditanya ke pemilik projek tepat sebelum dijalankan (skill `hris-workflow`). **Nilai rahasia tidak pernah ditulis di dokumen ini, di chat, atau di commit** — hanya nama variabel.

Rujukan: [D-016](../../decisions.md#d-016) · [D-029](../../decisions.md#d-029) · [D-030](../../decisions.md#d-030) · [D-036](../../decisions.md#d-036) · [RELEASE §6 rotasi rahasia](../../RELEASE.md#6-wajib-sebelum-produksi) · workflow `.github/workflows/deploy-staging.yml` · `apps/api/vercel.json` · `apps/web/vercel.json`.

## Checkpoint 2026-10-15 (berhenti di sini; lanjut dari sini)

- **Tujuan dipilih pemilik projek:** team Vercel **Pro "Arthasia Akselerasi"** (`arthasia-akselerasi`, `team_xDA1pGujNeVtv8qdSzzYoTqJ`, owner `oatse2458@arthasia.com`, Mat = viewer) — untuk **produksi**; staging ikut dipindah ke sana (jalur **A. transfer**). Domain sendiri ditunda. Team Pro masih **kosong**.
- **Sudah:** akun baru login di CLI dengan config terpisah (`vercel login --global-config <scratchpad>/vercel-pro`; CLI default tetap akun lama `oatse` / `oatses-projects`). Dibaca dari project lama: api root `apps/api` (hono, Node 24, files outside root ✔), web root `apps/web` (vite); proteksi SSO hanya preview; **6 cron terdaftar** (verifikasi §5 sebagian ✔); env Production api 14 (`APP_URL`, `CORS_ORIGINS`, `CRON_SECRET`, `DATABASE_URL`, `EMAIL_FROM`, `GOOGLE_SERVICE_ACCOUNT_JSON`, `LOGIN_EMAIL_DOMAIN`, `LOG_LEVEL`, `SMTP_HOST/PASS/PORT/USER`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`), web 4 (`VITE_*`).
- **Cadangan nilai env GAGAL:** env bertipe *sensitive* → `vercel env pull` hanya memberi variabel sistem. Sebelum transfer, pastikan nilai bisa diisi ulang bila tidak ikut (sumber: Supabase dashboard, `.env` lokal staging, akun SMTP, JSON service account).
- **Token deploy Vercel** (scope Arthasia Akselerasi) sudah dibuat pemilik projek dan **pernah tertulis di chat** → wajib dirotasi (RELEASE §6); dipasang ke GitHub `VERCEL_TOKEN` **setelah** transfer.
- **Belum:** transfer (akun lama: request transfer → akun baru: terima), ganti secret `VERCEL_ORG_ID` = `team_xDA1pGujNeVtv8qdSzzYoTqJ` + `VERCEL_TOKEN`, cek `VERCEL_PROJECT_ID_*`, Run workflow `Deploy staging`, verifikasi §5, catat `FND-D1` + OD-4 (sebagian terjawab).

---

## 1. Inventaris saat ini (yang harus ikut pindah)

### 1.1 Project Vercel

| Project | Id | Root | Framework / runtime | Region | Domain |
|---|---|---|---|---|---|
| `hris-staging-api` | `prj_YikNSEXpoKlOMC6Jli7a0MPjk0vu` | `apps/api` | Hono, **Bun runtime** (`bunVersion: 1.x`) | `sin1` | `https://hris-staging-api.vercel.app` |
| `hris-staging-web` | `prj_YZVG4UA4Ug5vhAPkbZBaA4e1tm7W` | `apps/web` | Vite (SPA, rewrite semua path → `/index.html`) | – (statis) | `https://hris-staging-web.vercel.app` |

Team/akun sekarang: `team_LT9rBNwfha3zcvHfBB85LEXk` (scope `oatses-projects`, Hobby).

Pengaturan project yang **bukan** dari `vercel.json` (dicek di dashboard › Settings, ikut pindah bila **transfer**, harus diatur ulang bila **buat baru**):
- Root Directory (`apps/api` / `apps/web`), "Include files outside the root directory" **aktif** (monorepo: `installCommand` = `cd ../.. && bun install --frozen-lockfile`).
- Deployment Protection: **Vercel Authentication hanya untuk Preview**; deployment Production (= staging) **tidak** dilindungi (kalau dilindungi, web tidak bisa memanggil api — pelajaran D-036).
- Git integration: **tidak dipakai** (deploy lewat GitHub Actions + Vercel CLI, D-036).

### 1.2 Environment variables (Production) — nama saja

**`hris-staging-api`** (skema `apps/api/src/env.ts`):

| Variabel | Isi / sumber | Catatan saat pindah |
|---|---|---|
| `NODE_ENV` | `production` | |
| `LOG_LEVEL` | `info` | opsional |
| `DATABASE_URL` | Supabase staging, **transaction pooler** port 6543 | sama (DB tidak pindah) |
| `DIRECT_URL` | Supabase staging, session pooler 5432 | sama |
| `CORS_ORIGINS` | URL web staging | **ganti** bila domain web berubah |
| `APP_URL` | URL web staging (tautan email) | **ganti** bila domain web berubah |
| `SUPABASE_URL` | URL project Supabase staging | sama |
| `SUPABASE_SERVICE_ROLE_KEY` | rahasia Supabase | sama (atau rotasi, RELEASE §6) |
| `CRON_SECRET` | rahasia acak; Vercel mengirim `Authorization: Bearer <CRON_SECRET>` ke cron | **buat baru** di akun baru (disarankan) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` | Gmail/Workspace pengirim staging (D-032) | sama |
| `ONBOARDING_INVITES_PER_HOUR` | batas undangan/jam | opsional |
| `LOGIN_EMAIL_DOMAIN` | domain email login NIP (D-063) | sama |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | akun layanan Drive lampiran import (D-060) | sama |
| `STORAGE_PATH_PREFIX` | kosong di staging | sama |

**`hris-staging-web`** (skema `apps/web/src/lib/env.ts`, dibaca saat **build** — Vite menanam nilainya ke bundle):

| Variabel | Isi | Catatan |
|---|---|---|
| `VITE_API_BASE_URL` | URL api staging + `/api/v1` | **ganti** bila domain api berubah, lalu **build ulang** |
| `VITE_SUPABASE_URL` | URL Supabase staging | sama |
| `VITE_SUPABASE_ANON_KEY` | publishable/anon key Supabase | sama |
| `VITE_LOGIN_EMAIL_DOMAIN` | sama dengan api | sama |

> Env opsional dev `LOCAL_*` / `STAGING_*` / `SUPABASE_DATABASE_URL` (switch DB lokal) **tidak** dipasang di Vercel.

### 1.3 Cron (dari `apps/api/vercel.json`, terdaftar otomatis saat deploy production)

| Path | Jadwal (UTC) | Fungsi |
|---|---|---|
| `/api/cron/document-expiry` | `0 0 * * *` | pengingat dokumen kedaluwarsa (D-055) |
| `/api/cron/asset-daily` | `30 0 * * *` | aset terlambat, APD jatuh tempo, aset karyawan keluar (ARS-D5/D6) |
| `/api/cron/discipline-daily` | `45 0 * * *` | SP kedaluwarsa + pengingat konfirmasi (ARS-D8/D9) |
| `/api/cron/grant-expiry` | `0 1 * * *` | grant akan kedaluwarsa |
| `/api/cron/email-retry` | `0 2 * * *` | kirim ulang `email_outbox` |
| `/api/cron/onboarding-maintenance` | `0 3 * * *` | bersihkan calon batal, pengingat undangan (D-045) |
| *(belum terdaftar)* `roster-extend`, `attendance-daily`, `leave-daily` | – | Time Management (milik Mat) — daftarkan saat TM dirilis; di Pro bisa lebih sering dari sekali sehari |

Semua cron menolak permintaan tanpa `CRON_SECRET` (401). Hobby: cron hanya sekali sehari dan jamnya tidak presisi; Pro: jadwal lebih rapat & presisi — **cek batas terbaru di halaman Pricing/Cron Jobs Vercel saat pindah** (belum diverifikasi di dokumen ini).

### 1.4 GitHub (repo `ArthasiaCiptaPratama/HRIS`, Settings › Secrets and variables › Actions)

| Secret | Dipakai | Saat pindah |
|---|---|---|
| `VERCEL_TOKEN` | job `vercel-api` & `vercel-web` | **ganti** dengan token akun/team baru (scope team Pro) |
| `VERCEL_ORG_ID` | sama | **ganti** dengan id team baru (`team_…`) |
| `VERCEL_PROJECT_ID_API` | job api | **ganti** bila project dibuat baru (transfer: cek, biasanya tetap) |
| `VERCEL_PROJECT_ID_WEB` | job web | idem |
| `STAGING_DIRECT_URL` | job migrasi | tidak berubah |

### 1.5 Supabase staging (Authentication › URL Configuration)

- **Site URL** & **Redirect URLs**: berisi URL web staging (+ `http://localhost:5173/**`). Tautan email undangan/reset memakai URL ini → **ganti** bila domain web berubah.
- Template email (`docs/email-templates/`) memakai `{{ .SiteURL }}` / `APP_URL` → ikut domain baru.

---

## 2. Pilih jalur

| | **A. Transfer project (disarankan)** | **B. Buat project baru** |
|---|---|---|
| Cara | Dashboard project › Settings › General › *Transfer Project* ke team Pro (atau REST `POST /projects/{id}/transfer-request` → terima dengan kode di team tujuan) | Buat 2 project baru di team Pro, isi ulang semua pengaturan & env |
| Env, domain `*.vercel.app`, pengaturan | ikut pindah | diisi ulang manual |
| Domain tetap `hris-staging-*.vercel.app` | ya (domain ikut project) | **tidak bisa** selama project lama masih ada (nama `*.vercel.app` unik global) — hapus/ganti nama project lama dulu (ada jeda) atau pakai domain baru |
| Risiko | rendah; cek ulang env & proteksi setelah transfer | salah ketik env, domain berubah → harus ubah CORS/APP_URL/VITE_API_BASE_URL/Supabase |

Pertanyaan untuk pemilik projek sebelum mulai: (1) jalur A atau B, (2) akun Pro ini untuk staging saja atau sekalian calon produksi (OD-4), (3) mau sekalian **domain sendiri** (mis. `hris-staging.<domain-kantor>`) — sangat disarankan: pindah akun berikutnya cukup memindah domain, URL tidak berubah.

---

## 3. Jalur A — transfer project

1. **Persiapan (tanpa gangguan)**
   - Pastikan team Pro sudah ada dan pemilik projek **Owner** di kedua akun.
   - Catat ulang inventaris §1 dari dashboard lama (nama env, proteksi, domain). Unduh cadangan nilai env ke file lokal yang **tidak di-commit**: `vercel env pull .env.staging-api --environment=production` (di folder `apps/api`, setelah `vercel link`) — hapus file itu setelah selesai.
   - Jangan ada deploy yang berjalan (cek tab Actions; tahan merge ke `HRIS/debug/fe-be`).
2. **Transfer** `hris-staging-api` lalu `hris-staging-web` ke team Pro; terima di team tujuan.
3. **Cek setelah transfer** (dashboard team baru):
   - Settings › Environment Variables: semua nama di §1.2 ada di Production.
   - Settings › Deployment Protection: Vercel Authentication **hanya Preview**.
   - Settings › Domains: `hris-staging-api.vercel.app` / `hris-staging-web.vercel.app` terpasang.
   - Settings › Functions: region `sin1` (api).
4. **GitHub secrets:** buat token baru di team Pro (scope team, masa berlaku sesuai kebijakan), lalu ganti `VERCEL_TOKEN` dan `VERCEL_ORG_ID`; cek `VERCEL_PROJECT_ID_API/WEB` = id project di team baru.
5. **Deploy ulang:** Actions › `Deploy staging` › *Run workflow* (branch `HRIS/debug/fe-be`) — migrasi "no pending", api, web harus hijau. Cron didaftarkan ulang oleh deploy production ini.
6. **Verifikasi:** §5.
7. **Bersih-bersih:** cabut token lama (akun `oatse`), catat di RELEASE §4 & D-036 (keputusan baru `FND-Dn`: staging pindah ke team Pro).

## 4. Jalur B — project baru

1. Buat `hris-staging-api` (Root `apps/api`, framework Hono, include files outside root) dan `hris-staging-web` (Root `apps/web`, framework Vite) di team Pro. Nama boleh sama kalau project lama sudah dihapus; kalau belum, pakai nama sementara lalu catat domain barunya.
2. Isi env Production sesuai §1.2 (salin nilai dari dashboard lama / `vercel env pull` lama; **`CRON_SECRET` baru**). Bila domain berubah: set `CORS_ORIGINS`, `APP_URL` (api) dan `VITE_API_BASE_URL` (web) ke domain baru.
3. Deployment Protection: Vercel Authentication hanya Preview.
4. GitHub secrets: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID_API`, `VERCEL_PROJECT_ID_WEB` → nilai baru.
5. Supabase staging › URL Configuration: tambah domain web baru ke Site URL / Redirect URLs (biarkan domain lama sampai verifikasi selesai).
6. Deploy ulang lewat `Deploy staging` (*Run workflow*), lalu verifikasi §5.
7. Setelah lulus: hapus domain lama dari Supabase Redirect URLs, hapus/arsipkan project lama, cabut token lama.

## 5. Verifikasi setelah pindah (wajib, dicatat di `docs/qa/runs/<tanggal>-pindah-vercel.md`)

- `GET <api>/api/v1/health` → 200 `database: ok`; web terbuka; login 4 akun uji (SA/HR/MGR/EMP).
- `GET <api>/api/cron/discipline-daily` tanpa header → **401**.
- Cron terdaftar: dashboard › project api › Settings › Cron Jobs **6 job** sesuai §1.3, atau CLI `vercel crons ls` (scope team baru). Opsional: jalankan satu cron manual dari dashboard / `vercel crons run /api/cron/email-retry` dan cek log 200.
- Email: undang/reset password akun uji → tautan di email mengarah ke domain web yang benar.
- Upload foto/dokumen (Supabase Storage) & unduh PDF BAST/SP berhasil.
- Supabase advisor tidak berubah; tidak ada error 5xx di log runtime Vercel 30 menit pertama.
- QA staging singkat: jalankan ulang skrip `QA/2026-10-15-staging-sp/qa-staging-sp.ts` (ganti URL bila domain berubah).

## 6. Rollback

- Jalur A: transfer balik ke akun `oatse` (selama belum dihapus) + kembalikan 4 secret GitHub lama.
- Jalur B: project lama jangan dihapus sampai §5 lulus; rollback = kembalikan 4 secret GitHub lama + Redirect URLs Supabase, lalu *Run workflow* `Deploy staging`.
- DB tidak ikut pindah → tidak ada rollback data.

## 7. Setelah pindah ke Pro (peluang, keputusan terpisah)

- **Git integration** Vercel untuk repo organisasi (tidak tersedia di Hobby) — tetap disarankan memakai GitHub Actions + CLI agar **migrasi selalu sebelum deploy** (D-030/D-036).
- **Preview deployment per PR** dengan env Preview terpisah (jangan arahkan ke DB staging tanpa keputusan).
- Cron Time Management lebih rapat (mis. `attendance-daily` tiap jam) bila dibutuhkan Mat.
- Anggota team (Mat) sebagai Member → bisa melihat log tanpa memakai akun pemilik projek.
- Rotasi rahasia sekaligus (RELEASE §6): `SUPABASE_SERVICE_ROLE_KEY`, password DB staging, `SMTP_PASS`, `CRON_SECRET`, token Vercel.

## 8. Checklist ringkas

- [ ] Pilih jalur (A/B), tujuan akun (staging/produksi), domain sendiri atau tidak
- [ ] Inventaris & cadangan env (file lokal, tidak di-commit)
- [ ] Transfer / buat project + pengaturan + env (`CRON_SECRET` baru)
- [ ] Deployment Protection hanya Preview
- [ ] GitHub secrets `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID_API`, `VERCEL_PROJECT_ID_WEB`
- [ ] Supabase Site URL / Redirect URLs (bila domain berubah)
- [ ] `Deploy staging` › Run workflow hijau
- [ ] Verifikasi §5 (health, login 4 role, cron 401 & 6 job terdaftar, email, storage, PDF)
- [ ] Cabut token lama, hapus project lama (jalur B), catat RELEASE §4 + keputusan `FND-Dn`
