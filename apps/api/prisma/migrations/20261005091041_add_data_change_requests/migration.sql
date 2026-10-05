-- D-054 / OD-6 (Arsip gelombang 1c): pengajuan perubahan data diri + grant employee.changes.review.
-- Hanya menambah.

-- CreateEnum
CREATE TYPE "employee"."DataChangeSection" AS ENUM ('PERSONAL', 'EMERGENCY', 'FAMILY', 'BANK', 'DOCUMENT');

-- CreateEnum
CREATE TYPE "employee"."DataChangeStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "iam"."Permission" ADD VALUE 'employee.changes.review';

-- CreateTable
CREATE TABLE "employee"."data_change_requests" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "section" "employee"."DataChangeSection" NOT NULL,
    "status" "employee"."DataChangeStatus" NOT NULL DEFAULT 'PENDING',
    "payload" JSONB NOT NULL,
    "previous" JSONB,
    "document_id" UUID,
    "submitted_by" UUID NOT NULL,
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "review_note" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "data_change_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "data_change_requests_employee_id_status_idx" ON "employee"."data_change_requests"("employee_id", "status");

-- CreateIndex
CREATE INDEX "data_change_requests_status_created_at_idx" ON "employee"."data_change_requests"("status", "created_at");

-- CreateIndex
CREATE INDEX "data_change_requests_document_id_idx" ON "employee"."data_change_requests"("document_id");

-- AddForeignKey
ALTER TABLE "employee"."data_change_requests" ADD CONSTRAINT "data_change_requests_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"."employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee"."data_change_requests" ADD CONSTRAINT "data_change_requests_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "employee"."employee_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Satu pengajuan menunggu per karyawan per bagian (dokumen boleh beberapa sekaligus).
CREATE UNIQUE INDEX "data_change_requests_one_pending_idx" ON "employee"."data_change_requests"("employee_id", "section")
  WHERE "status" = 'PENDING' AND "section" <> 'DOCUMENT';

-- Keputusan selalu tercatat pemeriksa & waktunya; pengajuan rekening/dokumen wajib berlampiran saat dibuat.
ALTER TABLE "employee"."data_change_requests"
  ADD CONSTRAINT "data_change_requests_review_check"
    CHECK ("status" NOT IN ('APPROVED', 'REJECTED') OR ("reviewed_by" IS NOT NULL AND "reviewed_at" IS NOT NULL));
