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
