---
name: hris-db-schema
description: Alur kerja skema database HRIS (Prisma 7 multi-file, satu skema Postgres per modul, migrasi, seed, verifikasi) dan batas pemakaian Supabase MCP. Use when adding/changing tables, columns, enums, relations, indexes, migrations, or seed data in apps/api/prisma, translating an ERD (dbdiagram.io) into Prisma, or when tempted to change the Supabase database directly.
---

# Skema Database HRIS

Aturan sumber: PROMPT §6 (konvensi DB), PLAN §3.2 (batas modul), D-003 (Prisma satu-satunya ORM), D-023 (DB lokal Docker), D-026 (ERD employee management). Aturan projek **mengalahkan** skill `supabase` bawaan bila bertentangan.

## Larangan keras

- Perubahan skema **hanya** lewat file `apps/api/prisma/schema/<modul>.prisma` + migrasi Prisma. **Jangan** memakai Supabase MCP `apply_migration`/`execute_sql` DDL, Supabase CLI `db pull/push`, atau dashboard untuk mengubah skema.
- Migrasi yang sudah di-merge tidak pernah diedit. Perubahan = migrasi baru.
- Tidak ada objek milik Supabase (`auth.*`, `storage.*`, `CREATE EXTENSION`) di migrasi: harus jalan di PostgreSQL polos.
- FK lintas modul hanya ke modul inti `employee`/`organization`. Relasi Prisma lintas modul hanya penjaga integritas, **bukan** untuk `include` dari repository modul lain.
- Data sensitif (PLAN §4.2) di tabel terpisah (`employee_personal`, `employee_bank_accounts`, `family_members`), bukan di tabel utama.

## Checklist perubahan skema

```
- [ ] Tentukan modul pemilik tabel (CODEMAP §5) → file <modul>.prisma
- [ ] Model PascalCase tunggal, @@map snake_case jamak, @@schema("<modul>")
- [ ] id String @id @default(uuid()) @db.Uuid; createdAt/updatedAt Timestamptz(6); deletedAt hanya bila soft delete
- [ ] Field camelCase + @map snake_case; uang Decimal(15,2); koordinat Decimal(9,6); tanggal murni @db.Date
- [ ] Himpunan tetap → enum Prisma (@@schema juga); himpunan yang diatur SUPER_ADMIN → tabel
- [ ] Index untuk setiap FK & kolom filter/pencarian; @@unique untuk kunci bisnis
- [ ] bunx prisma format && bunx prisma validate   (di apps/api)
- [ ] bun run db:migrate -- --create-only --name <deskripsi_snake_case>  → BACA SQL-nya
- [ ] bun run db:migrate          (terapkan)
- [ ] bun run db:generate         (WAJIB: Prisma 7 tidak generate otomatis setelah migrate)
- [ ] bun run db:check            ("No difference detected")
- [ ] Integration test constraint di apps/api/tests/integration/ (lihat EXAMPLES.md)
- [ ] bun run typecheck && bun run check:boundaries && bun run test:api
- [ ] Perbarui docs/erd/hris.dbml (diagram dbdiagram.io), CODEMAP §6, PLAN bila ada keputusan baru, log PROGRESS
```

SQL mentah (index parsial, CHECK) → edit file hasil `--create-only` sebelum diterapkan, beri komentar alasan.

## Menerjemahkan ERD → Prisma

Lihat [ERD.md](ERD.md) untuk pemetaan ERD minggu 2026-09-28 dan pola umumnya (int PK → UUID, `nik` → `employee_number`, kolom sensitif dipisah, `age` → `birth_date`).

## Supabase MCP (project staging)

Boleh: `search_docs`, `list_tables`/`list_migrations` untuk **membaca**, `get_advisors`, `get_logs`, `execute_sql` **SELECT saja** untuk diagnosis. Migrasi ke staging **hanya** lewat workflow `Deploy staging` (D-030) saat kode masuk `HRIS/debug/fe-be`; jangan menjalankan `db:deploy` ke staging dari laptop. Konfirmasi ke pengguna sebelum aksi tulis apa pun ke project Supabase.

## Gotcha

- `prisma migrate reset` ditolak untuk AI agent tanpa persetujuan eksplisit; minta izin, lalu set `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION` = teks persetujuan pengguna persis.
- `PrismaPromise` bukan Promise: bungkus `(async () => q())()` sebelum `expect(...).rejects`, dan selalu `await`.
- Kode error Prisma: P2002 unik, P2003 FK, P2025 tidak ditemukan.
