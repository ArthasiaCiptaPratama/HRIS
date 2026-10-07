-- CreateEnum
CREATE TYPE "employee"."DrivingLicenseType" AS ENUM ('A', 'A_UMUM', 'B1', 'B1_UMUM', 'B2', 'B2_UMUM', 'C', 'C1', 'C2', 'D', 'D1');

-- AlterTable
ALTER TABLE "employee"."employee_personal" ADD COLUMN     "blood_type" VARCHAR(3),
ADD COLUMN     "driving_license_number" VARCHAR(30),
ADD COLUMN     "driving_license_types" "employee"."DrivingLicenseType"[] DEFAULT ARRAY[]::"employee"."DrivingLicenseType"[],
ADD COLUMN     "ethnicity" VARCHAR(50),
ADD COLUMN     "nationality" VARCHAR(50),
ADD COLUMN     "nickname" VARCHAR(50);

-- D-059 (SQL mentah, tidak didukung Prisma): golongan darah A/B/AB/O dengan rhesus opsional.
ALTER TABLE "employee"."employee_personal" ADD CONSTRAINT "employee_personal_blood_type_check"
  CHECK ("blood_type" IS NULL OR "blood_type" ~ '^(A|B|AB|O)[+-]?$');
