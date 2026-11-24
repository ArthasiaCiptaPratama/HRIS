import { getPrisma } from "../../core/db.ts";
import type { Prisma } from "../../generated/prisma/client.ts";

// Query hari absen & absen masuk/pulang (skema attendance) — Tahap C/D.
export type AttendanceTx = Prisma.TransactionClient;
const db = (tx?: AttendanceTx) => tx ?? getPrisma();

const withPunches = { punches: { orderBy: { kind: "asc" } } } satisfies Prisma.AttendanceDayInclude;
export type DayRow = Prisma.AttendanceDayGetPayload<{ include: typeof withPunches }>;

export const findDay = (employeeId: string, workDate: Date, tx?: AttendanceTx) =>
  db(tx).attendanceDay.findUnique({
    where: { employeeId_workDate: { employeeId, workDate } },
    include: withPunches,
  });

export const findDayById = (id: string, tx?: AttendanceTx) =>
  db(tx).attendanceDay.findUnique({ where: { id }, include: withPunches });

/** MOB-D7: punch dengan kunci idempotensi dari klien (retry setelah respons hilang). */
export const findPunchByIdempotencyKey = (key: string) =>
  getPrisma().attendancePunch.findUnique({
    where: { idempotencyKey: key },
    select: { id: true, day: { select: { id: true, employeeId: true } } },
  });

/** Hari OPEN (sudah masuk, belum pulang) terbaru milik karyawan. */
export const findOpenDay = (employeeId: string) =>
  getPrisma().attendanceDay.findFirst({
    where: { employeeId, status: "OPEN" },
    orderBy: { workDate: "desc" },
    include: withPunches,
  });

export const createDayWithPunch = (
  tx: AttendanceTx,
  day: Omit<Prisma.AttendanceDayUncheckedCreateInput, "punches">,
  punch: Omit<Prisma.AttendancePunchUncheckedCreateInput, "dayId">,
) =>
  tx.attendanceDay.create({
    data: { ...day, punches: { create: [punch] } },
    include: withPunches,
  });

export const addPunch = (tx: AttendanceTx, punch: Prisma.AttendancePunchUncheckedCreateInput) =>
  tx.attendancePunch.create({ data: punch });

export const updateDay = (
  tx: AttendanceTx,
  id: string,
  data: Prisma.AttendanceDayUncheckedUpdateInput,
) => tx.attendanceDay.update({ where: { id }, data, include: withPunches });

export const daysOfEmployee = (employeeId: string, from: Date, to: Date) =>
  getPrisma().attendanceDay.findMany({
    where: { employeeId, workDate: { gte: from, lte: to } },
    include: withPunches,
    orderBy: { workDate: "desc" },
  });

export const listDays = (where: Prisma.AttendanceDayWhereInput, take = 500) =>
  getPrisma().attendanceDay.findMany({
    where,
    include: withPunches,
    orderBy: [{ workDate: "desc" }, { createdAt: "asc" }],
    take,
  });

export const daysByIds = (ids: string[]) =>
  getPrisma().attendanceDay.findMany({ where: { id: { in: ids } }, include: withPunches });

/** Hari OPEN yang lewat batas absen pulang (cron attendance-no-checkout). */
/** TM-D26: jumlah absen pulang di luar lokasi kantor (label OUTSIDE_RADIUS) pada rentang tanggal kerja. */
export const countOutsideCheckOuts = (
  employeeId: string,
  from: Date,
  to: Date,
  tx?: AttendanceTx,
) =>
  db(tx).attendancePunch.count({
    where: {
      kind: "OUT",
      labels: { has: "OUTSIDE_RADIUS" },
      day: { employeeId, workDate: { gte: from, lte: to } },
    },
  });

export const overdueOpenDays = (now: Date, employeeIds?: string[]) =>
  getPrisma().attendanceDay.findMany({
    where: {
      status: "OPEN",
      ...(employeeIds ? { employeeId: { in: employeeIds } } : {}),
      OR: [
        { checkOutDeadline: { lt: now } },
        // Tanpa jadwal (di luar roster): batas 24 jam setelah absen masuk.
        { checkOutDeadline: null, createdAt: { lt: new Date(now.getTime() - 24 * 3600_000) } },
      ],
    },
    include: withPunches,
  });

/** Hari absen yang mengunci roster (sudah disetujui) pada rentang. */
export const lockingDays = (employeeIds: string[], from: Date, to: Date, tx?: AttendanceTx) =>
  db(tx).attendanceDay.findMany({
    where: {
      employeeId: { in: employeeIds },
      workDate: { gte: from, lte: to },
      status: "APPROVED",
    },
    select: { employeeId: true, workDate: true },
  });

/** Hari pemilik absen-absen (inbox persetujuan per absen, D-073). */
export const dayIdsOfPunches = async (punchIds: string[]) =>
  punchIds.length === 0
    ? []
    : (
        await getPrisma().attendancePunch.findMany({
          where: { id: { in: punchIds } },
          select: { dayId: true },
        })
      ).map((p) => p.dayId);

export const findPunch = (id: string) =>
  getPrisma().attendancePunch.findUnique({ where: { id }, include: { day: true } });

/** Selfie yang melewati masa simpan dan belum dihapus. */
export const expiredSelfies = (before: Date, employeeIds?: string[], take = 500) =>
  getPrisma().attendancePunch.findMany({
    where: {
      at: { lt: before },
      selfiePurgedAt: null,
      selfiePath: { not: null },
      ...(employeeIds ? { day: { employeeId: { in: employeeIds } } } : {}),
    },
    select: { id: true, selfiePath: true },
    take,
  });

export const markSelfiesPurged = (ids: string[], at: Date) =>
  getPrisma().attendancePunch.updateMany({
    where: { id: { in: ids } },
    data: { selfiePurgedAt: at },
  });

export async function withTransactionDay<T>(run: (tx: AttendanceTx) => Promise<T>): Promise<T> {
  return getPrisma().$transaction(run);
}

/** EMP-D8 P1: hanya absen perangkat normal; istirahat, manual, Alpha, dan cuti dikecualikan. */
export function normalPendingPunches(
  filters: { companyId?: string; before?: Date; id?: string; afterId?: string },
  tx?: AttendanceTx,
) {
  return db(tx).attendancePunch.findMany({
    where: {
      ...(filters.id ? { id: filters.id } : filters.afterId ? { id: { gt: filters.afterId } } : {}),
      kind: { in: ["IN", "OUT"] },
      status: "PENDING",
      source: "DEVICE",
      labels: { isEmpty: true },
      day: {
        status: { notIn: ["ALPHA", "LEAVE"] },
        ...(filters.companyId ? { companyId: filters.companyId } : {}),
        ...(filters.before ? { workDate: { lt: filters.before } } : {}),
      },
    },
    select: { id: true, day: { select: { companyId: true, workDate: true } } },
    orderBy: { id: "asc" },
    take: 500,
  });
}
