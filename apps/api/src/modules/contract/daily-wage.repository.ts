import { getPrisma } from "../../core/db.ts";
import type { Prisma } from "../../generated/prisma/client.ts";

export function listDailyWages(employeeIds: string[], tx: Prisma.TransactionClient = getPrisma()) {
  return tx.dailyWage.findMany({
    where: { employeeId: { in: employeeIds } },
    orderBy: [{ employeeId: "asc" }, { effectiveFrom: "desc" }],
  });
}
export function upsertDailyWage(
  data: Prisma.DailyWageUncheckedCreateInput,
  tx: Prisma.TransactionClient,
) {
  return tx.dailyWage.upsert({
    where: {
      employeeId_effectiveFrom: { employeeId: data.employeeId, effectiveFrom: data.effectiveFrom },
    },
    create: data,
    update: { amount: data.amount, note: data.note, companyId: data.companyId },
  });
}
