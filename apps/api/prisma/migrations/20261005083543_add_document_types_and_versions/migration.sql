-- D-055 (Arsip gelombang 1b): jenis dokumen + versi & masa berlaku dokumen karyawan. Hanya menambah;
-- kolom enum `type` lama tetap (expand → contract).

-- CreateEnum
CREATE TYPE "employee"."DocumentCategory" AS ENUM ('IDENTITY', 'EDUCATION', 'COMPETENCY', 'HEALTH', 'EMPLOYMENT', 'FINANCE', 'OTHER');

-- CreateEnum
CREATE TYPE "employee"."DocumentRequirement" AS ENUM ('NONE', 'ALL', 'SITE', 'POSITIONS');

-- CreateEnum
CREATE TYPE "employee"."DocumentStatus" AS ENUM ('PENDING_REVIEW', 'VERIFIED', 'REJECTED');

-- AlterTable
ALTER TABLE "employee"."employee_documents" ADD COLUMN     "document_number" VARCHAR(60),
ADD COLUMN     "document_type_id" UUID,
ADD COLUMN     "expires_at" DATE,
ADD COLUMN     "is_current" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "issued_at" DATE,
ADD COLUMN     "note" VARCHAR(500),
ADD COLUMN     "replaces_id" UUID,
ADD COLUMN     "status" "employee"."DocumentStatus" NOT NULL DEFAULT 'VERIFIED',
ADD COLUMN     "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "verified_at" TIMESTAMPTZ(6),
ADD COLUMN     "verified_by" UUID,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "employee"."document_types" (
    "id" UUID NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "category" "employee"."DocumentCategory" NOT NULL,
    "has_expiry" BOOLEAN NOT NULL DEFAULT false,
    "default_validity_months" INTEGER,
    "reminder_days" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "required_scope" "employee"."DocumentRequirement" NOT NULL DEFAULT 'NONE',
    "required_position_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "multiple" BOOLEAN NOT NULL DEFAULT false,
    "employee_can_upload" BOOLEAN NOT NULL DEFAULT false,
    "sensitive" BOOLEAN NOT NULL DEFAULT false,
    "max_size_mb" INTEGER NOT NULL DEFAULT 5,
    "allowed_mime_types" TEXT[] DEFAULT ARRAY['application/pdf', 'image/jpeg', 'image/png']::TEXT[],
    "legacy_type" "employee"."EmployeeDocumentType",
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "document_types_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "document_types_code_key" ON "employee"."document_types"("code");

-- CreateIndex
CREATE UNIQUE INDEX "document_types_legacy_type_key" ON "employee"."document_types"("legacy_type");

-- CreateIndex
CREATE INDEX "document_types_category_sort_order_idx" ON "employee"."document_types"("category", "sort_order");

-- CreateIndex
CREATE INDEX "employee_documents_employee_id_document_type_id_is_current_idx" ON "employee"."employee_documents"("employee_id", "document_type_id", "is_current");

-- CreateIndex
CREATE INDEX "employee_documents_document_type_id_idx" ON "employee"."employee_documents"("document_type_id");

-- CreateIndex
CREATE INDEX "employee_documents_replaces_id_idx" ON "employee"."employee_documents"("replaces_id");

-- D-055: katalog awal jenis dokumen (design/arsip-karyawan.md §4). Dikelola SUPER_ADMIN setelahnya.
INSERT INTO "employee"."document_types"
  ("id", "code", "name", "category", "has_expiry", "default_validity_months", "reminder_days",
   "required_scope", "multiple", "employee_can_upload", "sensitive", "legacy_type", "sort_order", "updated_at")
VALUES
  (gen_random_uuid(), 'KTP', 'KTP', 'IDENTITY', false, NULL, ARRAY[]::INTEGER[], 'ALL', false, true, true, 'KTP'::"employee"."EmployeeDocumentType", 1, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'KK', 'Kartu Keluarga', 'IDENTITY', false, NULL, ARRAY[]::INTEGER[], 'ALL', false, true, true, 'KK'::"employee"."EmployeeDocumentType", 2, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'NPWP', 'NPWP', 'IDENTITY', false, NULL, ARRAY[]::INTEGER[], 'NONE', false, true, true, 'NPWP'::"employee"."EmployeeDocumentType", 3, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'BPJS_TK', 'Kartu BPJS Ketenagakerjaan', 'IDENTITY', false, NULL, ARRAY[]::INTEGER[], 'NONE', false, false, true, 'BPJS_EMPLOYMENT'::"employee"."EmployeeDocumentType", 4, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'BPJS_KES', 'Kartu BPJS Kesehatan', 'IDENTITY', false, NULL, ARRAY[]::INTEGER[], 'NONE', false, false, true, 'BPJS_HEALTH'::"employee"."EmployeeDocumentType", 5, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'PHOTO_FORMAL', 'Pas foto formal', 'IDENTITY', false, NULL, ARRAY[]::INTEGER[], 'NONE', false, true, false, NULL, 6, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'SKCK', 'SKCK', 'IDENTITY', true, 6, ARRAY[60,30,7], 'NONE', false, true, true, NULL, 7, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'DIPLOMA', 'Ijazah terakhir', 'EDUCATION', false, NULL, ARRAY[]::INTEGER[], 'ALL', false, true, false, 'DIPLOMA'::"employee"."EmployeeDocumentType", 1, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'TRANSCRIPT', 'Transkrip nilai', 'EDUCATION', false, NULL, ARRAY[]::INTEGER[], 'NONE', false, true, false, NULL, 2, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'CV', 'Daftar riwayat hidup', 'EDUCATION', false, NULL, ARRAY[]::INTEGER[], 'NONE', false, true, false, 'CV'::"employee"."EmployeeDocumentType", 3, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'SIM', 'SIM A/B/C', 'COMPETENCY', true, 60, ARRAY[60,30,7], 'NONE', true, true, false, NULL, 1, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'SIMPER', 'SIMPER (izin mengemudi di area tambang)', 'COMPETENCY', true, 12, ARRAY[60,30,7], 'NONE', false, false, false, NULL, 2, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'SIO', 'Surat Izin Operator (Kemnaker)', 'COMPETENCY', true, 60, ARRAY[60,30,7], 'NONE', true, true, false, NULL, 3, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'CERT_K3', 'Sertifikat Ahli K3 Umum', 'COMPETENCY', true, 36, ARRAY[60,30,7], 'NONE', false, true, false, NULL, 4, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'CERT_POP', 'Sertifikat Pengawas Operasional Pertama (POP)', 'COMPETENCY', true, NULL, ARRAY[60,30,7], 'NONE', false, true, false, NULL, 5, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'CERT_POM', 'Sertifikat Pengawas Operasional Madya (POM)', 'COMPETENCY', true, NULL, ARRAY[60,30,7], 'NONE', false, true, false, NULL, 6, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'CERT_POU', 'Sertifikat Pengawas Operasional Utama (POU)', 'COMPETENCY', true, NULL, ARRAY[60,30,7], 'NONE', false, true, false, NULL, 7, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'CERT_OTHER', 'Sertifikat pelatihan lain', 'COMPETENCY', false, NULL, ARRAY[]::INTEGER[], 'NONE', true, true, false, 'CERTIFICATE'::"employee"."EmployeeDocumentType", 8, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'MCU', 'Hasil Medical Check-Up', 'HEALTH', true, 12, ARRAY[60,30,7], 'SITE', false, false, true, NULL, 1, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'CONTRACT', 'Perjanjian kerja (PKWT/PKWTT)', 'EMPLOYMENT', false, NULL, ARRAY[]::INTEGER[], 'ALL', true, false, true, NULL, 1, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'DECREE', 'SK (pengangkatan/mutasi/promosi)', 'EMPLOYMENT', false, NULL, ARRAY[]::INTEGER[], 'NONE', true, false, false, NULL, 2, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'WARNING_LETTER', 'Surat Peringatan', 'EMPLOYMENT', true, 6, ARRAY[60,30,7], 'NONE', true, false, true, NULL, 3, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'BAST_ASSET', 'Berita Acara Serah Terima aset', 'EMPLOYMENT', false, NULL, ARRAY[]::INTEGER[], 'NONE', true, false, false, NULL, 4, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'RESIGN_LETTER', 'Surat pengunduran diri / PHK', 'EMPLOYMENT', false, NULL, ARRAY[]::INTEGER[], 'NONE', false, false, true, NULL, 5, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'BANK_BOOK', 'Buku tabungan / bukti rekening', 'FINANCE', false, NULL, ARRAY[]::INTEGER[], 'ALL', false, true, true, 'BANK_BOOK'::"employee"."EmployeeDocumentType", 1, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'OTHER', 'Lainnya', 'OTHER', false, NULL, ARRAY[]::INTEGER[], 'NONE', true, false, false, 'OTHER'::"employee"."EmployeeDocumentType", 1, CURRENT_TIMESTAMP);

-- Backfill: dokumen lama (wizard onboarding) → jenis padanan enum lama; lalu wajib diisi.
UPDATE "employee"."employee_documents" d
SET "document_type_id" = t."id"
FROM "employee"."document_types" t
WHERE t."legacy_type" = d."type";

ALTER TABLE "employee"."employee_documents" ALTER COLUMN "document_type_id" SET NOT NULL;

-- Aturan data (D-055): kedaluwarsa ≥ terbit; versi ≥ 1; batas bucket 5 MB; masa bawaan 1–120 bulan.
ALTER TABLE "employee"."employee_documents"
  ADD CONSTRAINT "employee_documents_period_check"
    CHECK ("expires_at" IS NULL OR "issued_at" IS NULL OR "expires_at" >= "issued_at"),
  ADD CONSTRAINT "employee_documents_version_check" CHECK ("version" >= 1);
ALTER TABLE "employee"."document_types"
  ADD CONSTRAINT "document_types_max_size_check" CHECK ("max_size_mb" BETWEEN 1 AND 5),
  ADD CONSTRAINT "document_types_validity_check"
    CHECK ("default_validity_months" IS NULL OR "default_validity_months" BETWEEN 1 AND 120),
  ADD CONSTRAINT "document_types_mime_check" CHECK (cardinality("allowed_mime_types") >= 1);

-- Cron `document-expiry` & filter "akan/sudah kedaluwarsa": hanya versi aktif yang belum dihapus.
CREATE INDEX "employee_documents_current_expires_at_idx" ON "employee"."employee_documents"("expires_at")
  WHERE "is_current" AND "deleted_at" IS NULL AND "expires_at" IS NOT NULL;

-- AddForeignKey
ALTER TABLE "employee"."employee_documents" ADD CONSTRAINT "employee_documents_document_type_id_fkey" FOREIGN KEY ("document_type_id") REFERENCES "employee"."document_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee"."employee_documents" ADD CONSTRAINT "employee_documents_replaces_id_fkey" FOREIGN KEY ("replaces_id") REFERENCES "employee"."employee_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
