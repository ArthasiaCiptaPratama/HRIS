import { z } from "@hono/zod-openapi";
import {
  OVERTIME_DAY_TYPES,
  OVERTIME_FLAGS,
  OVERTIME_FORMULAS,
  OVERTIME_STATUSES,
} from "@hris/shared";
import { assertExact, nullableRef } from "../../core/contract.ts";
import { approvalViewSchema } from "../approval/index.ts";
import { shiftSchema } from "./attendance.contract.ts";
import type {
  BreakLocationsView,
  GradeWageView,
  OvertimeSummary,
  OvertimeView,
} from "./overtime.service.ts";
import type { RosterTemplateResult } from "./roster-template.service.ts";

// MOB-D7 #1: skema respons OpenAPI lembur & upah grade (TM-D6), lokasi wajib istirahat (TM-D7),
// template roster (TM-D8). Setiap skema dikunci ke tipe service dengan assertExact.

const employeeRef = z.object({
  id: z.uuid(),
  fullName: z.string(),
  employeeNumber: z.string().nullable(),
});

export const overtimeViewSchema = z
  .object({
    id: z.uuid(),
    dayId: z.uuid(),
    employee: employeeRef,
    workDate: z.iso.date(),
    shiftCode: z.string().nullable(),
    checkIn: z.iso.datetime().nullable(),
    checkOut: z.iso.datetime().nullable(),
    dayType: z.enum(OVERTIME_DAY_TYPES),
    formula: z.enum(OVERTIME_FORMULAS),
    rawMin: z.number().int(),
    earlyMin: z.number().int(),
    debtMin: z.number().int(),
    regularMin: z.number().int(),
    proposedMin: z.number().int(),
    equivalentHours: z.number(),
    flags: z.array(z.enum(OVERTIME_FLAGS)),
    status: z.enum(OVERTIME_STATUSES),
    approval: nullableRef(approvalViewSchema),
    pay: z.number().nullable(),
  })
  .openapi("Overtime");
assertExact<z.infer<typeof overtimeViewSchema>, OvertimeView>(true);

export const overtimeListSchema = z.array(overtimeViewSchema);

export const overtimeSummarySchema = z
  .object({
    month: z.string(),
    rows: z.array(
      z
        .object({
          employee: employeeRef,
          regularMin: z.number().int(),
          regularEquivalentHours: z.number(),
          approvedMin: z.number().int(),
          approvedEquivalentHours: z.number(),
          pendingMin: z.number().int(),
          totalEquivalentHours: z.number(),
          pay: z.number().nullable(),
          wageMissing: z.boolean(),
        })
        .openapi("OvertimeSummaryRow"),
    ),
    totals: z.object({
      regularMin: z.number().int(),
      approvedMin: z.number().int(),
      pendingMin: z.number().int(),
      totalEquivalentHours: z.number(),
      pay: z.number().nullable(),
    }),
    showPay: z.boolean(),
  })
  .openapi("OvertimeSummary");
assertExact<z.infer<typeof overtimeSummarySchema>, OvertimeSummary>(true);

export const gradeWageViewSchema = z
  .object({
    gradeId: z.uuid(),
    gradeName: z.string(),
    basePay: z.number().nullable(),
    fixedAllowance: z.number().nullable(),
    hourly: z.number().nullable(),
    updatedAt: z.iso.datetime().nullable(),
  })
  .openapi("GradeWage");
assertExact<z.infer<typeof gradeWageViewSchema>, GradeWageView>(true);

export const gradeWageListSchema = z.array(gradeWageViewSchema);

export const breakLocationsViewSchema = z
  .object({
    locations: z.array(
      z.object({
        id: z.uuid(),
        name: z.string(),
        city: z.string().nullable(),
        required: z.boolean(),
      }),
    ),
  })
  .openapi("OvertimeBreakLocations");
assertExact<z.infer<typeof breakLocationsViewSchema>, BreakLocationsView>(true);

// Pola & crew ditulis inline (tanpa nama komponen) agar tidak bentrok dengan skema roster.
export const rosterTemplateResultSchema = z
  .object({
    shifts: z.array(shiftSchema),
    pattern: z.object({
      id: z.uuid(),
      companyId: z.uuid(),
      name: z.string(),
      steps: z.array(z.string()),
      cycleLength: z.number().int(),
      workDays: z.number().int(),
      crewCount: z.number().int(),
    }),
    crews: z.array(
      z.object({
        id: z.uuid(),
        companyId: z.uuid(),
        workLocation: z.object({ id: z.uuid(), name: z.string() }).nullable(),
        name: z.string(),
        pattern: z.object({ id: z.uuid(), name: z.string(), steps: z.array(z.string()) }),
        cycleStartDate: z.iso.date(),
        members: z.array(
          z.object({
            employeeId: z.uuid(),
            fullName: z.string(),
            employeeNumber: z.string().nullable(),
            startDate: z.iso.date(),
          }),
        ),
      }),
    ),
  })
  .openapi("OvertimeRosterTemplateResult");
assertExact<z.infer<typeof rosterTemplateResultSchema>, RosterTemplateResult>(true);
