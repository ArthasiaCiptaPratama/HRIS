-- AlterTable
ALTER TABLE "employee"."employees" ADD COLUMN     "manager_override" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "org_post_id" UUID;

-- AlterTable
ALTER TABLE "organization"."departments" ADD COLUMN     "company_id" UUID;

-- CreateTable
CREATE TABLE "organization"."org_posts" (
    "id" UUID NOT NULL,
    "code" VARCHAR(40),
    "position_id" UUID NOT NULL,
    "reports_to_id" UUID,
    "functional_reports_to_id" UUID,
    "headcount" SMALLINT NOT NULL DEFAULT 1,
    "sort_order" SMALLINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "org_posts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "org_posts_position_id_idx" ON "organization"."org_posts"("position_id");

-- CreateIndex
CREATE INDEX "org_posts_reports_to_id_idx" ON "organization"."org_posts"("reports_to_id");

-- CreateIndex
CREATE INDEX "org_posts_functional_reports_to_id_idx" ON "organization"."org_posts"("functional_reports_to_id");

-- CreateIndex
CREATE UNIQUE INDEX "org_posts_code_key" ON "organization"."org_posts"("code");

-- CreateIndex
CREATE INDEX "employees_org_post_id_idx" ON "employee"."employees"("org_post_id");

-- CreateIndex
CREATE INDEX "departments_company_id_idx" ON "organization"."departments"("company_id");

-- AddForeignKey
ALTER TABLE "employee"."employees" ADD CONSTRAINT "employees_org_post_id_fkey" FOREIGN KEY ("org_post_id") REFERENCES "organization"."org_posts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization"."departments" ADD CONSTRAINT "departments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "organization"."companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization"."org_posts" ADD CONSTRAINT "org_posts_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "organization"."positions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization"."org_posts" ADD CONSTRAINT "org_posts_reports_to_id_fkey" FOREIGN KEY ("reports_to_id") REFERENCES "organization"."org_posts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization"."org_posts" ADD CONSTRAINT "org_posts_functional_reports_to_id_fkey" FOREIGN KEY ("functional_reports_to_id") REFERENCES "organization"."org_posts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- D-051: penjaga di DB (selain validasi service): slot 1–50 & pos tidak menjadi atasan dirinya sendiri.
-- Siklus lebih panjang & aturan PT dijaga service (shared org-chart.ts).
ALTER TABLE "organization"."org_posts" ADD CONSTRAINT "org_posts_headcount_check" CHECK ("headcount" BETWEEN 1 AND 50);
ALTER TABLE "organization"."org_posts" ADD CONSTRAINT "org_posts_not_self_check" CHECK ("reports_to_id" IS DISTINCT FROM "id" AND "functional_reports_to_id" IS DISTINCT FROM "id");
