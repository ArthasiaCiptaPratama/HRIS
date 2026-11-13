-- CreateEnum
CREATE TYPE "employee"."FieldChangeSource" AS ENUM ('HR_FORM', 'HR_PROFILE', 'DATA_CHANGE', 'IMPORT', 'SELF_FILL', 'ONBOARDING_REVIEW', 'ONBOARDING_INVITE', 'ORG_CHART', 'POST_SYNC', 'MASTER_MERGE', 'ARCHIVE', 'DOCUMENT', 'PHOTO');

-- CreateEnum
CREATE TYPE "employee"."FieldChangeSection" AS ENUM ('WORK', 'EMERGENCY', 'PERSONAL', 'FAMILY', 'BANK', 'EDUCATION', 'TRAINING', 'WORK_EXPERIENCE', 'DOCUMENT', 'PHOTO');

-- CreateTable
CREATE TABLE "employee"."employee_field_changes" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changed_by" UUID,
    "source" "employee"."FieldChangeSource" NOT NULL,
    "section" "employee"."FieldChangeSection" NOT NULL,
    "field" VARCHAR(60) NOT NULL,
    "old_value" TEXT,
    "new_value" TEXT,
    "ref_id" UUID,

    CONSTRAINT "employee_field_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "employee_field_changes_employee_id_occurred_at_idx" ON "employee"."employee_field_changes"("employee_id", "occurred_at" DESC);

-- AddForeignKey
ALTER TABLE "employee"."employee_field_changes" ADD CONSTRAINT "employee_field_changes_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"."employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
