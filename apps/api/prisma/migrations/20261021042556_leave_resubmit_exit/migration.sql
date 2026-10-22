-- CreateEnum
CREATE TYPE "leave"."LeaveExitStatus" AS ENUM ('OPEN', 'PAID', 'CANCELLED');

-- AlterTable
ALTER TABLE "leave"."leave_requests" ADD COLUMN     "resubmitted_from_id" UUID;

-- CreateTable
CREATE TABLE "leave"."leave_exit_settlements" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "exit_date" DATE NOT NULL,
    "year" SMALLINT NOT NULL,
    "remaining_days" SMALLINT NOT NULL,
    "debt_days" SMALLINT NOT NULL,
    "pending_days" SMALLINT NOT NULL DEFAULT 0,
    "formula" VARCHAR(10) NOT NULL,
    "divisor" SMALLINT NOT NULL,
    "grade_id" UUID,
    "monthly_wage" DECIMAL(14,2),
    "pay_amount" DECIMAL(14,2),
    "debt_amount" DECIMAL(14,2),
    "status" "leave"."LeaveExitStatus" NOT NULL DEFAULT 'OPEN',
    "note" VARCHAR(300),
    "decided_by_account_id" UUID,
    "decided_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "leave_exit_settlements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "leave_exit_settlements_employee_id_idx" ON "leave"."leave_exit_settlements"("employee_id");

-- CreateIndex
CREATE INDEX "leave_exit_settlements_company_id_status_idx" ON "leave"."leave_exit_settlements"("company_id", "status");

-- CreateIndex
CREATE INDEX "leave_requests_resubmitted_from_id_idx" ON "leave"."leave_requests"("resubmitted_from_id");
