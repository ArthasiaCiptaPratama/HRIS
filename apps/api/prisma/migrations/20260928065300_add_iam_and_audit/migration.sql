-- CreateEnum
CREATE TYPE "iam"."Role" AS ENUM ('SUPER_ADMIN', 'HR_ADMIN', 'MANAGER', 'EMPLOYEE');

-- CreateEnum
CREATE TYPE "iam"."Permission" AS ENUM ('employee.personal.read', 'employee.personal.write', 'employee.bank.read', 'employee.bank.write', 'employee.documents.read', 'employee.documents.write', 'contract.manage', 'payroll.period.prepare');

-- CreateTable
CREATE TABLE "audit"."audit_logs" (
    "id" UUID NOT NULL,
    "actor_account_id" UUID,
    "action" VARCHAR(100) NOT NULL,
    "entity_type" VARCHAR(50) NOT NULL,
    "entity_id" VARCHAR(100),
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT,
    "request_id" VARCHAR(128),
    "ip" VARCHAR(45),
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "iam"."accounts" (
    "id" UUID NOT NULL,
    "auth_user_id" UUID NOT NULL,
    "employee_id" UUID,
    "email" VARCHAR(254) NOT NULL,
    "role" "iam"."Role" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_primary_super_admin" BOOLEAN NOT NULL DEFAULT false,
    "last_login_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "iam"."permission_grants" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "permission" "iam"."Permission" NOT NULL,
    "expires_at" TIMESTAMPTZ(6),
    "reason" TEXT,
    "granted_by" UUID NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "revoked_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "permission_grants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_logs_actor_account_id_idx" ON "audit"."audit_logs"("actor_account_id");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit"."audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_occurred_at_idx" ON "audit"."audit_logs"("occurred_at");

-- CreateIndex
CREATE INDEX "accounts_role_idx" ON "iam"."accounts"("role");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_auth_user_id_key" ON "iam"."accounts"("auth_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_employee_id_key" ON "iam"."accounts"("employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_email_key" ON "iam"."accounts"("email");

-- CreateIndex
CREATE INDEX "permission_grants_account_id_idx" ON "iam"."permission_grants"("account_id");

-- CreateIndex
CREATE INDEX "permission_grants_granted_by_idx" ON "iam"."permission_grants"("granted_by");

-- CreateIndex
CREATE INDEX "permission_grants_revoked_by_idx" ON "iam"."permission_grants"("revoked_by");

-- AddForeignKey
ALTER TABLE "iam"."accounts" ADD CONSTRAINT "accounts_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"."employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "iam"."permission_grants" ADD CONSTRAINT "permission_grants_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "iam"."accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "iam"."permission_grants" ADD CONSTRAINT "permission_grants_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "iam"."accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "iam"."permission_grants" ADD CONSTRAINT "permission_grants_revoked_by_fkey" FOREIGN KEY ("revoked_by") REFERENCES "iam"."accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- SQL mentah: aturan yang tidak bisa diekspresikan skema Prisma (PROMPT §6).

-- PLAN §4.4: paling banyak satu akun berstatus Super Admin Utama (index unik parsial).
-- "Tepat satu" (tidak nol) dijaga service & script bootstrap/recover.
CREATE UNIQUE INDEX "accounts_single_primary_super_admin_key"
  ON "iam"."accounts" ("is_primary_super_admin")
  WHERE "is_primary_super_admin";

-- PLAN §4.4: status Utama hanya untuk akun ber-role SUPER_ADMIN.
ALTER TABLE "iam"."accounts"
  ADD CONSTRAINT "accounts_primary_requires_super_admin_check"
  CHECK (NOT "is_primary_super_admin" OR "role" = 'SUPER_ADMIN');

-- Pencabutan grant tercatat utuh: kapan & oleh siapa diisi bersamaan.
ALTER TABLE "iam"."permission_grants"
  ADD CONSTRAINT "permission_grants_revocation_complete_check"
  CHECK (("revoked_at" IS NULL) = ("revoked_by" IS NULL));
