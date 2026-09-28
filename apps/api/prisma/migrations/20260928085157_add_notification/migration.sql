-- CreateEnum
CREATE TYPE "notification"."EmailOutboxStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "notification"."notifications" (
    "id" UUID NOT NULL,
    "recipient_account_id" UUID NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "body" TEXT,
    "link" VARCHAR(500),
    "dedupe_key" VARCHAR(200),
    "read_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification"."email_outbox" (
    "id" UUID NOT NULL,
    "to_email" VARCHAR(254) NOT NULL,
    "subject" VARCHAR(200) NOT NULL,
    "text_body" TEXT NOT NULL,
    "status" "notification"."EmailOutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" VARCHAR(500),
    "next_attempt_at" TIMESTAMPTZ(6),
    "sent_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "email_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notifications_recipient_account_id_read_at_idx" ON "notification"."notifications"("recipient_account_id", "read_at");

-- CreateIndex
CREATE INDEX "notifications_created_at_idx" ON "notification"."notifications"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_recipient_account_id_dedupe_key_key" ON "notification"."notifications"("recipient_account_id", "dedupe_key");

-- CreateIndex
CREATE INDEX "email_outbox_status_next_attempt_at_idx" ON "notification"."email_outbox"("status", "next_attempt_at");
