-- D-037: foto profil pegawai = path objek di bucket private Supabase Storage `employee-photos`.
-- Kolom biasa (tanpa objek milik Supabase) supaya tetap jalan di PostgreSQL polos (D-023).
-- AlterTable
ALTER TABLE "employee"."employees" ADD COLUMN     "photo_path" VARCHAR(255);

