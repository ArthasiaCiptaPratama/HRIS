-- CreateEnum
CREATE TYPE "notification"."PushPlatform" AS ENUM ('ANDROID');

-- AlterTable
ALTER TABLE "notification"."notifications" ADD COLUMN     "target_id" VARCHAR(64),
ADD COLUMN     "target_type" VARCHAR(50);

-- CreateTable
CREATE TABLE "notification"."push_devices" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "token" VARCHAR(512) NOT NULL,
    "platform" "notification"."PushPlatform" NOT NULL,
    "app_version" VARCHAR(40),
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "push_devices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "push_devices_token_key" ON "notification"."push_devices"("token");

-- CreateIndex
CREATE INDEX "push_devices_account_id_idx" ON "notification"."push_devices"("account_id");
