import type { Role } from "@hris/shared";
import type { TokenVerifier } from "../../src/core/auth/index.ts";
import { getPrisma } from "../../src/core/db.ts";
import { UnauthenticatedError } from "../../src/core/errors.ts";
import type { Permission as DbPermission } from "../../src/generated/prisma/client.ts";

// PROMPT §10: auth di test memakai verifier pengganti, tidak memanggil Supabase Auth.
const TOKEN_PREFIX = "test-token:";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const testVerifier: TokenVerifier = {
  async verify(token) {
    const authUserId = token.startsWith(TOKEN_PREFIX) ? token.slice(TOKEN_PREFIX.length) : "";
    if (!UUID.test(authUserId)) throw new UnauthenticatedError();
    return { authUserId, email: undefined };
  },
};

export function bearer(authUserId: string): Record<string, string> {
  return { Authorization: `Bearer ${TOKEN_PREFIX}${authUserId}` };
}

export interface GrantInput {
  permission: DbPermission;
  expiresAt?: Date | null;
  revoked?: boolean;
}

export interface LoginOptions {
  grants?: GrantInput[];
  employeeId?: string | null;
  isActive?: boolean;
  primary?: boolean;
}

/** Membuat akun uji sungguhan di DB lokal; `cleanup()` menghapus semua yang dibuat fixture ini. */
export function createAuthFixture(run: string) {
  const prisma = getPrisma();
  const emailPrefix = `auth-${run}-`;
  let counter = 0;
  let granterId: string | undefined;

  async function granter(): Promise<string> {
    granterId ??= (
      await prisma.account.create({
        data: {
          authUserId: crypto.randomUUID(),
          email: `${emailPrefix}granter@example.test`,
          role: "SUPER_ADMIN",
        },
      })
    ).id;
    return granterId;
  }

  async function loginAs(role: Role, options: LoginOptions = {}) {
    counter += 1;
    const account = await prisma.account.create({
      data: {
        authUserId: crypto.randomUUID(),
        email: `${emailPrefix}${counter}@example.test`,
        role,
        employeeId: options.employeeId ?? null,
        isActive: options.isActive ?? true,
        isPrimarySuperAdmin: options.primary ?? false,
      },
    });
    for (const grant of options.grants ?? []) {
      const grantedBy = await granter();
      await prisma.permissionGrant.create({
        data: {
          accountId: account.id,
          permission: grant.permission,
          expiresAt: grant.expiresAt ?? null,
          grantedBy,
          ...(grant.revoked ? { revokedAt: new Date(), revokedBy: grantedBy } : {}),
        },
      });
    }
    return { account, headers: bearer(account.authUserId) };
  }

  async function cleanup() {
    const accounts = await prisma.account.findMany({
      where: { email: { startsWith: emailPrefix } },
      select: { id: true },
    });
    const ids = accounts.map((a) => a.id);
    await prisma.permissionGrant.deleteMany({ where: { accountId: { in: ids } } });
    await prisma.account.deleteMany({ where: { id: { in: ids } } });
  }

  return { loginAs, cleanup };
}
