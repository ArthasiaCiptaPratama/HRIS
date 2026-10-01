-- (Dipindah dari 20260930061627 pada 2026-10-01 agar berurutan setelah migrasi rilis 20260930102336, D-043 poin 5.)
-- D-039 multi-perusahaan & D-040 cakupan PT akun HR_ADMIN.
-- Urutan expand → backfill → contract supaya berjalan di DB yang sudah berisi karyawan
-- (lokal, staging) maupun DB kosong (CI). Portabel: gen_random_uuid() bawaan PostgreSQL 13+ (D-023).

-- AlterEnum
ALTER TYPE "employee"."EmploymentChangeType" ADD VALUE 'COMPANY_CHANGED';

-- CreateTable
CREATE TABLE "organization"."companies" (
    "id" UUID NOT NULL,
    "code" VARCHAR(10) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "npwp_number" VARCHAR(20),
    "address" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "companies_code_key" ON "organization"."companies"("code");

-- CreateIndex
CREATE UNIQUE INDEX "companies_name_key" ON "organization"."companies"("name");

-- Data referensi wajib: perusahaan pertama grup (D-039). Perusahaan lain dibuat SUPER_ADMIN lewat aplikasi.
INSERT INTO "organization"."companies" ("id", "code", "name", "updated_at")
VALUES (gen_random_uuid(), 'ACP', 'PT Arthasia Cipta Pratama', CURRENT_TIMESTAMP);

-- Expand: kolom boleh kosong dulu.
ALTER TABLE "employee"."employees" ADD COLUMN "company_id" UUID;

-- Backfill: semua karyawan yang sudah ada milik ACP.
UPDATE "employee"."employees"
SET "company_id" = (SELECT "id" FROM "organization"."companies" WHERE "code" = 'ACP');

-- Contract: wajib.
ALTER TABLE "employee"."employees" ALTER COLUMN "company_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "employee"."employment_histories" ADD COLUMN     "from_company_id" UUID,
ADD COLUMN     "to_company_id" UUID;

-- CreateTable
CREATE TABLE "iam"."account_companies" (
    "account_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "assigned_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_companies_pkey" PRIMARY KEY ("account_id","company_id")
);

-- Backfill: akun HR_ADMIN yang sudah ada tetap melihat karyawan ACP (sebelumnya melihat semua).
INSERT INTO "iam"."account_companies" ("account_id", "company_id")
SELECT a."id", c."id"
FROM "iam"."accounts" a
CROSS JOIN "organization"."companies" c
WHERE a."role" = 'HR_ADMIN' AND c."code" = 'ACP';

-- CreateIndex
CREATE INDEX "account_companies_company_id_idx" ON "iam"."account_companies"("company_id");

-- CreateIndex
CREATE INDEX "employees_company_id_is_active_idx" ON "employee"."employees"("company_id", "is_active");

-- CreateIndex
CREATE INDEX "employment_histories_from_company_id_idx" ON "employee"."employment_histories"("from_company_id");

-- CreateIndex
CREATE INDEX "employment_histories_to_company_id_idx" ON "employee"."employment_histories"("to_company_id");

-- AddForeignKey
ALTER TABLE "employee"."employees" ADD CONSTRAINT "employees_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "organization"."companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee"."employment_histories" ADD CONSTRAINT "employment_histories_from_company_id_fkey" FOREIGN KEY ("from_company_id") REFERENCES "organization"."companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee"."employment_histories" ADD CONSTRAINT "employment_histories_to_company_id_fkey" FOREIGN KEY ("to_company_id") REFERENCES "organization"."companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "iam"."account_companies" ADD CONSTRAINT "account_companies_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "iam"."accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "iam"."account_companies" ADD CONSTRAINT "account_companies_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "organization"."companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- D-040/D-042: PT bawaan import (import_jobs dibuat migrasi 20260930102336 tanpa kolom ini).
ALTER TABLE "employee"."import_jobs" ADD COLUMN "company_id" UUID;

-- CreateIndex
CREATE INDEX "import_jobs_company_id_idx" ON "employee"."import_jobs"("company_id");

-- AddForeignKey
ALTER TABLE "employee"."import_jobs" ADD CONSTRAINT "import_jobs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "organization"."companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
