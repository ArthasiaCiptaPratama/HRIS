# HRIS — Instruksi untuk AI Agent

Sebelum mengerjakan apa pun di repo ini, baca dan ikuti protokol di **[docs/PROMPT.md](docs/PROMPT.md)**.

Ringkasnya:
1. Baca `docs/PROMPT.md` → `docs/PROGRESS.md` §2 → bagian relevan `docs/PLAN.md` dan `docs/CODEMAP.md`.
2. Kerjakan fase aktif saja; jangan memutuskan keputusan terbuka (OD) sendiri.
3. Akhiri setiap sesi dengan memperbarui `docs/PROGRESS.md` dan `docs/CODEMAP.md`.
4. Ikuti skill **`hris-workflow`**: rencana selalu menunggu persetujuan; setiap commit/push/PR/deploy ditanyakan dulu; `main` tidak disentuh tanpa permintaan eksplisit.

## Skill projek (`.claude/skills/`)

| Tugas | Skill |
|---|---|
| **Setiap tugas**: rencana & persetujuan, status per poin, PROGRESS, izin aksi keluar, laporan akhir | `hris-workflow` |
| Tabel, kolom, migrasi, seed, ERD → Prisma, Supabase MCP | `hris-db-schema` |
| Test API, alur bisnis, matriks akses | `hris-flow-testing` |
| Script Playwright / E2E | `hris-e2e-playwright` |
| Dokumentasi QA (plan, case, run, bug) | `hris-qa-docs` |

Skill resmi `supabase` & `supabase-postgres-best-practices` juga terpasang. **Jika bertentangan dengan dokumen projek, dokumen projek yang menang**: skema hanya diubah lewat migrasi Prisma (D-003), tidak lewat MCP `apply_migration`/`execute_sql` DDL atau Supabase CLI.

Komunikasi dengan pengguna dalam bahasa Indonesia.
