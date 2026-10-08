-- CreateEnum
CREATE TYPE "employee"."ImportAttachmentStatus" AS ENUM ('PENDING', 'PROCESSING', 'DONE', 'SKIPPED', 'FAILED');

-- CreateTable
CREATE TABLE "employee"."import_job_attachments" (
    "id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "source_row" INTEGER NOT NULL,
    "field" VARCHAR(50) NOT NULL,
    "target" VARCHAR(50) NOT NULL,
    "note" VARCHAR(200) NOT NULL,
    "document_number" VARCHAR(60),
    "drive_file_ids" TEXT[],
    "status" "employee"."ImportAttachmentStatus" NOT NULL DEFAULT 'PENDING',
    "reason" VARCHAR(300),
    "source_sha256" VARCHAR(64),
    "attempts" SMALLINT NOT NULL DEFAULT 0,
    "document_id" UUID,
    "claimed_at" TIMESTAMPTZ(6),
    "processed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "import_job_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "import_job_attachments_job_id_status_idx" ON "employee"."import_job_attachments"("job_id", "status");

-- CreateIndex
CREATE INDEX "import_job_attachments_employee_id_target_idx" ON "employee"."import_job_attachments"("employee_id", "target");

-- CreateIndex
CREATE INDEX "import_job_attachments_document_id_idx" ON "employee"."import_job_attachments"("document_id");

-- AddForeignKey
ALTER TABLE "employee"."import_job_attachments" ADD CONSTRAINT "import_job_attachments_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "employee"."import_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee"."import_job_attachments" ADD CONSTRAINT "import_job_attachments_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"."employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee"."import_job_attachments" ADD CONSTRAINT "import_job_attachments_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "employee"."employee_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- D-060: penjaga isi antrean (Prisma tidak mendukung CHECK; ditulis manual).
ALTER TABLE "employee"."import_job_attachments"
  ADD CONSTRAINT "import_job_attachments_drive_file_ids_check"
    CHECK (cardinality("drive_file_ids") BETWEEN 1 AND 10),
  ADD CONSTRAINT "import_job_attachments_attempts_check" CHECK ("attempts" >= 0),
  ADD CONSTRAINT "import_job_attachments_source_sha256_check"
    CHECK ("source_sha256" IS NULL OR "source_sha256" ~ '^[0-9a-f]{64}$');
