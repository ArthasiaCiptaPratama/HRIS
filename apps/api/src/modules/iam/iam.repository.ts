import { getPrisma } from "../../core/db.ts";
import type { Permission as DbPermission, Prisma } from "../../generated/prisma/client.ts";

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

// ── D-065: susunan widget dashboard per akun ──
export async function findDashboardLayout(accountId: string) {
  return getPrisma().dashboardLayout.findUnique({
    where: { accountId },
    select: { layout: true, updatedAt: true },
  });
}

export async function upsertDashboardLayout(accountId: string, layout: Prisma.InputJsonValue) {
  return getPrisma().dashboardLayout.upsert({
    where: { accountId },
    create: { accountId, layout },
    update: { layout },
    select: { layout: true, updatedAt: true },
  });
}

export async function deleteDashboardLayout(accountId: string) {
  await getPrisma().dashboardLayout.deleteMany({ where: { accountId } });
}

export async function touchLastLogin(accountId: string, at: Date) {
  return getPrisma().account.update({
    where: { id: accountId },
    data: { lastLoginAt: at },
    include: {
      ...activeGrantsInclude(at),
      employee: { select: { fullName: true, companyId: true } },
    },
  });
}

/** Klien baca tanpa transaksi (pratinjau batch grant memakai fungsi yang sama dengan penulisan). */
export function readClient(): IamTx {
  return getPrisma() as unknown as IamTx;
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
  /** ONB-D2: akun Karyawan/Manager tanpa data karyawan tertaut. */
  unlinked?: boolean | undefined;
}

function accountWhere(filter: AccountFilter): Prisma.AccountWhereInput {
  return {
    ...(filter.role ? { role: filter.role } : {}),
    ...(filter.isActive === undefined ? {} : { isActive: filter.isActive }),
    ...(filter.q ? { email: { contains: filter.q, mode: "insensitive" } } : {}),
    ...(filter.unlinked === true
      ? { employeeId: null, AND: [{ role: { in: ["EMPLOYEE" as const, "MANAGER" as const] } }] }
      : {}),
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

/** Batch grant: akun penerima (dikunci dalam transaksi yang sama). */
export async function findAccountsForGrant(tx: IamTx, ids: string[]) {
  return tx.account.findMany({ where: { id: { in: ids } } });
}

/** Batch grant: grant aktif milik banyak akun sekaligus. */
export async function findActiveGrantsOf(tx: IamTx, accountIds: string[], now: Date) {
  return tx.permissionGrant.findMany({
    where: {
      accountId: { in: accountIds },
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
  });
}

export async function findGrantsByIds(tx: IamTx, ids: string[]) {
  return tx.permissionGrant.findMany({ where: { id: { in: ids } } });
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
  accountIds?: string[];
  permissions?: DbPermission[];
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
    ...(filter.accountIds?.length ? { accountId: { in: filter.accountIds } } : {}),
    ...(filter.permission ? { permission: filter.permission } : {}),
    ...(filter.permissions?.length ? { permission: { in: filter.permissions } } : {}),
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

/** DEV: akun aktif dengan domain email uji (switcher akun uji). */
export async function listActiveAccountsByEmailSuffix(suffix: string) {
  return getPrisma().account.findMany({
    where: { isActive: true, email: { endsWith: suffix } },
    orderBy: [{ role: "asc" }, { email: "asc" }],
    select: { email: true, role: true, employeeId: true },
  });
}

/** Akun aktif yang bisa memutuskan approval Time Management (ringkasan antrean harian). */
/** Calon pemutus antrean: SA/HR/MANAGER + (ORG-D9) akun role apa pun yang punya bawahan langsung aktif. */
export async function listApproverAccounts() {
  return getPrisma().account.findMany({
    where: {
      isActive: true,
      OR: [
        { role: { in: ["SUPER_ADMIN", "HR_ADMIN", "MANAGER"] } },
        {
          employee: {
            subordinates: { some: { isActive: true, onboardingStatus: "APPROVED" } },
          },
        },
      ],
    },
    select: { id: true, email: true, authUserId: true, role: true },
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

/** ORG-D9: karyawan (dari daftar) yang punya akun aktif tertaut, role apa pun. */
export async function findEmployeeIdsWithActiveAccount(employeeIds: string[]) {
  if (employeeIds.length === 0) return [];
  const rows = await getPrisma().account.findMany({
    where: { isActive: true, employeeId: { in: employeeIds } },
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

// ── D-045: undangan akun dari onboarding ────────────────────────────────────

export async function findAccountEmails(emails: string[]) {
  if (emails.length === 0) return [];
  return getPrisma().account.findMany({
    where: { email: { in: emails } },
    select: { email: true, employeeId: true },
  });
}

export async function createEmployeeAccount(
  tx: IamTx,
  data: { authUserId: string; email: string; employeeId: string },
) {
  return tx.account.create({
    data: { ...data, role: "EMPLOYEE" },
    select: { id: true },
  });
}

export async function findAccountsForEmployees(employeeIds: string[]) {
  if (employeeIds.length === 0) return [];
  return getPrisma().account.findMany({
    where: { employeeId: { in: employeeIds } },
    select: {
      id: true,
      employeeId: true,
      email: true,
      loginEmail: true,
      lastLoginAt: true,
      isActive: true,
    },
  });
}

/**
 * ONB-D1: apakah user Auth akun ini DIBUAT oleh undangan onboarding (bukan user Auth yang sudah ada &
 * dipakai bersama lingkungan lain, D-023). Sumbernya audit `iam.account.invite` (`emailSent`).
 */
export async function authUserCreatedByInvite(tx: IamTx, accountId: string): Promise<boolean> {
  const row = await tx.auditLog.findFirst({
    where: { entityType: "iam.account", entityId: accountId, action: "iam.account.invite" },
    orderBy: { occurredAt: "desc" },
    select: { after: true },
  });
  // Undangan onboarding mencatat `emailSent`; Akun › Undang akun (ONB-D2) `invitationEmailSent`.
  const after = row?.after as
    | { emailSent?: unknown; invitationEmailSent?: unknown }
    | null
    | undefined;
  return after?.emailSent === true || after?.invitationEmailSent === true;
}

/** D-047: penerima notifikasi review onboarding — HR_ADMIN aktif ber-grant aktif di PT itu. */
export async function findOnboardingReviewerHrs(companyId: string, now: Date) {
  return getPrisma().account.findMany({
    where: {
      role: "HR_ADMIN",
      isActive: true,
      companies: { some: { companyId } },
      grants: {
        some: {
          permission: "EMPLOYEE_ONBOARDING_REVIEW",
          revokedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
      },
    },
    select: { id: true, email: true },
  });
}

/** D-055: HR aktif yang ditugaskan di PT (opsional: hanya pemegang grant aktif tertentu). */
export async function findCompanyHrs(
  companyId: string,
  permission: Prisma.EnumPermissionFilter["equals"] | null,
  now: Date,
) {
  return getPrisma().account.findMany({
    where: {
      role: "HR_ADMIN",
      isActive: true,
      companies: { some: { companyId } },
      ...(permission
        ? {
            grants: {
              some: {
                permission,
                revokedAt: null,
                OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
              },
            },
          }
        : {}),
    },
    select: { id: true, email: true },
  });
}

/** D-054 / OD-6: HR aktif di PT yang memegang SEMUA grant aktif yang diminta. */
export async function findCompanyHrsWithAll(
  companyId: string,
  permissions: NonNullable<Prisma.EnumPermissionFilter["equals"]>[],
  now: Date,
) {
  return getPrisma().account.findMany({
    where: {
      role: "HR_ADMIN",
      isActive: true,
      companies: { some: { companyId } },
      AND: permissions.map((permission) => ({
        grants: {
          some: {
            permission,
            revokedAt: null,
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          },
        },
      })),
    },
    select: { id: true, email: true },
  });
}

// ── D-048: login NIK & lupa password ────────────────────────────────────────

/** Akun lain yang sudah memakai alamat ini sebagai email kontak atau email login. */
export async function findAccountUsingAddress(tx: IamTx, address: string, excludeId: string) {
  return tx.account.findFirst({
    where: { id: { not: excludeId }, OR: [{ email: address }, { loginEmail: address }] },
    select: { id: true },
  });
}

export async function setLoginEmail(tx: IamTx, accountId: string, loginEmail: string | null) {
  return tx.account.update({ where: { id: accountId }, data: { loginEmail } });
}

export async function findAccountForReset(where: { email: string } | { employeeId: string }) {
  return getPrisma().account.findFirst({
    where,
    select: {
      id: true,
      email: true,
      loginEmail: true,
      role: true,
      employeeId: true,
      isActive: true,
    },
  });
}

/** Catat percobaan lalu kembalikan jumlah percobaan sebelumnya dalam jendela waktu (satu transaksi). */
export async function recordResetAttempt(keyHash: string, since: Date, purgeBefore: Date) {
  return getPrisma().$transaction(async (tx) => {
    await tx.passwordResetAttempt.deleteMany({ where: { createdAt: { lt: purgeBefore } } });
    const previous = await tx.passwordResetAttempt.count({
      where: { keyHash, createdAt: { gte: since } },
    });
    await tx.passwordResetAttempt.create({ data: { keyHash } });
    return previous;
  });
}

/** D-045 d: hapus permanen akun (grant & penugasan PT ikut). */
export async function deleteAccount(tx: IamTx, accountId: string) {
  await tx.permissionGrant.deleteMany({ where: { accountId } });
  await tx.accountCompany.deleteMany({ where: { accountId } });
  await tx.account.delete({ where: { id: accountId } });
}
