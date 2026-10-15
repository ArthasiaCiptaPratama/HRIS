---
name: hris-db-switch
description: Tukar target database HRIS antara PostgreSQL lokal (Docker) dan Supabase (pooler) lewat `bun run db:use`, kapan memakai masing-masing, jaring pengaman destruktif, dan konvensi agar fitur ini aman-merge. Use when the user wants to switch/point the database between local and Supabase, asks "pakai DB mana", runs db:use/db:which, hits the destructive-op guard, reconciles .env after pulling updates, or when editing the switch tooling without breaking merges.
---

# Tukar Database: Lokal ⇄ Supabase

Fitur dev-tooling: satu perintah menukar koneksi Postgres yang dipakai aplikasi & Prisma, tanpa mengubah kode. Dibuat 2026-10-09 (branch `HRIS/mat/windows`). Melengkapi [[hris-db-schema]] (migrasi/skema) dan PROMPT §6/§9.

## Model mental

- **Koneksi Postgres selalu berpindah.** `DATABASE_URL` (runtime, `src/core/db.ts`) dan `DIRECT_URL` (Prisma CLI, `prisma.config.ts`) ditulis ulang dari profil.
- **Dua mode, dipilih per-developer lewat `.env`:**
  - **Mode "DB saja" (bawaan, tanpa `LOCAL_SUPABASE_URL`)**: Auth & Storage SELALU Supabase staging. Di mode lokal: DB lokal + login lewat Auth staging. Akun login harus **ada di DB aktif** (`bootstrap:super-admin` / `dev:account`).
  - **Mode "terpisah penuh" (`LOCAL_SUPABASE_URL` terisi, dibuat 2026-10-15 di `HRIS/Mat/Mac`)**: `db:use local` juga menukar Auth & Storage ke **Supabase lokal** (Supabase CLI di Docker) → **nol request ke Supabase asli**. `db:use supabase` memulihkan staging dari cadangan `STAGING_*`. Lihat bagian "Mode terpisah penuh".
- **Pilihan per-developer ada di `.env` (gitignored)** → tidak pernah ikut commit/merge. Lihat bagian "Aman-merge".

## Perintah

```sh
bun run db:which            # target aktif sekarang (host saja, tanpa password)
bun run db:use local        # pakai PostgreSQL lokal (Docker)
bun run db:use supabase     # pakai Supabase (pooler)
```

Setelah menukar, **jalankan ulang `bun run dev`** (proses lama memegang koneksi lama). Log `server start` mencetak `dbHost` sebagai penanda.

## Kapan pakai yang mana

**Lokal (PostgreSQL Docker) — DEFAULT.** Pakai untuk hampir semua pekerjaan:
- Coding fitur sehari-hari, `bun run dev`.
- Migrasi (`db:migrate`), reset & seed bebas (`db:reset`, `db:seed`) — data buang.
- Menjalankan test (`bun run test`, `test:api`).
- Kerja offline, atau apa pun yang destruktif.
- Prasyarat: `bun run db:up` (container Postgres).

**Supabase (staging pooler) — SEMENTARA, baca-saja.** Pakai hanya untuk alasan spesifik, lalu **balik ke lokal**:
- Mereproduksi bug yang hanya muncul di staging.
- Melihat/verifikasi data yang dibuat tim di staging.
- Mengecek hasil migrasi yang sudah ter-deploy ke staging (bandingkan dengan `db:check`).
- Menguji alur yang butuh data DB staging sungguhan.
- Operasi destruktif **diblokir** (lihat jaring pengaman). Jangan `db:migrate` ke Supabase dari sini — deploy migrasi tetap lewat `db:deploy`/CI (PROMPT §6).

Ragu? Pakai **lokal**.

## Jaring pengaman (jangan sampai menghapus data Supabase)

- `db:reset` & `db:seed`: ditolak bila target non-lokal (`scripts/guard-local-db.ts`).
- `bun run test:api`: ditolak bila target non-lokal (`tests/helpers/db-guard-preload.ts` via `apps/api/bunfig.toml`) — test menulis & membersihkan data.
- Klasifikasi host lokal/remote: `scripts/db-target.ts` (localhost/127.0.0.1/::1/`*.localhost` = lokal; sisanya remote). Test unit: `tests/db-guard.test.ts`.
- **Override sadar-risiko:** `HRIS_ALLOW_REMOTE_DB=1` di depan perintah (mis. `HRIS_ALLOW_REMOTE_DB=1 bun run db:seed`). Gunakan hanya bila memang sengaja.

## Mode terpisah penuh (Auth & Storage lokal)

Untuk developer yang ingin data lokal **tidak pernah menyentuh** Supabase asli, termasuk akun login.

```sh
# Sekali: Docker (Mac: Colima `colima start --vm-type vz --cpu 2 --memory 3`; Windows/Linux: Docker Desktop/Engine)
#         + Supabase CLI. Kunci JWT lokal ES256 (per developer, gitignored):
echo '[]' > supabase/signing_keys.json && supabase gen signing-key --algorithm ES256 --yes
bun run auth:local:up                     # nyalakan Supabase lokal (Auth+Storage+Kong saja), tulis LOCAL_SUPABASE_* ke .env
bun run db:use local                      # DB lokal + Auth/Storage lokal; STAGING_* dicadangkan otomatis
bun run --cwd apps/api storage:setup      # bucket di Storage lokal
DEV_ACCOUNT_PASSWORD='...' bun run --cwd apps/api db:seed:time -- --demo --accounts   # akun demo di Auth LOKAL
bun run dev
```

- `supabase/config.toml` (ter-track) = konfigurasi **ramping**: hanya db internal, auth, storage, kong. `db.migrations` & `db.seed` **dimatikan**: skema HRIS tetap lewat Prisma ke Postgres lokal :5432 (D-003). Postgres internal Supabase (:54322) hanya untuk skema auth/storage miliknya.
- Verifier API (`core/auth/supabase-verifier.ts`) **tidak diubah**: Auth lokal memakai kunci ES256 via JWKS seperti staging. Issuer = `http://127.0.0.1:54321/auth/v1`, jadi `LOCAL_SUPABASE_URL` harus persis `API_URL` dari `supabase status` (jangan ganti ke `localhost`).
- Kunci yang ikut ditukar: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` ← `LOCAL_<kunci>` / `STAGING_<kunci>`. Kunci tidak pernah dicetak.
- **Pengaman:** `guard-local-db.ts` menolak seed/reset bila DB lokal tetapi `SUPABASE_URL` masih staging (seed akun demo tak akan menyentuh Auth staging). Tombol web "DB (dev)" terkunci ke target yang sama dengan Auth aktif (422 bila beda), karena Auth/`VITE_*` hanya terbaca saat start → pindah penuh lewat `db:use` + restart.
- Akun DB lokal yang dulu dibuat di Auth staging punya `auth_user_id` staging → setelah pindah ke Auth lokal, buat user di Auth lokal lalu tautkan ulang `iam.accounts.auth_user_id` (DB lokal saja).
- Matikan: `bun run auth:local:down` (data Auth lokal tetap di volume Docker).

## Konfigurasi `.env` (per-developer, gitignored)

Kunci **aktif** (ditulis `db:use`): `DATABASE_URL`, `DIRECT_URL`, `STORAGE_PATH_PREFIX`.
Profil (diisi sekali): `LOCAL_DATABASE_URL`/`LOCAL_DIRECT_URL`/`LOCAL_STORAGE_PATH_PREFIX` dan `SUPABASE_DATABASE_URL`/`SUPABASE_DIRECT_URL`/`SUPABASE_STORAGE_PATH_PREFIX`. Daftar + contoh ada di `.env.example`.

- `SUPABASE_DATABASE_URL` = transaction pooler (port 6543). `SUPABASE_DIRECT_URL` = session pooler (port 5432) untuk `prisma migrate`. Keduanya **rahasia** (password di URL) — jangan commit.
- `SUPABASE_URL` (Auth/JWKS) **berbeda** dari `SUPABASE_DATABASE_URL` (koneksi Postgres). Jangan tertukar.

**Setelah `git pull`/merge**, cek `.env` asli vs `.env.example`: bila tim menambah env var baru, salin namanya ke `.env` dan isi (termasuk yang rahasia), kalau tidak `env.ts` bisa menolak start.

## Aman-merge (WAJIB dijaga saat mengubah fitur ini)

Agar perubahan switch tidak pernah bentrok dengan kerja orang lain:
- **Logika switch hanya di file khusus** (`apps/api/scripts/{use-db,db-target,guard-local-db,auth-local}.ts`, `apps/api/bunfig.toml`, `apps/api/tests/helpers/db-guard-preload.ts`, `supabase/config.toml`). File baru = aman-merge. Runtime hanya: penanda `dbHost` di `src/index.ts` dan endpoint dev-only `src/core/dev.ts` (+ widget `dev-db-switcher.tsx`).
- **Jejak di file ter-track bersama hanya tambahan (additive):** key script `db:use`/`db:which`/`auth:local:up`/`auth:local:down` di `package.json`. Satu-satunya baris yang dimodifikasi: pembungkus guard di `db:reset`/`db:seed` (`apps/api/package.json`).
- **Mode terpisah penuh bersifat opt-in**: semua cabang kodenya bergantung pada `LOCAL_SUPABASE_URL`. Developer yang tidak mengisinya mendapat perilaku lama persis (dijaga test `tests/db-guard.test.ts`).
- **Pilihan DB & connection string tidak pernah di-track** — semuanya di `.env`. Saat merge, konfigurasi DB tiap orang tetap utuh karena gitignored.
- Dokumentasi "cara & kapan" tinggal di skill ini (file baru), bukan menyebar panjang di CODEMAP/README (perkecil permukaan konflik docs).
- Saat menyelesaikan konflik merge: **pertahankan perubahan rekan**, lalu pastikan jejak switch yang additive di atas masih ada.

## Jebakan diketahui

- **Windows**: `bun run test:api` bisa segfault (bug Bun 1.4.2, bukan kode) — lihat memori proyek; verifikasi backend lewat CI/Linux. Checkout baru: `bun run db:generate` dulu (client Prisma bisa basi).
- `db:use` menulis ke `.env` di root (atau `HRIS_ENV_FILE` bila diset untuk uji). Menukar 3 kunci aktif (+4 kunci Auth di mode terpisah); kunci lain tidak disentuh.
- **macOS 13 Intel**: Homebrew mengompilasi dari source (tanpa bottle) — PostgreSQL pakai Postgres.app, Docker pakai Colima + Docker CLI biner resmi (`~/.local/bin`).
