-- CreateEnum
CREATE TYPE "employee"."EmployeeExitReason" AS ENUM ('RESIGNATION', 'TERMINATION', 'CONTRACT_ENDED', 'RETIREMENT', 'DECEASED', 'OTHER');

-- CreateEnum
CREATE TYPE "employee"."EmploymentChangeType" AS ENUM ('HIRED', 'STATUS_CHANGED', 'POSITION_CHANGED', 'DEACTIVATED', 'REACTIVATED');

-- CreateEnum
CREATE TYPE "organization"."EmploymentCategory" AS ENUM ('PERMANENT', 'PKWT', 'INTERNSHIP', 'DAILY_WORKER', 'OUTSOURCING');

-- DropIndex
DROP INDEX "employee"."employees_employment_status_id_idx";

-- DropIndex
DROP INDEX "employee"."employees_full_name_idx";

-- AlterTable
ALTER TABLE "employee"."employees" ADD COLUMN     "exit_reason" "employee"."EmployeeExitReason";

-- AlterTable
ALTER TABLE "organization"."employment_statuses" ADD COLUMN     "category" "organization"."EmploymentCategory";

-- CreateTable
CREATE TABLE "employee"."employment_histories" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "change_type" "employee"."EmploymentChangeType" NOT NULL,
    "effective_date" DATE NOT NULL,
    "from_status_id" UUID,
    "to_status_id" UUID,
    "from_position_id" UUID,
    "to_position_id" UUID,
    "exit_reason" "employee"."EmployeeExitReason",
    "note" VARCHAR(500),
    "changed_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employment_histories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "employment_histories_employee_id_effective_date_idx" ON "employee"."employment_histories"("employee_id", "effective_date" DESC);

-- CreateIndex
CREATE INDEX "employment_histories_from_status_id_idx" ON "employee"."employment_histories"("from_status_id");

-- CreateIndex
CREATE INDEX "employment_histories_to_status_id_idx" ON "employee"."employment_histories"("to_status_id");

-- CreateIndex
CREATE INDEX "employment_histories_from_position_id_idx" ON "employee"."employment_histories"("from_position_id");

-- CreateIndex
CREATE INDEX "employment_histories_to_position_id_idx" ON "employee"."employment_histories"("to_position_id");

-- CreateIndex
CREATE INDEX "employees_employment_status_id_is_active_idx" ON "employee"."employees"("employment_status_id", "is_active");

-- CreateIndex
CREATE INDEX "employees_is_active_full_name_idx" ON "employee"."employees"("is_active", "full_name");

-- CreateIndex
CREATE UNIQUE INDEX "employment_statuses_category_key" ON "organization"."employment_statuses"("category");

-- AddForeignKey
ALTER TABLE "employee"."employment_histories" ADD CONSTRAINT "employment_histories_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"."employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee"."employment_histories" ADD CONSTRAINT "employment_histories_from_status_id_fkey" FOREIGN KEY ("from_status_id") REFERENCES "organization"."employment_statuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee"."employment_histories" ADD CONSTRAINT "employment_histories_to_status_id_fkey" FOREIGN KEY ("to_status_id") REFERENCES "organization"."employment_statuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee"."employment_histories" ADD CONSTRAINT "employment_histories_from_position_id_fkey" FOREIGN KEY ("from_position_id") REFERENCES "organization"."positions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee"."employment_histories" ADD CONSTRAINT "employment_histories_to_position_id_fkey" FOREIGN KEY ("to_position_id") REFERENCES "organization"."positions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- SQL mentah (D-035): alasan keluar hanya boleh terisi pada pegawai nonaktif.
ALTER TABLE "employee"."employees" ADD CONSTRAINT "employees_exit_reason_only_inactive" CHECK ("is_active" = false OR "exit_reason" IS NULL);
