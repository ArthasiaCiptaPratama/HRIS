import { getPrisma } from "../../core/db.ts";
import { realBalance } from "./leave-engine.ts";

// DSB-D1: fakta cuti agregat untuk dashboard (baca-saja).

export interface LeaveFacts {
  /** Per karyawan, tahun berjalan: jatah (+ penyesuaian), terpakai (termasuk cuti bersama), sisa nyata. */
  perEmployee: Map<string, { granted: number; used: number; remaining: number }>;
  onLeaveToday: number;
  pendingRequests: number;
}

export async function leaveFacts(
  employeeIds: string[],
  year: number,
  today: string,
): Promise<LeaveFacts> {
  if (employeeIds.length === 0) {
    return { perEmployee: new Map(), onLeaveToday: 0, pendingRequests: 0 };
  }
  const day = new Date(`${today}T00:00:00Z`);
  const [ledger, onLeave, pending] = await Promise.all([
    getPrisma().leaveLedger.findMany({
      where: { employeeId: { in: employeeIds }, year },
      select: { employeeId: true, kind: true, days: true },
    }),
    getPrisma().leaveRequest.count({
      where: {
        employeeId: { in: employeeIds },
        status: "APPROVED",
        workDates: { has: day },
      },
    }),
    getPrisma().leaveRequest.count({
      where: { employeeId: { in: employeeIds }, status: "PENDING" },
    }),
  ]);
  const byEmployee = new Map<string, typeof ledger>();
  for (const row of ledger) {
    const list = byEmployee.get(row.employeeId) ?? [];
    list.push(row);
    byEmployee.set(row.employeeId, list);
  }
  const perEmployee = new Map<string, { granted: number; used: number; remaining: number }>();
  for (const [id, rows] of byEmployee) {
    const sum = (...kinds: string[]) =>
      rows.filter((r) => kinds.includes(r.kind)).reduce((t, r) => t + r.days, 0);
    perEmployee.set(id, {
      granted: sum("GRANT", "ADJUST", "SETTLE"),
      used: -sum("USE", "COLLECTIVE"),
      remaining: realBalance(rows.filter((r) => r.kind !== "EXPIRE")),
    });
  }
  return { perEmployee, onLeaveToday: onLeave, pendingRequests: pending };
}
