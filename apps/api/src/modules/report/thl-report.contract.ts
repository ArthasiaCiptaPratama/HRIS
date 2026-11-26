import { z } from "@hono/zod-openapi";
import { assertExact } from "../../core/contract.ts";
import type { thlAttendanceWageReport } from "./thl-report.service.ts";

export const thlReportSchema = z
  .object({
    month: z.string(),
    note: z.string(),
    access: z.object({ wage: z.boolean() }),
    rows: z.array(
      z.object({
        employeeId: z.uuid(),
        employeeNumber: z.string().nullable(),
        fullName: z.string(),
        company: z.string(),
        unit: z.string().nullable(),
        position: z.string().nullable(),
        presentDays: z.number().int(),
        pendingDays: z.number().int(),
        dailyWage: z.number().nullable().optional(),
        estimatedWage: z.number().nullable().optional(),
      }),
    ),
  })
  .openapi("ThlAttendanceWageReport");
assertExact<z.infer<typeof thlReportSchema>, Awaited<ReturnType<typeof thlAttendanceWageReport>>>(
  true,
);
