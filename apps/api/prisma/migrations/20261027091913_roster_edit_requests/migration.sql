-- CreateEnum
CREATE TYPE "attendance"."RosterEditKind" AS ENUM ('TEMPLATE', 'CELLS', 'IMPORT', 'CREW');

-- CreateEnum
CREATE TYPE "attendance"."RosterEditStatus" AS ENUM ('PENDING', 'APPLIED', 'REJECTED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "approval"."ApprovalSubjectType" ADD VALUE 'ROSTER_EDIT';

-- AlterTable
ALTER TABLE "approval"."approval_requests" ADD COLUMN     "submitted_by_account_id" UUID;

-- CreateTable
CREATE TABLE "attendance"."roster_edit_requests" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "manager_employee_id" UUID,
    "kind" "attendance"."RosterEditKind" NOT NULL,
    "effective_date" DATE NOT NULL,
    "payload" JSONB NOT NULL,
    "preview" JSONB NOT NULL,
    "reason" VARCHAR(300),
    "status" "attendance"."RosterEditStatus" NOT NULL DEFAULT 'PENDING',
    "created_by_account_id" UUID NOT NULL,
    "applied_from" DATE,
    "decided_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "roster_edit_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "roster_edit_requests_employee_id_status_idx" ON "attendance"."roster_edit_requests"("employee_id", "status");

-- CreateIndex
CREATE INDEX "roster_edit_requests_company_id_status_idx" ON "attendance"."roster_edit_requests"("company_id", "status");
