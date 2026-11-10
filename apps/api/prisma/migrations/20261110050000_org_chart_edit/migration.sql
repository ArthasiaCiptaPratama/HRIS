-- ORG-D2: izin mode edit bagan + revisi bagan (konkurensi optimistis, 409).
-- AlterEnum
ALTER TYPE "iam"."Permission" ADD VALUE 'org.structure.manage';

-- CreateTable
CREATE TABLE "organization"."org_chart_state" (
    "id" SMALLINT NOT NULL DEFAULT 1,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "org_chart_state_pkey" PRIMARY KEY ("id")
);

-- Singleton revision serializes all org-chart writers.
INSERT INTO "organization"."org_chart_state" ("id") VALUES (1);
ALTER TABLE "organization"."org_chart_state" ADD CONSTRAINT "org_chart_state_singleton" CHECK ("id" = 1);
