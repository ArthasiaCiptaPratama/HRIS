-- CreateEnum
CREATE TYPE "attendance"."OvertimeClaimStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "attendance"."overtime_claims" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "manager_employee_id" UUID,
    "work_date" DATE NOT NULL,
    "start_time" VARCHAR(5),
    "end_time" VARCHAR(5),
    "reason" VARCHAR(300) NOT NULL,
    "status" "attendance"."OvertimeClaimStatus" NOT NULL DEFAULT 'PENDING',
    "approved_start_time" VARCHAR(5),
    "approved_end_time" VARCHAR(5),
    "decision_note" VARCHAR(300),
    "decided_by_account_id" UUID,
    "decided_at" TIMESTAMPTZ(6),
    "order_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "overtime_claims_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "overtime_claims_employee_id_work_date_idx" ON "attendance"."overtime_claims"("employee_id", "work_date");

-- CreateIndex
CREATE INDEX "overtime_claims_company_id_status_work_date_idx" ON "attendance"."overtime_claims"("company_id", "status", "work_date");
