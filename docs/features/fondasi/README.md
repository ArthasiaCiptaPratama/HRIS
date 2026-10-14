# Fondasi

> **Kode prefix:** `FND` · **Fase:** 0–1 · **PIC:** Oatse (+ Mat: tukar DB lokal ⇄ Supabase) · **Branch:** `HRIS/Oatse/Linux-Windows` (develop) · **Saklar `FEATURES`:** –
> **Status:** Selesai (pemilik projek 2026-10-12); sisa: uji `bun run dev` di Windows, OD-9, OD-12

Monorepo Bun, Prisma 7 multi-skema, CI GitHub Actions, staging Supabase + Vercel (D-029, D-030, D-036), jalur develop/rilis (D-043), tooling lokal (Docker Postgres, `db:use`), skill projek.

Dokumen fitur ini: **README** (status, checklist, keputusan) · [log.md](log.md). Induk: [PROGRESS](../../PROGRESS.md).

## Checklist

Legenda: `[ ]` belum · `[~]` sedang · `[x]` selesai · `[-]` dibatalkan/ditunda. Langkah baru: sub-item `(tambahan YYYY-MM-DD) alasan`.

### Fase 0 — Instruksi Projek
- [x] Sesi grill keputusan (D-001 s.d. D-022)
- [x] `docs/PLAN.md`
- [x] `docs/CODEMAP.md`
- [x] `docs/PROGRESS.md`
- [x] `docs/PROMPT.md`
- [x] `CLAUDE.md` + tautan di `README.md`
- [x] Review & persetujuan pemilik projek (pemilik projek meminta mulai Fase 1, 2026-09-28)
- [x] Branch `HRIS/Oatse/Linux-Windows` dibuat, di-commit & di-push

### Fase 1 — Fondasi
- [x] Root: Bun workspaces, `tsconfig.base.json`, Biome, `.editorconfig`, `.gitattributes` (LF), `.gitignore`, `.env.example`
- [~] Branch `HRIS/debug/database` dan `HRIS/debug/fe-be` dibuat dari `main` ✔; proteksi `main` ditolak GitHub (paket Free, repo private) → **OD-9**
- [x] PostgreSQL lokal: `docker-compose.yml` (image Postgres, versi = Supabase) + script `db:up`/`db:down`
- [x] Supabase project **staging** (D-029: `HRIS Project`, ref `iwgzuwcxsxnbjibhbqgh`, org `Work` Free): self sign-up nonaktif ✔, *Redirect URLs* `http://localhost:5173/**` ✔, Data API tidak mengekspos skema modul ✔ (dikonfirmasi pemilik projek); region **ap-northeast-2 (Seoul)**, diterima untuk staging (D-029; produksi wajib Singapura); pooler `aws-0-ap-northeast-2.pooler.supabase.com` (session 5432 & transaction 6543 teruji); bucket private menyusul saat Fase 4/5 butuh; `SUPABASE_URL`/`VITE_SUPABASE_URL` = `https://iwgzuwcxsxnbjibhbqgh.supabase.co`
- [x] Cocokkan versi major PostgreSQL di `docker-compose.yml` dengan project staging — Supabase 17.6, lokal & CI 17 (dicek via MCP 2026-09-28)
- [x] Custom SMTP Supabase staging (D-025) — `admin.arthasia@gmail.com` (D-032; akun final produksi tetap OD-5): login & kirim langsung ✔; SMTP di dashboard Supabase diisi pemilik projek & dimuat ulang 07:57 UTC, lalu undangan lewat Supabase Auth `POST /invite` **200** 2026-09-28 07:58 UTC ✔ (koreksi audit 2026-09-30: catatan lama "uji lewat Supabase Auth belum" sudah basi)
- [x] `packages/shared` (roles, permissions, enums)
- [x] `apps/api`: Hono + `@hono/zod-openapi`, `env.ts`, `core/` (errors, response, logger, request-id, db), `/api/v1/health`, `/openapi.json`, `/docs`
- [x] Prisma 7: `prisma.config.ts`, skema multi-file, multi-schema, driver adapter, migrasi awal (buat semua skema)
- [x] `apps/web`: Vite + React + TS, Tailwind, shadcn/ui, React Router, TanStack Query, layout kosong
- [x] dependency-cruiser + aturan batas modul
- [x] Test: `bun test` (api) & Vitest (web) dengan contoh test
- [x] GitHub Actions: typecheck, lint, boundaries, migrasi dari DB kosong + test (service container Postgres), build — run #36375129344 hijau (commit `1815b3c`)
- [x] Keputusan OD-7 ✔ (D-030), lalu `db:deploy` migrasi awal ke staging — workflow `Deploy staging` run #36385730691 sukses (2 migrasi, `db:check` tanpa selisih), diverifikasi via MCP
- [x] Vercel: project `api` (Bun runtime, region `sin1`) dan `web`; ~~preview~~ staging untuk `HRIS/debug/fe-be` (D-036) — `hris-staging-api` & `hris-staging-web` (akun `oatse`, Hobby), deploy otomatis `Deploy staging` #36531510460 ✔, health/CORS/cron teruji live 2026-09-29
  - [x] Job `vercel` di `deploy-staging.yml`: Vercel CLI `pull/build/deploy --prebuilt --prod` setelah migrasi + secret `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID_API/WEB` (tambahan 2026-09-29: repo private milik organisasi tidak bisa dihubungkan ke Vercel Hobby, D-036)
  - [x] Api dibundel sendiri untuk Vercel: `bun build src/index.ts --external hono` → `dist/index.js` + `outputDirectory: dist` (tambahan 2026-09-29: kompilasi per file oleh `@vercel/node` tidak cocok dengan monorepo paket sumber TS — (1) memilih `src/app.ts` tanpa default export sebagai entry, (2) tidak membaca `extends` tsconfig sehingga strict mati, (3) import `./x.ts` & `exports` `@hris/shared` tetap `.ts` setelah dikompilasi → `ResolveMessage` di deploy #36529746512, (4) tambalan `exports` `.js` membuat `packages/shared` tidak ikut (`BuildMessage`, deploy #36530682448). Tambalan PR #11/#12 dikembalikan; bundel diuji dari **clone bersih** + simulasi function terisolasi: health 200 ke DB staging, 401, 404, OpenAPI 200)
  - [x] Proteksi Vercel Authentication hanya untuk preview (tambahan 2026-09-29: default project baru melindungi URL `*.vercel.app` production sehingga web tidak bisa memanggil api)
  - [x] Isi data staging: seed dummy (5 departemen, 12 jabatan, 5 status, 5 grade, 2 lokasi, 21 karyawan) + akun uji HR/MGR/EMP ke DB staging, diverifikasi via MCP (tambahan 2026-09-29: D-036 poin 4)
- [x] `Dockerfile` api (build lokal berhasil)
- [x] Verifikasi `bun install && bun run dev` di **Linux**
- [ ] Verifikasi `bun install && bun run dev` di **Windows**
  - [~] Uji Windows parsial (branch `HRIS/mat/windows`, 2026-10-09): `typecheck`/`biome ci`/`boundaries`/`test:shared`/`test:web` ✔; **`bun run test:api` crash segfault Bun 1.4.2 di Windows** (terjadi juga tanpa perubahan apa pun — bug Bun, bukan kode) → perlu dituntaskan. Checkout baru: `bun run db:generate` dulu
- [x] Tukar DB lokal ⇄ Supabase lewat perintah: `bun run db:use local|supabase` + `db:which`, profil `LOCAL_*`/`SUPABASE_*` di `.env` (gitignored = aman-merge), penanda `dbHost` saat start, jaring pengaman destruktif + skill `hris-db-switch` (tambahan 2026-10-09: permintaan pemilik projek; branch `HRIS/mat/windows`, belum masuk antrean rilis)
- [x] README "Mulai cepat" (install, env, db, dev) (tambahan 2026-09-28)
- [x] MCP Supabase di `.mcp.json` (project `iwgzuwcxsxnbjibhbqgh`) terautentikasi + skill resmi `supabase` & `supabase-postgres-best-practices` (tambahan 2026-09-28)
- [x] Skill projek: `hris-workflow`, `hris-db-schema`, `hris-flow-testing`, `hris-e2e-playwright`, `hris-qa-docs` (tambahan 2026-09-28)
  - [x] Arsip QA ke Google Drive: `hris-qa-docs` menambah aturan & templat — hanya fitur LEGIT (P1/P2 LULUS lokal + staging, tanpa bug P1/P2 terbuka), satu folder `<tanggal>-<target>/` (plan, cases fitur saja, run, bugs, screenshots), `.md` apa adanya, `rclone sync` ke remote `hris-qa:` (rclone 1.75.1 via pacman); uji coba `2026-09-30-seragam-admin` 36 file (tambahan 2026-09-30: permintaan pemilik projek)
- [x] Aturan dua jalur develop & rilis (D-043): PLAN §6/§8, PROMPT §1/§8 (+ aturan rekan tim), PROGRESS §2, CODEMAP, skill `hris-workflow` (tambahan 2026-10-01: permintaan pemilik projek setelah audit — isi develop & rilis sempat dikira selisih)
  - [x] Ganti nama branch `HRIS/Oatse/rilis-import` → `HRIS/Oatse/rilis` + sesuaikan worktree ✔ 2026-10-05 (branch lama dibiarkan di GitHub) (setelah presentasi 2026-10-02; butuh izin push)
  - [x] Bawa balik dashboard SA/HR dari rilis ke develop (D-043 poin 4) + satukan migrasi: `20260930090116` lokal dihapus (digantikan `20260930102336` rilis), multi-PT dipindah ke `20261001100000` (+ `import_jobs.company_id`); dashboard kini per cakupan PT (D-040); commit lokal `9faaa8b`, `4441206` (2026-10-01)
- [x] Nama aplikasi tampil **Akselerasi Arthasia** (D-044) di develop & rilis (tambahan 2026-10-01: permintaan pemilik projek)
- [x] Workflow `.github/workflows/deploy-staging.yml` (D-030) + secret repo `STAGING_DIRECT_URL` (session pooler `aws-0-ap-northeast-2`, port 5432) (tambahan 2026-09-28: host direct Supabase hanya IPv6)
- [x] Perbaikan advisor staging: RLS `public._prisma_migrations` (ERROR → INFO disengaja) & index `departments.parent_id` (tambahan 2026-09-28)
- [x] Uji SMTP langsung (Gmail) & undangan Supabase Auth; user uji dibersihkan dari Auth staging (tambahan 2026-09-28)

## Keputusan

Isi lengkap di [decisions.md](../../decisions.md).

- [D-003](../../decisions.md#d-003) Prisma 7 satu-satunya ORM
- [D-005](../../decisions.md#d-005) Supabase DB + Auth + Storage; modul iam
- [D-015](../../decisions.md#d-015) Stack frontend React + Vite
- [D-016](../../decisions.md#d-016) Vercel web & api; Docker lokal
- [D-017](../../decisions.md#d-017) Monorepo apps/web, apps/api, packages/shared
- [D-019](../../decisions.md#d-019) Alur Git debug/database → debug/fe-be → main
- [D-023](../../decisions.md#d-023) PostgreSQL lokal di Docker
- [D-029](../../decisions.md#d-029) Project Supabase staging
- [D-030](../../decisions.md#d-030) db:deploy otomatis dari GitHub Actions
- [D-036](../../decisions.md#d-036) Staging di Vercel
- [D-043](../../decisions.md#d-043) Dua jalur kerja develop & rilis
- [D-044](../../decisions.md#d-044) Nama aplikasi Akselerasi Arthasia

**Keputusan baru** (prefix `FND-D1`, `FND-D2`, …; tulis lengkap di sini, lalu daftarkan di indeks [PLAN §8](../../PLAN.md#8-keputusan-adr-ringkas) saat digabung ke develop):

| ID | Keputusan | Alasan / sumber |
|---|---|---|
| – | – | – |

## Keputusan terbuka

- [OD-7](../../decisions.md#d-030) Cara db:deploy & env (terjawab D-030)
- [OD-9](../../decisions.md#od-9) Proteksi main butuh GitHub Team
- [OD-12](../../decisions.md#od-12) Repo GitHub ternyata public

OD baru: `FND-OD1`, … (tulis di sini + ringkasan di [PROGRESS](../../PROGRESS.md#keputusan-terbuka)).

## QA

- [plans/2026-09-29-staging.md](../../qa/plans/2026-09-29-staging.md)
- [runs/2026-09-29-staging.md](../../qa/runs/2026-09-29-staging.md)
- [runs/2026-10-08-staging-gel2.md](../../qa/runs/2026-10-08-staging-gel2.md)
- [cases/staging.md](../../qa/cases/staging.md)
- [bugs/BUG-001-hydratefallback-warning.md](../../qa/bugs/BUG-001-hydratefallback-warning.md)

Aturan & templat QA: skill `hris-qa-docs` ([docs/qa/README.md](../../qa/README.md)).
