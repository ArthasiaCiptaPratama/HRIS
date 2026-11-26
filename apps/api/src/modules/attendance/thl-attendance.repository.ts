import { getPrisma } from "../../core/db.ts";
import { Prisma } from "../../generated/prisma/client.ts";

export function monthlyCounts(employeeIds: string[], from: Date, until: Date) {
  return getPrisma().$queryRaw<
    { employeeId: string; month: string; presentDays: number; pendingDays: number }[]
  >(Prisma.sql`
    SELECT employee_id AS "employeeId", to_char(work_date, 'YYYY-MM') AS month,
      count(*) FILTER (WHERE status = 'APPROVED')::int AS "presentDays",
      count(*) FILTER (WHERE status IN ('OPEN', 'PENDING'))::int AS "pendingDays"
    FROM attendance.attendance_days
    WHERE employee_id IN (${Prisma.join(employeeIds.map((id) => Prisma.sql`${id}::uuid`))})
      AND work_date >= ${from} AND work_date < ${until}
    GROUP BY employee_id, to_char(work_date, 'YYYY-MM')
  `);
}

export function approvedDates(employeeIds: string[], from: Date, until: Date) {
  return getPrisma().attendanceDay.findMany({
    where: {
      employeeId: { in: employeeIds },
      status: "APPROVED",
      workDate: { gte: from, lt: until },
    },
    select: { employeeId: true, workDate: true },
    orderBy: { workDate: "asc" },
  });
}
