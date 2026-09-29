import { getPrisma } from "../../core/db.ts";
import type { Prisma } from "../../generated/prisma/client.ts";

// Satu-satunya tempat query Prisma ke tabel skema employee (PROMPT §4).
// Tidak ada `include` ke tabel modul lain: nama jabatan/status dirakit service dari modul organization.

export type EmployeeTx = Prisma.TransactionClient;
export type EmployeeWhere = Prisma.EmployeeWhereInput;
export type EmployeeOrderBy = Prisma.EmployeeOrderByWithRelationInput;

// Kolom daftar dipilih eksplisit: data sensitif (tabel terpisah) tidak pernah ikut ter-select.
export const LIST_SELECT = {
  id: true,
  employeeNumber: true,
  fullName: true,
  workEmail: true,
  phoneNumber: true,
  gender: true,
  joinDate: true,
  endDate: true,
  isActive: true,
  exitReason: true,
  employmentStatusId: true,
  positionId: true,
  workLocationId: true,
  gradeId: true,
  managerId: true,
  manager: { select: { id: true, fullName: true } },
} satisfies Prisma.EmployeeSelect;

export type EmployeeRow = Prisma.EmployeeGetPayload<{ select: typeof LIST_SELECT }>;

export async function withTransaction<T>(run: (tx: EmployeeTx) => Promise<T>): Promise<T> {
  return getPrisma().$transaction(run);
}

export async function listEmployees(
  where: EmployeeWhere,
  orderBy: EmployeeOrderBy[],
  skip: number,
  take: number,
) {
  const prisma = getPrisma();
  const [rows, total] = await prisma.$transaction([
    prisma.employee.findMany({ where, orderBy, skip, take, select: LIST_SELECT }),
    prisma.employee.count({ where }),
  ]);
  return { rows, total };
}

export async function countByStatus(where: EmployeeWhere) {
  return getPrisma().employee.groupBy({
    by: ["employmentStatusId", "isActive"],
    where,
    _count: { _all: true },
    orderBy: { employmentStatusId: "asc" },
  });
}

export async function findEmployee(id: string, tx: EmployeeTx = getPrisma()) {
  return tx.employee.findUnique({
    where: { id },
    select: { ...LIST_SELECT, emergencyPhone: true },
  });
}

export async function findEmployeeParts(id: string, include: { personal: boolean; bank: boolean }) {
  const prisma = getPrisma();
  // Bagian sensitif hanya di-query bila boleh (tidak dibaca lalu dibuang).
  const [educations, trainings, histories, personal, familyMembers, bankAccount] =
    await Promise.all([
      prisma.education.findMany({
        where: { employeeId: id },
        select: { id: true, schoolName: true, major: true, graduationYear: true },
        orderBy: [{ graduationYear: "desc" }, { createdAt: "desc" }],
      }),
      prisma.training.findMany({
        where: { employeeId: id },
        select: {
          id: true,
          trainingField: true,
          organizer: true,
          duration: true,
          trainingYear: true,
        },
        orderBy: [{ trainingYear: "desc" }, { createdAt: "desc" }],
      }),
      prisma.employmentHistory.findMany({
        where: { employeeId: id },
        orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }],
        take: 50,
      }),
      include.personal ? prisma.employeePersonal.findUnique({ where: { employeeId: id } }) : null,
      include.personal
        ? prisma.familyMember.findMany({
            where: { employeeId: id },
            select: {
              id: true,
              name: true,
              relationship: true,
              address: true,
              birthDate: true,
              phoneNumber: true,
            },
            orderBy: { createdAt: "asc" },
          })
        : null,
      include.bank
        ? prisma.employeeBankAccount.findUnique({
            where: { employeeId: id },
            select: { bankName: true, accountNumber: true, accountHolder: true },
          })
        : null,
    ]);
  return { educations, trainings, histories, personal, familyMembers, bankAccount };
}

export async function findManyByIds(ids: string[]) {
  if (ids.length === 0) return [];
  return getPrisma().employee.findMany({
    where: { id: { in: ids } },
    select: { id: true, fullName: true, employeeNumber: true, positionId: true, isActive: true },
    orderBy: { fullName: "asc" },
  });
}

/** Nama & lokasi kerja pegawai milik akun pengubah (riwayat "diubah oleh"). */
export async function findChangerEmployees(ids: string[]) {
  if (ids.length === 0) return [];
  return getPrisma().employee.findMany({
    where: { id: { in: ids } },
    select: { id: true, fullName: true, workLocationId: true },
  });
}

/** Rantai atasan ke atas (untuk mencegah siklus manager_id). */
export async function findManagerId(id: string, tx: EmployeeTx = getPrisma()) {
  const row = await tx.employee.findUnique({ where: { id }, select: { managerId: true } });
  return row?.managerId ?? null;
}

export async function listActiveForStructure() {
  return getPrisma().employee.findMany({
    where: { isActive: true },
    select: { id: true, fullName: true, employeeNumber: true, positionId: true, managerId: true },
    orderBy: { fullName: "asc" },
  });
}

export async function createEmployee(tx: EmployeeTx, data: Prisma.EmployeeUncheckedCreateInput) {
  return tx.employee.create({ data, select: { id: true } });
}

export async function updateEmployee(
  tx: EmployeeTx,
  id: string,
  data: Prisma.EmployeeUncheckedUpdateInput,
) {
  return tx.employee.update({ where: { id }, data, select: { id: true } });
}

export async function createHistory(
  tx: EmployeeTx,
  data: Prisma.EmploymentHistoryUncheckedCreateInput,
) {
  return tx.employmentHistory.create({ data, select: { id: true } });
}

export async function countActiveSubordinates(id: string) {
  return getPrisma().employee.count({ where: { managerId: id, isActive: true } });
}
