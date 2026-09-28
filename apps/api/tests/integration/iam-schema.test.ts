import { afterAll, describe, expect, test } from "bun:test";
import { PERMISSIONS } from "@hris/shared";
import { disconnectPrisma, getPrisma } from "../../src/core/db.ts";

// Constraint skema iam & audit (PLAN §4.2, §4.4) di PostgreSQL lokal. Data dibersihkan sendiri.
const prisma = getPrisma();
const RUN = crypto.randomUUID().slice(0, 8);
const attempt = <T>(run: () => PromiseLike<T>) => (async () => run())();

function newAccount(
  suffix: string,
  data: { role?: "SUPER_ADMIN" | "HR_ADMIN"; primary?: boolean } = {},
) {
  return prisma.account.create({
    data: {
      authUserId: crypto.randomUUID(),
      email: `iam-${RUN}-${suffix}@example.test`,
      role: data.role ?? "SUPER_ADMIN",
      isPrimarySuperAdmin: data.primary ?? false,
    },
  });
}

afterAll(async () => {
  const accounts = await prisma.account.findMany({
    where: { email: { startsWith: `iam-${RUN}-` } },
    select: { id: true },
  });
  const ids = accounts.map((a) => a.id);
  await prisma.permissionGrant.deleteMany({ where: { accountId: { in: ids } } });
  await prisma.account.deleteMany({ where: { id: { in: ids } } });
  await prisma.auditLog.deleteMany({ where: { entityId: `iam-${RUN}` } });
  await disconnectPrisma();
});

describe("skema iam", () => {
  test("enum Permission di DB = daftar PLAN §4.2 di @hris/shared", async () => {
    const rows = await prisma.$queryRaw<{ label: string }[]>`
      SELECT e.enumlabel AS label FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'iam' AND t.typname = 'Permission' ORDER BY e.enumsortorder`;
    expect(rows.map((r) => r.label)).toEqual([...PERMISSIONS]);
  });

  test("hanya satu Super Admin Utama (index unik parsial)", async () => {
    // Bila DB lokal sudah punya Utama (bootstrap), cukup pastikan akun kedua ditolak.
    const existing = await prisma.account.count({ where: { isPrimarySuperAdmin: true } });
    if (existing === 0) await newAccount("primary-1", { primary: true });
    await expect(attempt(() => newAccount("primary-2", { primary: true }))).rejects.toMatchObject({
      code: "P2002",
    });
  });

  test("status Utama hanya untuk role SUPER_ADMIN (CHECK)", async () => {
    await expect(
      attempt(
        () =>
          prisma.$executeRaw`
          INSERT INTO iam.accounts (id, auth_user_id, email, role, is_primary_super_admin, updated_at)
          VALUES (gen_random_uuid(), gen_random_uuid(), ${`iam-${RUN}-hrprimary@example.test`},
                  'HR_ADMIN', true, now())`,
      ),
    ).rejects.toThrow(/accounts_primary_requires_super_admin_check/);
  });

  test("email & auth_user_id unik", async () => {
    const account = await newAccount("uniq");
    await expect(
      attempt(() =>
        prisma.account.create({
          data: {
            authUserId: account.authUserId,
            email: `iam-${RUN}-other@example.test`,
            role: "EMPLOYEE",
          },
        }),
      ),
    ).rejects.toMatchObject({ code: "P2002" });
    await expect(
      attempt(() =>
        prisma.account.create({
          data: { authUserId: crypto.randomUUID(), email: account.email, role: "EMPLOYEE" },
        }),
      ),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  test("pencabutan grant harus mengisi revoked_at & revoked_by bersamaan (CHECK)", async () => {
    const admin = await newAccount("granter");
    const hr = await newAccount("hr", { role: "HR_ADMIN" });
    const grant = await prisma.permissionGrant.create({
      data: { accountId: hr.id, permission: "EMPLOYEE_PERSONAL_READ", grantedBy: admin.id },
    });
    await expect(
      attempt(() =>
        prisma.permissionGrant.update({ where: { id: grant.id }, data: { revokedAt: new Date() } }),
      ),
    ).rejects.toThrow(/permission_grants_revocation_complete_check/);
    const revoked = await prisma.permissionGrant.update({
      where: { id: grant.id },
      data: { revokedAt: new Date(), revokedBy: admin.id },
    });
    expect(revoked.revokedBy).toBe(admin.id);
  });
});

describe("skema audit", () => {
  test("audit log append-only dengan aktor opsional", async () => {
    const log = await prisma.auditLog.create({
      data: {
        action: "test.schema",
        entityType: "test",
        entityId: `iam-${RUN}`,
        after: { ok: true },
      },
    });
    expect(log.actorAccountId).toBeNull();
    expect(log.occurredAt).toBeInstanceOf(Date);
  });
});
