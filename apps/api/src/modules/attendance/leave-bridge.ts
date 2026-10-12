import { getPrisma } from "../../core/db.ts";
import type { Prisma } from "../../generated/prisma/client.ts";
import { toDate, toIso } from "./calendar.service.ts";

// Jembatan baca/tulis untuk modul leave (D-071 §7.3–§7.4): roster kerja/OFF, bentrok absen, dan
// penandaan hari absen berstatus LEAVE saat cuti/izin/sakit disetujui. Diekspor lewat index.ts.

type Tx = Prisma.TransactionClient;

/** Tanda roster per tanggal: WORK (ada shift) / OFF; tanggal tanpa baris roster tidak ada di map. */
export async function rosterMarks(
  employeeId: string,
  from: string,
  to: string,
): Promise<Map<string, "WORK" | "OFF">> {
  const rows = await getPrisma().rosterDay.findMany({
    where: { employeeId, workDate: { gte: toDate(from), lte: toDate(to) } },
    select: { workDate: true, shiftId: true },
  });
  return new Map(rows.map((r) => [toIso(r.workDate), r.shiftId ? "WORK" : "OFF"]));
}

/** Tanggal yang sudah punya absen (masuk/pulang) — tidak boleh diajukan cuti. */
export async function datesWithPunches(employeeId: string, dates: string[]): Promise<string[]> {
  if (dates.length === 0) return [];
  const rows = await getPrisma().attendanceDay.findMany({
    where: {
      employeeId,
      workDate: { in: dates.map(toDate) },
      punches: { some: {} },
    },
    select: { workDate: true },
  });
  return rows.map((r) => toIso(r.workDate)).sort();
}

/** Tandai hari absen LEAVE (dibuat bila belum ada; hari yang sudah berisi absen tidak diubah). */
export async function markLeaveDays(
  tx: Tx,
  input: {
    employeeId: string;
    companyId: string;
    managerEmployeeId: string | null;
    dates: string[];
  },
): Promise<number> {
  let marked = 0;
  for (const date of input.dates) {
    const workDate = toDate(date);
    const existing = await tx.attendanceDay.findUnique({
      where: { employeeId_workDate: { employeeId: input.employeeId, workDate } },
      include: { punches: { select: { id: true } } },
    });
    if (existing && existing.punches.length > 0) continue;
    if (existing) {
      await tx.attendanceDay.update({ where: { id: existing.id }, data: { status: "LEAVE" } });
    } else {
      await tx.attendanceDay.create({
        data: {
          employeeId: input.employeeId,
          companyId: input.companyId,
          managerEmployeeId: input.managerEmployeeId,
          workDate,
          status: "LEAVE",
          labels: [],
        },
      });
    }
    marked++;
  }
  return marked;
}

/** Karyawan dijadwalkan kerja di roster pada `date` tetapi tanpa hari absen sama sekali. */
export async function rosteredWithoutAttendance(date: string): Promise<string[]> {
  const workDate = toDate(date);
  const [rostered, present] = await Promise.all([
    getPrisma().rosterDay.findMany({
      where: { workDate, shiftId: { not: null } },
      select: { employeeId: true },
    }),
    getPrisma().attendanceDay.findMany({ where: { workDate }, select: { employeeId: true } }),
  ]);
  const seen = new Set(present.map((p) => p.employeeId));
  return rostered.map((r) => r.employeeId).filter((id) => !seen.has(id));
}
