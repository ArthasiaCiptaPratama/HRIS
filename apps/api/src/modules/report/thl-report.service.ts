import { shiftThlMonth, thlCurrentMonth, type XlsxSheet } from "@hris/shared";
import { z } from "zod";
import { Prisma } from "../../generated/prisma/client.ts";
import { approvedAttendanceDates, countAttendanceByMonth } from "../attendance/index.ts";
import {
  canAccessDailyWage,
  canAccessDailyWageInCompany,
  dailyWageHistory,
} from "../contract/index.ts";
import { parse, personDto, type RequestContext, scopedEmployees } from "./report-common.ts";

export const thlReportQuerySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional(),
});
export async function thlAttendanceWageReport(ctx: RequestContext, raw: unknown, now = new Date()) {
  const query = parse(thlReportQuerySchema, raw);
  const month = query.month ?? shiftThlMonth(thlCurrentMonth(now), -1);
  const { employees, lookup } = await scopedEmployees(ctx, raw);
  const thl = employees.filter(
    (e) => e.isActive && lookup.statuses.get(e.employmentStatusId)?.category === "DAILY_WORKER",
  );
  const ids = thl.map((e) => e.id);
  const wageIds = thl
    .filter((e) => canAccessDailyWageInCompany(ctx.actor, e.companyId))
    .map((e) => e.id);
  const [counts, dates, wages] = await Promise.all([
    countAttendanceByMonth({ employeeIds: ids, fromMonth: month, toMonth: month }),
    approvedAttendanceDates(wageIds, month),
    dailyWageHistory(wageIds),
  ]);
  const wagesByEmployee = new Map<string, typeof wages>();
  for (const wage of wages) {
    const history = wagesByEmployee.get(wage.employeeId) ?? [];
    history.push(wage);
    wagesByEmployee.set(wage.employeeId, history);
  }
  const totals = new Map<string, { amount: Prisma.Decimal; missing: boolean }>();
  for (const date of dates) {
    const wage = wagesByEmployee
      .get(date.employeeId)
      ?.find((w) => w.effectiveFrom.toISOString().slice(0, 10) <= date.workDate);
    const total = totals.get(date.employeeId) ?? { amount: new Prisma.Decimal(0), missing: false };
    if (wage) total.amount = total.amount.add(wage.amount);
    else total.missing = true;
    totals.set(date.employeeId, total);
  }
  const end = shiftThlMonth(month, 1);
  const canSeeWage = canAccessDailyWage(ctx.actor);
  return {
    month,
    note: "Perkiraan, bukan payroll",
    access: { wage: canSeeWage },
    rows: thl.map((e) => {
      const count = counts.get(e.id)?.[0];
      const history = wagesByEmployee.get(e.id) ?? [];
      const wage = history.find((w) => w.effectiveFrom.toISOString().slice(0, 7) < end);
      const total = totals.get(e.id);
      return {
        ...personDto(lookup, e),
        presentDays: count?.presentDays ?? 0,
        pendingDays: count?.pendingDays ?? 0,
        ...(canAccessDailyWageInCompany(ctx.actor, e.companyId)
          ? {
              dailyWage: wage?.amount.toNumber() ?? null,
              estimatedWage: total?.missing
                ? null
                : (total?.amount ?? new Prisma.Decimal(0))
                    .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP)
                    .toNumber(),
            }
          : {}),
      };
    }),
  };
}

export async function thlReportSheets(ctx: RequestContext, raw: unknown): Promise<XlsxSheet[]> {
  const report = await thlAttendanceWageReport(ctx, raw);
  return [
    {
      name: "Rekap THL",
      title: `Rekap Kehadiran & Upah THL — ${report.month}`,
      notes: [
        report.note,
        "Upah harian = tarif terakhir dalam bulan; perkiraan mengikuti tarif setiap hari hadir. Hari hadir tanpa tarif menghasilkan perkiraan kosong.",
      ],
      rows: [
        [
          "NIP",
          "Nama",
          "PT",
          "Jabatan",
          "Hari hadir",
          "Menunggu persetujuan",
          ...(report.access.wage ? ["Upah harian", "Perkiraan upah"] : []),
        ],
        ...report.rows.map((r) => [
          r.employeeNumber,
          r.fullName,
          r.company,
          r.position,
          r.presentDays,
          r.pendingDays,
          ...(report.access.wage ? [r.dailyWage ?? null, r.estimatedWage ?? null] : []),
        ]),
      ],
      formats: [
        "text",
        "text",
        "text",
        "text",
        "int",
        "int",
        ...(report.access.wage ? ["int" as const, "int" as const] : []),
      ],
      freezeColumns: 2,
    },
  ];
}
