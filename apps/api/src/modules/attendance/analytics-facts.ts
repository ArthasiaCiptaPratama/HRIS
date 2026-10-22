import { formulaForPattern, type OvertimeFormula } from "@hris/shared";
import * as repository from "./overtime.repository.ts";
import { calcDay, loadCalcContext, wagesOfGrades } from "./overtime.service.ts";

// DSB-D1: fakta absensi & lembur agregat per karyawan untuk dashboard (baca-saja, tanpa aktor —
// cakupan & gerbang rupiah di modul analytics).

export interface AttendanceFactsRow {
  /** Hari kerja roster (shift) di luar hari cuti. */
  workDays: number;
  scheduledMin: number;
  presentDays: number;
  workedMin: number;
  lateDays: number;
  alphaDays: number;
  /** Lembur rutin (hari disetujui) + lembur tambahan yang disetujui. */
  overtimeMin: number;
  overtimeEquivalentHours: number;
}

const MIN = 60_000;

export async function attendanceFacts(
  employeeIds: string[],
  from: string,
  to: string,
): Promise<Map<string, AttendanceFactsRow>> {
  const out = new Map<string, AttendanceFactsRow>();
  if (employeeIds.length === 0) return out;
  const range = { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) };
  const [roster, days, overtime] = await Promise.all([
    repository.scheduledRosterDays(employeeIds, range),
    repository.daysWithPunches({ employeeId: { in: employeeIds }, workDate: range }),
    repository.approvedOvertimeTotals(employeeIds, range),
  ]);
  const row = (id: string) => {
    let r = out.get(id);
    if (!r) {
      r = {
        workDays: 0,
        scheduledMin: 0,
        presentDays: 0,
        workedMin: 0,
        lateDays: 0,
        alphaDays: 0,
        overtimeMin: 0,
        overtimeEquivalentHours: 0,
      };
      out.set(id, r);
    }
    return r;
  };
  const leaveDays = new Set(
    days
      .filter((d) => d.status === "LEAVE")
      .map((d) => `${d.employeeId}|${d.workDate.toISOString()}`),
  );
  for (const r of roster) {
    if (!r.shift || leaveDays.has(`${r.employeeId}|${r.workDate.toISOString()}`)) continue;
    const length = (r.shift.endMinute - r.shift.startMinute + 1440) % 1440 || 1440;
    const unpaid = r.shift.breakPaid ? 0 : r.shift.breakMin;
    const acc = row(r.employeeId);
    acc.workDays += 1;
    acc.scheduledMin += Math.max(0, length - unpaid);
  }
  const ctx = await loadCalcContext(undefined, days);
  for (const d of days) {
    const acc = row(d.employeeId);
    if (d.status === "ALPHA") acc.alphaDays += 1;
    const inP = d.punches.find((p) => p.kind === "IN");
    const outP = d.punches.find((p) => p.kind === "OUT");
    if (!inP) continue;
    acc.presentDays += 1;
    if (d.labels.includes("LATE")) acc.lateDays += 1;
    if (outP && d.status !== "REJECTED") {
      const shift = d.shiftId ? ctx.shifts.get(d.shiftId) : undefined;
      const bs = d.punches.find((p) => p.kind === "BREAK_START");
      const be = d.punches.find((p) => p.kind === "BREAK_END");
      const breakMin =
        shift?.breakPaid === true
          ? 0
          : bs && be
            ? Math.max(0, (be.at.getTime() - bs.at.getTime()) / MIN)
            : (shift?.breakMin ?? 0);
      acc.workedMin += Math.max(0, (outP.at.getTime() - inP.at.getTime()) / MIN - breakMin);
    }
    if (d.status === "APPROVED") {
      const calc = calcDay(ctx, d);
      if (calc) {
        acc.overtimeMin += calc.result.regularMin;
        acc.overtimeEquivalentHours += calc.result.regularEquivalentHours;
      }
    }
  }
  for (const o of overtime) {
    const acc = row(o.employeeId);
    acc.overtimeMin += o.proposedMin;
    acc.overtimeEquivalentHours += Number(o.equivalentHours);
  }
  for (const r of out.values()) {
    r.workedMin = Math.round(r.workedMin);
    r.overtimeEquivalentHours = Math.round(r.overtimeEquivalentHours * 100) / 100;
  }
  return out;
}

/** Upah bulanan (pokok + tunjangan tetap) per grade. */
export async function monthlyWagesOfGrades(gradeIds: (string | null)[]) {
  const wages = await wagesOfGrades(gradeIds);
  return new Map([...wages.entries()].map(([id, w]) => [id, w.basePay + w.fixedAllowance]));
}

/**
 * Rumus pola per karyawan pada `date` (pembagi upah harian ÷25 / ÷21): pola crew dari hari roster
 * terakhir dalam 90 hari s.d. `date`; tanpa crew → pola 5 hari (sama dengan hak cuti keluar TM-D9).
 */
export async function formulasOfEmployees(
  employeeIds: string[],
  date: string,
): Promise<Map<string, OvertimeFormula>> {
  const out = new Map<string, OvertimeFormula>(employeeIds.map((id) => [id, "FIVE_DAY"]));
  if (employeeIds.length === 0) return out;
  const end = new Date(`${date}T00:00:00Z`);
  const start = new Date(end.getTime() - 90 * 86_400_000);
  const rows = await repository.crewRosterDays(employeeIds, { gte: start, lte: end });
  const latest = new Map<string, string>();
  for (const r of rows) if (!latest.has(r.employeeId)) latest.set(r.employeeId, r.crewId as string);
  const crews = await repository.crewsWithPattern([...new Set(latest.values())]);
  const formula = new Map(crews.map((c) => [c.id, formulaForPattern(c.pattern.steps)]));
  for (const [id, crewId] of latest) out.set(id, formula.get(crewId) ?? "FIVE_DAY");
  return out;
}
