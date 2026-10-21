-- CreateEnum
CREATE TYPE "attendance"."PunchChannel" AS ENUM ('APP', 'PWA');

-- AlterTable
ALTER TABLE "attendance"."attendance_punches" ADD COLUMN     "app_version" VARCHAR(40),
ADD COLUMN     "channel" "attendance"."PunchChannel" NOT NULL DEFAULT 'PWA',
ADD COLUMN     "idempotency_key" VARCHAR(64);

-- CreateIndex
CREATE UNIQUE INDEX "attendance_punches_idempotency_key_key" ON "attendance"."attendance_punches"("idempotency_key");
