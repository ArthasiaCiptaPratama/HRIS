-- CreateEnum
CREATE TYPE "leave"."LeaveCategory" AS ENUM ('ANNUAL', 'PERMIT', 'SICK');

-- CreateEnum
CREATE TYPE "leave"."LeaveRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "leave"."LeaveLedgerKind" AS ENUM ('GRANT', 'HOLD', 'RELEASE', 'USE', 'COLLECTIVE', 'EXPIRE', 'SETTLE', 'ADJUST');

-- CreateTable
CREATE TABLE "leave"."leave_types" (
    "id" UUID NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "category" "leave"."LeaveCategory" NOT NULL,
    "max_days_per_request" SMALLINT,
    "document_required_after_days" SMALLINT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" SMALLINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "leave_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave"."leave_years" (
    "id" UUID NOT NULL,
    "year" SMALLINT NOT NULL,
    "quota" SMALLINT NOT NULL DEFAULT 12,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "granted_at" TIMESTAMPTZ(6),
    "settled_at" TIMESTAMPTZ(6),
    "expired_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "leave_years_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave"."leave_ledger" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "year" SMALLINT NOT NULL,
    "kind" "leave"."LeaveLedgerKind" NOT NULL,
    "days" SMALLINT NOT NULL,
    "request_id" UUID,
    "work_date" DATE,
    "note" VARCHAR(300),
    "created_by_account_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leave_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave"."leave_requests" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "manager_employee_id" UUID,
    "leave_type_id" UUID NOT NULL,
    "category" "leave"."LeaveCategory" NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "work_dates" DATE[],
    "days" SMALLINT NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "attachment_path" VARCHAR(300),
    "status" "leave"."LeaveRequestStatus" NOT NULL DEFAULT 'PENDING',
    "created_by_employee_id" UUID NOT NULL,
    "decided_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "leave_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "leave_types_code_key" ON "leave"."leave_types"("code");

-- CreateIndex
CREATE UNIQUE INDEX "leave_years_year_key" ON "leave"."leave_years"("year");

-- CreateIndex
CREATE INDEX "leave_ledger_employee_id_year_idx" ON "leave"."leave_ledger"("employee_id", "year");

-- CreateIndex
CREATE INDEX "leave_ledger_company_id_year_idx" ON "leave"."leave_ledger"("company_id", "year");

-- CreateIndex
CREATE INDEX "leave_ledger_request_id_idx" ON "leave"."leave_ledger"("request_id");

-- CreateIndex
CREATE INDEX "leave_requests_employee_id_start_date_idx" ON "leave"."leave_requests"("employee_id", "start_date");

-- CreateIndex
CREATE INDEX "leave_requests_company_id_status_idx" ON "leave"."leave_requests"("company_id", "status");

-- AddForeignKey
ALTER TABLE "leave"."leave_requests" ADD CONSTRAINT "leave_requests_leave_type_id_fkey" FOREIGN KEY ("leave_type_id") REFERENCES "leave"."leave_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
