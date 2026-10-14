# HRIS — Instruksi untuk AI Agent

Sebelum mengerjakan apa pun di repo ini, baca dan ikuti protokol di **[docs/PROMPT.md](docs/PROMPT.md)**.

Ringkasnya (peta dokumen: [docs/README.md](docs/README.md)):
1. Baca `docs/PROMPT.md` → `docs/PROGRESS.md` (induk: status per fitur) → `docs/features/<fitur>/README.md` yang dikerjakan → bagian relevan `docs/PLAN.md` dan `docs/codemap/<modul>.md`.
2. Kerjakan fitur/fase aktif saja; jangan memutuskan keputusan terbuka (OD) sendiri. Keputusan baru berprefix fitur (`TM-D1`), bukan `D-074`.
3. Akhiri setiap sesi dengan memperbarui README + `log.md` fitur dan `docs/codemap/<modul>.md`; induk (`PROGRESS.md`, indeks PLAN §8) diperbarui saat digabung ke develop.
4. **Dua jalur (D-043):** folder `HRIS` = develop, folder `HRIS-rilis` = rilis/staging; isinya sengaja berbeda. Cek `docs/RELEASE.md` §2 "Antrean push / rilis" sebelum push/rilis apa pun.
5. Ikuti skill **`hris-workflow`**: rencana selalu menunggu persetujuan; setiap commit/push/PR/deploy ditanyakan dulu; `main` tidak disentuh tanpa permintaan eksplisit.

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
