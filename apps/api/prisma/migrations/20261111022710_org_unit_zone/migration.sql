-- CreateEnum
CREATE TYPE "organization"."OrgZone" AS ENUM ('HEAD_OFFICE', 'SITE');

-- AlterTable
ALTER TABLE "organization"."departments" ADD COLUMN     "zone" "organization"."OrgZone";

-- ORG-D5: isi zona dari turunan nama ORG-D4 (unit bernama "Site …" = akar Site; turunannya ikut induk).
UPDATE "organization"."departments" SET "zone" = 'SITE' WHERE btrim("name") ~* '^site([^[:alnum:]_]|$)';
