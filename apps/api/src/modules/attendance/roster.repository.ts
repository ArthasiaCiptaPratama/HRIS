import { getPrisma } from "../../core/db.ts";
import type { Prisma } from "../../generated/prisma/client.ts";

// Query roster (skema attendance) — D-068.
export type AttendanceTx = Prisma.TransactionClient;
const db = (tx?: AttendanceTx) => tx ?? getPrisma();

export async function withTransaction<T>(run: (tx: AttendanceTx) => Promise<T>): Promise<T> {
  return getPrisma().$transaction(run, { timeout: 30_000 });
}

// ── Shift ──
export const listShifts = (companyId: string, includeArchived = false) =>
  getPrisma().shift.findMany({
    where: { companyId, ...(includeArchived ? {} : { deletedAt: null }) },
    orderBy: [{ startMinute: "asc" }, { code: "asc" }],
  });
export const findShift = (id: string) => getPrisma().shift.findUnique({ where: { id } });
export const createShift = (data: Prisma.ShiftUncheckedCreateInput) =>
  getPrisma().shift.create({ data });
export const updateShift = (id: string, data: Prisma.ShiftUncheckedUpdateInput) =>
  getPrisma().shift.update({ where: { id }, data });
export const countShiftUsage = (shiftId: string, fromDate: Date) =>
  getPrisma().rosterDay.count({ where: { shiftId, workDate: { gte: fromDate } } });

// ── Pola ──
export const listPatterns = (companyId: string) =>
  getPrisma().rosterPattern.findMany({
    where: { companyId, deletedAt: null },
    orderBy: { name: "asc" },
    include: { _count: { select: { crews: { where: { deletedAt: null } } } } },
  });
export const findPattern = (id: string) => getPrisma().rosterPattern.findUnique({ where: { id } });
export const createPattern = (data: Prisma.RosterPatternUncheckedCreateInput) =>
  getPrisma().rosterPattern.create({ data });
export const updatePattern = (id: string, data: Prisma.RosterPatternUncheckedUpdateInput) =>
  getPrisma().rosterPattern.update({ where: { id }, data });

// ── Crew ──
const crewInclude = {
  pattern: true,
  members: { orderBy: { startDate: "asc" } },
} satisfies Prisma.CrewInclude;
export type CrewRow = Prisma.CrewGetPayload<{ include: typeof crewInclude }>;

export const listCrews = (where: Prisma.CrewWhereInput) =>
  getPrisma().crew.findMany({
    where: { ...where, deletedAt: null },
    include: crewInclude,
    orderBy: { name: "asc" },
  });
export const findCrew = (id: string, tx?: AttendanceTx) =>
  db(tx).crew.findUnique({ where: { id }, include: crewInclude });
export const createCrew = (data: Prisma.CrewUncheckedCreateInput) =>
  getPrisma().crew.create({ data, include: crewInclude });
export const updateCrew = (id: string, data: Prisma.CrewUncheckedUpdateInput) =>
  getPrisma().crew.update({ where: { id }, data, include: crewInclude });

/** Keanggotaan yang masih berlaku pada/after tanggal (endDate null atau ≥ tanggal) untuk karyawan tertentu. */
export const openMemberships = (tx: AttendanceTx, employeeIds: string[], onDate: Date) =>
  tx.crewMember.findMany({
    where: {
      employeeId: { in: employeeIds },
      OR: [{ endDate: null }, { endDate: { gte: onDate } }],
    },
  });
export const endMembership = (tx: AttendanceTx, id: string, endDate: Date) =>
  tx.crewMember.update({ where: { id }, data: { endDate } });
export const deleteMembership = (tx: AttendanceTx, id: string) =>
  tx.crewMember.delete({ where: { id } });
export const addMembers = (tx: AttendanceTx, rows: Prisma.CrewMemberCreateManyInput[]) =>
  tx.crewMember.createMany({ data: rows });

/** Crew aktif beserta pola & anggota — untuk pembangkit roster harian. */
export const allActiveCrews = () =>
  getPrisma().crew.findMany({ where: { deletedAt: null }, include: crewInclude });

/** Crew tempat karyawan menjadi anggota pada tanggal itu. */
export const crewOfEmployeeOn = (employeeId: string, date: Date) =>
  getPrisma().crewMember.findFirst({
    where: {
      employeeId,
      startDate: { lte: date },
      OR: [{ endDate: null }, { endDate: { gte: date } }],
    },
    include: { crew: true },
  });

// ── Hari roster ──
export const rosterDaysBetween = (employeeIds: string[], from: Date, to: Date, tx?: AttendanceTx) =>
  db(tx).rosterDay.findMany({
    where: { employeeId: { in: employeeIds }, workDate: { gte: from, lte: to } },
    include: { shift: true },
  });

export const rosterDay = (employeeId: string, workDate: Date, tx?: AttendanceTx) =>
  db(tx).rosterDay.findUnique({
    where: { employeeId_workDate: { employeeId, workDate } },
    include: { shift: true },
  });

/** Hapus hari dari pola milik crew pada rentang (dibangkitkan ulang setelahnya). */
export const deletePatternDays = (tx: AttendanceTx, crewId: string, from: Date, to: Date) =>
  tx.rosterDay.deleteMany({
    where: { crewId, source: "PATTERN", workDate: { gte: from, lte: to } },
  });

/** Tambah hari dari pola; hari yang sudah ada (manual/import/perubahan/crew lain) dilewati. */
export const insertDays = (tx: AttendanceTx, rows: Prisma.RosterDayCreateManyInput[]) =>
  tx.rosterDay.createMany({ data: rows, skipDuplicates: true });

export const upsertDay = (
  tx: AttendanceTx,
  employeeId: string,
  workDate: Date,
  data: { shiftId: string | null; source: "MANUAL" | "IMPORT" | "CHANGE"; crewId?: string | null },
) =>
  tx.rosterDay.upsert({
    where: { employeeId_workDate: { employeeId, workDate } },
    create: { employeeId, workDate, ...data },
    update: data,
  });

export const deleteDay = (tx: AttendanceTx, employeeId: string, workDate: Date) =>
  tx.rosterDay.deleteMany({ where: { employeeId, workDate } });

/** Karyawan yang punya hari roster pada rentang (untuk grid PT). */
export const employeesWithDays = async (employeeIds: string[] | null, from: Date, to: Date) => {
  const rows = await getPrisma().rosterDay.findMany({
    where: {
      workDate: { gte: from, lte: to },
      ...(employeeIds ? { employeeId: { in: employeeIds } } : {}),
    },
    select: { employeeId: true },
    distinct: ["employeeId"],
  });
  return rows.map((row) => row.employeeId);
};

// ── Perubahan roster ──
export const createChange = (
  tx: AttendanceTx,
  data: Prisma.RosterChangeRequestUncheckedCreateInput,
) => tx.rosterChangeRequest.create({ data });
export const findChange = (id: string, tx?: AttendanceTx) =>
  db(tx).rosterChangeRequest.findUnique({ where: { id } });
export const updateChange = (
  tx: AttendanceTx,
  id: string,
  data: Prisma.RosterChangeRequestUncheckedUpdateInput,
) => tx.rosterChangeRequest.update({ where: { id }, data });
export const listChanges = (where: Prisma.RosterChangeRequestWhereInput, take = 200) =>
  getPrisma().rosterChangeRequest.findMany({ where, orderBy: { createdAt: "desc" }, take });
export const changesByIds = (ids: string[]) =>
  getPrisma().rosterChangeRequest.findMany({ where: { id: { in: ids } } });
export const shiftsByIds = (ids: string[]) =>
  getPrisma().shift.findMany({ where: { id: { in: ids } } });
