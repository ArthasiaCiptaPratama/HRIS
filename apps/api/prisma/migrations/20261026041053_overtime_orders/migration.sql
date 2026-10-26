-- AlterTable
ALTER TABLE "attendance"."shifts" ALTER COLUMN "check_out_close_min" SET DEFAULT 30;

-- CreateTable
CREATE TABLE "attendance"."overtime_orders" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "work_date" DATE NOT NULL,
    "starts_at" TIMESTAMPTZ(6),
    "ends_at" TIMESTAMPTZ(6),
    "reason" VARCHAR(300) NOT NULL,
    "created_by_account_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "overtime_orders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "overtime_orders_company_id_work_date_idx" ON "attendance"."overtime_orders"("company_id", "work_date");

-- CreateIndex
CREATE UNIQUE INDEX "overtime_orders_employee_id_work_date_key" ON "attendance"."overtime_orders"("employee_id", "work_date");
