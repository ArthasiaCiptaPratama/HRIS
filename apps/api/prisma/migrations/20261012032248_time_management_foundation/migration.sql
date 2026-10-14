-- CreateEnum
CREATE TYPE "approval"."ApprovalSubjectType" AS ENUM ('LEAVE', 'PERMIT', 'ATTENDANCE_CORRECTION', 'OVERTIME', 'ATTENDANCE_DAY', 'ROSTER_CHANGE');

-- CreateEnum
CREATE TYPE "approval"."ApprovalMode" AS ENUM ('PARALLEL', 'SINGLE');

-- CreateEnum
CREATE TYPE "approval"."ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "approval"."ApprovalStepKind" AS ENUM ('MANAGER', 'HR');

-- CreateEnum
CREATE TYPE "approval"."ApprovalDecision" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "attendance"."HolidayKind" AS ENUM ('NATIONAL', 'COLLECTIVE_LEAVE');

-- CreateTable
CREATE TABLE "approval"."approval_requests" (
    "id" UUID NOT NULL,
    "subject_type" "approval"."ApprovalSubjectType" NOT NULL,
    "subject_id" UUID NOT NULL,
    "requester_employee_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "manager_employee_id" UUID,
    "mode" "approval"."ApprovalMode" NOT NULL,
    "status" "approval"."ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "decided_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "approval_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval"."approval_steps" (
    "id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "kind" "approval"."ApprovalStepKind" NOT NULL,
    "decision" "approval"."ApprovalDecision" NOT NULL DEFAULT 'PENDING',
    "decided_by_account_id" UUID,
    "decided_at" TIMESTAMPTZ(6),
    "note" VARCHAR(500),
    "is_override" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "approval_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance"."holidays" (
    "id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "kind" "attendance"."HolidayKind" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "holidays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance"."time_settings" (
    "key" VARCHAR(60) NOT NULL,
    "value" JSONB NOT NULL,
    "updated_by_account_id" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "time_settings_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "approval_requests_status_company_id_idx" ON "approval"."approval_requests"("status", "company_id");

-- CreateIndex
CREATE INDEX "approval_requests_manager_employee_id_status_idx" ON "approval"."approval_requests"("manager_employee_id", "status");

-- CreateIndex
CREATE INDEX "approval_requests_requester_employee_id_idx" ON "approval"."approval_requests"("requester_employee_id");

-- CreateIndex
CREATE INDEX "approval_requests_company_id_idx" ON "approval"."approval_requests"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "approval_requests_subject_type_subject_id_key" ON "approval"."approval_requests"("subject_type", "subject_id");

-- CreateIndex
CREATE INDEX "approval_steps_decided_by_account_id_idx" ON "approval"."approval_steps"("decided_by_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "approval_steps_request_id_kind_key" ON "approval"."approval_steps"("request_id", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "holidays_date_key" ON "attendance"."holidays"("date");

-- AddForeignKey
ALTER TABLE "approval"."approval_steps" ADD CONSTRAINT "approval_steps_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "approval"."approval_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
