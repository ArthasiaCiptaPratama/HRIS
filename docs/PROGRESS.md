# PROGRESS — HRIS

> **Fungsi file ini:** mencatat **sudah sampai mana**: status fase, fokus saat ini, checklist, blocker, backlog, dan log setiap sesi kerja.
> Baca **§2 Fokus Saat Ini** di awal setiap sesi. Perbarui file ini di **akhir setiap sesi** (lihat PROMPT §2).

**Legenda:** `[ ]` belum · `[~]` sedang dikerjakan · `[x]` selesai · `[-]` dibatalkan/ditunda (beri alasan)

---

## 1. Ringkasan Status

| Fase | Nama             | Status       |
| ---- | ---------------- | ------------ |
| 0    | Instruksi Projek | Selesai      |
| 1    | Fondasi          | Berjalan     |
| 2    | IAM              | Belum mulai  |
| 3    | Organization     | Berjalan (skema ERD) |
| 4    | Employee         | Berjalan (skema ERD) |
| 5    | Attendance       | Belum mulai  |
| 6    | Leave            | Belum mulai  |
| —    | **Rilis 1**      | –            |
| 7    | Contract         | Belum mulai  |
| —    | **Rilis 2**      | –            |
| 8    | Payroll          | Belum mulai  |
| 9    | Hardening        | Belum mulai  |
| —    | **Rilis 3**      | –            |

Status yang dipakai: `Belum mulai` · `Berjalan` · `Review` · `Selesai`

---

## 2. Fokus Saat Ini

- **Fase aktif:** 1 — Fondasi (sisa item akun luar) · **Target minggu 2026-09-28 (D-027): employee management** — skema ERD `organization` & `employee` ✔, seed dummy ✔; berikutnya fondasi akses (core/auth + core/access, D-028) lalu CRUD employee.
- **Sudah jalan di lokal (Linux) & CI GitHub hijau:** monorepo, `packages/shared`, kerangka `apps/api` & `apps/web`, Prisma + migrasi awal, dependency-cruiser, test, Dockerfile. Semua cek hijau (lihat log 2026-09-28).
- **Langkah berikutnya:**
  1. Buat 2 project Vercel (`api` root `apps/api`, `web` root `apps/web`) + preview untuk `HRIS/debug/fe-be`; cek `/api/v1/health` di staging.
  2. Verifikasi `bun install && bun run dev` di **Windows**.
  3. Putuskan **OD-9** (proteksi `main`); minta admin IT menyiapkan akun pengirim (OD-5).
- **Supabase MCP:** terhubung ke project `iwgzuwcxsxnbjibhbqgh` (entri `.mcp.json`). Pemeriksaan read-only: PostgreSQL 17.6, TZ UTC, belum ada tabel/migrasi aplikasi, 0 user Auth, advisor keamanan & performa kosong. Entri duplikat scope user sebaiknya dihapus (`claude mcp remove supabase -s user`).
- **Blocker aktif:** OD-9 (proteksi `main`), OD-5 (SMTP staging). Supabase staging siap (D-029); akun Vercel harus dibuat pemilik projek.

---

## 3. Checklist Per Fase

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
- [ ] Custom SMTP Supabase staging memakai akun Google Workspace pengirim (D-025; menunggu OD-5)
- [x] `packages/shared` (roles, permissions, enums)
- [x] `apps/api`: Hono + `@hono/zod-openapi`, `env.ts`, `core/` (errors, response, logger, request-id, db), `/api/v1/health`, `/openapi.json`, `/docs`
- [x] Prisma 7: `prisma.config.ts`, skema multi-file, multi-schema, driver adapter, migrasi awal (buat semua skema)
- [x] `apps/web`: Vite + React + TS, Tailwind, shadcn/ui, React Router, TanStack Query, layout kosong
- [x] dependency-cruiser + aturan batas modul
- [x] Test: `bun test` (api) & Vitest (web) dengan contoh test
- [x] GitHub Actions: typecheck, lint, boundaries, migrasi dari DB kosong + test (service container Postgres), build — run #36375129344 hijau (commit `1815b3c`)
- [x] Keputusan OD-7 ✔ (D-030), lalu `db:deploy` migrasi awal ke staging — workflow `Deploy staging` run #36385730691 sukses (2 migrasi, `db:check` tanpa selisih), diverifikasi via MCP
- [~] Vercel: project `api` (Bun runtime, region `sin1`) dan `web`; preview untuk `HRIS/debug/fe-be` — `vercel.json` kedua app dibuat; project Vercel belum dibuat
- [x] `Dockerfile` api (build lokal berhasil)
- [x] Verifikasi `bun install && bun run dev` di **Linux**
- [ ] Verifikasi `bun install && bun run dev` di **Windows**

### Fase 2 — IAM
- [ ] Skema `iam`, `audit`, `notification` + migrasi
- [ ] `core/auth`: verifikasi JWT Supabase (JWKS) + verifier pengganti untuk test
- [ ] `core/access`: muat role, grant (cek kedaluwarsa), tim; `requireRole`/`requireGrant`
- [ ] Test matriks akses (TDD) untuk aksi IAM
- [ ] `GET /me`
- [ ] Kelola role HR_ADMIN/MANAGER; aturan Super Admin Utama (4 hak eksklusif, tidak boleh 0 SUPER_ADMIN)
- [ ] Grant: beri, cabut, kedaluwarsa, audit
- [ ] Audit log (core) + halaman audit untuk SUPER_ADMIN
- [ ] Notifikasi in-app + pengiriman email via SMTP (lokal: dicatat ke log; staging/produksi: Google Workspace) + `email_outbox`
- [ ] Keputusan OD-5 (akun pengirim Workspace + App Password) sebelum uji undangan
- [ ] Script `bootstrap-super-admin` dan `recover-primary-admin`
- [ ] Web: halaman login, sesi, route guard per role, menu per role, manajemen akun & grant

### Fase 3 — Organization
- [~] Skema + migrasi + seed dummy — tabel ERD (departments, positions, employment_statuses, grades, work_locations) + seed dummy ✔; company_profile, system_settings, holidays belum
- [ ] Profil perusahaan, pengaturan sistem
- [ ] Departemen (hierarki), jabatan, level, lokasi kerja (geofence), hari libur
- [ ] Policy + test
- [ ] Web: halaman master data

### Fase 4 — Employee
- [ ] Keputusan OD-6 (ubah data sensitif milik sendiri)
- [~] Skema + migrasi + seed dummy (NIK/NPWP fiktif berformat valid) — tabel ERD (employees, employee_personal, employee_bank_accounts, family_members, educations, trainings) + seed dummy 15 karyawan ✔; documents, histories, import_jobs belum
- [ ] CRUD karyawan + filter, pencarian, paginasi
- [ ] `manager_id` + validasi (harus MANAGER/SUPER_ADMIN)
- [ ] Data sensitif & rekening dengan grant (HR: semua, MANAGER: tim)
- [ ] Dokumen (signed upload URL), kontak darurat, riwayat
- [ ] Karyawan ubah data diri terbatas
- [ ] Undangan akun dari data karyawan
- [ ] Import CSV/Excel (template, validasi per baris, laporan error)
- [ ] Policy + test
- [ ] Web: daftar, detail, form, import

### Fase 5 — Attendance (+ Approval)
- [ ] Modul `approval`: mode paralel & tunggal, override, kasus khusus (PLAN §5.2) + test
- [ ] Skema attendance + migrasi
- [ ] Template shift, jadwal & penugasan
- [ ] Absen: geofence, selfie (kamera langsung, kompres, bucket private), waktu server, penanda "boleh di luar lokasi"
- [ ] Koreksi absensi (paralel) & lembur (MANAGER)
- [ ] Rekap harian/bulanan
- [ ] Tutup periode absensi (`payroll.period.prepare`)
- [ ] Cron `purge-selfies`
- [ ] Policy + test
- [ ] Web: tombol absen + kamera, riwayat, inbox approval, rekap

### Fase 6 — Leave
- [ ] Skema + migrasi
- [ ] Jenis cuti tahunan & izin, kuota, wajib dokumen
- [ ] Saldo: akrual, hold, penyesuaian, import saldo CSV/Excel
- [ ] Pengajuan + approval paralel + pembatalan
- [ ] Hitung hari kerja (jadwal & libur); tandai absensi saat disetujui
- [ ] Cron `leave-accrual`
- [ ] Policy + test
- [ ] Web: pengajuan, saldo, inbox approval

### Rilis 1
- [ ] Keputusan OD-4 (akun & paket), OD-8 (rollback & backup)
- [ ] Supabase produksi + migrasi + bootstrap SUPER_ADMIN Utama
- [ ] Vercel production + env
- [ ] Uji asap (smoke test) di produksi

### Fase 7 — Contract
- [ ] Skema + migrasi
- [ ] Jenis kontrak, CRUD kontrak, perpanjangan, terminasi
- [ ] Aturan 1 kontrak aktif per karyawan, cek overlap
- [ ] Cron `contract-expiry`
- [ ] Policy + test
- [ ] Web: tab kontrak, daftar kontrak akan habis

### Fase 8 — Payroll
- [ ] Keputusan OD-1 (metode pajak), OD-2 (THR), OD-3 (verifikator)
- [ ] Golden cases disusun & diverifikasi pihak luar
- [ ] Skema + migrasi
- [ ] Konfigurasi tarif BPJS, TER, PTKP
- [ ] Komponen gaji & struktur gaji per karyawan
- [ ] Perhitungan (TDD): BPJS, PPh 21 TER, perhitungan ulang masa pajak terakhir, lembur, potongan
- [ ] Periode: hitung → review → lock → terbit; snapshot
- [ ] Slip gaji (lihat & unduh)
- [ ] Policy + test
- [ ] Web: konfigurasi, struktur gaji, proses payroll, slip

### Fase 9 — Hardening
- [ ] E2E Playwright: login, cuti paralel, absen + selfie, payroll
- [ ] Review keamanan (akses, PII di log, bucket, CORS, rahasia)
- [ ] Uji performa dasar
- [ ] Runbook: deploy, rollback, pemulihan Super Admin Utama

---

## 4. Keputusan Terbuka

| ID   | Ringkasan                                   | Memblokir | Status              |
| ---- | ------------------------------------------- | --------- | ------------------- |
| OD-1 | Metode PPh 21 (gross/gross-up/net)          | Fase 8    | Menunggu keputusan  |
| OD-2 | THR dihitung sistem?                        | Fase 8    | Menunggu keputusan  |
| OD-3 | Verifikator golden cases payroll            | Fase 8    | Menunggu keputusan  |
| OD-4 | Kepemilikan akun Vercel/Supabase & paket     | Rilis 1   | Menunggu keputusan  |
| OD-5 | Email: penyedia = Google Workspace (D-025); sisa akun pengirim & App Password | Fase 2      | Sebagian terjawab |
| OD-6 | Ubah data sensitif/gaji milik sendiri       | Fase 4    | Menunggu keputusan  |
| OD-7 | Cara `db:deploy` & env per environment      | Fase 1    | Terjawab → D-030 (GitHub Actions) |
| OD-8 | Rollback migrasi & backup produksi          | Rilis 1   | Menunggu keputusan  |
| OD-9 | Proteksi `main` butuh GitHub Team (repo private) | Rilis 1 | Menunggu keputusan  |
| OD-10 | Bentuk role akun | Fase 2 | Terjawab → D-028 (satu akun satu role) |

Detail & rekomendasi: [PLAN §9](./PLAN.md#9-keputusan-terbuka).

---

## 5. Backlog

Ide atau fitur di luar fase aktif dicatat di sini dulu, **tidak langsung dikerjakan**.

- Aplikasi mobile (projek terpisah, memakai API yang sama)
- MFA untuk SUPER_ADMIN/HR_ADMIN
- Notifikasi WhatsApp
- Pencocokan wajah pada selfie absensi
- Approval berjenjang lebih dari satu atasan

---

## 6. Log Sesi

Entri terbaru di **atas**. Salin template di bagian bawah.

### 2026-09-28 — Fase 1: migrasi pertama ke staging & perbaikan advisor
- **Dikerjakan:** commit `c62c059` → CI hijau → PR #1 ke `HRIS/debug/database` (merge `41b6b9e`, CI hijau) → PR #2 ke `HRIS/debug/fe-be` (merge `d123237`) → workflow `Deploy staging` run #36385730691 sukses: 2 migrasi diterapkan, `db:check` tanpa selisih. `main` tidak disentuh (instruksi pemilik projek: `main` hanya atas permintaannya).
- **Verifikasi staging via MCP (read-only):** 10 skema modul; `organization` 5 tabel, `employee` 6 tabel; `_prisma_migrations` 2 baris selesai; `anon`/`authenticated` tanpa USAGE pada skema `employee`/`organization`/`iam`. Advisor security: **1 ERROR** `rls_disabled_in_public` pada `public._prisma_migrations`.
- **Perbaikan:** migrasi `20260928061939_enable_rls_on_prisma_migrations` (RLS tanpa policy, bersyarat `to_regclass`, portabel) — lokal: diterapkan, `relrowsecurity = t`, rerun "Already in sync", `db:check` ✔. Bug workflow: `bunx --cwd apps/api` dibaca Bun sebagai paket (tarball 404, tertutup `|| true`) → diganti `working-directory`; pola yang sama di skill Playwright diperbaiki.
- **Berikutnya:** alirkan perbaikan ke `HRIS/debug/fe-be`, pastikan advisor bersih; fondasi akses → CRUD employee.

### 2026-09-28 — Fase 1: koneksi staging & secret deploy
- **Dikerjakan:** host direct `db.iwgzuwcxsxnbjibhbqgh.supabase.co` terbukti **IPv6 saja** (tidak bisa dari runner GitHub). Mencari cluster pooler: tenant tidak ada di `aws-0/1-ap-southeast-2`; ditemukan di **`aws-0-ap-northeast-2`** (Seoul), cocok dengan string *Shared pooler* dari dashboard. Uji `select` read-only: port 5432 (session) ✔ & 6543 (transaction) ✔, PostgreSQL 17.6. `prisma migrate status` lewat session pooler ✔ (2 migrasi belum diterapkan, sesuai harapan). Secret repository `STAGING_DIRECT_URL` diisi (session pooler, port 5432) via `gh secret set` dari stdin.
- **Keputusan:** koreksi D-029: region staging **ap-northeast-2 (Seoul)**, bukan Sydney. Migrasi memakai port 5432 (session); port 6543 (transaction) untuk `DATABASE_URL` runtime Vercel nanti.
- **Masalah / catatan:** password DB staging tertulis di riwayat percakapan & lemah; pemilik projek memilih tetap memakainya untuk staging (data dummy saja). **Wajib diganti** (Reset database password → perbarui secret) sebelum ada data asli atau bila staging dipakai lebih luas.
- **Berikutnya:** commit; PR berantai ke `HRIS/debug/fe-be`; pantau `Deploy staging`; verifikasi via MCP.

### 2026-09-28 — Fase 1: OD-7 terjawab, workflow deploy staging
- **Dikerjakan:** `.github/workflows/deploy-staging.yml` (job `migrate`: cek secret → install → `db:deploy` → `db:check`; job `vercel`: Deploy Hook opsional setelah migrasi). Region staging dicatat di D-029 (kemudian dikoreksi menjadi Seoul).
- **Keputusan:** **D-030** (OD-7 = opsi A, GitHub Actions + repository secret + session pooler).
- **File berubah:** `.github/workflows/deploy-staging.yml`, `docs/PLAN.md`, `docs/CODEMAP.md`, `docs/PROGRESS.md`, `.claude/skills/hris-db-schema/SKILL.md`.
- **Verifikasi:** YAML kedua workflow terbaca (`Bun.YAML.parse`); simulasi langkah workflow di database kosong `hris_deploy_probe` tanpa `.env` (hanya `DIRECT_URL`): 2 migrasi diterapkan, `db:check` "No difference detected", deploy ulang "No pending migrations", DB probe dihapus. Workflow belum pernah jalan di GitHub.
- **Berikutnya:** pemilik projek mengisi secret; commit; PR berantai ke `HRIS/debug/fe-be`; verifikasi staging via MCP (read-only) + advisor.

### 2026-09-28 — Fase 1: penetapan project Supabase staging
- **Dikerjakan:** pemilik projek memeriksa dashboard (screenshot: org `Work` Free, project `HRIS Project`, branch `main` berlabel PRODUCTION bawaan) dan mengatur: sign-up mandiri mati, Redirect URL lokal, Exposed schemas hanya `public` & `graphql_public`.
- **Keputusan:** **D-029**: `HRIS Project` = staging (region diterima; lihat koreksi Seoul di entri berikutnya); produksi project terpisah di Singapura menjelang Rilis 1.
- **File berubah:** `docs/PLAN.md`, `docs/PROGRESS.md`.
- **Verifikasi:** pengaturan dashboard dikonfirmasi pemilik projek (tidak terbaca lewat MCP). Region dilaporkan ap-southeast-2 (Sydney); kemudian terbukti ap-northeast-2 (Seoul).
- **Berikutnya:** commit; OD-7 lalu `db:deploy` ke staging.

### 2026-09-28 — Supabase MCP terhubung & pemeriksaan project
- **Dikerjakan:** OAuth MCP untuk entri `.mcp.json` (URL berbeda dari entri scope user, token terpisah). Pemeriksaan read-only project `iwgzuwcxsxnbjibhbqgh` via MCP: `select version()`, daftar skema, `list_migrations`, `list_tables`, `list_extensions`, `get_advisors` (security & performance).
- **Hasil:** PostgreSQL 17.6 (cocok dengan lokal/CI 17), TZ UTC; skema bawaan Supabase saja (auth, extensions, graphql, graphql_public, pgbouncer, public, realtime, storage, vault); belum ada migrasi/tabel aplikasi; 0 user Auth; extension terpasang hanya bawaan (pgcrypto, uuid-ossp, pg_stat_statements, supabase_vault, plpgsql); advisor kosong. Tidak ada perubahan yang dibuat di project.
- **Catatan:** konfigurasi Auth (self sign-up, Redirect URLs), bucket Storage, dan *Exposed schemas* Data API tidak terbaca lewat MCP; cek manual di dashboard. Belum dikonfirmasi pemilik projek bahwa project ini adalah **staging**.
- **Berikutnya:** konfirmasi staging & pengaturan dashboard; commit; OD-7 lalu `db:deploy`; fondasi akses → CRUD employee.

### 2026-09-28 — OD-10 terjawab & seed dummy employee management
- **Dikerjakan:** keputusan role dicatat; seed dummy idempoten `apps/api/prisma/seed/{organization,employee}.ts` + unit test `tests/seed.test.ts`; env `SEED_EMAIL_BASE`.
- **Keputusan:** **D-028** (menjawab OD-10): satu akun satu role, kolom enum `iam.accounts.role`; hak layanan diri berasal dari keterhubungan akun ke data karyawan. D-007 bagian "role tambahan" ditandai diganti. PLAN §4.1, CODEMAP §6.1, `docs/erd/hris.dbml`, skill `hris-db-schema/ERD.md` diselaraskan.
- **File berubah:** `docs/PLAN.md`, `docs/CODEMAP.md`, `docs/PROGRESS.md`, `docs/erd/hris.dbml`, `.claude/skills/hris-db-schema/ERD.md`, `apps/api/prisma/seed/*`, `apps/api/tests/seed.test.ts`, `.env.example`.
- **Verifikasi:** `bun run db:seed` 3× → jumlah baris identik (5 dept, 12 jabatan, 4 status, 5 grade, 2 lokasi, 15 karyawan, 15 data pribadi, 15 rekening, 10 keluarga, 15 pendidikan, 4 pelatihan); NIK 16 digit, +40 untuk perempuan; relasi atasan terisi; plus-addressing dicoba dengan `SEED_EMAIL_BASE` lalu dikembalikan kosong. `bun run typecheck` ✔, `bunx biome ci .` ✔, `bun run check:boundaries` ✔, `bun run db:check` ✔, `bun run test` ✔ (shared 10, api 25, web 8). Belum di-commit.
- **Masalah / catatan:** MCP Supabase terhubung lewat entri scope user yang tidak dibatasi project (lihat §2).
- **Berikutnya:** commit; rapikan scope MCP & pastikan project staging; fondasi akses (`core/auth` + verifier test, `core/access` dengan satu role) → CRUD employee + policy + test; QA plan minggu ini.

### 2026-09-28 — Target mingguan: skema ERD employee management, skill projek, Supabase MCP
- **Dikerjakan:**
  - ERD dari pemilik projek diterjemahkan ke Prisma: `organization.prisma` (5 tabel) & `employee.prisma` (6 tabel + 4 enum), migrasi `20260928035758_add_organization_and_employee_master`, integration test constraint `tests/integration/employee-schema.test.ts`.
  - 4 skill projek di `.claude/skills/`: `hris-db-schema`, `hris-flow-testing`, `hris-e2e-playwright`, `hris-qa-docs`; `CLAUDE.md` menunjuk ke skill ini.
  - MCP Supabase di `.mcp.json` (URL dari pemilik projek, `project_ref=iwgzuwcxsxnbjibhbqgh`) + skill resmi `supabase` & `supabase-postgres-best-practices` (`npx skills add supabase/agent-skills`, disalin, ditinjau: hanya Markdown).
- **Keputusan:** D-026 (ERD jadi model data dengan penyesuaian), D-027 (target mingguan: skema karyawan lebih awal; endpoint tetap menunggu fondasi akses). OD baru: OD-10 (bentuk role). PLAN §4.2 `employee.personal.read` kini mencakup agama & data keluarga.
- **File berubah:** `apps/api/prisma/schema/{organization,employee}.prisma`, migrasi baru, `apps/api/tests/integration/employee-schema.test.ts`, `packages/shared/src/permissions.ts` (label), `.claude/skills/*`, `.mcp.json`, `skills-lock.json`, `CLAUDE.md`, `docs/erd/hris.dbml`, `docs/PLAN.md`, `docs/CODEMAP.md`, `docs/PROGRESS.md`.
- **Verifikasi:** `bunx prisma validate` ✔; migrasi diterapkan, rerun "Already in sync", `bun run db:check` "No difference detected"; SQL migrasi tanpa `auth.`/`storage.`/`EXTENSION`; `bun run typecheck` ✔; `bunx biome ci .` ✔; `bun run check:boundaries` ✔; `bun run test` ✔ (shared 10, api 21 termasuk 6 test constraint ERD, web 8); tidak ada sisa data test di DB; argumen `bun run db:migrate -- --create-only --name ...` terbukti diteruskan ke Prisma. Belum di-commit.
- **Masalah / catatan:**
  - Prisma 7 `migrate dev` **tidak** menjalankan `generate` otomatis; test gagal sampai `bun run db:generate` dijalankan (dicatat di skill `hris-db-schema`).
  - `PrismaPromise` bukan `Promise`: `expect(q).rejects` tanpa dibungkus & tanpa `await` bisa lolos palsu; diperbaiki dan dicatat di skill.
  - Skill resmi `supabase` menyarankan perubahan skema lewat MCP/CLI; bertentangan dengan D-003, jadi `hris-db-schema` & `CLAUDE.md` menyatakan aturan projek yang menang.
  - Autentikasi OAuth MCP Supabase belum dilakukan (butuh browser pemilik projek); belum dipastikan apakah project `iwgzuwcxsxnbjibhbqgh` adalah staging.
- **Persetujuan:** pemilik projek meninjau diagram DBML di dbdiagram.io dan menyetujuinya; disimpan di `docs/erd/hris.dbml`.
- **Berikutnya:** OAuth MCP; seed dummy organization & employee; fondasi akses (`core/auth` verifier + `core/access`, OD-10) agar CRUD employee bisa dibuat dengan policy; QA plan minggu ini di `docs/qa/`.

### 2026-09-28 — Fase 1: fondasi monorepo, api, web, Prisma, CI
- **Dikerjakan:** item Fase 1 berikut selesai & terverifikasi di Linux: root config, PostgreSQL lokal, `packages/shared`, `apps/api` (core + health + OpenAPI + docs), Prisma 7 + migrasi awal 10 skema, `apps/web` (layout kosong + status API), dependency-cruiser, test, Dockerfile, `bun run dev` di Linux. Sebagian: branch debug (proteksi `main` gagal), workflow CI (belum jalan di GitHub), `vercel.json` (project belum ada).
- **Keputusan:** Fase 0 dianggap disetujui (pemilik projek meminta mulai Fase 1). OD baru: **OD-9** (proteksi `main`). Pilihan teknis (bukan OD):
  - **TypeScript 6.0.3**, bukan 7.x: TS 7 (port Go) tidak lagi menyediakan compiler API JS yang dipakai dependency-cruiser.
  - **Prisma 7.10.0** dikunci (npm `latest` sudah 8.0.0-rc; D-003 menetapkan Prisma 7).
  - Versi paket dikunci persis (tanpa `^`); Bun 1.4.2 lewat `packageManager`.
  - Satu `.env` di root untuk semua workspace.
  - `GET /api/v1/health` mengembalikan **503** dengan envelope `data` (status `degraded`) bila DB tidak terjangkau, supaya monitor bisa membedakan API hidup vs DB putus.
  - Komponen shadcn memakai `cn` lokal (`@/lib/utils`); CLI shadcn 4.21 sempat menambah paket npm `cn`, dihapus.
- **File berubah:** root (`package.json`, `bun.lock`, `biome.json`, `.dependency-cruiser.cjs`, `tsconfig.base.json`, `tsconfig.depcruise.json`, `.editorconfig`, `.gitattributes`, `.gitignore`, `.dockerignore`, `.env.example`, `docker-compose.yml`), `.github/workflows/ci.yml`, `packages/shared/`, `apps/api/`, `apps/web/`, `docs/PLAN.md` (OD-9), `docs/CODEMAP.md`, `docs/PROGRESS.md`, `README.md` (mulai cepat).
- **Verifikasi (Linux, Bun 1.4.2, Docker 29.8, PostgreSQL 17.11):**
  - `bun run typecheck` ✔ (shared, api, web) · `bunx biome ci .` ✔ · `bun run check:boundaries` ✔ (56 modul, 0 pelanggaran)
  - `bun run test` ✔: shared 10, api 15 (termasuk integration ke PostgreSQL lokal), web 8
  - `bun run db:migrate` ✔ migrasi awal; rerun "Already in sync"; `bun run db:check` "No difference detected"
  - Uji manual: `bun run dev` → `/api/v1/health` 200, 503 saat container DB dihentikan lalu pulih 200; 404 envelope + `X-Request-Id` dipantulkan; `/openapi.json` & `/docs` 200; CORS hanya `http://localhost:5173`; web 5173 + fallback SPA 200
  - Ke-14 aturan dependency-cruiser dibuktikan dengan file yang sengaja melanggar (3 putaran); semua menangkap pelanggaran, lalu file dihapus
  - Clone bersih (hanya file yang akan di-commit) + `bun install --frozen-lockfile` → postinstall generate, typecheck, boundaries, test ✔ tanpa `.env`
  - `bun run build` (api & web) ✔; bundle api jalan mandiri tanpa `node_modules`; `docker build -f apps/api/Dockerfile .` ✔, container *healthy* sebagai user non-root
- **Masalah / catatan:**
  - Bug ditemukan test & diperbaiki: api client web menangkap `fetch` saat modul dimuat, sehingga `fetch` global yang diganti diabaikan.
  - Bug konfigurasi ditemukan & diperbaiki: `exclude: /dist/` di dependency-cruiser ikut membuang semua paket npm (`node_modules/.../dist/`), sehingga aturan yang melibatkan paket npm diam-diam tidak jalan.
  - Prisma menolak `migrate reset` yang dijalankan AI agent tanpa persetujuan eksplisit pengguna (env `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`). Setelah pemilik projek mengizinkan, `bun run db:reset` ✔ (migrasi ulang + seed, 10 skema, `db:check` tanpa selisih).
  - Bun belum di PATH fish: jalankan `fish_add_path ~/.bun/bin` (installer hanya menambahkan ke `~/.zshrc`).
  - Tidak ada lagi `baseUrl` di tsconfig web (deprecated di TS 6); alias `@/*` memakai `paths` saja.
  - Variabel Supabase/SMTP/cron masih opsional di `env.ts`; wajibkan di Fase 2.
- **CI GitHub:** setelah push, run #36375129344 hijau (job `quality` & `api-db`).
- **Berikutnya:** lihat §2 Fokus Saat Ini (Supabase staging, OD-7, Vercel, Windows, OD-9).

### 2026-09-28 — Fase 0: ganti penyedia email ke Google Workspace
- **Dikerjakan:** mengganti rencana SMTP dari Resend ke SMTP Google Workspace kantor di PLAN, CODEMAP, PROGRESS.
- **Keputusan:** D-025 menggantikan D-024. OD-5 tinggal akun pengirim & izin App Password (sebelum uji undangan Fase 2); pertanyaan kuota produksi dihapus karena batas Workspace cukup.
- **File berubah:** `docs/PLAN.md`, `docs/CODEMAP.md`, `docs/PROGRESS.md`.
- **Verifikasi:** perubahan dokumen saja; grep memastikan tidak ada rujukan Resend yang masih berlaku.
- **Berikutnya:** minta admin IT membuat akun pengirim (OD-5), jawab OD-7, review akhir → branch kerja → Fase 1.

### 2026-09-28 — Fase 0: review dokumen pasca D-023 & keputusan email
- **Dikerjakan:** review menyeluruh dokumen instruksi; menyelaraskan alur dengan database lokal (D-023): aturan portabilitas migrasi, tidak ada FK/skema `auth` lokal, Data API tidak mengekspos skema modul, bootstrap cari/buat user Auth, plus-addressing untuk akun uji, redirect URL lokal, cron manual di lokal, CI dengan service container Postgres, E2E di lokal + Auth staging.
- **Keputusan:** D-024 (Resend SMTP free plan untuk Auth & email aplikasi). OD-5 sebagian terjawab (sisa domain & kuota). OD baru: OD-7 (cara `db:deploy`), OD-8 (rollback & backup). Skema `auth` tiruan di lokal dipertimbangkan dan **tidak** dipakai (FK lokal tidak menjaga apa pun, dan skema `auth` dikelola Supabase).
- **File berubah:** `docs/PLAN.md` (v1.1), `docs/CODEMAP.md`, `docs/PROMPT.md`, `docs/PROGRESS.md`, `README.md`.
- **Verifikasi:** perubahan dokumen saja; dicek konsistensi antar-file dengan grep.
- **Berikutnya:** jawab OD-7, review akhir → buat branch kerja → Fase 1.

### 2026-09-28 — Fase 0: revisi database development
- **Dikerjakan:** mengganti Supabase CLI lokal dengan PostgreSQL 17 di container Docker; Auth & Storage saat develop memakai Supabase staging.
- **Keputusan:** D-023. Konsekuensi: tidak ada FK ke `auth.users`; develop butuh internet; project staging dibuat di Fase 1.
- **File berubah:** `docs/PLAN.md`, `docs/CODEMAP.md`, `docs/PROMPT.md`, `docs/PROGRESS.md`.
- **Verifikasi:** belum ada kode; perubahan dokumen saja.
- **Berikutnya:** review dokumen → buat branch kerja → Fase 1.

### 2026-09-25 — Fase 0: grill keputusan & file instruksi
- **Dikerjakan:** sesi grill 28 pertanyaan, lalu menulis `docs/PLAN.md`, `docs/CODEMAP.md`, `docs/PROGRESS.md`, `docs/PROMPT.md`, `CLAUDE.md`, dan memperbarui `README.md`.
- **Keputusan:** D-001 s.d. D-022 (PLAN §8). Perubahan besar dari brief awal:
  - microservice → **modular monolith**
  - Drizzle → **Prisma 7**
  - Vanilla JS → **TypeScript**
  - Docker produksi → **Vercel** (Docker hanya lokal)
  - Auth sendiri → **Supabase Auth**
- **Keputusan terbuka:** OD-1 s.d. OD-6.
- **File berubah:** `docs/*`, `CLAUDE.md`, `README.md`.
- **Verifikasi:** belum ada kode; menunggu review pemilik projek.
- **Berikutnya:** review dokumen → buat branch kerja → Fase 1.

<!--
### YYYY-MM-DD — Fase N: <judul singkat>
- **Dikerjakan:** apa yang selesai (rujuk item checklist).
- **Keputusan:** D-xxx baru atau OD yang terjawab.
- **File berubah:** file/folder utama.
- **Verifikasi:** perintah yang dijalankan (typecheck/lint/test/manual) dan hasilnya.
- **Masalah / catatan:** bug, workaround, hal yang perlu diwaspadai.
- **Berikutnya:** langkah konkret sesi selanjutnya.
-->
