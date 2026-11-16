-- AlterEnum
ALTER TYPE "attendance"."Residency" ADD VALUE 'OFFICE';

-- CreateTable
CREATE TABLE "attendance"."office_work_locations" (
    "work_location_id" UUID NOT NULL,
    "created_by_account_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "office_work_locations_pkey" PRIMARY KEY ("work_location_id")
);
