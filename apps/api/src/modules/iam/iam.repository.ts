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
    // D-040: PT yang ditugaskan (tabel milik iam).
    include: { ...activeGrantsInclude(now), companies: { select: { companyId: true } } },
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

// ---------------------------------------------------------------------------
// Kelola akun, role, grant (Fase 2).

export interface AccountFilter {
  role?: Prisma.AccountWhereInput["role"];
  isActive?: boolean;
  q?: string;
  /** D-040: cakupan HR — akun tertaut karyawan di daftar ini, atau belum tertaut karyawan. */
  employeeScope?: { employeeIds: string[] };
}

function accountWhere(filter: AccountFilter): Prisma.AccountWhereInput {
  return {
    ...(filter.role ? { role: filter.role } : {}),
    ...(filter.isActive === undefined ? {} : { isActive: filter.isActive }),
    ...(filter.q ? { email: { contains: filter.q, mode: "insensitive" } } : {}),
    ...(filter.employeeScope
      ? {
          OR: [{ employeeId: null }, { employeeId: { in: filter.employeeScope.employeeIds } }],
        }
      : {}),
  };
}

export async function listAccounts(filter: AccountFilter, skip: number, take: number) {
  const where = accountWhere(filter);
  const [rows, total] = await getPrisma().$transaction([
    getPrisma().account.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
    getPrisma().account.count({ where }),
  ]);
  return { rows, total };
}

export async function findAccountById(id: string, tx: IamTx = getPrisma()) {
  return tx.account.findUnique({ where: { id } });
}

export async function findAccountByEmail(email: string, tx: IamTx = getPrisma()) {
  return tx.account.findUnique({ where: { email } });
}

export async function countActiveSuperAdmins(tx: IamTx, excludeAccountId?: string) {
  return tx.account.count({
    where: {
      role: "SUPER_ADMIN",
      isActive: true,
      ...(excludeAccountId ? { id: { not: excludeAccountId } } : {}),
    },
  });
}

export async function createAccount(
  tx: IamTx,
  data: { authUserId: string; email: string; role: Prisma.AccountCreateInput["role"] },
) {
  return tx.account.create({ data });
}

export async function updateAccountRole(
  tx: IamTx,
  id: string,
  role: Prisma.AccountUpdateInput["role"],
) {
  return tx.account.update({ where: { id }, data: { role } });
}

export async function setAccountActive(tx: IamTx, id: string, isActive: boolean) {
  return tx.account.update({ where: { id }, data: { isActive } });
}

export async function setPrimaryFlag(tx: IamTx, id: string, isPrimarySuperAdmin: boolean) {
  return tx.account.update({ where: { id }, data: { isPrimarySuperAdmin } });
}

export async function findActiveGrants(tx: IamTx, accountId: string, now: Date) {
  return tx.permissionGrant.findMany({
    where: { accountId, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
  });
}

export async function revokeGrants(tx: IamTx, ids: string[], revokedBy: string, at: Date) {
  if (ids.length === 0) return 0;
  const { count } = await tx.permissionGrant.updateMany({
    where: { id: { in: ids }, revokedAt: null },
    data: { revokedAt: at, revokedBy },
  });
  return count;
}

export interface GrantFilter {
  accountId?: string;
  permission?: Prisma.PermissionGrantWhereInput["permission"];
  /** true = belum dicabut & belum kedaluwarsa pada `now`; false = sebaliknya. */
  active?: boolean;
}

function grantWhere(filter: GrantFilter, now: Date): Prisma.PermissionGrantWhereInput {
  const activeWhere: Prisma.PermissionGrantWhereInput = {
    revokedAt: null,
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
  };
  return {
    ...(filter.accountId ? { accountId: filter.accountId } : {}),
    ...(filter.permission ? { permission: filter.permission } : {}),
    ...(filter.active === undefined ? {} : filter.active ? activeWhere : { NOT: activeWhere }),
  };
}

export async function listGrants(filter: GrantFilter, now: Date, skip: number, take: number) {
  const where = grantWhere(filter, now);
  const [rows, total] = await getPrisma().$transaction([
    getPrisma().permissionGrant.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
    getPrisma().permissionGrant.count({ where }),
  ]);
  return { rows, total };
}

export async function findGrantById(id: string, tx: IamTx = getPrisma()) {
  return tx.permissionGrant.findUnique({ where: { id } });
}

export async function createGrant(tx: IamTx, data: Prisma.PermissionGrantUncheckedCreateInput) {
  return tx.permissionGrant.create({ data });
}

export async function revokeGrant(tx: IamTx, id: string, revokedBy: string, at: Date) {
  return tx.permissionGrant.update({ where: { id }, data: { revokedAt: at, revokedBy } });
}

// ---------------------------------------------------------------------------
// Penerima notifikasi (Fase 2 Bagian B).

export async function listActiveSuperAdmins() {
  return getPrisma().account.findMany({
    where: { role: "SUPER_ADMIN", isActive: true },
    select: { id: true, email: true },
  });
}

/** Grant aktif yang kedaluwarsa dalam rentang (now, until], beserta email pemiliknya (akun aktif). */
export async function findGrantsExpiringBetween(now: Date, until: Date) {
  return getPrisma().permissionGrant.findMany({
    where: { revokedAt: null, expiresAt: { gt: now, lte: until }, account: { isActive: true } },
    select: {
      id: true,
      permission: true,
      expiresAt: true,
      account: { select: { id: true, email: true } },
    },
  });
}

export async function linkEmployee(tx: IamTx, accountId: string, employeeId: string | null) {
  return tx.account.update({ where: { id: accountId }, data: { employeeId } });
}

// Dipakai modul employee lewat index.ts (D-035): keterhubungan akun ↔ data karyawan.

export async function findAccountsByEmployeeIds(employeeIds: string[]) {
  if (employeeIds.length === 0) return [];
  return getPrisma().account.findMany({
    where: { employeeId: { in: employeeIds } },
    select: { id: true, employeeId: true, role: true, isActive: true },
  });
}

export async function findAccountsByIds(ids: string[]) {
  if (ids.length === 0) return [];
  return getPrisma().account.findMany({
    where: { id: { in: ids } },
    select: { id: true, employeeId: true, role: true, email: true },
  });
}

export async function findEmployeeIdsByRoles(roles: NonNullable<Prisma.AccountWhereInput["role"]>) {
  const rows = await getPrisma().account.findMany({
    where: { role: roles, isActive: true, employeeId: { not: null } },
    select: { employeeId: true },
  });
  return rows.map((row) => row.employeeId as string);
}

export async function findAccountByEmployeeId(tx: IamTx, employeeId: string) {
  return tx.account.findUnique({ where: { employeeId } });
}

// ── D-040: penugasan perusahaan akun HR_ADMIN ───────────────────────────────

export async function findCompanyAssignments(accountIds: string[], tx: IamTx = getPrisma()) {
  if (accountIds.length === 0) return [];
  return tx.accountCompany.findMany({
    where: { accountId: { in: accountIds } },
    select: { accountId: true, companyId: true },
    orderBy: { createdAt: "asc" },
  });
}

/** Ganti seluruh penugasan (set baru), dalam transaksi pemanggil. */
export async function replaceCompanyAssignments(
  tx: IamTx,
  accountId: string,
  companyIds: string[],
  assignedBy: string,
) {
  await tx.accountCompany.deleteMany({ where: { accountId } });
  if (companyIds.length > 0) {
    await tx.accountCompany.createMany({
      data: companyIds.map((companyId) => ({ accountId, companyId, assignedBy })),
    });
  }
}
