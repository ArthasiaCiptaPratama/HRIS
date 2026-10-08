import { getPrisma } from "../../core/db.ts";
import type { Prisma } from "../../generated/prisma/client.ts";
import type { EmployeeTx, EmployeeWhere } from "./employee.repository.ts";

// D-054 (Arsip 1a): query tabel lintas karyawan & kelola item per karyawan (tabel skema employee).

export const ARCHIVE_EMPLOYEE_SELECT = {
  id: true,
  fullName: true,
  employeeNumber: true,
  isActive: true,
  companyId: true,
  positionId: true,
  managerId: true,
  photoPath: true,
} satisfies Prisma.EmployeeSelect;
export type ArchiveEmployee = Prisma.EmployeeGetPayload<{ select: typeof ARCHIVE_EMPLOYEE_SELECT }>;

const byEmployee = { employee: { fullName: "asc" } } as const;

export async function listContacts(where: EmployeeWhere, skip: number, take: number) {
  const prisma = getPrisma();
  const select = {
    ...ARCHIVE_EMPLOYEE_SELECT,
    workEmail: true,
    personalEmail: true,
    phoneNumber: true,
    emergencyContactName: true,
    emergencyContactRelationship: true,
    emergencyPhone: true,
  } satisfies Prisma.EmployeeSelect;
  const [rows, total] = await prisma.$transaction([
    prisma.employee.findMany({
      where,
      select,
      orderBy: [{ fullName: "asc" }, { id: "asc" }],
      skip,
      take,
    }),
    prisma.employee.count({ where }),
  ]);
  return { rows, total };
}

/** Alamat domisili hanya untuk id yang sudah dicek boleh dibaca (data pribadi, PLAN §4.2). */
export async function findDomiciles(ids: string[]) {
  if (ids.length === 0) return new Map<string, string | null>();
  const rows = await getPrisma().employeePersonal.findMany({
    where: { employeeId: { in: ids } },
    select: { employeeId: true, domicileAddress: true },
  });
  return new Map(rows.map((row) => [row.employeeId, row.domicileAddress]));
}

export async function listEducations(
  where: Prisma.EducationWhereInput,
  skip: number,
  take: number,
) {
  const prisma = getPrisma();
  const [rows, total] = await prisma.$transaction([
    prisma.education.findMany({
      where,
      include: { employee: { select: ARCHIVE_EMPLOYEE_SELECT } },
      orderBy: [byEmployee, { graduationYear: { sort: "desc", nulls: "last" } }, { id: "asc" }],
      skip,
      take,
    }),
    prisma.education.count({ where }),
  ]);
  return { rows, total };
}

export async function listTrainings(where: Prisma.TrainingWhereInput, skip: number, take: number) {
  const prisma = getPrisma();
  const [rows, total] = await prisma.$transaction([
    prisma.training.findMany({
      where,
      include: { employee: { select: ARCHIVE_EMPLOYEE_SELECT } },
      orderBy: [
        byEmployee,
        { startDate: { sort: "desc", nulls: "last" } },
        { trainingYear: { sort: "desc", nulls: "last" } },
        { id: "asc" },
      ],
      skip,
      take,
    }),
    prisma.training.count({ where }),
  ]);
  return { rows, total };
}

export async function listWorkExperiences(
  where: Prisma.WorkExperienceWhereInput,
  skip: number,
  take: number,
) {
  const prisma = getPrisma();
  const [rows, total] = await prisma.$transaction([
    prisma.workExperience.findMany({
      where,
      include: { employee: { select: ARCHIVE_EMPLOYEE_SELECT } },
      orderBy: [byEmployee, { startYear: "desc" }, { id: "asc" }],
      skip,
      take,
    }),
    prisma.workExperience.count({ where }),
  ]);
  return { rows, total };
}

export async function listPositionHistories(
  where: Prisma.EmploymentHistoryWhereInput,
  skip: number,
  take: number,
) {
  const prisma = getPrisma();
  const [rows, total] = await prisma.$transaction([
    prisma.employmentHistory.findMany({
      where,
      include: { employee: { select: ARCHIVE_EMPLOYEE_SELECT } },
      orderBy: [byEmployee, { effectiveDate: "desc" }, { createdAt: "desc" }],
      skip,
      take,
    }),
    prisma.employmentHistory.count({ where }),
  ]);
  return { rows, total };
}

// ── Kelola item per karyawan ────────────────────────────────────────────────

export const educationRepo = {
  find: (tx: EmployeeTx, id: string) => tx.education.findUnique({ where: { id } }),
  create: (tx: EmployeeTx, data: Prisma.EducationUncheckedCreateInput) =>
    tx.education.create({ data, select: { id: true } }),
  update: (tx: EmployeeTx, id: string, data: Prisma.EducationUncheckedUpdateInput) =>
    tx.education.update({ where: { id }, data, select: { id: true } }),
  delete: (tx: EmployeeTx, id: string) =>
    tx.education.delete({ where: { id }, select: { id: true } }),
};

export const trainingRepo = {
  find: (tx: EmployeeTx, id: string) => tx.training.findUnique({ where: { id } }),
  create: (tx: EmployeeTx, data: Prisma.TrainingUncheckedCreateInput) =>
    tx.training.create({ data, select: { id: true } }),
  update: (tx: EmployeeTx, id: string, data: Prisma.TrainingUncheckedUpdateInput) =>
    tx.training.update({ where: { id }, data, select: { id: true } }),
  delete: (tx: EmployeeTx, id: string) =>
    tx.training.delete({ where: { id }, select: { id: true } }),
};

export const workExperienceRepo = {
  find: (tx: EmployeeTx, id: string) => tx.workExperience.findUnique({ where: { id } }),
  create: (tx: EmployeeTx, data: Prisma.WorkExperienceUncheckedCreateInput) =>
    tx.workExperience.create({ data, select: { id: true } }),
  update: (tx: EmployeeTx, id: string, data: Prisma.WorkExperienceUncheckedUpdateInput) =>
    tx.workExperience.update({ where: { id }, data, select: { id: true } }),
  delete: (tx: EmployeeTx, id: string) =>
    tx.workExperience.delete({ where: { id }, select: { id: true } }),
};

export const historyRepo = {
  find: (tx: EmployeeTx, id: string) => tx.employmentHistory.findUnique({ where: { id } }),
  create: (tx: EmployeeTx, data: Prisma.EmploymentHistoryUncheckedCreateInput) =>
    tx.employmentHistory.create({ data, select: { id: true } }),
  update: (tx: EmployeeTx, id: string, data: Prisma.EmploymentHistoryUncheckedUpdateInput) =>
    tx.employmentHistory.update({ where: { id }, data, select: { id: true } }),
  delete: (tx: EmployeeTx, id: string) =>
    tx.employmentHistory.delete({ where: { id }, select: { id: true } }),
};
