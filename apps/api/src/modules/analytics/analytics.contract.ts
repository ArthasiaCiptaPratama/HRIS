import { z } from "@hono/zod-openapi";
import { SEVERANCE_SCENARIOS } from "@hris/shared";
import { assertExact } from "../../core/contract.ts";
import type { DashboardAnalytics } from "./analytics.service.ts";

// MOB-D7 #1: skema respons GET /dashboard/analytics (DSB-D1), dikunci ke tipe service dengan assertExact.

const headcountMonthSchema = z.object({
  month: z.string(),
  start: z.number().int(),
  joined: z.number().int(),
  left: z.number().int(),
  leftByReason: z.record(z.string(), z.number().int()),
  end: z.number().int(),
  turnoverPct: z.number(),
});

const efficiencyTotalsSchema = z.object({
  scheduledHours: z.number(),
  effectiveHours: z.number(),
  efficiencyPct: z.number(),
  overtimeHours: z.number(),
  overtimePct: z.number(),
  latePct: z.number(),
  alphaPct: z.number(),
});

export const dashboardAnalyticsSchema = z
  .object({
    month: z.string(),
    scope: z.enum(["all", "companies", "team"]),
    showCost: z
      .boolean()
      .openapi({ description: "Rupiah tampil (SA / HR ber-grant labor.cost.read)" }),
    headcount: headcountMonthSchema.extend({
      prevEnd: z.number().int(),
      endChangePct: z.number().nullable(),
      history: z.array(headcountMonthSchema),
    }),
    gender: z.array(z.object({ gender: z.string(), count: z.number().int(), pct: z.number() })),
    tenure: z.object({
      avgYears: z.number(),
      buckets: z.array(
        z.object({
          bucket: z.enum(["<1", "1-3", "3-5", "5-10", "10+"]),
          count: z.number().int(),
          pct: z.number(),
          avgYears: z.number(),
          avgGranted: z.number(),
          avgUsed: z.number(),
          avgRemaining: z.number(),
        }),
      ),
    }),
    leave: z.object({
      year: z.number().int(),
      onLeaveToday: z.number().int(),
      pendingRequests: z.number().int(),
      usedDays: z.number(),
      remainingDays: z.number(),
      debtDays: z.number(),
    }),
    efficiency: efficiencyTotalsSchema.extend({
      prevEfficiencyPct: z.number(),
      byLocation: z.array(
        efficiencyTotalsSchema.extend({ location: z.string(), headcount: z.number().int() }),
      ),
    }),
    projection: z.array(
      z.object({
        month: z.string(),
        contractEnds: z.number().int(),
        tierChanges: z.number().int(),
        retirements: z
          .number()
          .int()
          .nullable()
          .openapi({ description: "null = tanpa izin data pribadi" }),
        costDelta: z.number().nullable().openapi({ description: "null = tanpa izin biaya" }),
      }),
    ),
    laborCost: z
      .object({
        rows: z.array(
          z.object({
            category: z.string(),
            headcount: z.number().int(),
            wage: z.number(),
            overtime: z.number(),
            total: z.number(),
            pct: z.number(),
          }),
        ),
        total: z.number(),
        wageMissing: z.number().int(),
      })
      .nullable(),
    liability: z
      .object({
        scenario: z.enum(SEVERANCE_SCENARIOS),
        severance: z.number(),
        upmk: z.number(),
        pkwt: z.number(),
        leaveComp: z.number(),
        total: z.number(),
        employees: z.number().int(),
        wageMissing: z.number().int(),
      })
      .nullable(),
  })
  .openapi("DashboardAnalytics");

assertExact<z.infer<typeof dashboardAnalyticsSchema>, DashboardAnalytics>(true);
