import { getPrisma } from "../../core/db.ts";
import type { OvertimeStatus, Prisma } from "../../generated/prisma/client.ts";

// Query lembur (TM-D6), upah grade, lokasi wajib istirahat (TM-D7), & fakta dashboard (DSB-D1).
// Hanya tabel skema attendance; data karyawan/organisasi lewat directory.ts.

export type Tx = Prisma.TransactionClient;
const db = (tx?: Tx) => tx ?? getPrisma();
type Range = { gte: Date; lte: Date };

// ── Pengaturan ─────────────────────────────────────────────────────────────────
export const findSetting = (key: string, tx?: Tx) =>
  db(tx).timeSetting.findUnique({ where: { key } });
export const upsertSetting = (key: string, value: Prisma.InputJsonValue, accountId: string) =>
  getPrisma().timeSetting.upsert({
    where: { key },
    create: { key, value, updatedByAccountId: accountId },
    update: { value, updatedByAccountId: accountId },
  });

// ── Upah grade ─────────────────────────────────────────────────────────────────
export const listGradeWageRows = () => getPrisma().gradeWage.findMany();
export const findGradeWage = (gradeId: string) =>
  getPrisma().gradeWage.findUnique({ where: { gradeId } });
export const gradeWagesByIds = (gradeIds: string[]) =>
  getPrisma().gradeWage.findMany({ where: { gradeId: { in: gradeIds } } });
export const upsertGradeWage = (
  gradeId: string,
  data: { basePay: number; fixedAllowance: number },
  accountId: string,
) =>
  getPrisma().gradeWage.upsert({
    where: { gradeId },
    create: { gradeId, ...data, updatedByAccountId: accountId },
    update: { ...data, updatedByAccountId: accountId },
  });

// ── Roster, shift, crew, tanggal merah ─────────────────────────────────────────
/** Hari roster ber-crew terakhir s.d. `date`. */
export const lastCrewDay = (employeeId: string, date: Date) =>
  getPrisma().rosterDay.findFirst({
    where: { employeeId, workDate: { lte: date }, crewId: { not: null } },
    orderBy: { workDate: "desc" },
    select: { crewId: true },
  });
export const crewWithPattern = (id: string) =>
  getPrisma().crew.findUnique({
    where: { id },
    include: { pattern: { select: { steps: true } } },
  });
export const crewsWithPattern = (ids: string[], tx?: Tx) =>
  db(tx).crew.findMany({
    where: { id: { in: ids } },
    include: { pattern: { select: { steps: true } } },
  });
export const shiftsByIds = (ids: string[], tx?: Tx) =>
  db(tx).shift.findMany({ where: { id: { in: ids } } });
export const nationalHolidays = (range: Range, tx?: Tx) =>
  db(tx).holiday.findMany({ where: { kind: "NATIONAL", date: range } });
export const crewDaysOf = (keys: { employeeId: string; workDate: Date }[], tx?: Tx) =>
  db(tx).rosterDay.findMany({
    where: { OR: keys, crewId: { not: null } },
    select: { employeeId: true, workDate: true, crewId: true },
  });
/** Hari roster ber-shift (jadwal) per karyawan dalam rentang. */
export const scheduledRosterDays = (employeeIds: string[], range: Range) =>
  getPrisma().rosterDay.findMany({
    where: { employeeId: { in: employeeIds }, workDate: range, shiftId: { not: null } },
    include: { shift: true },
  });
/** Hari roster ber-crew, terbaru dulu (rumus pola per karyawan). */
export const crewRosterDays = (employeeIds: string[], range: Range) =>
  getPrisma().rosterDay.findMany({
    where: { employeeId: { in: employeeIds }, workDate: range, crewId: { not: null } },
    orderBy: { workDate: "desc" },
    select: { employeeId: true, crewId: true },
  });

// ── Hari absen ─────────────────────────────────────────────────────────────────
export const findDayWithPunches = (tx: Tx, id: string) =>
  tx.attendanceDay.findUnique({ where: { id }, include: { punches: true } });
export const daysWithPunches = (where: Prisma.AttendanceDayWhereInput, tx?: Tx) =>
  db(tx).attendanceDay.findMany({ where, include: { punches: true } });
export const daysWithPunchTimes = (ids: string[]) =>
  getPrisma().attendanceDay.findMany({
    where: { id: { in: ids } },
    include: { punches: { select: { kind: true, at: true } } },
  });
export const setDayLabels = (tx: Tx, id: string, labels: string[]) =>
  tx.attendanceDay.update({ where: { id }, data: { labels } });

// ── Usulan lembur ──────────────────────────────────────────────────────────────
export const findOvertimeByDay = (tx: Tx, dayId: string) =>
  tx.overtimeRequest.findUnique({ where: { dayId } });
export const findOvertime = (tx: Tx, id: string) =>
  tx.overtimeRequest.findUnique({ where: { id } });
export const overtimeOfDays = (tx: Tx, dayIds: string[], statuses: OvertimeStatus[]) =>
  tx.overtimeRequest.findMany({ where: { dayId: { in: dayIds }, status: { in: statuses } } });
export const createOvertime = (tx: Tx, data: Prisma.OvertimeRequestUncheckedCreateInput) =>
  tx.overtimeRequest.create({ data });
export const deleteOvertime = (tx: Tx, id: string) => tx.overtimeRequest.delete({ where: { id } });
export const decideOvertime = (
  tx: Tx,
  id: string,
  data: { status: OvertimeStatus; decidedAt: Date | null },
) => tx.overtimeRequest.update({ where: { id }, data });
export const listOvertimeRows = (where: Prisma.OvertimeRequestWhereInput, take = 1000) =>
  getPrisma().overtimeRequest.findMany({
    where,
    orderBy: [{ workDate: "desc" }, { createdAt: "asc" }],
    take,
  });
export const overtimeRows = (where: Prisma.OvertimeRequestWhereInput) =>
  getPrisma().overtimeRequest.findMany({ where });
export const approvedOvertimeTotals = (employeeIds: string[], range: Range) =>
  getPrisma().overtimeRequest.findMany({
    where: { employeeId: { in: employeeIds }, workDate: range, status: "APPROVED" },
    select: { employeeId: true, proposedMin: true, equivalentHours: true },
  });

export const withTransaction = <T>(run: (tx: Tx) => Promise<T>) => getPrisma().$transaction(run);
