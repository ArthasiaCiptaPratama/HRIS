-- CreateEnum
CREATE TYPE "employee"."TrainingType" AS ENUM ('INTERNAL', 'EXTERNAL');

-- CreateEnum
CREATE TYPE "employee"."HistorySource" AS ENUM ('SYSTEM', 'MANUAL');

-- CreateEnum
CREATE TYPE "employee"."MovementType" AS ENUM ('PROMOTION', 'MUTATION', 'DEMOTION', 'ROTATION', 'OTHER');

-- AlterTable
ALTER TABLE "employee"."employment_histories" ADD COLUMN     "decree_number" VARCHAR(60),
ADD COLUMN     "movement_type" "employee"."MovementType",
ADD COLUMN     "source" "employee"."HistorySource" NOT NULL DEFAULT 'SYSTEM',
ADD COLUMN     "to_department_name" VARCHAR(100),
ADD COLUMN     "to_position_name" VARCHAR(100),
ADD COLUMN     "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "employee"."trainings" ADD COLUMN     "cost" DECIMAL(15,2),
ADD COLUMN     "end_date" DATE,
ADD COLUMN     "hours" SMALLINT,
ADD COLUMN     "start_date" DATE,
ADD COLUMN     "type" "employee"."TrainingType";

-- D-054: penjaga di DB (selain validasi Zod di API & form).
ALTER TABLE "employee"."trainings" ADD CONSTRAINT "trainings_period_check" CHECK ("end_date" IS NULL OR "start_date" IS NULL OR "end_date" >= "start_date");
ALTER TABLE "employee"."trainings" ADD CONSTRAINT "trainings_hours_check" CHECK ("hours" IS NULL OR "hours" BETWEEN 1 AND 2000);
ALTER TABLE "employee"."trainings" ADD CONSTRAINT "trainings_cost_check" CHECK ("cost" IS NULL OR "cost" >= 0);
-- Riwayat lama (MANUAL) wajib punya jabatan tujuan: dari master atau teks bebas.
ALTER TABLE "employee"."employment_histories" ADD CONSTRAINT "employment_histories_manual_position_check" CHECK ("source" <> 'MANUAL' OR "to_position_id" IS NOT NULL OR "to_position_name" IS NOT NULL);
