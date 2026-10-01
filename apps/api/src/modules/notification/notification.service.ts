import type { Actor } from "../../core/access/index.ts";
import { createLogSender, type EmailSender } from "../../core/email.ts";
import { NotFoundError } from "../../core/errors.ts";
import { createLogger, type Logger } from "../../core/logger.ts";
import * as repository from "./notification.repository.ts";
import type { ListNotificationsQuery, NotificationDto } from "./notification.schema.ts";

// PLAN §5.6: in-app + email; email hanya pemberitahuan + link, TANPA data sensitif.

export interface NotificationConfig {
  sender: EmailSender;
  appUrl: string;
  logger: Logger;
}

let config: NotificationConfig | undefined;

/** Dipanggil sekali saat app dirakit (atau oleh test) supaya modul tahu pengirim email & URL web. */
export function configureNotification(next: NotificationConfig): void {
  config = next;
}

function currentConfig(): NotificationConfig {
  if (!config) {
    const logger = createLogger("info");
    config = { sender: createLogSender(logger), appUrl: "http://localhost:5173", logger };
  }
  return config;
}

export interface Recipient {
  accountId: string;
  email: string;
}

export interface NotifyInput {
  recipients: Recipient[];
  type: string;
  title: string;
  body?: string;
  /** Path web relatif, mis. `/akun/grant`. */
  link?: string;
  /** Kunci anti-duplikat per penerima (cron). Notifikasi yang sudah ada tidak dibuat & tidak di-email ulang. */
  dedupeKey?: string;
  email: boolean;
}

export interface NotifyResult {
  created: number;
  skippedDuplicates: number;
  emailed: number;
  queued: number;
  failed: number;
}

/** Backoff percobaan ulang email: 30 menit, lalu +1 jam tiap percobaan; menyerah setelah 5 kali. */
export const MAX_EMAIL_ATTEMPTS = 5;
function nextAttempt(now: Date, attempts: number): Date {
  return new Date(now.getTime() + (attempts <= 1 ? 30 * 60_000 : attempts * 3_600_000));
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002"
  );
}

function safeError(error: unknown): string {
  // Pesan transport SMTP tidak memuat password; tetap dipotong supaya muat kolom & log.
  return (error instanceof Error ? error.message : String(error)).slice(0, 480);
}

function emailText(input: NotifyInput, appUrl: string): string {
  const link = input.link
    ? `\n\nBuka Akselerasi Arthasia: ${appUrl.replace(/\/+$/, "")}${input.link}`
    : "";
  return `${input.title}${input.body ? `\n\n${input.body}` : ""}${link}\n\n— Akselerasi Arthasia (email otomatis, jangan dibalas)`;
}

/** Tidak pernah melempar: kegagalan notifikasi tidak boleh membatalkan aksi utama pemanggil. */
export async function notify(input: NotifyInput, now: Date = new Date()): Promise<NotifyResult> {
  const { sender, appUrl, logger } = currentConfig();
  const result: NotifyResult = {
    created: 0,
    skippedDuplicates: 0,
    emailed: 0,
    queued: 0,
    failed: 0,
  };
  const seen = new Set<string>();

  for (const recipient of input.recipients) {
    if (seen.has(recipient.accountId)) continue;
    seen.add(recipient.accountId);
    try {
      await repository.createNotification({
        recipientAccountId: recipient.accountId,
        type: input.type,
        title: input.title,
        body: input.body ?? null,
        link: input.link ?? null,
        dedupeKey: input.dedupeKey ?? null,
      });
      result.created += 1;
    } catch (error) {
      if (isUniqueViolation(error)) {
        result.skippedDuplicates += 1;
        continue;
      }
      result.failed += 1;
      logger.error("notification create failed", {
        type: input.type,
        recipientAccountId: recipient.accountId,
        error: safeError(error),
      });
      continue;
    }

    if (!input.email) continue;
    const message = {
      to: recipient.email,
      subject: `[Akselerasi Arthasia] ${input.title}`,
      text: emailText(input, appUrl),
    };
    try {
      await sender.send(message);
      result.emailed += 1;
    } catch (error) {
      try {
        await repository.enqueueEmail({
          toEmail: message.to,
          subject: message.subject,
          textBody: message.text,
          attempts: 1,
          lastError: safeError(error),
          nextAttemptAt: nextAttempt(now, 1),
        });
        result.queued += 1;
      } catch (queueError) {
        result.failed += 1;
        logger.error("email outbox enqueue failed", {
          type: input.type,
          error: safeError(queueError),
        });
      }
    }
  }
  return result;
}

/** Cron `email-retry` (CODEMAP §7): kirim ulang email tertunda yang sudah jatuh tempo. */
export async function retryEmailOutbox(now: Date = new Date(), batchSize = 50) {
  const { sender } = currentConfig();
  const due = await repository.findDueEmails(now, batchSize);
  const summary = { processed: due.length, sent: 0, rescheduled: 0, failed: 0 };
  for (const email of due) {
    try {
      await sender.send({ to: email.toEmail, subject: email.subject, text: email.textBody });
      await repository.markEmailSent(email.id, now);
      summary.sent += 1;
    } catch (error) {
      const attempts = email.attempts + 1;
      const failed = attempts >= MAX_EMAIL_ATTEMPTS;
      await repository.markEmailRetry(email.id, {
        attempts,
        lastError: safeError(error),
        nextAttemptAt: failed ? null : nextAttempt(now, attempts),
        failed,
      });
      if (failed) summary.failed += 1;
      else summary.rescheduled += 1;
    }
  }
  return summary;
}

// ---------------------------------------------------------------------------
// Notifikasi milik sendiri (PLAN §4.3 "sendiri"): akun hanya melihat/menandai notifikasinya.

function toDto(row: Awaited<ReturnType<typeof repository.createNotification>>): NotificationDto {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    link: row.link,
    readAt: row.readAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listMine(actor: Actor, query: ListNotificationsQuery) {
  const { rows, total, unread } = await repository.listForRecipient(
    actor.accountId,
    query.unreadOnly ?? false,
    (query.page - 1) * query.pageSize,
    query.pageSize,
  );
  return {
    data: rows.map(toDto),
    meta: { page: query.page, pageSize: query.pageSize, total, unreadCount: unread },
  };
}

export async function markMineRead(actor: Actor, id: string, now: Date = new Date()) {
  // Notifikasi milik akun lain dijawab 404 (keberadaannya tidak boleh diketahui, PROMPT §5).
  if ((await repository.markRead(actor.accountId, id, now)) === 0) {
    throw new NotFoundError("Notifikasi tidak ditemukan.");
  }
}

export async function markAllMineRead(actor: Actor, now: Date = new Date()) {
  return { updated: await repository.markAllRead(actor.accountId, now) };
}
