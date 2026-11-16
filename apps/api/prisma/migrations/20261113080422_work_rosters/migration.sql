-- CreateEnum
CREATE TYPE "attendance"."Residency" AS ENUM ('LOCAL', 'NON_LOCAL');

-- AlterTable
ALTER TABLE "attendance"."roster_days" ADD COLUMN     "time_off" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "attendance"."roster_templates" ADD COLUMN     "work_roster_id" UUID;

-- CreateTable
CREATE TABLE "attendance"."work_rosters" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "residency" "attendance"."Residency" NOT NULL,
    "work_days" INTEGER NOT NULL,
    "off_days" INTEGER NOT NULL,
    "cycles_before_time_off" INTEGER NOT NULL,
    "time_off_days" INTEGER NOT NULL,
    "crew_count" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "work_rosters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance"."work_location_local_homebases" (
    "work_location_id" UUID NOT NULL,
    "homebase_id" UUID NOT NULL,
    "created_by_account_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_location_local_homebases_pkey" PRIMARY KEY ("work_location_id","homebase_id")
);

-- CreateTable
CREATE TABLE "attendance"."employee_residencies" (
    "employee_id" UUID NOT NULL,
    "residency" "attendance"."Residency" NOT NULL,
    "updated_by_account_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "employee_residencies_pkey" PRIMARY KEY ("employee_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "work_rosters_company_id_name_key" ON "attendance"."work_rosters"("company_id", "name");

-- CreateIndex
CREATE INDEX "work_location_local_homebases_homebase_id_idx" ON "attendance"."work_location_local_homebases"("homebase_id");

-- CreateIndex
CREATE INDEX "roster_templates_work_roster_id_idx" ON "attendance"."roster_templates"("work_roster_id");

-- AddForeignKey
ALTER TABLE "attendance"."roster_templates" ADD CONSTRAINT "roster_templates_work_roster_id_fkey" FOREIGN KEY ("work_roster_id") REFERENCES "attendance"."work_rosters"("id") ON DELETE SET NULL ON UPDATE CASCADE;
