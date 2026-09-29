import { afterAll, describe, expect, test } from "bun:test";
import { disconnectPrisma, getPrisma } from "../../../src/core/db.ts";
import { provisionAccount } from "../../../src/modules/iam/index.ts";
import { createAuthFixture } from "../../helpers/auth.ts";

const RUN = crypto.randomUUID().slice(0, 8);
const auth = createAuthFixture(RUN);
const prisma = getPrisma();

afterAll(async () => {
  await auth.cleanup();
  await disconnectPrisma();
});

describe("provisionAccount (script akun dev)", () => {
  test("buat → ulang tanpa perubahan → ubah role; audit tercatat", async () => {
    const authUserId = crypto.randomUUID();
    const email = `auth-${RUN}-dev@example.test`;
    const first = await provisionAccount({ authUserId, email, role: "HR_ADMIN", employeeId: null });
    expect(first.outcome).toBe("created");
    expect(
      await provisionAccount({ authUserId, email, role: "HR_ADMIN", employeeId: null }),
    ).toEqual({
      outcome: "unchanged",
      accountId: first.accountId,
    });
    expect(
      (await provisionAccount({ authUserId, email, role: "MANAGER", employeeId: null })).outcome,
    ).toBe("updated");
    expect((await prisma.account.findUniqueOrThrow({ where: { id: first.accountId } })).role).toBe(
      "MANAGER",
    );
    expect(
      await prisma.auditLog.count({
        where: { entityId: first.accountId, action: "iam.account.provision_script" },
      }),
    ).toBe(2);
  });

  test("tidak mengubah akun SUPER_ADMIN", async () => {
    const sa = await auth.loginAs("SUPER_ADMIN");
    await expect(
      provisionAccount({
        authUserId: sa.account.authUserId,
        email: sa.account.email,
        role: "EMPLOYEE",
        employeeId: null,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
