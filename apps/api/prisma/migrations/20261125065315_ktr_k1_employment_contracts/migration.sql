-- CreateEnum
CREATE TYPE "contract"."ContractKind" AS ENUM ('PKWT', 'PROBATION');

-- CreateEnum
CREATE TYPE "contract"."ContractStatus" AS ENUM ('ACTIVE', 'EXTENDED', 'CONVERTED', 'PASSED', 'ENDED');

-- AlterEnum
ALTER TYPE "employee"."EmployeeExitReason" ADD VALUE 'PROBATION_FAILED';

-- AlterEnum
ALTER TYPE "employee"."EmploymentChangeType" ADD VALUE 'CONTRACT_STAGE_CHANGED';

-- AlterTable
ALTER TABLE "employee"."employees" ADD COLUMN     "contract_end_date" DATE,
ADD COLUMN     "contract_stage" INTEGER,
ADD COLUMN     "pkwtt_start_date" DATE;

-- CreateTable
CREATE TABLE "contract"."contracts" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "kind" "contract"."ContractKind" NOT NULL,
    "sequence" INTEGER,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "previous_contract_id" UUID,
    "pkwt_first_start_date" DATE,
    "status" "contract"."ContractStatus" NOT NULL DEFAULT 'ACTIVE',
    "closed_at" TIMESTAMPTZ(6),
    "close_reason" VARCHAR(500),
    "note" VARCHAR(500),
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contracts_employee_id_start_date_idx" ON "contract"."contracts"("employee_id", "start_date" DESC);

-- CreateIndex
CREATE INDEX "contracts_status_end_date_idx" ON "contract"."contracts"("status", "end_date");

-- CreateIndex
CREATE INDEX "contracts_previous_contract_id_idx" ON "contract"."contracts"("previous_contract_id");

-- AddForeignKey
ALTER TABLE "contract"."contracts" ADD CONSTRAINT "contracts_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"."employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract"."contracts" ADD CONSTRAINT "contracts_previous_contract_id_fkey" FOREIGN KEY ("previous_contract_id") REFERENCES "contract"."contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- KTR-D3: Prisma cannot express a partial unique index. Historical stages remain unlimited.
CREATE UNIQUE INDEX "contracts_one_active_per_employee" ON "contract"."contracts" ("employee_id") WHERE "status" = 'ACTIVE';
-- KTR-D4/D6: guard invariants even for direct SQL writes.
ALTER TABLE "contract"."contracts"
  ADD CONSTRAINT "contracts_date_order" CHECK ("end_date" >= "start_date"),
  ADD CONSTRAINT "contracts_kind_sequence" CHECK (("kind" = 'PKWT' AND "sequence" IS NOT NULL AND "sequence" BETWEEN 1 AND 3) OR ("kind" = 'PROBATION' AND "sequence" IS NULL)),
  ADD CONSTRAINT "contracts_first_start_root" CHECK ("pkwt_first_start_date" IS NULL OR ("kind" = 'PKWT' AND "previous_contract_id" IS NULL AND "pkwt_first_start_date" <= "start_date"));

-- KTR-D2 (revisi 2026-11-25, kutipan pengguna "setuju sidebar biasa + filter"): nama bawaan dipertahankan,
-- hanya Pekerja Harian → Harian Lepas (THL); baris yang sudah bernama target tidak berubah.
-- KTR-D2: names are globally unique, including archived rows. Fail explicitly on collisions.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "organization"."employment_statuses" s
    JOIN (VALUES ('PERMANENT', 'Karyawan Tetap'), ('PROBATION', 'Karyawan Percobaan'), ('PKWT', 'PKWT'), ('DAILY_WORKER', 'Harian Lepas (THL)')) AS target(category, name)
      ON s.category::text = target.category
    JOIN "organization"."employment_statuses" other ON other.name = target.name AND other.id <> s.id
  ) THEN
    RAISE EXCEPTION 'KTR-K1: employment status target name already belongs to another row (including archived statuses)';
  END IF;
END $$;
UPDATE "organization"."employment_statuses" s SET "name" = target.name
FROM (VALUES ('PERMANENT', 'Karyawan Tetap'), ('PROBATION', 'Karyawan Percobaan'), ('PKWT', 'PKWT'), ('DAILY_WORKER', 'Harian Lepas (THL)')) AS target(category, name)
WHERE s.category::text = target.category;

-- KTR-D7: preserve the latest entry into PKWTT, not the later probation -> permanent change.
UPDATE "employee"."employees" e SET "pkwtt_start_date" = COALESCE((
  SELECT h.effective_date FROM "employee"."employment_histories" h
  JOIN "organization"."employment_statuses" dest ON dest.id = h.to_status_id
  LEFT JOIN "organization"."employment_statuses" origin ON origin.id = h.from_status_id
  WHERE h.employee_id = e.id AND h.change_type IN ('HIRED', 'STATUS_CHANGED')
    AND dest.category IN ('PERMANENT', 'PROBATION')
    AND (origin.category IS NULL OR origin.category NOT IN ('PERMANENT', 'PROBATION'))
  ORDER BY h.effective_date DESC, h.created_at DESC, h.id DESC LIMIT 1
), e.join_date)
FROM "organization"."employment_statuses" current_status
WHERE current_status.id = e.employment_status_id AND current_status.category IN ('PERMANENT', 'PROBATION');

-- KTR-D2 (revisi): salinan tahap PKWT & akhir kontrak aktif di employees untuk filter/urut daftar berhalaman
-- tanpa membaca skema contract dari modul employee; dijaga orkestrasi aksi kontrak (employee.service).
ALTER TABLE "employee"."employees"
  ADD CONSTRAINT "employees_contract_stage_range" CHECK ("contract_stage" IS NULL OR "contract_stage" BETWEEN 1 AND 3);
UPDATE "employee"."employees" e SET "contract_stage" = c."sequence", "contract_end_date" = c."end_date"
FROM "contract"."contracts" c WHERE c."employee_id" = e."id" AND c."status" = 'ACTIVE';
