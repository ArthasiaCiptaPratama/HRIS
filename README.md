# HRIS
HRIS System for ArthasiaCiptaPratama 

Modular monolith: Bun + Hono + Prisma (TypeScript) di backend, React + Vite di frontend, Supabase (database, auth, storage), dan hosting di Vercel.

Development lokal memakai PostgreSQL di Docker; login & storage saat develop memakai Supabase project staging (lihat [PLAN §3.3](docs/PLAN.md#33-environment)).

## Dokumen Projek

| File | Isi |
| ---- | --- |
| [docs/PLAN.md](docs/PLAN.md) | Apa & kenapa: tujuan, arsitektur, model akses, aturan bisnis, keputusan, roadmap |
| [docs/CODEMAP.md](docs/CODEMAP.md) | Di mana: struktur folder, modul, tabel, endpoint, env var, script |
| [docs/PROGRESS.md](docs/PROGRESS.md) | Sampai mana: status fase, checklist, keputusan terbuka, log sesi |
| [docs/PROMPT.md](docs/PROMPT.md) | Bagaimana bekerja: protokol sesi, aturan, konvensi, template prompt |

## Mulai Cepat (Development Lokal)

Prasyarat: [Bun](https://bun.sh) 1.4.x dan Docker (Docker Engine di Linux, Docker Desktop + WSL2 di Windows).

```sh
bun install                 # install semua workspace + generate client Prisma
cp .env.example .env        # lalu isi nilai yang dibutuhkan (lihat docs/CODEMAP.md §8)
bun run db:up               # PostgreSQL lokal (Docker)
bun run db:migrate          # terapkan migrasi ke DB lokal
bun run dev                 # api http://localhost:3000/api/v1  ·  web http://localhost:5173
```

Dokumen API: `http://localhost:3000/api/v1/docs`. Pemeriksaan sebelum commit: `bun run typecheck && bun run lint && bun run check:boundaries && bun run test`. Daftar script lengkap: [CODEMAP §9](docs/CODEMAP.md#9-script-root).

### Tukar database: lokal ⇄ Supabase

Isi profil `LOCAL_*` dan `SUPABASE_*` sekali di `.env` (lihat `.env.example`), lalu tukar kapan saja:

```sh
bun run db:which          # target DB aktif sekarang
bun run db:use local      # pakai PostgreSQL lokal (Docker)
bun run db:use supabase   # pakai Supabase (pooler)
```

Hanya menulis ulang `DATABASE_URL`/`DIRECT_URL`/`STORAGE_PATH_PREFIX` di `.env` (tanpa menampilkan password); setelah menukar jalankan ulang `bun run dev`. Pengaman: `db:reset`/`db:seed`/test menolak target non-lokal (lewati `HRIS_ALLOW_REMOTE_DB=1`). Panduan kapan pakai lokal vs Supabase: skill `.claude/skills/hris-db-switch`.
