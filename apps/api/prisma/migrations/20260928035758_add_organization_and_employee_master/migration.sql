-- CreateEnum
CREATE TYPE "employee"."Gender" AS ENUM ('MALE', 'FEMALE');

-- CreateEnum
CREATE TYPE "employee"."MaritalStatus" AS ENUM ('SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED');

-- CreateEnum
CREATE TYPE "employee"."Religion" AS ENUM ('ISLAM', 'PROTESTANT', 'CATHOLIC', 'HINDU', 'BUDDHIST', 'CONFUCIAN', 'OTHER');

-- CreateEnum
CREATE TYPE "employee"."FamilyRelationship" AS ENUM ('SPOUSE', 'CHILD', 'FATHER', 'MOTHER', 'SIBLING', 'OTHER');

-- CreateTable
CREATE TABLE "employee"."employees" (
    "id" UUID NOT NULL,
    "employee_number" VARCHAR(30) NOT NULL,
    "full_name" VARCHAR(150) NOT NULL,
    "work_email" VARCHAR(254),
    "phone_number" VARCHAR(30),
    "emergency_phone" VARCHAR(30),
    "gender" "employee"."Gender",
    "join_date" DATE NOT NULL,
    "end_date" DATE,
    "employment_status_id" UUID NOT NULL,
    "position_id" UUID NOT NULL,
    "work_location_id" UUID,
    "grade_id" UUID,
    "manager_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee"."employee_personal" (
    "employee_id" UUID NOT NULL,
    "ktp_number" VARCHAR(16),
    "npwp_number" VARCHAR(20),
    "kk_number" VARCHAR(16),
    "birth_place" VARCHAR(100),
    "birth_date" DATE,
    "ktp_address" TEXT,
    "domicile_address" TEXT,
    "marital_status" "employee"."MaritalStatus",
    "religion" "employee"."Religion",
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "employee_personal_pkey" PRIMARY KEY ("employee_id")
);

-- CreateTable
CREATE TABLE "employee"."employee_bank_accounts" (
    "employee_id" UUID NOT NULL,
    "bank_name" VARCHAR(100) NOT NULL,
    "account_number" VARCHAR(30) NOT NULL,
    "account_holder" VARCHAR(150),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "employee_bank_accounts_pkey" PRIMARY KEY ("employee_id")
);

-- CreateTable
CREATE TABLE "employee"."family_members" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "relationship" "employee"."FamilyRelationship" NOT NULL,
    "address" TEXT,
    "birth_date" DATE,
    "phone_number" VARCHAR(30),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "family_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee"."educations" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "school_name" VARCHAR(150) NOT NULL,
    "major" VARCHAR(100),
    "graduation_year" SMALLINT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "educations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee"."trainings" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "training_field" VARCHAR(150) NOT NULL,
    "organizer" VARCHAR(150),
    "duration" VARCHAR(50),
    "training_year" SMALLINT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "trainings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization"."departments" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "parent_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization"."positions" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "department_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization"."employment_statuses" (
    "id" UUID NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "employment_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization"."grades" (
    "id" UUID NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "grades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization"."work_locations" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "city" VARCHAR(100),
    "address" TEXT,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "radius_m" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "work_locations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "employees_position_id_idx" ON "employee"."employees"("position_id");

-- CreateIndex
CREATE INDEX "employees_employment_status_id_idx" ON "employee"."employees"("employment_status_id");

-- CreateIndex
CREATE INDEX "employees_work_location_id_idx" ON "employee"."employees"("work_location_id");

-- CreateIndex
CREATE INDEX "employees_grade_id_idx" ON "employee"."employees"("grade_id");

-- CreateIndex
CREATE INDEX "employees_manager_id_idx" ON "employee"."employees"("manager_id");

-- CreateIndex
CREATE INDEX "employees_full_name_idx" ON "employee"."employees"("full_name");

-- CreateIndex
CREATE UNIQUE INDEX "employees_employee_number_key" ON "employee"."employees"("employee_number");

-- CreateIndex
CREATE UNIQUE INDEX "employees_work_email_key" ON "employee"."employees"("work_email");

-- CreateIndex
CREATE UNIQUE INDEX "employee_personal_ktp_number_key" ON "employee"."employee_personal"("ktp_number");

-- CreateIndex
CREATE INDEX "family_members_employee_id_idx" ON "employee"."family_members"("employee_id");

-- CreateIndex
CREATE INDEX "educations_employee_id_idx" ON "employee"."educations"("employee_id");

-- CreateIndex
CREATE INDEX "trainings_employee_id_idx" ON "employee"."trainings"("employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "departments_name_key" ON "organization"."departments"("name");

-- CreateIndex
CREATE INDEX "positions_department_id_idx" ON "organization"."positions"("department_id");

-- CreateIndex
CREATE UNIQUE INDEX "positions_department_id_name_key" ON "organization"."positions"("department_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "employment_statuses_name_key" ON "organization"."employment_statuses"("name");

-- CreateIndex
CREATE UNIQUE INDEX "grades_name_key" ON "organization"."grades"("name");

-- CreateIndex
CREATE UNIQUE INDEX "work_locations_name_key" ON "organization"."work_locations"("name");

-- AddForeignKey
ALTER TABLE "employee"."employees" ADD CONSTRAINT "employees_employment_status_id_fkey" FOREIGN KEY ("employment_status_id") REFERENCES "organization"."employment_statuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee"."employees" ADD CONSTRAINT "employees_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "organization"."positions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee"."employees" ADD CONSTRAINT "employees_work_location_id_fkey" FOREIGN KEY ("work_location_id") REFERENCES "organization"."work_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee"."employees" ADD CONSTRAINT "employees_grade_id_fkey" FOREIGN KEY ("grade_id") REFERENCES "organization"."grades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee"."employees" ADD CONSTRAINT "employees_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "employee"."employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee"."employee_personal" ADD CONSTRAINT "employee_personal_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"."employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee"."employee_bank_accounts" ADD CONSTRAINT "employee_bank_accounts_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"."employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee"."family_members" ADD CONSTRAINT "family_members_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"."employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee"."educations" ADD CONSTRAINT "educations_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"."employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee"."trainings" ADD CONSTRAINT "trainings_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"."employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization"."departments" ADD CONSTRAINT "departments_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "organization"."departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization"."positions" ADD CONSTRAINT "positions_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "organization"."departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
