-- ORG-D3: jabatan rangkap (hanya menambah tabel; aman untuk staging).
-- CreateTable
CREATE TABLE "employee"."employee_secondary_posts" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "org_post_id" UUID NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_secondary_posts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "employee_secondary_posts_org_post_id_idx" ON "employee"."employee_secondary_posts"("org_post_id");

-- CreateIndex
CREATE UNIQUE INDEX "employee_secondary_posts_employee_id_org_post_id_key" ON "employee"."employee_secondary_posts"("employee_id", "org_post_id");

-- AddForeignKey
ALTER TABLE "employee"."employee_secondary_posts" ADD CONSTRAINT "employee_secondary_posts_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"."employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee"."employee_secondary_posts" ADD CONSTRAINT "employee_secondary_posts_org_post_id_fkey" FOREIGN KEY ("org_post_id") REFERENCES "organization"."org_posts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
