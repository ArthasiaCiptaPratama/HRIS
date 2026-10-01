-- CreateEnum
CREATE TYPE "organization"."OrgUnitType" AS ENUM ('DIRECTORATE', 'DIVISION', 'DEPARTMENT', 'SECTION');

-- CreateEnum
CREATE TYPE "organization"."PositionLevel" AS ENUM ('DIRECTOR', 'GENERAL_MANAGER', 'MANAGER', 'SUPERINTENDENT', 'SUPERVISOR', 'FOREMAN', 'STAFF', 'NON_STAFF');

-- AlterTable
ALTER TABLE "organization"."departments" ADD COLUMN     "unit_type" "organization"."OrgUnitType" NOT NULL DEFAULT 'DEPARTMENT';

-- AlterTable
ALTER TABLE "organization"."positions" ADD COLUMN     "level" "organization"."PositionLevel";
