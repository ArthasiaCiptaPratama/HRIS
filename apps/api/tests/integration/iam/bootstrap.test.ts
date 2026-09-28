import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { disconnectPrisma, getPrisma } from "../../../src/core/db.ts";
import { bootstrapPrimarySuperAdmin } from "../../../src/modules/iam/index.ts";

// PLAN §4.4: bootstrap akun Utama idempoten & menolak Utama kedua.
const prisma = getPrisma();
const RUN = crypto.randomUUID().slice(0, 8);
const email = (s: string) => `boot-${RUN}-${s}@example.test`;
let skip = false;

beforeAll(async () => {
  // Jangan mengganggu Utama sungguhan di DB lokal developer (hasil bootstrap manual).
  skip = (await prisma.account.count({ where: { isPrimarySuperAdmin: true } })) > 0;
});

afterAll(async () => {
  const ids = (
    await prisma.account.findMany({ where: { email: { startsWith: `boot-${RUN}-` } } })
  ).map((a) => a.id);
  await prisma.auditLog.deleteMany({ where: { entityId: { in: ids } } });
  await prisma.account.deleteMany({ where: { id: { in: ids } } });
  await disconnectPrisma();
});

describe("bootstrapPrimarySuperAdmin", () => {
  test("buat → ulang tanpa perubahan → Utama lain ditolak", async () => {
    if (skip) return;
    const authUserId = crypto.randomUUID();
    const first = await bootstrapPrimarySuperAdmin({
      authUserId,
      email: email("utama").toUpperCase(),
    });
    expect(first.outcome).toBe("created");
    const stored = await prisma.account.findUniqueOrThrow({ where: { id: first.accountId } });
    expect(stored).toMatchObject({
      role: "SUPER_ADMIN",
      isPrimarySuperAdmin: true,
      email: email("utama"),
    });
    expect(
      await prisma.auditLog.count({
        where: { entityId: first.accountId, action: "iam.account.bootstrap_primary_super_admin" },
      }),
    ).toBe(1);

    expect(await bootstrapPrimarySuperAdmin({ authUserId, email: email("utama") })).toEqual({
      outcome: "unchanged",
      accountId: first.accountId,
    });

    await expect(
      bootstrapPrimarySuperAdmin({ authUserId: crypto.randomUUID(), email: email("lain") }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    await prisma.account.update({
      where: { id: first.accountId },
      data: { isPrimarySuperAdmin: false },
    });
  });

  test("akun yang sudah ada dipromosikan menjadi Utama", async () => {
    if (skip) return;
    const existing = await prisma.account.create({
      data: { authUserId: crypto.randomUUID(), email: email("hr"), role: "HR_ADMIN" },
    });
    const result = await bootstrapPrimarySuperAdmin({
      authUserId: existing.authUserId,
      email: existing.email,
    });
    expect(result).toEqual({ outcome: "promoted", accountId: existing.id });
    expect(await prisma.account.findUniqueOrThrow({ where: { id: existing.id } })).toMatchObject({
      role: "SUPER_ADMIN",
      isPrimarySuperAdmin: true,
    });
    await prisma.account.update({
      where: { id: existing.id },
      data: { isPrimarySuperAdmin: false },
    });
  });
});
