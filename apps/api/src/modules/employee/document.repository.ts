import { getPrisma } from "../../core/db.ts";
import type { Prisma } from "../../generated/prisma/client.ts";
import { ARCHIVE_EMPLOYEE_SELECT } from "./archive.repository.ts";
import type { EmployeeTx } from "./employee.repository.ts";

// D-055 (Arsip 1b): jenis dokumen (master data) & dokumen karyawan berversi + bermasa berlaku.

// ── Jenis dokumen ───────────────────────────────────────────────────────────

export async function listTypes(includeArchived: boolean) {
  return getPrisma().documentType.findMany({
    where: includeArchived ? {} : { deletedAt: null },
    orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    include: { _count: { select: { documents: { where: { deletedAt: null } } } } },
  });
}
export type DocumentTypeRow = Awaited<ReturnType<typeof listTypes>>[number];

export async function findType(id: string, tx?: EmployeeTx) {
  return (tx ?? getPrisma()).documentType.findUnique({
    where: { id },
    include: { _count: { select: { documents: { where: { deletedAt: null } } } } },
  });
}

export async function createType(tx: EmployeeTx, data: Prisma.DocumentTypeCreateInput) {
  return tx.documentType.create({ data, select: { id: true } });
}

export async function updateType(tx: EmployeeTx, id: string, data: Prisma.DocumentTypeUpdateInput) {
  return tx.documentType.update({ where: { id }, data, select: { id: true } });
}

/** Termasuk dokumen yang sudah dihapus (FK tetap menunjuk jenis ini). */
export async function countAllDocumentsOfType(tx: EmployeeTx, id: string) {
  return tx.employeeDocument.count({ where: { documentTypeId: id } });
}

export async function deleteType(tx: EmployeeTx, id: string) {
  await tx.documentType.delete({ where: { id } });
}

// ── Dokumen karyawan ────────────────────────────────────────────────────────

const TYPE_SELECT = {
  id: true,
  code: true,
  name: true,
  category: true,
  sensitive: true,
  hasExpiry: true,
  multiple: true,
} satisfies Prisma.DocumentTypeSelect;

export const DOCUMENT_SELECT = {
  id: true,
  employeeId: true,
  documentType: { select: TYPE_SELECT },
  documentNumber: true,
  issuedAt: true,
  expiresAt: true,
  version: true,
  isCurrent: true,
  replacesId: true,
  status: true,
  note: true,
  mimeType: true,
  sizeBytes: true,
  trainingId: true,
  historyId: true,
  storagePath: true,
  createdAt: true,
} satisfies Prisma.EmployeeDocumentSelect;
export type DocumentRow = Prisma.EmployeeDocumentGetPayload<{ select: typeof DOCUMENT_SELECT }>;

export async function listOfEmployee(employeeId: string) {
  return getPrisma().employeeDocument.findMany({
    where: { employeeId, deletedAt: null },
    select: DOCUMENT_SELECT,
    orderBy: [
      { documentType: { category: "asc" } },
      { documentType: { sortOrder: "asc" } },
      { version: "desc" },
      { createdAt: "desc" },
    ],
  });
}

export async function findDocument(tx: EmployeeTx | undefined, id: string) {
  return (tx ?? getPrisma()).employeeDocument.findFirst({
    where: { id, deletedAt: null },
    select: DOCUMENT_SELECT,
  });
}

/** Versi aktif sejenis milik karyawan (jenis tunggal: diganti versi baru). */
export async function findCurrentOfType(
  tx: EmployeeTx,
  employeeId: string,
  documentTypeId: string,
) {
  return tx.employeeDocument.findMany({
    where: { employeeId, documentTypeId, isCurrent: true, deletedAt: null },
    select: { id: true, version: true },
    orderBy: [{ version: "desc" }, { createdAt: "desc" }],
  });
}

export async function markNotCurrent(tx: EmployeeTx, ids: string[]) {
  if (ids.length === 0) return;
  await tx.employeeDocument.updateMany({ where: { id: { in: ids } }, data: { isCurrent: false } });
}

export async function createDocument(
  tx: EmployeeTx,
  data: Prisma.EmployeeDocumentUncheckedCreateInput,
) {
  return tx.employeeDocument.create({ data, select: { id: true } });
}

export async function updateDocument(
  tx: EmployeeTx,
  id: string,
  data: Prisma.EmployeeDocumentUncheckedUpdateInput,
) {
  await tx.employeeDocument.update({ where: { id }, data });
}

export async function restoreCurrent(tx: EmployeeTx, id: string) {
  await tx.employeeDocument.updateMany({
    where: { id, deletedAt: null },
    data: { isCurrent: true },
  });
}

export async function itemBelongsTo(
  tx: EmployeeTx,
  kind: "training" | "history",
  id: string,
  employeeId: string,
) {
  const row =
    kind === "training"
      ? await tx.training.findUnique({ where: { id }, select: { employeeId: true } })
      : await tx.employmentHistory.findUnique({ where: { id }, select: { employeeId: true } });
  return row?.employeeId === employeeId;
}

// ── Tabel lintas karyawan (Data File) ───────────────────────────────────────

export async function listArchive(
  where: Prisma.EmployeeDocumentWhereInput,
  orderBy: Prisma.EmployeeDocumentOrderByWithRelationInput[],
  skip: number,
  take: number,
) {
  const prisma = getPrisma();
  const [rows, total] = await prisma.$transaction([
    prisma.employeeDocument.findMany({
      where,
      select: { ...DOCUMENT_SELECT, employee: { select: ARCHIVE_EMPLOYEE_SELECT } },
      orderBy,
      skip,
      take,
    }),
    prisma.employeeDocument.count({ where }),
  ]);
  return { rows, total };
}

// ── Cron pengingat ──────────────────────────────────────────────────────────

export async function findExpiringCurrent(from: Date, until: Date) {
  return getPrisma().employeeDocument.findMany({
    where: {
      isCurrent: true,
      deletedAt: null,
      expiresAt: { gte: from, lte: until },
      employee: { isActive: true, onboardingStatus: "APPROVED" },
    },
    select: {
      id: true,
      expiresAt: true,
      documentType: { select: { name: true, sensitive: true, reminderDays: true } },
      employee: { select: { id: true, fullName: true, companyId: true } },
    },
    orderBy: { expiresAt: "asc" },
  });
}
