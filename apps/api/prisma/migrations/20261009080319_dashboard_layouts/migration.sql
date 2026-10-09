-- CreateTable
CREATE TABLE "iam"."dashboard_layouts" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "layout" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "dashboard_layouts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dashboard_layouts_account_id_key" ON "iam"."dashboard_layouts"("account_id");

-- AddForeignKey
ALTER TABLE "iam"."dashboard_layouts" ADD CONSTRAINT "dashboard_layouts_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "iam"."accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
