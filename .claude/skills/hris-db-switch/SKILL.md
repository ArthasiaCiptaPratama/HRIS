---
name: hris-db-switch
description: Tukar target database HRIS antara PostgreSQL lokal (Docker) dan Supabase (pooler) lewat `bun run db:use`, kapan memakai masing-masing, jaring pengaman destruktif, dan konvensi agar fitur ini aman-merge. Use when the user wants to switch/point the database between local and Supabase, asks "pakai DB mana", runs db:use/db:which, hits the destructive-op guard, reconciles .env after pulling updates, or when editing the switch tooling without breaking merges.
---

# Tukar Database: Lokal ⇄ Supabase

Fitur dev-tooling: satu perintah menukar koneksi Postgres yang dipakai aplikasi & Prisma, tanpa mengubah kode. Dibuat 2026-10-09 (branch `HRIS/mat/windows`). Melengkapi [[hris-db-schema]] (migrasi/skema) dan PROMPT §6/§9.

## Model mental

- **Hanya koneksi Postgres yang berpindah.** `DATABASE_URL` (runtime, `src/core/db.ts`) dan `DIRECT_URL` (Prisma CLI, `prisma.config.ts`) ditulis ulang dari profil.
- **Auth & Storage SELALU Supabase staging** (`SUPABASE_URL` tidak ikut ditukar). Jadi di mode lokal: DB lokal + login lewat Auth staging. Akun yang dipakai login harus **ada di DB yang sedang aktif** (pakai `bootstrap:super-admin` / `dev:account` untuk mengisi DB lokal).
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

## Konfigurasi `.env` (per-developer, gitignored)

Kunci **aktif** (ditulis `db:use`): `DATABASE_URL`, `DIRECT_URL`, `STORAGE_PATH_PREFIX`.
Profil (diisi sekali): `LOCAL_DATABASE_URL`/`LOCAL_DIRECT_URL`/`LOCAL_STORAGE_PATH_PREFIX` dan `SUPABASE_DATABASE_URL`/`SUPABASE_DIRECT_URL`/`SUPABASE_STORAGE_PATH_PREFIX`. Daftar + contoh ada di `.env.example`.

- `SUPABASE_DATABASE_URL` = transaction pooler (port 6543). `SUPABASE_DIRECT_URL` = session pooler (port 5432) untuk `prisma migrate`. Keduanya **rahasia** (password di URL) — jangan commit.
- `SUPABASE_URL` (Auth/JWKS) **berbeda** dari `SUPABASE_DATABASE_URL` (koneksi Postgres). Jangan tertukar.

**Setelah `git pull`/merge**, cek `.env` asli vs `.env.example`: bila tim menambah env var baru, salin namanya ke `.env` dan isi (termasuk yang rahasia), kalau tidak `env.ts` bisa menolak start.

## Aman-merge (WAJIB dijaga saat mengubah fitur ini)

Agar perubahan switch tidak pernah bentrok dengan kerja orang lain:
- **Logika switch hanya di file khusus** (`apps/api/scripts/{use-db,db-target,guard-local-db}.ts`, `apps/api/bunfig.toml`, `apps/api/tests/helpers/db-guard-preload.ts`). File baru = aman-merge. **Jangan** sebar logika ke `src/` runtime (kecuali 1 baris penanda `dbHost` di `src/index.ts`).
- **Jejak di file ter-track bersama hanya tambahan (additive):** key script `db:use`/`db:which` di `package.json`. Satu-satunya baris yang dimodifikasi: pembungkus guard di `db:reset`/`db:seed` (`apps/api/package.json`).
- **Pilihan DB & connection string tidak pernah di-track** — semuanya di `.env`. Saat merge, konfigurasi DB tiap orang tetap utuh karena gitignored.
- Dokumentasi "cara & kapan" tinggal di skill ini (file baru), bukan menyebar panjang di CODEMAP/README (perkecil permukaan konflik docs).
- Saat menyelesaikan konflik merge: **pertahankan perubahan rekan**, lalu pastikan jejak switch yang additive di atas masih ada.

## Jebakan diketahui

- **Windows**: `bun run test:api` bisa segfault (bug Bun 1.4.2, bukan kode) — lihat memori proyek; verifikasi backend lewat CI/Linux. Checkout baru: `bun run db:generate` dulu (client Prisma bisa basi).
- `db:use` menulis ke `.env` di root (atau `HRIS_ENV_FILE` bila diset untuk uji). Hanya menukar 3 kunci aktif; kunci lain tidak disentuh.
