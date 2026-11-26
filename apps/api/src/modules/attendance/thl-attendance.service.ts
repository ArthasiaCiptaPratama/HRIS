import { shiftThlMonth, type ThlAttendanceMonth } from "@hris/shared";
import * as repository from "./thl-attendance.repository.ts";

const date = (month: string) => new Date(`${month}-01T00:00:00Z`);
export async function countAttendanceByMonth(input: {
  employeeIds: string[];
  fromMonth: string;
  toMonth: string;
}): Promise<Map<string, ThlAttendanceMonth[]>> {
  const result = new Map<string, ThlAttendanceMonth[]>();
  if (!input.employeeIds.length) return result;
  const rows = await repository.monthlyCounts(
    input.employeeIds,
    date(input.fromMonth),
    date(shiftThlMonth(input.toMonth, 1)),
  );
  const byKey = new Map(rows.map((row) => [`${row.employeeId}:${row.month}`, row]));
  for (const employeeId of new Set(input.employeeIds)) {
    const months: ThlAttendanceMonth[] = [];
    for (let month = input.fromMonth; month <= input.toMonth; month = shiftThlMonth(month, 1)) {
      const row = byKey.get(`${employeeId}:${month}`);
      months.push({
        month,
        presentDays: row?.presentDays ?? 0,
        pendingDays: row?.pendingDays ?? 0,
      });
    }
    result.set(employeeId, months);
  }
  return result;
}

/** Approved local dates for applying the rate effective on each day (KTR-D13). */
export async function approvedAttendanceDates(employeeIds: string[], month: string) {
  if (!employeeIds.length) return [];
  return (
    await repository.approvedDates(employeeIds, date(month), date(shiftThlMonth(month, 1)))
  ).map((row) => ({
    employeeId: row.employeeId,
    workDate: row.workDate.toISOString().slice(0, 10),
  }));
}
