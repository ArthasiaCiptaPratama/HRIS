import type { Prisma } from "../generated/prisma/client.ts";
import { getPrisma } from "./db.ts";
import { redact } from "./logger.ts";

// PROMPT §3.14: aksi sensitif menulis audit log. Pemanggil tetap WAJIB tidak mengirim nilai sensitif
// mentah; redaksi berbasis nama field di sini hanya jaring pengaman (sama dengan logger).
export interface AuditEntry {
  /** Null bila dilakukan script/sistem. */
  actorAccountId: string | null;
  /** Format `<modul>.<entitas>.<aksi>`, mis. `iam.account.bootstrap_primary`. */
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  reason?: string | null;
  requestId?: string | null;
  ip?: string | null;
}

/** Klien Prisma biasa atau klien transaksi, supaya audit ikut batal bila transaksinya batal. */
export type AuditClient = Pick<Prisma.TransactionClient, "auditLog">;

function toJson(value: Record<string, unknown> | null | undefined) {
  if (value === undefined || value === null) return undefined;
  return JSON.parse(JSON.stringify(redact(value))) as Prisma.InputJsonObject;
}

export async function writeAudit(entry: AuditEntry, client: AuditClient = getPrisma()) {
  return client.auditLog.create({
    data: {
      actorAccountId: entry.actorAccountId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      before: toJson(entry.before),
      after: toJson(entry.after),
      reason: entry.reason ?? null,
      requestId: entry.requestId ?? null,
      ip: entry.ip ?? null,
    },
  });
}

export interface AuditLogFilter {
  action?: string;
  entityType?: string;
  entityId?: string;
  actorAccountId?: string;
  from?: Date;
  to?: Date;
}

/** Baca audit log (terbaru dulu). Akses dibatasi pemanggil: hanya SUPER_ADMIN (PLAN §4.3). */
export async function listAuditLogs(filter: AuditLogFilter, skip: number, take: number) {
  const where: Prisma.AuditLogWhereInput = {
    ...(filter.action ? { action: { startsWith: filter.action } } : {}),
    ...(filter.entityType ? { entityType: filter.entityType } : {}),
    ...(filter.entityId ? { entityId: filter.entityId } : {}),
    ...(filter.actorAccountId ? { actorAccountId: filter.actorAccountId } : {}),
    ...(filter.from || filter.to
      ? {
          occurredAt: {
            ...(filter.from ? { gte: filter.from } : {}),
            ...(filter.to ? { lte: filter.to } : {}),
          },
        }
      : {}),
  };
  const prisma = getPrisma();
  const [rows, total] = await prisma.$transaction([
    prisma.auditLog.findMany({ where, orderBy: { occurredAt: "desc" }, skip, take }),
    prisma.auditLog.count({ where }),
  ]);
  return { rows, total };
}
