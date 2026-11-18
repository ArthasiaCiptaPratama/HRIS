-- TM-D29 (STAGING) absen mandiri. Rollback: DROP TABLE "attendance"."self_report_crews";
-- lalu hapus baris migrasi ini dari public._prisma_migrations (lihat docs/features/time-management/tm-d29-absen-mandiri.md).
-- CreateTable
CREATE TABLE "attendance"."self_report_crews" (
    "crew_id" UUID NOT NULL,
    "enabled_by_account_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "self_report_crews_pkey" PRIMARY KEY ("crew_id")
);

-- AddForeignKey
ALTER TABLE "attendance"."self_report_crews" ADD CONSTRAINT "self_report_crews_crew_id_fkey" FOREIGN KEY ("crew_id") REFERENCES "attendance"."crews"("id") ON DELETE CASCADE ON UPDATE CASCADE;
