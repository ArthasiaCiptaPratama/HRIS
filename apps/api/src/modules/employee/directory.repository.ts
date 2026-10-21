import { getPrisma } from "../../core/db.ts";

// Direktori baca-saja untuk modul lain (lewat index.ts): data minimum karyawan & rujukan dokumen.
// Hanya karyawan "resmi" (D-045: calon onboarding yang belum disetujui bukan karyawan).

const BRIEF_SELECT = {
  id: true,
  fullName: true,
  employeeNumber: true,
  companyId: true,
  managerId: true,
  isActive: true,
  positionId: true,
  workLocationId: true,
} as const;

export async function findBriefsByIds(ids: string[]) {
  if (ids.length === 0) return [];
  return getPrisma().employee.findMany({
    where: { id: { in: ids }, onboardingStatus: "APPROVED" },
    select: BRIEF_SELECT,
  });
}

export async function findBriefs(filter: {
  companyIds: string[] | null;
  managerId: string | null;
  isActive: boolean | null;
  employeeNumbers: string[] | null;
  q: string | null;
  limit: number;
}) {
  return getPrisma().employee.findMany({
    where: {
      onboardingStatus: "APPROVED",
      ...(filter.companyIds ? { companyId: { in: filter.companyIds } } : {}),
      ...(filter.managerId ? { managerId: filter.managerId } : {}),
      ...(filter.isActive === null ? {} : { isActive: filter.isActive }),
      ...(filter.employeeNumbers ? { employeeNumber: { in: filter.employeeNumbers } } : {}),
      ...(filter.q
        ? {
            OR: [
              { fullName: { contains: filter.q, mode: "insensitive" as const } },
              { employeeNumber: { contains: filter.q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    select: BRIEF_SELECT,
    orderBy: { fullName: "asc" },
    take: filter.limit,
  });
}

export async function findActiveJoinDates() {
  return getPrisma().employee.findMany({
    where: { onboardingStatus: "APPROVED", isActive: true },
    select: { id: true, companyId: true, joinDate: true },
  });
}

export async function findDocumentRef(id: string) {
  return getPrisma().employeeDocument.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, employeeId: true, documentType: { select: { code: true } } },
  });
}
