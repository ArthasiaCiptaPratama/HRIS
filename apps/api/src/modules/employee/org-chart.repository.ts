import { getPrisma } from "../../core/db.ts";
import type { EmployeeTx } from "./employee.repository.ts";

// D-051/D-053: query pemegang pos jabatan (tabel employee). Pos sendiri dibaca dari modul organization.

/** Pemegang pos = karyawan aktif yang sudah disetujui (calon onboarding belum masuk bagan, D-045). */
const HOLDER_WHERE = {
  isActive: true,
  onboardingStatus: "APPROVED",
  orgPostId: { not: null },
} as const;

/** ORG-D3: pemegang rangkap dihitung hanya bila karyawannya aktif & disetujui. */
const SECONDARY_WHERE = { employee: { isActive: true, onboardingStatus: "APPROVED" } } as const;

/** Pemegang per pos = pemegang utama + pemegang rangkap (ORG-D3; mengisi slot yang sama). */
export async function countPostHolders(tx?: EmployeeTx): Promise<Map<string, number>> {
  const db = tx ?? getPrisma();
  const [rows, secondary] = await Promise.all([
    db.employee.groupBy({ by: ["orgPostId"], where: HOLDER_WHERE, _count: { _all: true } }),
    db.employeeSecondaryPost.groupBy({
      by: ["orgPostId"],
      where: SECONDARY_WHERE,
      _count: { _all: true },
    }),
  ]);
  const counts = new Map<string, number>();
  for (const row of rows) if (row.orgPostId) counts.set(row.orgPostId, row._count._all);
  for (const row of secondary) {
    counts.set(row.orgPostId, (counts.get(row.orgPostId) ?? 0) + row._count._all);
  }
  return counts;
}

/** ORG-D3: semua pemegang rangkap aktif (urut nomor induk, seperti pemegang utama). */
export async function listSecondaryHolders(tx?: EmployeeTx) {
  return (tx ?? getPrisma()).employeeSecondaryPost.findMany({
    where: SECONDARY_WHERE,
    select: {
      employeeId: true,
      orgPostId: true,
      employee: { select: { fullName: true, companyId: true, photoPath: true } },
    },
    orderBy: { employee: { employeeNumber: "asc" } },
  });
}

/** ORG-D3: pos rangkap satu karyawan. */
export async function listEmployeeSecondaryPosts(tx: EmployeeTx, employeeId: string) {
  return tx.employeeSecondaryPost.findMany({
    where: { employeeId },
    select: { orgPostId: true },
  });
}

export async function addSecondaryPost(
  tx: EmployeeTx,
  employeeId: string,
  orgPostId: string,
  createdBy: string | null,
) {
  await tx.employeeSecondaryPost.create({
    data: { employeeId, orgPostId, createdBy },
    select: { id: true },
  });
}

export async function removeSecondaryPost(tx: EmployeeTx, employeeId: string, orgPostId: string) {
  const { count } = await tx.employeeSecondaryPost.deleteMany({ where: { employeeId, orgPostId } });
  return count;
}

/** ORG-D3: pos rangkap untuk profil karyawan (tanpa transaksi). */
export function listEmployeeSecondaryPostIds(employeeId: string) {
  return getPrisma().employeeSecondaryPost.findMany({
    where: { employeeId },
    select: { orgPostId: true },
  });
}

/** ORG-D3: karyawan nonaktif/keluar atau pindah PT → semua pos rangkapnya dilepas. */
export async function clearSecondaryPosts(tx: EmployeeTx, employeeId: string) {
  await tx.employeeSecondaryPost.deleteMany({ where: { employeeId } });
}

export async function postHolderCompanies(tx: EmployeeTx, postIds: string[]): Promise<string[]> {
  if (postIds.length === 0) return [];
  const [rows, secondary] = await Promise.all([
    tx.employee.findMany({
      where: { ...HOLDER_WHERE, orgPostId: { in: postIds } },
      select: { companyId: true },
      distinct: ["companyId"],
    }),
    tx.employeeSecondaryPost.findMany({
      where: { ...SECONDARY_WHERE, orgPostId: { in: postIds } },
      select: { employee: { select: { companyId: true } } },
    }),
  ]);
  return [
    ...new Set([...rows.map((r) => r.companyId), ...secondary.map((r) => r.employee.companyId)]),
  ];
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

/** Directory-only snapshot also includes people detached during an edit. */
export function listChartPeople(tx: EmployeeTx) {
  return tx.employee.findMany({
    where: { isActive: true, onboardingStatus: "APPROVED" },
    select: { id: true, fullName: true, companyId: true, managerId: true, orgPostId: true },
    orderBy: { employeeNumber: "asc" },
  });
}

export function findChartPersonNames(tx: EmployeeTx, ids: string[]) {
  return tx.employee.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } });
}

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
  const except = exceptId ? { not: exceptId } : undefined;
  const [primary, secondary] = await Promise.all([
    tx.employee.count({
      where: { ...HOLDER_WHERE, orgPostId: postId, ...(except ? { id: except } : {}) },
    }),
    tx.employeeSecondaryPost.count({
      where: { ...SECONDARY_WHERE, orgPostId: postId, ...(except ? { employeeId: except } : {}) },
    }),
  ]);
  return primary + secondary;
}
