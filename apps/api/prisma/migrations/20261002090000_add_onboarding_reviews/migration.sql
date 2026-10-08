-- D-045 c / D-047: grant review onboarding + tabel keputusan review. Hanya menambah.
-- CreateEnum
CREATE TYPE "employee"."OnboardingDecision" AS ENUM ('APPROVED', 'REVISION_REQUESTED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "iam"."Permission" ADD VALUE 'employee.onboarding.review';

-- CreateTable
CREATE TABLE "employee"."onboarding_reviews" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "decision" "employee"."OnboardingDecision" NOT NULL,
    "reviewer_account_id" UUID NOT NULL,
    "section_notes" JSONB,
    "reason" TEXT,
    "completion" BOOLEAN NOT NULL DEFAULT false,
    "decided_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "onboarding_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "onboarding_reviews_employee_id_decided_at_idx" ON "employee"."onboarding_reviews"("employee_id", "decided_at");

-- AddForeignKey
ALTER TABLE "employee"."onboarding_reviews" ADD CONSTRAINT "onboarding_reviews_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"."employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

