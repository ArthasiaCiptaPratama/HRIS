-- CreateEnum
CREATE TYPE "attendance"."AttendanceDayStatus" AS ENUM ('OPEN', 'PENDING', 'APPROVED', 'REJECTED', 'ALPHA', 'LEAVE');

-- CreateEnum
CREATE TYPE "attendance"."PunchKind" AS ENUM ('IN', 'OUT');

-- CreateTable
CREATE TABLE "attendance"."attendance_days" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "manager_employee_id" UUID,
    "work_date" DATE NOT NULL,
    "shift_id" UUID,
    "shift_code" VARCHAR(10),
    "scheduled_start" TIMESTAMPTZ(6),
    "scheduled_end" TIMESTAMPTZ(6),
    "check_out_deadline" TIMESTAMPTZ(6),
    "work_location_id" UUID,
    "status" "attendance"."AttendanceDayStatus" NOT NULL,
    "labels" VARCHAR(20)[],
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "attendance_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance"."attendance_punches" (
    "id" UUID NOT NULL,
    "day_id" UUID NOT NULL,
    "kind" "attendance"."PunchKind" NOT NULL,
    "at" TIMESTAMPTZ(6) NOT NULL,
    "latitude" DECIMAL(9,6) NOT NULL,
    "longitude" DECIMAL(9,6) NOT NULL,
    "accuracy_m" INTEGER NOT NULL,
    "distance_m" INTEGER,
    "work_location_id" UUID,
    "inside_geofence" BOOLEAN NOT NULL,
    "labels" VARCHAR(20)[],
    "reason" VARCHAR(500),
    "selfie_path" VARCHAR(300) NOT NULL,
    "selfie_purged_at" TIMESTAMPTZ(6),
    "user_agent" VARCHAR(300),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_punches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attendance_days_company_id_work_date_idx" ON "attendance"."attendance_days"("company_id", "work_date");

-- CreateIndex
CREATE INDEX "attendance_days_status_check_out_deadline_idx" ON "attendance"."attendance_days"("status", "check_out_deadline");

-- CreateIndex
CREATE INDEX "attendance_days_manager_employee_id_work_date_idx" ON "attendance"."attendance_days"("manager_employee_id", "work_date");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_days_employee_id_work_date_key" ON "attendance"."attendance_days"("employee_id", "work_date");

-- CreateIndex
CREATE INDEX "attendance_punches_at_idx" ON "attendance"."attendance_punches"("at");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_punches_day_id_kind_key" ON "attendance"."attendance_punches"("day_id", "kind");

-- AddForeignKey
ALTER TABLE "attendance"."attendance_punches" ADD CONSTRAINT "attendance_punches_day_id_fkey" FOREIGN KEY ("day_id") REFERENCES "attendance"."attendance_days"("id") ON DELETE CASCADE ON UPDATE CASCADE;
