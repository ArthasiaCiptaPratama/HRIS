-- AlterTable
ALTER TABLE "employee"."employee_personal" ADD COLUMN     "domicile_city" VARCHAR(100),
ADD COLUMN     "domicile_district" VARCHAR(100),
ADD COLUMN     "domicile_province" VARCHAR(100),
ADD COLUMN     "domicile_village" VARCHAR(100),
ADD COLUMN     "emergency_contact2_address" TEXT,
ADD COLUMN     "emergency_contact2_name" VARCHAR(150),
ADD COLUMN     "emergency_contact2_phone" VARCHAR(30),
ADD COLUMN     "emergency_contact2_relationship" VARCHAR(50),
ADD COLUMN     "ktp_city" VARCHAR(100),
ADD COLUMN     "ktp_district" VARCHAR(100),
ADD COLUMN     "ktp_province" VARCHAR(100),
ADD COLUMN     "ktp_village" VARCHAR(100);

-- AlterTable
ALTER TABLE "employee"."family_members" ADD COLUMN     "relation_detail" VARCHAR(30);

-- D-061 (data): jenis dokumen SIM tanpa masa berlaku — Form tidak menanyakan tanggal kedaluwarsa SIM dan
-- masa berlaku menjadi tanggung jawab pemegang SIM (keputusan pemilik projek 2026-10-08). File SIM dari
-- Import lampiran (D-060) lalu tidak dilewati lagi. Dokumen SIM lama tetap menyimpan tanggalnya.
UPDATE "employee"."document_types"
SET "has_expiry" = false,
    "default_validity_months" = NULL,
    "reminder_days" = ARRAY[]::INTEGER[],
    "updated_at" = CURRENT_TIMESTAMP
WHERE "code" = 'SIM';
