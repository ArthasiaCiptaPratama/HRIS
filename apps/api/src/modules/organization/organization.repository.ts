import type { EmploymentCategory, OrgUnitType, PositionLevel } from "@hris/shared";
import { getPrisma } from "../../core/db.ts";
import type { Prisma } from "../../generated/prisma/client.ts";

export type OrganizationTx = Prisma.TransactionClient;

// Satu-satunya tempat query Prisma ke tabel skema organization (PROMPT §4).
// Master data kecil (puluhan baris) → dibaca utuh dalam satu transaksi baca.

export async function loadMasterData() {
  const prisma = getPrisma();
  const [departments, positions, statuses, grades, locations, companies] =
    await prisma.$transaction([
      prisma.department.findMany({
        select: {
          id: true,
          name: true,
          parentId: true,
          unitType: true,
          companyId: true,
          deletedAt: true,
        },
        orderBy: { name: "asc" },
      }),
      prisma.position.findMany({
        select: { id: true, name: true, departmentId: true, level: true, deletedAt: true },
        orderBy: { name: "asc" },
      }),
      prisma.employmentStatus.findMany({
        select: { id: true, name: true, category: true, deletedAt: true },
        orderBy: { name: "asc" },
      }),
      prisma.grade.findMany({
        select: { id: true, name: true, deletedAt: true },
        orderBy: { name: "asc" },
      }),
      prisma.workLocation.findMany({
        select: { id: true, name: true, city: true, deletedAt: true },
        orderBy: { name: "asc" },
      }),
      // D-039: perusahaan dalam grup; nonaktif diperlakukan seperti dihapus untuk pilihan baru.
      prisma.company.findMany({
        select: { id: true, code: true, name: true, isActive: true, deletedAt: true },
        orderBy: { code: "asc" },
      }),
    ]);
  return { departments, positions, statuses, grades, locations, companies };
}

// ── D-042: master data baru dari import (dalam transaksi pemanggil) ───────────

export async function createDepartment(
  tx: OrganizationTx,
  name: string,
  placement: { parentId: string; companyId: string | null } | null = null,
) {
  return tx.department.create({
    data: { name, ...(placement ?? {}) },
    select: { id: true, name: true },
  });
}

export async function createPosition(tx: OrganizationTx, departmentId: string, name: string) {
  return tx.position.create({
    data: { name, departmentId },
    select: { id: true, name: true, departmentId: true },
  });
}

export async function createGrade(tx: OrganizationTx, name: string) {
  return tx.grade.create({ data: { name }, select: { id: true, name: true } });
}

export async function createWorkLocation(tx: OrganizationTx, name: string) {
  return tx.workLocation.create({ data: { name }, select: { id: true, name: true } });
}

// ── D-049: kelola master data (SUPER_ADMIN) ─────────────────────────────────────

export function withTransaction<T>(fn: (tx: OrganizationTx) => Promise<T>): Promise<T> {
  return getPrisma().$transaction(fn);
}

const ADMIN_SELECT = { id: true, name: true, deletedAt: true, createdAt: true } as const;

/** Semua baris (aktif & arsip) untuk halaman admin; tabel kecil → tanpa paginasi. */
export async function listAdminRows() {
  const prisma = getPrisma();
  const [companies, departments, positions, statuses, grades, locations] =
    await prisma.$transaction([
      prisma.company.findMany({
        select: { ...ADMIN_SELECT, code: true, npwpNumber: true, address: true },
        orderBy: { code: "asc" },
      }),
      prisma.department.findMany({
        select: { ...ADMIN_SELECT, parentId: true, unitType: true, companyId: true },
        orderBy: { name: "asc" },
      }),
      prisma.position.findMany({
        select: { ...ADMIN_SELECT, departmentId: true, level: true },
        orderBy: { name: "asc" },
      }),
      prisma.employmentStatus.findMany({
        select: { ...ADMIN_SELECT, category: true },
        orderBy: { name: "asc" },
      }),
      prisma.grade.findMany({ select: ADMIN_SELECT, orderBy: { name: "asc" } }),
      prisma.workLocation.findMany({
        select: {
          ...ADMIN_SELECT,
          city: true,
          address: true,
          latitude: true,
          longitude: true,
          radiusM: true,
        },
        orderBy: { name: "asc" },
      }),
    ]);
  return { companies, departments, positions, statuses, grades, locations };
}
export type AdminRows = Awaited<ReturnType<typeof listAdminRows>>;

export interface CompanyData {
  code: string;
  name: string;
  npwpNumber: string | null;
  address: string | null;
}
export interface WorkLocationData {
  name: string;
  city: string | null;
  address: string | null;
  latitude: Prisma.Decimal | null;
  longitude: Prisma.Decimal | null;
  radiusM: number | null;
}

export const companyRepo = {
  create: (tx: OrganizationTx, data: CompanyData) =>
    tx.company.create({ data, select: { id: true } }),
  update: (tx: OrganizationTx, id: string, data: Partial<CompanyData>) =>
    tx.company.update({ where: { id }, data, select: { id: true } }),
};

export const departmentRepo = {
  create: (
    tx: OrganizationTx,
    data: {
      name: string;
      parentId: string | null;
      unitType: OrgUnitType;
      companyId: string | null;
    },
  ) => tx.department.create({ data, select: { id: true } }),
  update: (
    tx: OrganizationTx,
    id: string,
    data: {
      name?: string;
      parentId?: string | null;
      unitType?: OrgUnitType;
      companyId?: string | null;
    },
  ) => tx.department.update({ where: { id }, data, select: { id: true } }),
  /** Pindahkan sub-departemen ke induk lain (gabungkan departemen). */
  reparentChildren: (tx: OrganizationTx, fromId: string, toId: string) =>
    tx.department.updateMany({ where: { parentId: fromId }, data: { parentId: toId } }),
};

export const positionRepo = {
  create: (
    tx: OrganizationTx,
    data: { name: string; departmentId: string; level: PositionLevel | null },
  ) => tx.position.create({ data, select: { id: true } }),
  update: (
    tx: OrganizationTx,
    id: string,
    data: { name?: string; departmentId?: string; level?: PositionLevel | null },
  ) => tx.position.update({ where: { id }, data, select: { id: true } }),
};

export const statusRepo = {
  create: (tx: OrganizationTx, data: { name: string; category: EmploymentCategory | null }) =>
    tx.employmentStatus.create({ data, select: { id: true } }),
  update: (
    tx: OrganizationTx,
    id: string,
    data: { name?: string; category?: EmploymentCategory | null },
  ) => tx.employmentStatus.update({ where: { id }, data, select: { id: true } }),
};

export const gradeRepo = {
  create: (tx: OrganizationTx, data: { name: string }) =>
    tx.grade.create({ data, select: { id: true } }),
  update: (tx: OrganizationTx, id: string, data: { name?: string }) =>
    tx.grade.update({ where: { id }, data, select: { id: true } }),
};

export const workLocationRepo = {
  create: (tx: OrganizationTx, data: WorkLocationData) =>
    tx.workLocation.create({ data, select: { id: true } }),
  update: (tx: OrganizationTx, id: string, data: Partial<WorkLocationData>) =>
    tx.workLocation.update({ where: { id }, data, select: { id: true } }),
};

export type ArchivableEntity =
  | "company"
  | "department"
  | "position"
  | "employmentStatus"
  | "grade"
  | "workLocation";

/** Arsip (deletedAt diisi) / pulihkan (null). */
export async function setArchived(
  tx: OrganizationTx,
  entity: ArchivableEntity,
  id: string,
  at: Date | null,
) {
  const data = { deletedAt: at };
  switch (entity) {
    case "company":
      return tx.company.update({ where: { id }, data, select: { id: true } });
    case "department":
      return tx.department.update({ where: { id }, data, select: { id: true } });
    case "position":
      return tx.position.update({ where: { id }, data, select: { id: true } });
    case "employmentStatus":
      return tx.employmentStatus.update({ where: { id }, data, select: { id: true } });
    case "grade":
      return tx.grade.update({ where: { id }, data, select: { id: true } });
    case "workLocation":
      return tx.workLocation.update({ where: { id }, data, select: { id: true } });
  }
}

/** Hapus permanen; FK `ON DELETE RESTRICT` menolak bila masih dirujuk data mana pun (P2003). */
export async function hardDelete(tx: OrganizationTx, entity: ArchivableEntity, id: string) {
  const where = { id };
  switch (entity) {
    case "company":
      return tx.company.delete({ where, select: { id: true } });
    case "department":
      return tx.department.delete({ where, select: { id: true } });
    case "position":
      return tx.position.delete({ where, select: { id: true } });
    case "employmentStatus":
      return tx.employmentStatus.delete({ where, select: { id: true } });
    case "grade":
      return tx.grade.delete({ where, select: { id: true } });
    case "workLocation":
      return tx.workLocation.delete({ where, select: { id: true } });
  }
}

// ── D-051: pos jabatan ─────────────────────────────────────────────────────────

const POST_SELECT = {
  id: true,
  code: true,
  positionId: true,
  reportsToId: true,
  functionalReportsToId: true,
  headcount: true,
  sortOrder: true,
  deletedAt: true,
  position: {
    select: {
      name: true,
      level: true,
      deletedAt: true,
      departmentId: true,
      department: {
        select: { name: true, unitType: true, companyId: true, parentId: true, deletedAt: true },
      },
    },
  },
} as const;

/** Semua pos (aktif & arsip) beserta jabatan & unitnya; tabel kecil (ratusan baris) → tanpa paginasi. */
export function listPostRows(tx?: OrganizationTx) {
  return (tx ?? getPrisma()).orgPost.findMany({
    select: POST_SELECT,
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
}
export type PostRow = Awaited<ReturnType<typeof listPostRows>>[number];

export interface PostData {
  code?: string | null;
  positionId?: string;
  reportsToId?: string | null;
  functionalReportsToId?: string | null;
  headcount?: number;
  sortOrder?: number;
}

export const postRepo = {
  create: (tx: OrganizationTx, data: PostData & { positionId: string }) =>
    tx.orgPost.create({ data, select: { id: true } }),
  update: (tx: OrganizationTx, id: string, data: PostData) =>
    tx.orgPost.update({ where: { id }, data, select: { id: true } }),
  setArchived: (tx: OrganizationTx, id: string, at: Date | null) =>
    tx.orgPost.update({ where: { id }, data: { deletedAt: at }, select: { id: true } }),
  delete: (tx: OrganizationTx, id: string) =>
    tx.orgPost.delete({ where: { id }, select: { id: true } }),
};
