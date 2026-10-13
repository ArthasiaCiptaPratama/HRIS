-- CreateEnum
CREATE TYPE "attendance"."RosterSource" AS ENUM ('PATTERN', 'MANUAL', 'IMPORT', 'CHANGE');

-- CreateEnum
CREATE TYPE "attendance"."RosterChangeStatus" AS ENUM ('AWAITING_PEER', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "attendance"."shifts" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "code" VARCHAR(10) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "start_minute" SMALLINT NOT NULL,
    "end_minute" SMALLINT NOT NULL,
    "check_in_open_min" SMALLINT NOT NULL DEFAULT 60,
    "late_tolerance_min" SMALLINT NOT NULL DEFAULT 15,
    "early_leave_tolerance_min" SMALLINT NOT NULL DEFAULT 15,
    "check_out_close_min" SMALLINT NOT NULL DEFAULT 240,
    "color" VARCHAR(9),
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance"."roster_patterns" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "steps" VARCHAR(10)[],
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "roster_patterns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance"."crews" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "work_location_id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "pattern_id" UUID NOT NULL,
    "cycle_start_date" DATE NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "crews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance"."crew_members" (
    "id" UUID NOT NULL,
    "crew_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crew_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance"."roster_days" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "work_date" DATE NOT NULL,
    "shift_id" UUID,
    "crew_id" UUID,
    "source" "attendance"."RosterSource" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "roster_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance"."roster_change_requests" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "created_by_employee_id" UUID NOT NULL,
    "work_date" DATE NOT NULL,
    "from_shift_id" UUID,
    "to_shift_id" UUID,
    "peer_employee_id" UUID,
    "reason" VARCHAR(500) NOT NULL,
    "status" "attendance"."RosterChangeStatus" NOT NULL,
    "peer_decided_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "roster_change_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shifts_company_id_idx" ON "attendance"."shifts"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "shifts_company_id_code_key" ON "attendance"."shifts"("company_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "roster_patterns_company_id_name_key" ON "attendance"."roster_patterns"("company_id", "name");

-- CreateIndex
CREATE INDEX "crews_pattern_id_idx" ON "attendance"."crews"("pattern_id");

-- CreateIndex
CREATE INDEX "crews_work_location_id_idx" ON "attendance"."crews"("work_location_id");

-- CreateIndex
CREATE UNIQUE INDEX "crews_company_id_name_key" ON "attendance"."crews"("company_id", "name");

-- CreateIndex
CREATE INDEX "crew_members_crew_id_idx" ON "attendance"."crew_members"("crew_id");

-- CreateIndex
CREATE INDEX "crew_members_employee_id_start_date_idx" ON "attendance"."crew_members"("employee_id", "start_date");

-- CreateIndex
CREATE INDEX "roster_days_work_date_idx" ON "attendance"."roster_days"("work_date");

-- CreateIndex
CREATE INDEX "roster_days_shift_id_idx" ON "attendance"."roster_days"("shift_id");

-- CreateIndex
CREATE UNIQUE INDEX "roster_days_employee_id_work_date_key" ON "attendance"."roster_days"("employee_id", "work_date");

-- CreateIndex
CREATE INDEX "roster_change_requests_employee_id_work_date_idx" ON "attendance"."roster_change_requests"("employee_id", "work_date");

-- CreateIndex
CREATE INDEX "roster_change_requests_peer_employee_id_status_idx" ON "attendance"."roster_change_requests"("peer_employee_id", "status");

-- AddForeignKey
ALTER TABLE "attendance"."crews" ADD CONSTRAINT "crews_pattern_id_fkey" FOREIGN KEY ("pattern_id") REFERENCES "attendance"."roster_patterns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance"."crew_members" ADD CONSTRAINT "crew_members_crew_id_fkey" FOREIGN KEY ("crew_id") REFERENCES "attendance"."crews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance"."roster_days" ADD CONSTRAINT "roster_days_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "attendance"."shifts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
