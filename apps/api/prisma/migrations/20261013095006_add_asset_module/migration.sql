-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "asset";

-- CreateEnum
CREATE TYPE "asset"."AssetCondition" AS ENUM ('GOOD', 'FAIR', 'DAMAGED');

-- CreateEnum
CREATE TYPE "asset"."AssetStatus" AS ENUM ('AVAILABLE', 'ASSIGNED', 'MAINTENANCE', 'LOST', 'RETIRED');

-- CreateEnum
CREATE TYPE "asset"."AssignmentOutcome" AS ENUM ('RETURNED', 'LOST');

-- AlterEnum
ALTER TYPE "iam"."Permission" ADD VALUE 'asset.manage';

-- CreateTable
CREATE TABLE "asset"."asset_categories" (
    "id" UUID NOT NULL,
    "code" VARCHAR(6) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "requires_serial" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "asset_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset"."assets" (
    "id" UUID NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "category_id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "brand" VARCHAR(80),
    "model" VARCHAR(80),
    "serial_number" VARCHAR(80),
    "company_id" UUID NOT NULL,
    "work_location_id" UUID,
    "condition" "asset"."AssetCondition" NOT NULL DEFAULT 'GOOD',
    "status" "asset"."AssetStatus" NOT NULL DEFAULT 'AVAILABLE',
    "purchase_date" DATE,
    "purchase_price" DECIMAL(15,2),
    "note" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset"."asset_assignments" (
    "id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "assigned_at" DATE NOT NULL,
    "due_back_at" DATE,
    "condition_out" "asset"."AssetCondition" NOT NULL,
    "closed_at" DATE,
    "outcome" "asset"."AssignmentOutcome",
    "condition_in" "asset"."AssetCondition",
    "handover_document_id" UUID,
    "return_document_id" UUID,
    "acknowledged_at" TIMESTAMPTZ(6),
    "assigned_by" UUID NOT NULL,
    "closed_by" UUID,
    "note" VARCHAR(500),
    "close_note" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "asset_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset"."ppe_types" (
    "id" UUID NOT NULL,
    "code" VARCHAR(6) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "replace_after_months" INTEGER,
    "must_return" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ppe_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset"."ppe_issues" (
    "id" UUID NOT NULL,
    "ppe_type_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "size" VARCHAR(20),
    "issued_at" DATE NOT NULL,
    "issued_by" UUID NOT NULL,
    "handover_document_id" UUID,
    "acknowledged_at" TIMESTAMPTZ(6),
    "returned_at" DATE,
    "returned_by" UUID,
    "note" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ppe_issues_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "asset_categories_code_key" ON "asset"."asset_categories"("code");

-- CreateIndex
CREATE UNIQUE INDEX "asset_categories_name_key" ON "asset"."asset_categories"("name");

-- CreateIndex
CREATE INDEX "assets_company_id_status_idx" ON "asset"."assets"("company_id", "status");

-- CreateIndex
CREATE INDEX "assets_category_id_idx" ON "asset"."assets"("category_id");

-- CreateIndex
CREATE INDEX "assets_work_location_id_idx" ON "asset"."assets"("work_location_id");

-- CreateIndex
CREATE UNIQUE INDEX "assets_code_key" ON "asset"."assets"("code");

-- CreateIndex
CREATE UNIQUE INDEX "assets_serial_number_key" ON "asset"."assets"("serial_number");

-- CreateIndex
CREATE INDEX "asset_assignments_asset_id_idx" ON "asset"."asset_assignments"("asset_id");

-- CreateIndex
CREATE INDEX "asset_assignments_employee_id_closed_at_idx" ON "asset"."asset_assignments"("employee_id", "closed_at");

-- CreateIndex
CREATE INDEX "asset_assignments_due_back_at_idx" ON "asset"."asset_assignments"("due_back_at");

-- CreateIndex
CREATE UNIQUE INDEX "ppe_types_code_key" ON "asset"."ppe_types"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ppe_types_name_key" ON "asset"."ppe_types"("name");

-- CreateIndex
CREATE INDEX "ppe_issues_employee_id_ppe_type_id_idx" ON "asset"."ppe_issues"("employee_id", "ppe_type_id");

-- CreateIndex
CREATE INDEX "ppe_issues_ppe_type_id_idx" ON "asset"."ppe_issues"("ppe_type_id");

-- CreateIndex
CREATE INDEX "ppe_issues_issued_at_idx" ON "asset"."ppe_issues"("issued_at");

-- AddForeignKey
ALTER TABLE "asset"."assets" ADD CONSTRAINT "assets_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "asset"."asset_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset"."assets" ADD CONSTRAINT "assets_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "organization"."companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset"."assets" ADD CONSTRAINT "assets_work_location_id_fkey" FOREIGN KEY ("work_location_id") REFERENCES "organization"."work_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset"."asset_assignments" ADD CONSTRAINT "asset_assignments_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "asset"."assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset"."asset_assignments" ADD CONSTRAINT "asset_assignments_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"."employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset"."ppe_issues" ADD CONSTRAINT "ppe_issues_ppe_type_id_fkey" FOREIGN KEY ("ppe_type_id") REFERENCES "asset"."ppe_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset"."ppe_issues" ADD CONSTRAINT "ppe_issues_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"."employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- SQL mentah (tidak didukung Prisma; PROMPT §6): aturan ARS-D1–D6 dijaga juga di DB.
-- Satu pemegang aktif per aset: serah-terima terbuka = closed_at NULL.
CREATE UNIQUE INDEX "asset_assignments_one_open_per_asset" ON "asset"."asset_assignments"("asset_id") WHERE "closed_at" IS NULL;

ALTER TABLE "asset"."asset_assignments"
  ADD CONSTRAINT "asset_assignments_due_after_assigned" CHECK ("due_back_at" IS NULL OR "due_back_at" >= "assigned_at"),
  ADD CONSTRAINT "asset_assignments_closed_after_assigned" CHECK ("closed_at" IS NULL OR "closed_at" >= "assigned_at"),
  -- Terbuka: belum ada hasil; tertutup: hasil wajib (dikembalikan / hilang).
  ADD CONSTRAINT "asset_assignments_closed_has_outcome" CHECK (("closed_at" IS NULL) = ("outcome" IS NULL));

ALTER TABLE "asset"."assets"
  ADD CONSTRAINT "assets_purchase_price_non_negative" CHECK ("purchase_price" IS NULL OR "purchase_price" >= 0);

ALTER TABLE "asset"."ppe_types"
  ADD CONSTRAINT "ppe_types_replace_after_months_range" CHECK ("replace_after_months" IS NULL OR "replace_after_months" BETWEEN 1 AND 120);

ALTER TABLE "asset"."ppe_issues"
  ADD CONSTRAINT "ppe_issues_quantity_range" CHECK ("quantity" BETWEEN 1 AND 100),
  ADD CONSTRAINT "ppe_issues_returned_after_issued" CHECK ("returned_at" IS NULL OR "returned_at" >= "issued_at");
