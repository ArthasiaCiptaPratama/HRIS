-- CreateEnum
CREATE TYPE "attendance"."AttendancePeriodStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "attendance"."AttendanceCorrectionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "attendance"."attendance_periods" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "month" VARCHAR(7) NOT NULL,
    "status" "attendance"."AttendancePeriodStatus" NOT NULL DEFAULT 'OPEN',
    "closed_at" TIMESTAMPTZ(6),
    "closed_by_account_id" UUID,
    "summary" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "attendance_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance"."attendance_statements" (
    "id" UUID NOT NULL,
    "day_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "manager_employee_id" UUID,
    "work_date" DATE NOT NULL,
    "reason" VARCHAR(1000) NOT NULL,
    "attachment_path" VARCHAR(300),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_statements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance"."attendance_corrections" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "manager_employee_id" UUID,
    "work_date" DATE NOT NULL,
    "check_in_at" TIMESTAMPTZ(6),
    "check_out_at" TIMESTAMPTZ(6),
    "reason" VARCHAR(500) NOT NULL,
    "status" "attendance"."AttendanceCorrectionStatus" NOT NULL DEFAULT 'PENDING',
    "decided_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "attendance_corrections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "attendance_periods_company_id_month_key" ON "attendance"."attendance_periods"("company_id", "month");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_statements_day_id_key" ON "attendance"."attendance_statements"("day_id");

-- CreateIndex
CREATE INDEX "attendance_statements_company_id_work_date_idx" ON "attendance"."attendance_statements"("company_id", "work_date");

-- CreateIndex
CREATE INDEX "attendance_statements_employee_id_idx" ON "attendance"."attendance_statements"("employee_id");

-- CreateIndex
CREATE INDEX "attendance_corrections_employee_id_work_date_idx" ON "attendance"."attendance_corrections"("employee_id", "work_date");

-- CreateIndex
CREATE INDEX "attendance_corrections_company_id_status_idx" ON "attendance"."attendance_corrections"("company_id", "status");
