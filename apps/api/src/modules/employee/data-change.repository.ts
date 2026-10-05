import { getPrisma } from "../../core/db.ts";
import type { Prisma } from "../../generated/prisma/client.ts";
import { ARCHIVE_EMPLOYEE_SELECT } from "./archive.repository.ts";
import type { EmployeeTx, EmployeeWhere } from "./employee.repository.ts";

// D-054 / OD-6 (Arsip 1c): pengajuan perubahan data diri + daftar Arsip Keluarga & Bank.

const REQUEST_SELECT = {
  id: true,
  employeeId: true,
  section: true,
  status: true,
  payload: true,
  previous: true,
  documentId: true,
  submittedBy: true,
  reviewedBy: true,
  reviewedAt: true,
  reviewNote: true,
  createdAt: true,
  employee: { select: ARCHIVE_EMPLOYEE_SELECT },
  document: {
    select: {
      id: true,
      storagePath: true,
      mimeType: true,
      sizeBytes: true,
      status: true,
      documentType: {
        select: { id: true, code: true, name: true, sensitive: true, multiple: true },
      },
    },
  },
} satisfies Prisma.DataChangeRequestSelect;
export type RequestRow = Prisma.DataChangeRequestGetPayload<{ select: typeof REQUEST_SELECT }>;

export async function createRequest(
  tx: EmployeeTx,
  data: Prisma.DataChangeRequestUncheckedCreateInput,
) {
  return tx.dataChangeRequest.create({ data, select: { id: true } });
}

export async function findRequest(id: string, tx?: EmployeeTx) {
  return (tx ?? getPrisma()).dataChangeRequest.findUnique({
    where: { id },
    select: REQUEST_SELECT,
  });
}

export async function updateRequest(
  tx: EmployeeTx,
  id: string,
  data: Prisma.DataChangeRequestUncheckedUpdateInput,
) {
  await tx.dataChangeRequest.update({ where: { id }, data });
}

export async function listOfEmployee(employeeId: string) {
  return getPrisma().dataChangeRequest.findMany({
    where: { employeeId },
    select: REQUEST_SELECT,
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

export async function listQueue(
  where: Prisma.DataChangeRequestWhereInput,
  skip: number,
  take: number,
) {
  const prisma = getPrisma();
  const [rows, total] = await prisma.$transaction([
    prisma.dataChangeRequest.findMany({
      where,
      select: REQUEST_SELECT,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      skip,
      take,
    }),
    prisma.dataChangeRequest.count({ where }),
  ]);
  return { rows, total };
}

export async function maxVersionOfType(tx: EmployeeTx, employeeId: string, documentTypeId: string) {
  const row = await tx.employeeDocument.aggregate({
    where: { employeeId, documentTypeId, deletedAt: null, status: "VERIFIED" },
    _max: { version: true },
  });
  return row._max.version ?? 0;
}

export async function findTypeByCode(code: string) {
  return getPrisma().documentType.findUnique({ where: { code } });
}

// ── Arsip › Data Keluarga & Data Bank ───────────────────────────────────────

export async function listFamilies(
  where: Prisma.FamilyMemberWhereInput,
  skip: number,
  take: number,
) {
  const prisma = getPrisma();
  const [rows, total] = await prisma.$transaction([
    prisma.familyMember.findMany({
      where,
      select: {
        id: true,
        name: true,
        relationship: true,
        birthDate: true,
        phoneNumber: true,
        employee: { select: ARCHIVE_EMPLOYEE_SELECT },
      },
      orderBy: [{ employee: { fullName: "asc" } }, { createdAt: "asc" }, { id: "asc" }],
      skip,
      take,
    }),
    prisma.familyMember.count({ where }),
  ]);
  return { rows, total };
}

export async function listBankAccounts(where: EmployeeWhere, skip: number, take: number) {
  const prisma = getPrisma();
  const full: EmployeeWhere = { AND: [where, { bankAccount: { isNot: null } }] };
  const [rows, total] = await prisma.$transaction([
    prisma.employee.findMany({
      where: full,
      select: {
        ...ARCHIVE_EMPLOYEE_SELECT,
        bankAccount: { select: { bankName: true, accountNumber: true, accountHolder: true } },
      },
      orderBy: [{ fullName: "asc" }, { id: "asc" }],
      skip,
      take,
    }),
    prisma.employee.count({ where: full }),
  ]);
  return { rows, total };
}
