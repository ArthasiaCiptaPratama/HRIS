-- CreateEnum
CREATE TYPE "attendance"."OvertimeDayType" AS ENUM ('WORKDAY', 'OFF_DAY', 'HOLIDAY');

-- CreateEnum
CREATE TYPE "attendance"."OvertimeFormula" AS ENUM ('SIX_DAY', 'FIVE_DAY');

-- CreateEnum
CREATE TYPE "attendance"."OvertimeStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "attendance"."PunchKind" ADD VALUE 'BREAK_START';
ALTER TYPE "attendance"."PunchKind" ADD VALUE 'BREAK_END';

-- AlterEnum
ALTER TYPE "iam"."Permission" ADD VALUE 'labor.cost.read';

-- AlterTable
ALTER TABLE "attendance"."shifts" ADD COLUMN     "break_min" SMALLINT NOT NULL DEFAULT 0,
ADD COLUMN     "break_paid" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "regular_overtime_min" SMALLINT NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "attendance"."grade_wages" (
    "grade_id" UUID NOT NULL,
    "base_pay" DECIMAL(14,2) NOT NULL,
    "fixed_allowance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "updated_by_account_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "grade_wages_pkey" PRIMARY KEY ("grade_id")
);

-- CreateTable
CREATE TABLE "attendance"."overtime_requests" (
    "id" UUID NOT NULL,
    "day_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "manager_employee_id" UUID,
    "work_date" DATE NOT NULL,
    "day_type" "attendance"."OvertimeDayType" NOT NULL,
    "formula" "attendance"."OvertimeFormula" NOT NULL,
    "raw_min" INTEGER NOT NULL,
    "early_min" INTEGER NOT NULL DEFAULT 0,
    "debt_min" INTEGER NOT NULL,
    "regular_min" INTEGER NOT NULL,
    "proposed_min" INTEGER NOT NULL,
    "equivalent_hours" DECIMAL(6,2) NOT NULL,
    "flags" VARCHAR(20)[],
    "status" "attendance"."OvertimeStatus" NOT NULL DEFAULT 'PENDING',
    "decided_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "overtime_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "overtime_requests_day_id_key" ON "attendance"."overtime_requests"("day_id");

-- CreateIndex
CREATE INDEX "overtime_requests_employee_id_work_date_idx" ON "attendance"."overtime_requests"("employee_id", "work_date");

-- CreateIndex
CREATE INDEX "overtime_requests_company_id_work_date_idx" ON "attendance"."overtime_requests"("company_id", "work_date");

-- CreateIndex
CREATE INDEX "overtime_requests_status_idx" ON "attendance"."overtime_requests"("status");
