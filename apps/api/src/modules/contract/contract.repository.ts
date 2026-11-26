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
/** KTR-D12: koreksi tanggal kontrak aktif (tahap tidak berubah). */
export function updateContractDates(
  id: string,
  data: { startDate: Date; endDate: Date; pkwtFirstStartDate?: Date | null },
  actorId: string,
  tx: ContractTx = getPrisma(),
) {
  return tx.employmentContract.update({ where: { id }, data: { ...data, updatedBy: actorId } });
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
