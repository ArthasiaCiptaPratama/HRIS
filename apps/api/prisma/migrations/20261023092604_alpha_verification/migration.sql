-- CreateEnum
CREATE TYPE "attendance"."AlphaVerification" AS ENUM ('PENDING', 'CONFIRMED', 'PERMIT', 'SICK', 'DUTY');

-- AlterTable
ALTER TABLE "attendance"."attendance_days" ADD COLUMN     "alpha_verification" "attendance"."AlphaVerification",
ADD COLUMN     "alpha_verification_note" VARCHAR(300),
ADD COLUMN     "alpha_verified_at" TIMESTAMPTZ(6),
ADD COLUMN     "alpha_verified_by" UUID;

-- CreateIndex
CREATE INDEX "attendance_days_alpha_verification_company_id_idx" ON "attendance"."attendance_days"("alpha_verification", "company_id");
