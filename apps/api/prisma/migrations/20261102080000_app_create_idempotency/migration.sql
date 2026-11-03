-- AlterTable
ALTER TABLE "attendance"."attendance_corrections" ADD COLUMN     "idempotency_key" VARCHAR(64);

-- AlterTable
ALTER TABLE "attendance"."attendance_statements" ADD COLUMN     "idempotency_key" VARCHAR(64);

-- AlterTable
ALTER TABLE "leave"."leave_requests" ADD COLUMN     "idempotency_key" VARCHAR(64);

-- CreateIndex
CREATE UNIQUE INDEX "attendance_corrections_idempotency_key_key" ON "attendance"."attendance_corrections"("idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_statements_idempotency_key_key" ON "attendance"."attendance_statements"("idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "leave_requests_idempotency_key_key" ON "leave"."leave_requests"("idempotency_key");

