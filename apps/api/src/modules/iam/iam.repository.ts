import { getPrisma } from "../../core/db.ts";
import type { Prisma } from "../../generated/prisma/client.ts";

export type IamTx = Prisma.TransactionClient;

// Satu-satunya tempat query Prisma ke tabel skema iam (PROMPT §4).
function activeGrantsInclude(now: Date) {
  return {
    grants: {
      where: { revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      select: { permission: true, expiresAt: true, revokedAt: true },
      orderBy: { createdAt: "asc" },
    },
  } satisfies Prisma.AccountInclude;
}

export async function findActiveAccountByAuthUserId(authUserId: string, now: Date) {
  return getPrisma().account.findFirst({
    where: { authUserId, isActive: true },
    include: activeGrantsInclude(now),
  });
}

export async function touchLastLogin(accountId: string, at: Date) {
  return getPrisma().account.update({
    where: { id: accountId },
    data: { lastLoginAt: at },
    include: activeGrantsInclude(at),
  });
}

export async function withTransaction<T>(run: (tx: IamTx) => Promise<T>): Promise<T> {
  return getPrisma().$transaction(run);
}

export async function findPrimarySuperAdmin(tx: IamTx) {
  return tx.account.findFirst({ where: { isPrimarySuperAdmin: true } });
}

export async function findAccountByAuthUserId(tx: IamTx, authUserId: string) {
  return tx.account.findUnique({ where: { authUserId } });
}

export async function createPrimarySuperAdmin(tx: IamTx, authUserId: string, email: string) {
  return tx.account.create({
    data: { authUserId, email, role: "SUPER_ADMIN", isPrimarySuperAdmin: true, isActive: true },
  });
}

export async function promoteToPrimarySuperAdmin(tx: IamTx, accountId: string) {
  return tx.account.update({
    where: { id: accountId },
    data: { role: "SUPER_ADMIN", isPrimarySuperAdmin: true, isActive: true },
  });
}
