-- CreateTable
CREATE TABLE "contract"."daily_wages" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "effective_from" DATE NOT NULL,
    "note" VARCHAR(300) NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "daily_wages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "daily_wages_employee_id_effective_from_idx" ON "contract"."daily_wages"("employee_id", "effective_from" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "daily_wages_employee_id_effective_from_key" ON "contract"."daily_wages"("employee_id", "effective_from");

-- AddForeignKey
ALTER TABLE "contract"."daily_wages" ADD CONSTRAINT "daily_wages_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"."employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- KTR-D13: upah harus positif meskipun ditulis di luar API.
ALTER TABLE "contract"."daily_wages" ADD CONSTRAINT "daily_wages_amount_positive" CHECK (amount > 0);
