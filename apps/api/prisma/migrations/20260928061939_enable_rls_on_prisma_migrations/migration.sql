-- Advisor Supabase `rls_disabled_in_public` (ERROR): tabel riwayat migrasi Prisma berada di skema
-- `public` yang diekspos Data API, sehingga bisa dibaca dengan anon key (PLAN §3.2.8).
-- RLS tanpa policy menolak semua role non-pemilik (anon, authenticated); Prisma memakai role
-- pemilik tabel sehingga tetap bisa menulis.
-- Portabel (D-023): Postgres polos; bersyarat karena shadow database `migrate dev` tidak punya tabel ini.
DO $$
BEGIN
  IF to_regclass('public._prisma_migrations') IS NOT NULL THEN
    ALTER TABLE public._prisma_migrations ENABLE ROW LEVEL SECURITY;
  END IF;
END
$$;
