import { afterAll, describe, expect, test } from "bun:test";
import { writeAudit } from "../../src/core/audit.ts";
import { disconnectPrisma, getPrisma } from "../../src/core/db.ts";
import { REDACTED } from "../../src/core/logger.ts";

const prisma = getPrisma();
const RUN = `audit-${crypto.randomUUID().slice(0, 8)}`;

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { entityId: { startsWith: RUN } } });
  await disconnectPrisma();
});

describe("writeAudit (core)", () => {
  test("menulis entri dengan field sensitif tersamarkan", async () => {
    const log = await writeAudit({
      actorAccountId: null,
      action: "test.entity.update",
      entityType: "test",
      entityId: `${RUN}-1`,
      before: { fullName: "Budi", nik: "3171011205840001" },
      after: { fullName: "Budi S.", bankAccountNumber: "9990000001", nested: { salary: 1000 } },
      reason: "uji",
      requestId: "req-1",
    });
    expect(log.before).toEqual({ fullName: "Budi", nik: REDACTED });
    expect(log.after).toEqual({
      fullName: "Budi S.",
      bankAccountNumber: REDACTED,
      nested: { salary: REDACTED },
    });
  });

  test("ikut transaksi: rollback membatalkan audit", async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        await writeAudit(
          {
            actorAccountId: null,
            action: "test.rollback",
            entityType: "test",
            entityId: `${RUN}-2`,
          },
          tx,
        );
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");
    expect(await prisma.auditLog.count({ where: { entityId: `${RUN}-2` } })).toBe(0);
  });
});
