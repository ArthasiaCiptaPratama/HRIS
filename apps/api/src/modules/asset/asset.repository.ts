import { getPrisma } from "../../core/db.ts";
import type { Prisma } from "../../generated/prisma/client.ts";

// Query Prisma ke tabel modul asset saja (PROMPT §4). Data karyawan/PT dibaca lewat index.ts modul lain.

export type AssetTx = Prisma.TransactionClient;
export const transaction = <T>(fn: (tx: AssetTx) => Promise<T>) =>
  getPrisma().$transaction(fn, { timeout: 20_000 });
const db = (tx?: AssetTx) => tx ?? getPrisma();

// --- Master ---

export const listCategories = () =>
  getPrisma().assetCategory.findMany({ orderBy: [{ isActive: "desc" }, { name: "asc" }] });
export const findCategory = (id: string, tx?: AssetTx) =>
  db(tx).assetCategory.findUnique({ where: { id } });
export const createCategory = (data: Prisma.AssetCategoryCreateInput) =>
  getPrisma().assetCategory.create({ data });
export const updateCategory = (id: string, data: Prisma.AssetCategoryUpdateInput) =>
  getPrisma().assetCategory.update({ where: { id }, data });

export const listPpeTypes = () =>
  getPrisma().ppeType.findMany({ orderBy: [{ isActive: "desc" }, { name: "asc" }] });
export const findPpeType = (id: string, tx?: AssetTx) =>
  db(tx).ppeType.findUnique({ where: { id } });
export const createPpeType = (data: Prisma.PpeTypeCreateInput) =>
  getPrisma().ppeType.create({ data });
export const updatePpeType = (id: string, data: Prisma.PpeTypeUpdateInput) =>
  getPrisma().ppeType.update({ where: { id }, data });

// --- Aset ---

const ASSET_INCLUDE = {
  category: { select: { id: true, code: true, name: true } },
  assignments: { where: { closedAt: null }, take: 1 },
} as const;

export type AssetWithOpen = Prisma.AssetGetPayload<{ include: typeof ASSET_INCLUDE }>;

export interface AssetFilter {
  companyIds: string[] | null;
  /** Hanya aset yang sedang dipegang salah satu karyawan ini (cakupan tim MANAGER / filter pemegang). */
  holderIds: string[] | null;
  q: string | null;
  status: Prisma.EnumAssetStatusFilter["equals"] | null;
  categoryId: string | null;
  workLocationId: string | null;
  overdueBefore: Date | null;
}

function assetWhere(f: AssetFilter): Prisma.AssetWhereInput {
  return {
    ...(f.companyIds ? { companyId: { in: f.companyIds } } : {}),
    ...(f.status ? { status: f.status } : {}),
    ...(f.categoryId ? { categoryId: f.categoryId } : {}),
    ...(f.workLocationId ? { workLocationId: f.workLocationId } : {}),
    ...(f.holderIds || f.overdueBefore
      ? {
          assignments: {
            some: {
              closedAt: null,
              ...(f.holderIds ? { employeeId: { in: f.holderIds } } : {}),
              ...(f.overdueBefore ? { dueBackAt: { lt: f.overdueBefore } } : {}),
            },
          },
        }
      : {}),
    ...(f.q
      ? {
          OR: [
            { code: { contains: f.q, mode: "insensitive" } },
            { name: { contains: f.q, mode: "insensitive" } },
            { serialNumber: { contains: f.q, mode: "insensitive" } },
            { brand: { contains: f.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
}

export async function listAssets(f: AssetFilter, skip: number, take: number) {
  const where = assetWhere(f);
  const [rows, total] = await Promise.all([
    getPrisma().asset.findMany({
      where,
      include: ASSET_INCLUDE,
      orderBy: { code: "asc" },
      skip,
      take,
    }),
    getPrisma().asset.count({ where }),
  ]);
  return { rows, total };
}

export const findAsset = (id: string, tx?: AssetTx) =>
  db(tx).asset.findUnique({ where: { id }, include: ASSET_INCLUDE });
export const createAsset = (tx: AssetTx, data: Prisma.AssetUncheckedCreateInput) =>
  tx.asset.create({ data, include: ASSET_INCLUDE });
export const updateAsset = (tx: AssetTx, id: string, data: Prisma.AssetUncheckedUpdateInput) =>
  tx.asset.update({ where: { id }, data, include: ASSET_INCLUDE });

/** Kode aset berawalan `prefix` (untuk nomor urut berikutnya, ARS-D4). */
export async function codesWithPrefix(prefix: string, tx?: AssetTx) {
  const rows = await db(tx).asset.findMany({
    where: { code: { startsWith: prefix } },
    select: { code: true },
  });
  return rows.map((r) => r.code);
}

// --- Serah-terima ---

export const findAssignment = (id: string, tx?: AssetTx) =>
  db(tx).assetAssignment.findUnique({
    where: { id },
    include: { asset: { include: { category: { select: { id: true, code: true, name: true } } } } },
  });
export type AssignmentWithAsset = NonNullable<Awaited<ReturnType<typeof findAssignment>>>;

export const assignmentsOfAsset = (assetId: string) =>
  getPrisma().assetAssignment.findMany({
    where: { assetId },
    orderBy: [{ assignedAt: "desc" }, { createdAt: "desc" }],
  });

export const createAssignment = (tx: AssetTx, data: Prisma.AssetAssignmentUncheckedCreateInput) =>
  tx.assetAssignment.create({ data });
export const updateAssignment = (
  tx: AssetTx,
  id: string,
  data: Prisma.AssetAssignmentUncheckedUpdateInput,
) => tx.assetAssignment.update({ where: { id }, data });

/** Aset yang pernah/sedang dipegang karyawan-karyawan ini. `openOnly` = belum ditutup. */
export const assignmentsOfEmployees = (employeeIds: string[], openOnly: boolean) =>
  getPrisma().assetAssignment.findMany({
    where: { employeeId: { in: employeeIds }, ...(openOnly ? { closedAt: null } : {}) },
    include: { asset: { include: { category: { select: { id: true, code: true, name: true } } } } },
    orderBy: [{ closedAt: { sort: "desc", nulls: "first" } }, { assignedAt: "desc" }],
  });

/** Semua serah-terima terbuka (cron & daftar belum kembali). */
export const openAssignments = () =>
  getPrisma().assetAssignment.findMany({
    where: { closedAt: null },
    include: { asset: { select: { id: true, code: true, name: true, companyId: true } } },
  });

// --- APD ---

export interface PpeFilter {
  employeeIds: string[] | null;
  ppeTypeId: string | null;
  issuedFrom: Date | null;
  issuedTo: Date | null;
}

export async function listPpeIssues(f: PpeFilter, skip: number, take: number) {
  const where: Prisma.PpeIssueWhereInput = {
    ...(f.employeeIds ? { employeeId: { in: f.employeeIds } } : {}),
    ...(f.ppeTypeId ? { ppeTypeId: f.ppeTypeId } : {}),
    ...(f.issuedFrom || f.issuedTo
      ? {
          issuedAt: {
            ...(f.issuedFrom ? { gte: f.issuedFrom } : {}),
            ...(f.issuedTo ? { lte: f.issuedTo } : {}),
          },
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    getPrisma().ppeIssue.findMany({
      where,
      include: { ppeType: true },
      orderBy: [{ issuedAt: "desc" }, { createdAt: "desc" }],
      skip,
      take,
    }),
    getPrisma().ppeIssue.count({ where }),
  ]);
  return { rows, total };
}

export const findPpeIssue = (id: string, tx?: AssetTx) =>
  db(tx).ppeIssue.findUnique({ where: { id }, include: { ppeType: true } });
export type PpeIssueWithType = NonNullable<Awaited<ReturnType<typeof findPpeIssue>>>;
export const createPpeIssue = (tx: AssetTx, data: Prisma.PpeIssueUncheckedCreateInput) =>
  tx.ppeIssue.create({ data, include: { ppeType: true } });
export const updatePpeIssue = (
  tx: AssetTx,
  id: string,
  data: Prisma.PpeIssueUncheckedUpdateInput,
) => tx.ppeIssue.update({ where: { id }, data, include: { ppeType: true } });
export const deletePpeIssue = (tx: AssetTx, id: string) => tx.ppeIssue.delete({ where: { id } });

export const ppeIssuesOfEmployees = (employeeIds: string[]) =>
  getPrisma().ppeIssue.findMany({
    where: { employeeId: { in: employeeIds } },
    include: { ppeType: true },
    orderBy: [{ issuedAt: "desc" }, { createdAt: "desc" }],
  });

/** APD wajib kembali yang belum dikembalikan (ARS-D6). */
export const unreturnedMustReturnPpe = (employeeIds: string[] | null) =>
  getPrisma().ppeIssue.findMany({
    where: {
      returnedAt: null,
      ppeType: { mustReturn: true },
      ...(employeeIds ? { employeeId: { in: employeeIds } } : {}),
    },
    include: { ppeType: true },
  });

/** Pembagian terakhir per (karyawan, jenis) untuk jenis bermasa ganti (cron ARS-D5). */
export const ppeIssuesWithReplacement = () =>
  getPrisma().ppeIssue.findMany({
    where: { ppeType: { replaceAfterMonths: { not: null }, isActive: true } },
    include: { ppeType: true },
    orderBy: [{ issuedAt: "desc" }, { createdAt: "desc" }],
  });

// --- Update bersyarat (audit F2): aturan status dicek atomik di baris yang diubah, bukan dari
// pembacaan sebelumnya, supaya dua aksi bersamaan tidak sama-sama lolos. Hasil = jumlah baris (0/1).

/** Tutup serah-terima hanya bila masih terbuka. */
export const closeAssignmentIfOpen = (
  tx: AssetTx,
  id: string,
  data: Prisma.AssetAssignmentUncheckedUpdateManyInput,
) => tx.assetAssignment.updateMany({ where: { id, closedAt: null }, data }).then((r) => r.count);

/** Konfirmasi terima hanya sekali dan selama masih terbuka. */
export const acknowledgeAssignmentIfPending = (tx: AssetTx, id: string, at: Date) =>
  tx.assetAssignment
    .updateMany({
      where: { id, closedAt: null, acknowledgedAt: null },
      data: { acknowledgedAt: at },
    })
    .then((r) => r.count);

/** Ubah status aset hanya bila statusnya masih `from` (atau bukan ASSIGNED bila `from` null). */
export const setAssetStatusIf = (
  tx: AssetTx,
  id: string,
  from: Prisma.EnumAssetStatusFilter["equals"] | null,
  data: Prisma.AssetUncheckedUpdateManyInput,
) =>
  tx.asset
    .updateMany({ where: { id, status: from ?? { not: "ASSIGNED" } }, data })
    .then((r) => r.count);

export const returnPpeIfOpen = (
  tx: AssetTx,
  id: string,
  data: Prisma.PpeIssueUncheckedUpdateManyInput,
) => tx.ppeIssue.updateMany({ where: { id, returnedAt: null }, data }).then((r) => r.count);

export const acknowledgePpeIfPending = (tx: AssetTx, id: string, at: Date) =>
  tx.ppeIssue
    .updateMany({ where: { id, acknowledgedAt: null }, data: { acknowledgedAt: at } })
    .then((r) => r.count);

/** Hapus pembagian hanya bila belum dikonfirmasi & tanpa BAST. */
export const deletePpeIfUnconfirmed = (tx: AssetTx, id: string) =>
  tx.ppeIssue
    .deleteMany({ where: { id, acknowledgedAt: null, handoverDocumentId: null } })
    .then((r) => r.count);
