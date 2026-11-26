import { expect, test } from "bun:test";
import { evaluateThlAttendance, shiftThlMonth, thlCurrentMonth } from "@hris/shared";
import { seedContracts } from "../../../prisma/seed/contract.ts";
import { seedOrganization } from "../../../prisma/seed/organization.ts";
import { getPrisma } from "../../../src/core/db.ts";

// Only the explicitly fictional seed records are touched; preload forbids remote databases.
test("K4 local seed: REQUIRED/APPROACHING, pending, changing wage, and idempotency", async () => {
  const prisma = getPrisma();
  const org = await seedOrganization(prisma);
  await seedContracts(prisma, org);
  const employees = await prisma.employee.findMany({
    where: { employeeNumber: { in: ["KTR-DMY-THL-REQ", "KTR-DMY-THL-APP"] } },
    orderBy: { employeeNumber: "asc" },
  });
  expect(employees).toHaveLength(2);
  const ids = employees.map((e) => e.id);
  const snapshot = async () => ({
    days: await prisma.attendanceDay.findMany({
      where: { employeeId: { in: ids } },
      orderBy: [{ employeeId: "asc" }, { workDate: "asc" }],
      select: { id: true, employeeId: true, workDate: true, status: true },
    }),
    wages: await prisma.dailyWage.findMany({
      where: { employeeId: { in: ids } },
      orderBy: [{ employeeId: "asc" }, { effectiveFrom: "asc" }],
      select: { id: true, employeeId: true, effectiveFrom: true, amount: true },
    }),
  });
  const before = await snapshot();
  await seedContracts(prisma, org);
  expect(await snapshot()).toEqual(before);
  const current = thlCurrentMonth();
  const lastMonth = shiftThlMonth(current, -1);
  for (const employee of employees) {
    const months = [-3, -2, -1].map((offset) => {
      const month = shiftThlMonth(current, offset);
      const days = before.days.filter(
        (d) => d.employeeId === employee.id && d.workDate.toISOString().startsWith(month),
      );
      return {
        month,
        presentDays: days.filter((d) => d.status === "APPROVED").length,
        pendingDays: days.filter((d) => d.status === "PENDING").length,
      };
    });
    expect(evaluateThlAttendance(months).status).toBe(
      employee.employeeNumber?.endsWith("REQ") ? "REQUIRED" : "APPROACHING",
    );
    expect(months[2]?.pendingDays).toBe(2);
    expect(before.wages.some((w) => w.employeeId === employee.id)).toBe(true);
    if (employee.employeeNumber?.endsWith("REQ"))
      expect(
        before.wages.some(
          (w) =>
            w.employeeId === employee.id &&
            w.effectiveFrom.toISOString().startsWith(`${lastMonth}-15`),
        ),
      ).toBe(true);
  }
});
