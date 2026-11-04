-- Backfill (migrasi terpisah: nilai enum baru tak bisa dipakai di transaksi yang menambahkannya).
-- Langkah PENDING milik pengajuan yang sudah CANCELLED → CANCELLED, waktu = waktu pembatalan.
UPDATE "approval"."approval_steps" AS s
SET "decision" = 'CANCELLED',
    "decided_at" = r."decided_at",
    "updated_at" = now()
FROM "approval"."approval_requests" AS r
WHERE s."request_id" = r."id"
  AND r."status" = 'CANCELLED'
  AND s."decision" = 'PENDING';
