-- AlterTable
ALTER TABLE "employee"."educations" ADD COLUMN     "entry_year" SMALLINT;

-- AlterTable
ALTER TABLE "employee"."employee_personal" ADD COLUMN     "driving_license_numbers" JSONB,
ADD COLUMN     "emergency_contact_address" TEXT;

-- AlterTable
ALTER TABLE "employee"."family_members" ADD COLUMN     "age_at_entry" SMALLINT,
ADD COLUMN     "birth_place" VARCHAR(100),
ADD COLUMN     "education" VARCHAR(50),
ADD COLUMN     "gender" "employee"."Gender",
ADD COLUMN     "occupation" VARCHAR(100),
ADD COLUMN     "work_address" TEXT;

-- AlterTable
ALTER TABLE "employee"."trainings" ADD COLUMN     "certificate_number" VARCHAR(60);

-- D-059 (SQL mentah, tidak didukung Prisma): rentang wajar & urutan tahun pendidikan.
ALTER TABLE "employee"."family_members" ADD CONSTRAINT "family_members_age_at_entry_check"
  CHECK ("age_at_entry" IS NULL OR "age_at_entry" BETWEEN 0 AND 130);
ALTER TABLE "employee"."educations" ADD CONSTRAINT "educations_entry_year_check"
  CHECK ("entry_year" IS NULL OR ("entry_year" BETWEEN 1940 AND 2100
    AND ("graduation_year" IS NULL OR "entry_year" <= "graduation_year")));
