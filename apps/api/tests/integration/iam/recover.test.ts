import { afterAll, describe, expect, test } from "bun:test";
import { disconnectPrisma, getPrisma } from "../../../src/core/db.ts";
import { recoverPrimarySuperAdmin } from "../../../src/modules/iam/index.ts";
import { createAuthFixture } from "../../helpers/auth.ts";

// PLAN §4.4: pemulihan status Utama oleh developer (script), tercatat di audit.
const RUN = crypto.randomUUID().slice(0, 8);
const auth = createAuthFixture(RUN);
const prisma = getPrisma();

afterAll(async () => {
  await auth.cleanup();
  await disconnectPrisma();
});

describe("recoverPrimarySuperAdmin", () => {
  test("tujuan harus SUPER_ADMIN aktif; akun tak dikenal ditolak", async () => {
    const hr = await auth.loginAs("HR_ADMIN");
    const inactiveSa = await auth.loginAs("SUPER_ADMIN", { isActive: false });
    await expect(
      recoverPrimarySuperAdmin({ targetEmail: hr.account.email, reason: "uji tolak role" }),
    ).rejects.toMatchObject({ code: "BUSINESS_RULE_VIOLATION" });
    await expect(
      recoverPrimarySuperAdmin({
        targetEmail: inactiveSa.account.email,
        reason: "uji tolak nonaktif",
      }),
    ).rejects.toMatchObject({ code: "BUSINESS_RULE_VIOLATION" });
    await expect(
      recoverPrimarySuperAdmin({
        targetEmail: `nope-${RUN}@example.test`,
        reason: "uji tidak ada",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("memindahkan status Utama dari akun lama ke SA tujuan + audit (DB tanpa Utama sungguhan)", async () => {
    if ((await prisma.account.count({ where: { isPrimarySuperAdmin: true } })) > 0) return;
    const lost = await auth.loginAs("SUPER_ADMIN", { primary: true });
    const next = await auth.loginAs("SUPER_ADMIN");
    const result = await recoverPrimarySuperAdmin({
      targetEmail: next.account.email,
      reason: "akun Utama hilang",
    });
    expect(result).toMatchObject({
      outcome: "recovered",
      accountId: next.account.id,
      previousId: lost.account.id,
    });
    expect(
      (await prisma.account.findUniqueOrThrow({ where: { id: lost.account.id } }))
        .isPrimarySuperAdmin,
    ).toBe(false);
    expect(
      (await prisma.account.findUniqueOrThrow({ where: { id: next.account.id } }))
        .isPrimarySuperAdmin,
    ).toBe(true);
    expect(
      await prisma.auditLog.count({
        where: { entityId: next.account.id, action: "iam.account.recover_primary_super_admin" },
      }),
    ).toBe(1);
    await prisma.account.update({
      where: { id: next.account.id },
      data: { isPrimarySuperAdmin: false },
    });
  });
});
