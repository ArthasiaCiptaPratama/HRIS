-- D-045 Onboarding bagian b: penanda "belum punya" NPWP/BPJS, dokumen karyawan, riwayat kerja, penanda kirim karyawan existing. Hanya menambah.
-- CreateEnum
CREATE TYPE "employee"."EmployeeDocumentType" AS ENUM ('KTP', 'KK', 'DIPLOMA', 'BANK_BOOK', 'NPWP', 'BPJS_EMPLOYMENT', 'BPJS_HEALTH', 'CERTIFICATE', 'CV', 'OTHER');

-- AlterTable
ALTER TABLE "employee"."employee_personal" ADD COLUMN     "bpjs_employment_absent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "bpjs_health_absent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "npwp_absent" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "employee"."employees" ADD COLUMN     "completion_submitted_at" TIMESTAMPTZ(6);

-- CreateTable
CREATE TABLE "employee"."employee_documents" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "type" "employee"."EmployeeDocumentType" NOT NULL,
    "storage_path" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "uploaded_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "employee_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee"."work_experiences" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "company_name" VARCHAR(150) NOT NULL,
    "position" VARCHAR(100) NOT NULL,
    "start_year" SMALLINT NOT NULL,
    "end_year" SMALLINT,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "work_experiences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "employee_documents_employee_id_type_idx" ON "employee"."employee_documents"("employee_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "employee_documents_storage_path_key" ON "employee"."employee_documents"("storage_path");

-- CreateIndex
CREATE INDEX "work_experiences_employee_id_idx" ON "employee"."work_experiences"("employee_id");

-- AddForeignKey
ALTER TABLE "employee"."employee_documents" ADD CONSTRAINT "employee_documents_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"."employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee"."work_experiences" ADD CONSTRAINT "work_experiences_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"."employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

