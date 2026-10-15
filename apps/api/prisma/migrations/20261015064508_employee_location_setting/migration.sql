-- CreateTable
CREATE TABLE "attendance"."employee_location_settings" (
    "employee_id" UUID NOT NULL,
    "work_location_id" UUID,
    "anywhere" BOOLEAN NOT NULL DEFAULT false,
    "updated_by_account_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "employee_location_settings_pkey" PRIMARY KEY ("employee_id")
);

-- CreateIndex
CREATE INDEX "employee_location_settings_work_location_id_idx" ON "attendance"."employee_location_settings"("work_location_id");
