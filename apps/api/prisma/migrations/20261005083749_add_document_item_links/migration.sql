-- D-055 (Arsip 1b): lampiran item Arsip — sertifikat pelatihan & SK riwayat jabatan. Hanya menambah;
-- item dihapus → tautan dilepas (dokumen tetap tersimpan).

-- AlterTable
ALTER TABLE "employee"."employee_documents" ADD COLUMN     "history_id" UUID,
ADD COLUMN     "training_id" UUID;

-- CreateIndex
CREATE INDEX "employee_documents_training_id_idx" ON "employee"."employee_documents"("training_id");

-- CreateIndex
CREATE INDEX "employee_documents_history_id_idx" ON "employee"."employee_documents"("history_id");

-- AddForeignKey
ALTER TABLE "employee"."employee_documents" ADD CONSTRAINT "employee_documents_training_id_fkey" FOREIGN KEY ("training_id") REFERENCES "employee"."trainings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee"."employee_documents" ADD CONSTRAINT "employee_documents_history_id_fkey" FOREIGN KEY ("history_id") REFERENCES "employee"."employment_histories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
