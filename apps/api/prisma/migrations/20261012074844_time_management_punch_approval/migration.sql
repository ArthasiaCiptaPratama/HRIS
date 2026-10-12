-- CreateEnum
CREATE TYPE "attendance"."PunchStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "attendance"."PunchSource" AS ENUM ('DEVICE', 'MANUAL');

-- AlterEnum
ALTER TYPE "approval"."ApprovalSubjectType" ADD VALUE 'ATTENDANCE_PUNCH';

-- AlterTable
ALTER TABLE "attendance"."attendance_punches" ADD COLUMN     "decided_at" TIMESTAMPTZ(6),
ADD COLUMN     "manual_by_account_id" UUID,
ADD COLUMN     "source" "attendance"."PunchSource" NOT NULL DEFAULT 'DEVICE',
ADD COLUMN     "status" "attendance"."PunchStatus" NOT NULL DEFAULT 'PENDING',
ALTER COLUMN "latitude" DROP NOT NULL,
ALTER COLUMN "longitude" DROP NOT NULL,
ALTER COLUMN "accuracy_m" DROP NOT NULL,
ALTER COLUMN "selfie_path" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "attendance_punches_status_idx" ON "attendance"."attendance_punches"("status");
