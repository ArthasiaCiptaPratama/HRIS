-- AlterTable
ALTER TABLE "attendance"."roster_patterns" ADD COLUMN     "template_id" UUID;

-- CreateTable
CREATE TABLE "attendance"."roster_templates" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "description" VARCHAR(300),
    "steps" VARCHAR(10)[],
    "crew_count" INTEGER NOT NULL,
    "crew_offset_days" INTEGER NOT NULL,
    "start_on_monday" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "roster_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "roster_templates_company_id_name_key" ON "attendance"."roster_templates"("company_id", "name");

-- CreateIndex
CREATE INDEX "roster_patterns_template_id_idx" ON "attendance"."roster_patterns"("template_id");

-- AddForeignKey
ALTER TABLE "attendance"."roster_patterns" ADD CONSTRAINT "roster_patterns_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "attendance"."roster_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
