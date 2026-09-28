import { getPrisma } from "../../core/db.ts";

// Satu-satunya tempat query Prisma ke skema notification (PROMPT §4).

export async function createNotification(data: {
  recipientAccountId: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  dedupeKey: string | null;
}) {
  return getPrisma().notification.create({ data });
}

export async function listForRecipient(
  recipientAccountId: string,
  unreadOnly: boolean,
  skip: number,
  take: number,
) {
  const prisma = getPrisma();
  const where = { recipientAccountId, ...(unreadOnly ? { readAt: null } : {}) };
  const [rows, total, unread] = await prisma.$transaction([
    prisma.notification.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { recipientAccountId, readAt: null } }),
  ]);
  return { rows, total, unread };
}

export async function markRead(recipientAccountId: string, id: string, at: Date) {
  const { count } = await getPrisma().notification.updateMany({
    where: { id, recipientAccountId },
    data: { readAt: at },
  });
  return count;
}

export async function markAllRead(recipientAccountId: string, at: Date) {
  const { count } = await getPrisma().notification.updateMany({
    where: { recipientAccountId, readAt: null },
    data: { readAt: at },
  });
  return count;
}

export async function enqueueEmail(data: {
  toEmail: string;
  subject: string;
  textBody: string;
  attempts: number;
  lastError: string;
  nextAttemptAt: Date;
}) {
  return getPrisma().emailOutbox.create({ data: { ...data, status: "PENDING" } });
}

export async function findDueEmails(now: Date, take: number) {
  return getPrisma().emailOutbox.findMany({
    where: { status: "PENDING", nextAttemptAt: { lte: now } },
    orderBy: { nextAttemptAt: "asc" },
    take,
  });
}

export async function markEmailSent(id: string, at: Date) {
  return getPrisma().emailOutbox.update({
    where: { id },
    data: { status: "SENT", sentAt: at, nextAttemptAt: null },
  });
}

export async function markEmailRetry(
  id: string,
  data: { attempts: number; lastError: string; nextAttemptAt: Date | null; failed: boolean },
) {
  return getPrisma().emailOutbox.update({
    where: { id },
    data: {
      attempts: data.attempts,
      lastError: data.lastError,
      nextAttemptAt: data.nextAttemptAt,
      status: data.failed ? "FAILED" : "PENDING",
    },
  });
}
