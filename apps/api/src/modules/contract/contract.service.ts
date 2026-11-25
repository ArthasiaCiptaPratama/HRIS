import {
  addContractDays,
  type CreateContractInput,
  contractSummary,
  type EmploymentCategory,
  type ExtendContractInput,
  employmentTier,
  tenure,
  validateContractStage,
} from "@hris/shared";
import { BusinessRuleError, ConflictError, NotFoundError } from "../../core/errors.ts";
import type { EmploymentContract } from "../../generated/prisma/client.ts";
import * as repository from "./contract.repository.ts";

const iso = (value: Date) => value.toISOString().slice(0, 10);
const date = (value: string) => new Date(`${value}T00:00:00.000Z`);
export function contractDto(row: EmploymentContract) {
  return {
    ...row,
    startDate: iso(row.startDate),
    endDate: iso(row.endDate),
    pkwtFirstStartDate: row.pkwtFirstStartDate ? iso(row.pkwtFirstStartDate) : null,
    closedAt: row.closedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
export interface ContractActionResult {
  contract: ReturnType<typeof contractDto> | null;
  warnings: string[];
}

export interface ContractEmployee {
  id: string;
  companyId: string;
  category: EmploymentCategory | null;
  joinDate: Date;
  pkwttStartDate: Date | null;
}
/** KTR-K1: tombol aksi web; `missingGrant` = HR_ADMIN dalam cakupan tanpa grant `contract.manage`. */
export interface ContractAccess {
  manage: boolean;
  missingGrant: boolean;
}
export async function readEmployeeContracts(
  employee: ContractEmployee,
  today: string,
  access: ContractAccess,
  tx?: repository.ContractTx,
) {
  const contracts = (await repository.listContracts(employee.id, tx)).map(contractDto);
  return {
    contracts,
    summary: contractSummary(contracts, today),
    tier: employmentTier(employee.category),
    category: employee.category,
    joinDate: iso(employee.joinDate),
    pkwttStartDate: employee.pkwttStartDate ? iso(employee.pkwttStartDate) : null,
    companyTenure: tenure(iso(employee.joinDate), today),
    pkwttTenure: employee.pkwttStartDate ? tenure(iso(employee.pkwttStartDate), today) : null,
    access,
  };
}
export async function getActiveContract(
  employeeId: string,
  tx: repository.ContractTx,
  contractId?: string,
) {
  const contracts = await repository.listContracts(employeeId, tx);
  const active = contracts.find(
    (c) => c.status === "ACTIVE" && (!contractId || c.id === contractId),
  );
  if (!active) {
    if (contractId && !contracts.some((c) => c.id === contractId))
      throw new NotFoundError("Kontrak tidak ditemukan.");
    throw new BusinessRuleError("Kontrak aktif tidak ditemukan.");
  }
  return active;
}
function assertStage(input: Parameters<typeof validateContractStage>[0]) {
  const result = validateContractStage(input);
  if (result.errors.length) throw new BusinessRuleError(result.errors.join(" "));
  return result.warnings;
}
export async function fillContract(
  employee: ContractEmployee,
  input: CreateContractInput,
  actorId: string,
  tx: repository.ContractTx,
) {
  const contracts = await repository.listContracts(employee.id, tx);
  if (contracts.some((c) => c.status === "ACTIVE"))
    throw new ConflictError("Karyawan sudah memiliki kontrak aktif.");
  if (
    (input.kind === "PKWT" && employee.category !== "PKWT") ||
    (input.kind === "PROBATION" && employee.category !== "PROBATION")
  )
    throw new BusinessRuleError("Jenis kontrak harus sesuai kategori kepegawaian.");
  if (input.startDate < iso(employee.joinDate))
    throw new BusinessRuleError("Tanggal mulai kontrak tidak boleh sebelum tanggal masuk.");
  const sequence = input.sequence ?? null;
  if (input.kind === "PKWT" && sequence !== null && sequence > 1 && !input.firstPkwtStartDate)
    throw new BusinessRuleError(
      "Tanggal mulai PKWT 1 wajib untuk tahap lama tanpa kontrak sebelumnya.",
    );
  if (input.kind === "PROBATION" && input.firstPkwtStartDate)
    throw new BusinessRuleError("Tanggal mulai PKWT 1 hanya untuk kontrak PKWT.");
  if (
    input.kind === "PKWT" &&
    sequence === 1 &&
    input.firstPkwtStartDate &&
    input.firstPkwtStartDate !== input.startDate
  )
    throw new BusinessRuleError("Tanggal mulai PKWT 1 harus sama dengan awal tahap 1.");
  const warnings = assertStage({
    kind: input.kind,
    sequence,
    startDate: input.startDate,
    endDate: input.endDate,
    previous: input.firstPkwtStartDate
      ? {
          endDate: addContractDays(input.startDate, -1),
          sequence: (sequence ?? 1) - 1,
          firstPkwtStart: input.firstPkwtStartDate,
        }
      : null,
  });
  const row = await repository.createContract(
    {
      employeeId: employee.id,
      companyId: employee.companyId,
      kind: input.kind,
      sequence,
      startDate: date(input.startDate),
      endDate: date(input.endDate),
      pkwtFirstStartDate: input.firstPkwtStartDate ? date(input.firstPkwtStartDate) : null,
      note: input.note ?? null,
      createdBy: actorId,
      updatedBy: actorId,
    },
    tx,
  );
  return { contract: contractDto(row), warnings };
}
export async function extendContract(
  employee: Pick<ContractEmployee, "id" | "companyId">,
  contractId: string,
  input: ExtendContractInput,
  actorId: string,
  tx: repository.ContractTx,
) {
  const employeeId = employee.id;
  const previous = await getActiveContract(employeeId, tx, contractId);
  if (previous.kind !== "PKWT")
    throw new BusinessRuleError("Hanya kontrak PKWT yang dapat diperpanjang.");
  if (previous.sequence === null || previous.sequence >= 3)
    throw new BusinessRuleError("Batas PKWT tercapai: jadikan Karyawan Tetap atau akhiri kontrak");
  const startDate = input.startDate ?? addContractDays(iso(previous.endDate), 1);
  const contracts = (await repository.listContracts(employeeId, tx)).map(contractDto);
  const firstStart =
    contractSummary(contracts, startDate)?.totalPkwt?.firstStartDate ?? iso(previous.startDate);
  const warnings = assertStage({
    kind: "PKWT",
    sequence: previous.sequence + 1,
    startDate,
    endDate: input.endDate,
    previous: {
      endDate: iso(previous.endDate),
      sequence: previous.sequence,
      firstPkwtStart: firstStart,
    },
  });
  await repository.closeContract(previous.id, "EXTENDED", actorId, input.note, tx);
  const row = await repository.createContract(
    {
      employeeId,
      companyId: employee.companyId,
      kind: "PKWT",
      sequence: previous.sequence + 1,
      startDate: date(startDate),
      endDate: date(input.endDate),
      previousContractId: previous.id,
      note: input.note ?? null,
      createdBy: actorId,
      updatedBy: actorId,
    },
    tx,
  );
  return { contract: contractDto(row), warnings };
}
export async function finishContract(
  row: EmploymentContract,
  status: "CONVERTED" | "PASSED" | "ENDED",
  actorId: string,
  reason: string | undefined,
  tx: repository.ContractTx,
) {
  return contractDto(await repository.closeContract(row.id, status, actorId, reason, tx));
}
