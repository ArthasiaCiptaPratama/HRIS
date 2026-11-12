import { getPrisma } from "../../core/db.ts";
import type { Prisma } from "../../generated/prisma/client.ts";

// Sama dengan employee.repository.EmployeeTx (didefinisikan ulang supaya tanpa impor melingkar).
type EmployeeTx = Prisma.TransactionClient;

// EMP-D6: query riwayat homebase (Point of Hire) per karyawan — tabel employee.employee_homebases.
// Di dalam transaksi interaktif semua query dijalankan berurutan (tanpa Promise.all / include relasi).

const ENTRY_SELECT = {
  id: true,
  employeeId: true,
  homebaseId: true,
  effectiveFrom: true,
  decreeNumber: true,
  note: true,
  changedBy: true,
  createdAt: true,
} as const;

const NEWEST_FIRST = [{ effectiveFrom: "desc" as const }, { createdAt: "desc" as const }];

export type HomebaseEntryRow = Awaited<ReturnType<typeof listEntries>>[number];

/** Riwayat satu karyawan, terbaru dulu (`take` untuk detail yang dipangkas). */
export function listEntries(employeeId: string, take?: number, tx: EmployeeTx = getPrisma()) {
  return tx.employeeHomebase.findMany({
    where: { employeeId },
    select: ENTRY_SELECT,
    orderBy: NEWEST_FIRST,
    ...(take ? { take } : {}),
  });
}

export function findEntry(tx: EmployeeTx, employeeId: string, entryId: string) {
  return tx.employeeHomebase.findFirst({
    where: { id: entryId, employeeId },
    select: ENTRY_SELECT,
  });
}

export function findEntryOnDate(tx: EmployeeTx, employeeId: string, effectiveFrom: Date) {
  return tx.employeeHomebase.findUnique({
    where: { employeeId_effectiveFrom: { employeeId, effectiveFrom } },
    select: ENTRY_SELECT,
  });
}

export function createEntry(
  tx: EmployeeTx,
  data: {
    employeeId: string;
    homebaseId: string;
    effectiveFrom: Date;
    decreeNumber: string | null;
    note: string | null;
    changedBy: string | null;
  },
) {
  return tx.employeeHomebase.create({ data, select: ENTRY_SELECT });
}

export function updateEntry(
  tx: EmployeeTx,
  id: string,
  data: {
    homebaseId?: string;
    effectiveFrom?: Date;
    decreeNumber?: string | null;
    note?: string | null;
  },
) {
  return tx.employeeHomebase.update({ where: { id }, data, select: ENTRY_SELECT });
}

export function deleteEntry(tx: EmployeeTx, id: string) {
  return tx.employeeHomebase.delete({ where: { id }, select: { id: true } });
}

/**
 * Hitung ulang kolom turunan `employees.homebase_id` dari baris dengan `effective_from` terbaru (null bila
 * riwayat kosong). Dipanggil di transaksi yang sama setiap kali riwayat berubah.
 */
export async function syncCurrentHomebase(tx: EmployeeTx, employeeId: string) {
  const latest = await tx.employeeHomebase.findFirst({
    where: { employeeId },
    select: { homebaseId: true },
    orderBy: NEWEST_FIRST,
  });
  const homebaseId = latest?.homebaseId ?? null;
  await tx.employee.update({ where: { id: employeeId }, data: { homebaseId } });
  return homebaseId;
}

/** Baris yang berlaku pada tanggal `on` (effective_from ≤ on), terbaru dulu, untuk banyak karyawan. */
export function listEntriesOnOrBefore(employeeIds: string[], on: Date) {
  return getPrisma().employeeHomebase.findMany({
    where: { employeeId: { in: employeeIds }, effectiveFrom: { lte: on } },
    select: { employeeId: true, homebaseId: true, effectiveFrom: true },
    orderBy: [{ employeeId: "asc" }, ...NEWEST_FIRST],
  });
}

/** Baris terbaru tiap karyawan yang homebase sekarangnya `homebaseId` (teks EMP-D5 saat gabung master). */
export function listLatestEntriesFor(tx: EmployeeTx, employeeIds: string[]) {
  if (employeeIds.length === 0) return Promise.resolve([]);
  return tx.employeeHomebase.findMany({
    where: { employeeId: { in: employeeIds } },
    select: { employeeId: true, homebaseId: true, effectiveFrom: true },
    orderBy: [{ employeeId: "asc" }, ...NEWEST_FIRST],
  });
}
