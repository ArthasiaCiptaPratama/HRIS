-- D-045 Onboarding bagian a: status onboarding (data lama = APPROVED), email pribadi, batch penerimaan, antrean undangan, jejak status. Hanya menambah.
-- CreateEnum
CREATE TYPE "employee"."OnboardingStatus" AS ENUM ('NOT_INVITED', 'INVITED', 'FILLING', 'SUBMITTED', 'REVISION_REQUESTED', 'APPROVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "employee"."OnboardingInvitationStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED');

-- AlterTable
ALTER TABLE "employee"."employees" ADD COLUMN     "completion_required" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "onboarding_batch_id" UUID,
ADD COLUMN     "onboarding_status" "employee"."OnboardingStatus" NOT NULL DEFAULT 'APPROVED',
ADD COLUMN     "personal_email" VARCHAR(254);

-- CreateTable
CREATE TABLE "employee"."onboarding_batches" (
    "id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "actor_account_id" UUID NOT NULL,
    "company_id" UUID,
    "source_file_name" VARCHAR(255),
    "source_file_sha256" VARCHAR(64),
    "created_count" INTEGER NOT NULL,
    "invited_count" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "onboarding_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee"."onboarding_invitations" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "status" "employee"."OnboardingInvitationStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error_code" VARCHAR(50),
    "queued_by" UUID NOT NULL,
    "sent_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "onboarding_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee"."onboarding_events" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "from_status" "employee"."OnboardingStatus",
    "to_status" "employee"."OnboardingStatus" NOT NULL,
    "actor_account_id" UUID,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "onboarding_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "onboarding_batches_actor_account_id_idx" ON "employee"."onboarding_batches"("actor_account_id");

-- CreateIndex
CREATE INDEX "onboarding_batches_company_id_idx" ON "employee"."onboarding_batches"("company_id");

-- CreateIndex
CREATE INDEX "onboarding_batches_created_at_idx" ON "employee"."onboarding_batches"("created_at");

-- CreateIndex
CREATE INDEX "onboarding_invitations_status_created_at_idx" ON "employee"."onboarding_invitations"("status", "created_at");

-- CreateIndex
CREATE INDEX "onboarding_invitations_employee_id_idx" ON "employee"."onboarding_invitations"("employee_id");

-- CreateIndex
CREATE INDEX "onboarding_invitations_sent_at_idx" ON "employee"."onboarding_invitations"("sent_at");

-- CreateIndex
CREATE INDEX "onboarding_events_employee_id_occurred_at_idx" ON "employee"."onboarding_events"("employee_id", "occurred_at");

-- CreateIndex
CREATE INDEX "employees_onboarding_status_idx" ON "employee"."employees"("onboarding_status");

-- CreateIndex
CREATE INDEX "employees_onboarding_batch_id_idx" ON "employee"."employees"("onboarding_batch_id");

-- CreateIndex
CREATE UNIQUE INDEX "employees_personal_email_key" ON "employee"."employees"("personal_email");

-- AddForeignKey
ALTER TABLE "employee"."employees" ADD CONSTRAINT "employees_onboarding_batch_id_fkey" FOREIGN KEY ("onboarding_batch_id") REFERENCES "employee"."onboarding_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee"."onboarding_batches" ADD CONSTRAINT "onboarding_batches_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "organization"."companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee"."onboarding_invitations" ADD CONSTRAINT "onboarding_invitations_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"."employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee"."onboarding_events" ADD CONSTRAINT "onboarding_events_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"."employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

