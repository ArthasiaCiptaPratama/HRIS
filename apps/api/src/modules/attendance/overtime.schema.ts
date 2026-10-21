import { z } from "@hono/zod-openapi";
import {
  APPROVAL_SUBJECTS,
  OVERTIME_DAY_TYPES,
  OVERTIME_FLAGS,
  OVERTIME_FORMULAS,
  OVERTIME_STATUSES,
} from "@hris/shared";
import type { ApprovalView } from "../approval/index.ts";
import type {
  BreakLocationsView,
  GradeWageView,
  OvertimeSummary,
  OvertimeView,
} from "./overtime.service.ts";
import type { RosterTemplateResult } from "./roster-template.service.ts";

// Kontrak OpenAPI respons rute lembur, upah grade, lokasi istirahat, & template roster (MOB-D10).
// Setiap skema dicek sama persis dengan tipe service di bawah (gagal typecheck bila salah satu berubah).

const employeeRef = z.object({
  id: z.uuid(),
  fullName: z.string(),
  employeeNumber: z.string().nullable(),
});

export const approvalViewSchema = z
  .object({
    id: z.uuid(),
    subjectType: z.enum(APPROVAL_SUBJECTS),
    subjectId: z.uuid(),
    status: z.enum(["PENDING", "APPROVED", "REJECTED", "CANCELLED"]),
    createdAt: z.string(),
    decidedAt: z.string().nullable(),
    steps: z.array(
      z.object({
        kind: z.enum(["MANAGER", "HR"]),
        decision: z.enum(["PENDING", "APPROVED", "REJECTED"]),
        decidedAt: z.string().nullable(),
        note: z.string().nullable(),
        isOverride: z.boolean(),
        myRight: z.enum(["regular", "override"]).nullable(),
      }),
    ),
    canDecide: z.boolean(),
    canOverride: z.boolean(),
  })
  .openapi("ApprovalView");

export const overtimeViewSchema = z
  .object({
    id: z.uuid(),
    dayId: z.uuid(),
    employee: employeeRef,
    workDate: z.string(),
    shiftCode: z.string().nullable(),
    checkIn: z.string().nullable(),
    checkOut: z.string().nullable(),
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
    approval: approvalViewSchema.nullable(),
    pay: z.number().nullable().openapi({ description: "Rupiah; null tanpa grant labor.cost.read" }),
  })
  .openapi("OvertimeView");

export const overtimeSummarySchema = z
  .object({
    month: z.string(),
    rows: z.array(
      z.object({
        employee: employeeRef,
        regularMin: z.number().int(),
        regularEquivalentHours: z.number(),
        approvedMin: z.number().int(),
        approvedEquivalentHours: z.number(),
        pendingMin: z.number().int(),
        totalEquivalentHours: z.number(),
        pay: z.number().nullable(),
        wageMissing: z.boolean(),
      }),
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

export const gradeWageViewSchema = z
  .object({
    gradeId: z.uuid(),
    gradeName: z.string(),
    basePay: z.number().nullable(),
    fixedAllowance: z.number().nullable(),
    hourly: z.number().nullable(),
    updatedAt: z.string().nullable(),
  })
  .openapi("GradeWageView");

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
  .openapi("BreakLocationsView");

export const rosterTemplateResultSchema = z
  .object({
    shifts: z.array(
      z.object({
        id: z.uuid(),
        companyId: z.uuid(),
        code: z.string(),
        name: z.string(),
        startMinute: z.number().int(),
        endMinute: z.number().int(),
        crossesMidnight: z.boolean(),
        checkInOpenMin: z.number().int(),
        lateToleranceMin: z.number().int(),
        earlyLeaveToleranceMin: z.number().int(),
        checkOutCloseMin: z.number().int(),
        breakMin: z.number().int(),
        breakPaid: z.boolean(),
        regularOvertimeMin: z.number().int(),
        color: z.string().nullable(),
        archived: z.boolean(),
      }),
    ),
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
        cycleStartDate: z.string(),
        members: z.array(
          z.object({
            employeeId: z.uuid(),
            fullName: z.string(),
            employeeNumber: z.string().nullable(),
            startDate: z.string(),
          }),
        ),
      }),
    ),
  })
  .openapi("RosterTemplateResult");

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const contract: [
  Same<z.infer<typeof approvalViewSchema>, ApprovalView>,
  Same<z.infer<typeof overtimeViewSchema>, OvertimeView>,
  Same<z.infer<typeof overtimeSummarySchema>, OvertimeSummary>,
  Same<z.infer<typeof gradeWageViewSchema>, GradeWageView>,
  Same<z.infer<typeof breakLocationsViewSchema>, BreakLocationsView>,
  Same<z.infer<typeof rosterTemplateResultSchema>, RosterTemplateResult>,
] = [true, true, true, true, true, true];
void contract;
