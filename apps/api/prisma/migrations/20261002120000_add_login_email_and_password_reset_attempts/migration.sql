-- D-048 (onboarding c2): login dengan NIK. Hanya menambah: kolom iam.accounts.login_email (unik, nullable)
-- dan tabel iam.password_reset_attempts (pembatas lupa password, hash masukan).

-- AlterTable
ALTER TABLE "iam"."accounts" ADD COLUMN     "login_email" VARCHAR(254);

-- CreateTable
CREATE TABLE "iam"."password_reset_attempts" (
    "id" UUID NOT NULL,
    "key_hash" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "password_reset_attempts_key_hash_created_at_idx" ON "iam"."password_reset_attempts"("key_hash", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_login_email_key" ON "iam"."accounts"("login_email");

