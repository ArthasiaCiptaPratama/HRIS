import { getPrisma } from "../../core/db.ts";
import type { EmployeeTx } from "./employee.repository.ts";

// D-051/D-053: query pemegang pos jabatan (tabel employee). Pos sendiri dibaca dari modul organization.

/** Pemegang pos = karyawan aktif yang sudah disetujui (calon onboarding belum masuk bagan, D-045). */
const HOLDER_WHERE = {
  isActive: true,
  onboardingStatus: "APPROVED",
  orgPostId: { not: null },
} as const;

export async function countPostHolders(tx?: EmployeeTx): Promise<Map<string, number>> {
  const rows = await (tx ?? getPrisma()).employee.groupBy({
    by: ["orgPostId"],
    where: HOLDER_WHERE,
    _count: { _all: true },
  });
  return new Map(
    rows.flatMap((row) => (row.orgPostId ? [[row.orgPostId, row._count._all] as const] : [])),
  );
}

export async function postHolderCompanies(tx: EmployeeTx, postIds: string[]): Promise<string[]> {
  if (postIds.length === 0) return [];
  const rows = await tx.employee.findMany({
    where: { ...HOLDER_WHERE, orgPostId: { in: postIds } },
    select: { companyId: true },
    distinct: ["companyId"],
  });
  return rows.map((row) => row.companyId);
}

/** Semua pemegang pos; urutan nomor induk = urutan tetap "pemegang pertama" (D-053). */
export async function listPostHolders(tx?: EmployeeTx) {
  return (tx ?? getPrisma()).employee.findMany({
    where: HOLDER_WHERE,
    select: {
      id: true,
      fullName: true,
      employeeNumber: true,
      companyId: true,
      orgPostId: true,
      managerId: true,
      managerOverride: true,
      photoPath: true,
    },
    orderBy: { employeeNumber: "asc" },
  });
}
export type PostHolderRow = Awaited<ReturnType<typeof listPostHolders>>[number];

export async function setManager(tx: EmployeeTx, id: string, managerId: string | null) {
  await tx.employee.update({ where: { id }, data: { managerId }, select: { id: true } });
}

/** Karyawan aktif (disetujui) di PT itu yang belum menempati pos mana pun. */
export async function countUnplaced(companyIds: readonly string[] | null): Promise<number> {
  return getPrisma().employee.count({
    where: {
      isActive: true,
      onboardingStatus: "APPROVED",
      orgPostId: null,
      ...(companyIds === null ? {} : { companyId: { in: [...companyIds] } }),
    },
  });
}

/** Satu karyawan untuk kartu profil kerja (kolom direktori saja, PLAN §4.3). */
export async function findCardRow(id: string) {
  return getPrisma().employee.findUnique({
    where: { id },
    select: {
      id: true,
      fullName: true,
      workEmail: true,
      companyId: true,
      positionId: true,
      workLocationId: true,
      orgPostId: true,
      photoPath: true,
      isActive: true,
      onboardingStatus: true,
    },
  });
}

/** Penempatan pos: berapa pemegang lain di pos itu (kapasitas slot). */
export async function countOtherHolders(tx: EmployeeTx, postId: string, exceptId: string | null) {
  return tx.employee.count({
    where: {
      ...HOLDER_WHERE,
      orgPostId: postId,
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
  });
}
