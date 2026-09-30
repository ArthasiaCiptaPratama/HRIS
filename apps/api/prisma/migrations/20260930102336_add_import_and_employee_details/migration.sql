-- D-041: kolom data karyawan tambahan (BPJS, PTKP, kota asal, kontak darurat, jenjang pendidikan).
-- D-042: jejak import (import_jobs, import_job_issues tanpa nilai) & profil pemetaan kolom.
-- Rilis import tanpa multi-perusahaan (D-039/D-040 ditahan): import_jobs.company_id menyusul.
-- CreateEnum
CREATE TYPE "employee"."PtkpStatus" AS ENUM ('TK0', 'TK1', 'TK2', 'TK3', 'K0', 'K1', 'K2', 'K3');

-- CreateEnum
CREATE TYPE "employee"."EducationLevel" AS ENUM ('SD', 'SMP', 'SMA', 'D1', 'D2', 'D3', 'D4', 'S1', 'S2', 'S3', 'OTHER');

-- CreateEnum
CREATE TYPE "employee"."ImportMode" AS ENUM ('CREATE_ONLY', 'UPSERT');

-- CreateEnum
CREATE TYPE "employee"."ImportIssueSeverity" AS ENUM ('ERROR', 'WARNING');

-- AlterTable
ALTER TABLE "employee"."educations" ADD COLUMN     "level" "employee"."EducationLevel";

-- AlterTable
ALTER TABLE "employee"."employee_personal" ADD COLUMN     "bpjs_employment_number" VARCHAR(20),
ADD COLUMN     "bpjs_health_number" VARCHAR(20),
ADD COLUMN     "origin_city" VARCHAR(100),
ADD COLUMN     "ptkp_status" "employee"."PtkpStatus";

-- AlterTable
ALTER TABLE "employee"."employees" ADD COLUMN     "emergency_contact_name" VARCHAR(150),
ADD COLUMN     "emergency_contact_relationship" VARCHAR(50);

-- CreateTable
CREATE TABLE "employee"."import_jobs" (
    "id" UUID NOT NULL,
    "actor_account_id" UUID NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "file_sha256" VARCHAR(64) NOT NULL,
    "mode" "employee"."ImportMode" NOT NULL,
    "total_rows" INTEGER NOT NULL,
    "created_count" INTEGER NOT NULL,
    "updated_count" INTEGER NOT NULL,
    "skipped_count" INTEGER NOT NULL,
    "error_count" INTEGER NOT NULL,
    "skipped_fields" TEXT[],
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee"."import_job_issues" (
    "id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "source_row" INTEGER NOT NULL,
    "source_column" VARCHAR(10),
    "field" VARCHAR(50),
    "code" VARCHAR(50) NOT NULL,
    "severity" "employee"."ImportIssueSeverity" NOT NULL,

    CONSTRAINT "import_job_issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee"."import_mappings" (
    "id" UUID NOT NULL,
    "signature" VARCHAR(64) NOT NULL,
    "mapping" JSONB NOT NULL,
    "updated_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "import_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "import_jobs_actor_account_id_idx" ON "employee"."import_jobs"("actor_account_id");

-- CreateIndex
CREATE INDEX "import_jobs_created_at_idx" ON "employee"."import_jobs"("created_at");

-- CreateIndex
CREATE INDEX "import_job_issues_job_id_idx" ON "employee"."import_job_issues"("job_id");

-- CreateIndex
CREATE UNIQUE INDEX "import_mappings_signature_key" ON "employee"."import_mappings"("signature");

-- AddForeignKey
ALTER TABLE "employee"."import_job_issues" ADD CONSTRAINT "import_job_issues_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "employee"."import_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
