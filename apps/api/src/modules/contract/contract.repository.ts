import { getPrisma } from "../../core/db.ts";
import type { Prisma } from "../../generated/prisma/client.ts";

export type ContractTx = Prisma.TransactionClient;
export function listContracts(employeeId: string, tx: ContractTx = getPrisma()) {
  return tx.employmentContract.findMany({
    where: { employeeId },
    orderBy: [{ startDate: "asc" }, { createdAt: "asc" }, { id: "asc" }],
  });
}
export function createContract(
  data: Prisma.EmploymentContractUncheckedCreateInput,
  tx: ContractTx = getPrisma(),
) {
  return tx.employmentContract.create({ data });
}
export function closeContract(
  id: string,
  status: "EXTENDED" | "CONVERTED" | "PASSED" | "ENDED",
  actorId: string,
  reason: string | undefined,
  tx: ContractTx = getPrisma(),
) {
  return tx.employmentContract.update({
    where: { id },
    data: { status, closedAt: new Date(), closeReason: reason ?? null, updatedBy: actorId },
  });
}
