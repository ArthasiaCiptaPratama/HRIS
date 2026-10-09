-- AlterTable
ALTER TABLE "employee"."employees" ALTER COLUMN "employee_number" DROP NOT NULL;

-- AlterTable
ALTER TABLE "employee"."family_members" ADD COLUMN     "is_deceased" BOOLEAN NOT NULL DEFAULT false;
