-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "discipline";

-- CreateEnum
CREATE TYPE "discipline"."WarningLevel" AS ENUM ('SP1', 'SP2', 'SP3');

-- CreateEnum
CREATE TYPE "discipline"."WarningLetterStatus" AS ENUM ('DRAFT', 'ISSUED', 'EXPIRED', 'REVOKED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "iam"."Permission" ADD VALUE 'employee.discipline.read';
ALTER TYPE "iam"."Permission" ADD VALUE 'employee.discipline.write';

-- CreateTable
CREATE TABLE "discipline"."violation_types" (
    "id" UUID NOT NULL,
    "code" VARCHAR(10) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "links_attendance" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "violation_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discipline"."warning_letters" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "level" "discipline"."WarningLevel" NOT NULL,
    "violation_type_id" UUID NOT NULL,
    "incident_date" DATE,
    "description" VARCHAR(4000) NOT NULL,
    "status" "discipline"."WarningLetterStatus" NOT NULL DEFAULT 'DRAFT',
    "suggested_level" "discipline"."WarningLevel",
    "escalation_reason" VARCHAR(500),
    "number" VARCHAR(60),
    "number_year" INTEGER,
    "number_seq" INTEGER,
    "issued_at" DATE,
    "effective_until" DATE,
    "manager_employee_id" UUID,
    "delivered_at" TIMESTAMPTZ(6),
    "delivered_by" UUID,
    "acknowledged_at" TIMESTAMPTZ(6),
    "scan_document_id" UUID,
    "revoked_at" TIMESTAMPTZ(6),
    "revoked_by" UUID,
    "revoke_reason" VARCHAR(500),
    "created_by" UUID NOT NULL,
    "issued_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "warning_letters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discipline"."warning_letter_alpha_days" (
    "id" UUID NOT NULL,
    "letter_id" UUID NOT NULL,
    "attendance_day_id" UUID NOT NULL,
    "work_date" DATE NOT NULL,

    CONSTRAINT "warning_letter_alpha_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discipline"."discipline_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "validity_months" INTEGER NOT NULL DEFAULT 6,
    "updated_by_account_id" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "discipline_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "violation_types_code_key" ON "discipline"."violation_types"("code");

-- CreateIndex
CREATE UNIQUE INDEX "violation_types_name_key" ON "discipline"."violation_types"("name");

-- CreateIndex
CREATE INDEX "warning_letters_employee_id_status_idx" ON "discipline"."warning_letters"("employee_id", "status");

-- CreateIndex
CREATE INDEX "warning_letters_company_id_status_idx" ON "discipline"."warning_letters"("company_id", "status");

-- CreateIndex
CREATE INDEX "warning_letters_status_effective_until_idx" ON "discipline"."warning_letters"("status", "effective_until");

-- CreateIndex
CREATE INDEX "warning_letters_manager_employee_id_idx" ON "discipline"."warning_letters"("manager_employee_id");

-- CreateIndex
CREATE INDEX "warning_letters_violation_type_id_idx" ON "discipline"."warning_letters"("violation_type_id");

-- CreateIndex
CREATE UNIQUE INDEX "warning_letters_number_key" ON "discipline"."warning_letters"("number");

-- CreateIndex
CREATE UNIQUE INDEX "warning_letters_company_id_number_year_number_seq_key" ON "discipline"."warning_letters"("company_id", "number_year", "number_seq");

-- CreateIndex
CREATE UNIQUE INDEX "warning_letter_alpha_days_letter_id_attendance_day_id_key" ON "discipline"."warning_letter_alpha_days"("letter_id", "attendance_day_id");

-- AddForeignKey
ALTER TABLE "discipline"."warning_letters" ADD CONSTRAINT "warning_letters_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"."employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discipline"."warning_letters" ADD CONSTRAINT "warning_letters_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "organization"."companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discipline"."warning_letters" ADD CONSTRAINT "warning_letters_violation_type_id_fkey" FOREIGN KEY ("violation_type_id") REFERENCES "discipline"."violation_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discipline"."warning_letter_alpha_days" ADD CONSTRAINT "warning_letter_alpha_days_letter_id_fkey" FOREIGN KEY ("letter_id") REFERENCES "discipline"."warning_letters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- SQL mentah (tidak didukung Prisma; PROMPT §6): aturan ARS-D7–D13 dijaga juga di DB.
ALTER TABLE "discipline"."warning_letters"
  -- Terbit/kedaluwarsa/dicabut dari terbit: nomor, tanggal terbit & berlaku s/d wajib; draft belum bernomor.
  ADD CONSTRAINT "warning_letters_issued_fields" CHECK (
    ("status" = 'DRAFT' AND "number" IS NULL AND "issued_at" IS NULL AND "effective_until" IS NULL)
    OR ("status" <> 'DRAFT' AND "number" IS NOT NULL AND "issued_at" IS NOT NULL AND "effective_until" IS NOT NULL)
  ),
  ADD CONSTRAINT "warning_letters_effective_after_issued" CHECK ("effective_until" IS NULL OR "effective_until" > "issued_at"),
  -- Dicabut: waktu & alasan wajib.
  ADD CONSTRAINT "warning_letters_revoked_fields" CHECK (
    ("status" = 'REVOKED') = ("revoked_at" IS NOT NULL AND "revoke_reason" IS NOT NULL)
  ),
  -- Nomor otomatis: tahun & urut berpasangan.
  ADD CONSTRAINT "warning_letters_number_seq_pair" CHECK (("number_year" IS NULL) = ("number_seq" IS NULL));

-- Pengaturan satu baris (ARS-D8): masa berlaku 1–24 bulan, bawaan 6 (PP 35/2021).
ALTER TABLE "discipline"."discipline_settings"
  ADD CONSTRAINT "discipline_settings_singleton" CHECK ("id" = 1),
  ADD CONSTRAINT "discipline_settings_validity_range" CHECK ("validity_months" BETWEEN 1 AND 24);
INSERT INTO "discipline"."discipline_settings" ("id", "validity_months", "updated_at")
VALUES (1, 6, CURRENT_TIMESTAMP);

-- Master jenis pelanggaran awal (ARS-D12); dapat diubah SA / HR ber-grant employee.discipline.write.
INSERT INTO "discipline"."violation_types" ("id", "code", "name", "links_attendance", "updated_at") VALUES
  (gen_random_uuid(), 'MANGKIR', 'Mangkir (tidak hadir tanpa keterangan)', true, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'TELAT', 'Terlambat berulang', false, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'K3', 'Pelanggaran K3 / APD', false, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'DISIPLIN', 'Indisipliner / pelanggaran tata tertib', false, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'LAIN', 'Lainnya', false, CURRENT_TIMESTAMP);
