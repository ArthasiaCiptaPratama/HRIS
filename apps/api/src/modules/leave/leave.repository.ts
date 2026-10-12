import { getPrisma } from "../../core/db.ts";
import type { LeaveLedgerKind, Prisma } from "../../generated/prisma/client.ts";

// Query skema leave (D-071). Tidak menyentuh tabel modul lain.
export type LeaveTx = Prisma.TransactionClient;
const db = (tx?: LeaveTx) => tx ?? getPrisma();

// ── Jenis & Master Cuti ────────────────────────────────────────────────────────
export const listTypes = () =>
  getPrisma().leaveType.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
export const findType = (id: string) => getPrisma().leaveType.findUnique({ where: { id } });
export const createTypes = (data: Prisma.LeaveTypeCreateManyInput[]) =>
  getPrisma().leaveType.createMany({ data, skipDuplicates: true });
export const createType = (data: Prisma.LeaveTypeCreateInput) =>
  getPrisma().leaveType.create({ data });
export const updateType = (id: string, data: Prisma.LeaveTypeUpdateInput) =>
  getPrisma().leaveType.update({ where: { id }, data });

export const listYears = () => getPrisma().leaveYear.findMany({ orderBy: { year: "desc" } });
export const findYear = (year: number, tx?: LeaveTx) =>
  db(tx).leaveYear.findUnique({ where: { year } });
export const upsertYear = (year: number, data: { quota: number; isActive: boolean }) =>
  getPrisma().leaveYear.upsert({ where: { year }, create: { year, ...data }, update: data });
export const markYear = (
  year: number,
  data: { grantedAt?: Date; settledAt?: Date; expiredAt?: Date },
) => getPrisma().leaveYear.update({ where: { year }, data });

// ── Buku besar ─────────────────────────────────────────────────────────────────
export const ledgerOf = (employeeId: string, years: number[]) =>
  getPrisma().leaveLedger.findMany({
    where: { employeeId, year: { in: years } },
    orderBy: { createdAt: "desc" },
  });

/** Saldo per (karyawan, tahun) = jumlah `days`. */
export async function balances(
  employeeIds: string[],
  years: number[],
  tx?: LeaveTx,
): Promise<Map<string, number>> {
  if (employeeIds.length === 0) return new Map();
  const rows = await db(tx).leaveLedger.groupBy({
    by: ["employeeId", "year"],
    where: { employeeId: { in: employeeIds }, year: { in: years } },
    _sum: { days: true },
  });
  return new Map(rows.map((r) => [`${r.employeeId}|${r.year}`, r._sum.days ?? 0]));
}

/** Jumlah per (karyawan, jenis) pada satu tahun — untuk tabel saldo per PT. */
export const sumsByKind = (employeeIds: string[], year: number) =>
  getPrisma().leaveLedger.groupBy({
    by: ["employeeId", "kind"],
    where: { employeeId: { in: employeeIds }, year },
    _sum: { days: true },
  });

/** Karyawan yang punya baris buku besar pada tahun (untuk pelunasan/hangus). */
export const employeesWithLedger = (year: number) =>
  getPrisma().leaveLedger.groupBy({
    by: ["employeeId", "companyId"],
    where: { year },
    _sum: { days: true },
  });

export const hasEntry = (where: Prisma.LeaveLedgerWhereInput, tx?: LeaveTx) =>
  db(tx)
    .leaveLedger.count({ where })
    .then((n) => n > 0);

export const addEntries = (tx: LeaveTx, data: Prisma.LeaveLedgerCreateManyInput[]) =>
  data.length ? tx.leaveLedger.createMany({ data }) : Promise.resolve({ count: 0 });

/** Tahanan per tahun milik satu pengajuan (HOLD + RELEASE ≠ 0 = masih ditahan). */
export async function heldByYear(tx: LeaveTx, requestId: string): Promise<Map<number, number>> {
  const rows = await tx.leaveLedger.groupBy({
    by: ["year"],
    where: { requestId, kind: { in: ["HOLD", "RELEASE"] satisfies LeaveLedgerKind[] } },
    _sum: { days: true },
  });
  return new Map(rows.map((r) => [r.year, -(r._sum.days ?? 0)]));
}

// ── Pengajuan ──────────────────────────────────────────────────────────────────
const withType = { type: true } satisfies Prisma.LeaveRequestInclude;
export type RequestRow = Prisma.LeaveRequestGetPayload<{ include: typeof withType }>;

export const findRequest = (id: string, tx?: LeaveTx) =>
  db(tx).leaveRequest.findUnique({ where: { id }, include: withType });
export const requestsByIds = (ids: string[]) =>
  getPrisma().leaveRequest.findMany({
    where: { id: { in: ids } },
    include: withType,
    orderBy: { startDate: "desc" },
  });
export const listRequests = (where: Prisma.LeaveRequestWhereInput, take = 300) =>
  getPrisma().leaveRequest.findMany({
    where,
    include: withType,
    orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
    take,
  });
export const createRequest = (tx: LeaveTx, data: Prisma.LeaveRequestUncheckedCreateInput) =>
  tx.leaveRequest.create({ data, include: withType });
export const updateRequest = (tx: LeaveTx, id: string, data: Prisma.LeaveRequestUpdateInput) =>
  tx.leaveRequest.update({ where: { id }, data, include: withType });

/** Pengajuan aktif (menunggu/disetujui) yang beririsan dengan rentang. */
export const overlapping = (employeeId: string, from: Date, to: Date) =>
  getPrisma().leaveRequest.findMany({
    where: {
      employeeId,
      status: { in: ["PENDING", "APPROVED"] },
      startDate: { lte: to },
      endDate: { gte: from },
    },
    select: { id: true, startDate: true, endDate: true },
  });

export async function withTransaction<T>(run: (tx: LeaveTx) => Promise<T>): Promise<T> {
  return getPrisma().$transaction(run);
}
