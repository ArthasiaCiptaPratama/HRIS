-- AlterTable
ALTER TABLE "iam"."accounts" ADD COLUMN     "restrict_head_office" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "organization"."work_locations" ADD COLUMN     "is_head_office" BOOLEAN NOT NULL DEFAULT false;

-- IAM-D3: penanda awal Head Office (keputusan pengguna 27 Nov: "batasi buat HO"); aman bila nama tidak ada.
UPDATE "organization"."work_locations" SET "is_head_office" = true WHERE "name" = 'Kantor Head Office';
