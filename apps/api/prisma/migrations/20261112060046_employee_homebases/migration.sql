-- AlterTable
ALTER TABLE "employee"."employees" ADD COLUMN     "homebase_id" UUID;

-- CreateTable
CREATE TABLE "employee"."employee_homebases" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "homebase_id" UUID NOT NULL,
    "effective_from" DATE NOT NULL,
    "decree_number" VARCHAR(60),
    "note" VARCHAR(500),
    "changed_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_homebases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization"."homebases" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "city" VARCHAR(100),
    "province" VARCHAR(100),
    "note" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "homebases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "employee_homebases_employee_id_effective_from_idx" ON "employee"."employee_homebases"("employee_id", "effective_from" DESC);

-- CreateIndex
CREATE INDEX "employee_homebases_homebase_id_idx" ON "employee"."employee_homebases"("homebase_id");

-- CreateIndex
CREATE UNIQUE INDEX "employee_homebases_employee_id_effective_from_key" ON "employee"."employee_homebases"("employee_id", "effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "homebases_name_key" ON "organization"."homebases"("name");

-- CreateIndex
CREATE INDEX "employees_homebase_id_idx" ON "employee"."employees"("homebase_id");

-- AddForeignKey
ALTER TABLE "employee"."employees" ADD CONSTRAINT "employees_homebase_id_fkey" FOREIGN KEY ("homebase_id") REFERENCES "organization"."homebases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee"."employee_homebases" ADD CONSTRAINT "employee_homebases_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"."employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee"."employee_homebases" ADD CONSTRAINT "employee_homebases_homebase_id_fkey" FOREIGN KEY ("homebase_id") REFERENCES "organization"."homebases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
