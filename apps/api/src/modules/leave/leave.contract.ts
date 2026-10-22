import { z } from "@hono/zod-openapi";
import { LEAVE_EXIT_STATUSES, LEAVE_LEDGER_KINDS, OVERTIME_FORMULAS } from "@hris/shared";
import { assertExact, nullableRef } from "../../core/contract.ts";
import { approvalViewSchema } from "../approval/index.ts";
import type * as service from "./leave.service.ts";
import type {
  BalanceRow,
  LeaveDailyResult,
  LeavePreview,
  LeaveRequestDto,
  LeaveTypeDto,
  LeaveYearDto,
} from "./leave.service.ts";
import type { BalanceSummary } from "./leave-engine.ts";
import type * as exits from "./leave-exit.service.ts";
import type { ExitSettlementView } from "./leave-exit.service.ts";

// MOB-D7 #1: skema respons OpenAPI modul leave (dipakai codegen app mobile, MOB-D9).
// Setiap skema dikunci ke tipe service dengan assertExact → typecheck gagal bila tidak sama.

const employeeRef = z.object({
  id: z.uuid(),
  fullName: z.string(),
  employeeNumber: z.string().nullable(),
});

export const leaveTypeSchema = z
  .object({
    id: z.uuid(),
    code: z.string(),
    name: z.string(),
    category: z.enum(["ANNUAL", "PERMIT", "SICK"]),
    maxDaysPerRequest: z.number().int().nullable(),
    documentRequiredAfterDays: z.number().int().nullable(),
    description: z.string().nullable(),
    documentLabel: z.string().nullable(),
    isActive: z.boolean(),
    sortOrder: z.number().int(),
  })
  .openapi("LeaveType");
assertExact<z.infer<typeof leaveTypeSchema>, LeaveTypeDto>(true);

export const leaveYearSchema = z
  .object({
    year: z.number().int(),
    quota: z.number().int(),
    isActive: z.boolean(),
    grantedAt: z.iso.datetime().nullable(),
    settledAt: z.iso.datetime().nullable(),
    expiredAt: z.iso.datetime().nullable(),
  })
  .openapi("LeaveYear");
assertExact<z.infer<typeof leaveYearSchema>, LeaveYearDto>(true);

export const leaveBalanceSummarySchema = z
  .object({
    year: z.number().int(),
    granted: z.number(),
    adjusted: z.number(),
    used: z.number(),
    held: z.number(),
    collective: z.number(),
    expired: z.number(),
    settled: z.number(),
    balance: z.number(),
  })
  .openapi("LeaveBalanceSummary");
assertExact<z.infer<typeof leaveBalanceSummarySchema>, BalanceSummary>(true);

export const leavePreviewSchema = z
  .object({
    expiredYear: z.number().int().nullable(),
    dates: z.array(z.iso.date()),
    days: z.number().int(),
    annualDays: z.number().int(),
    charges: z.array(z.object({ year: z.number().int(), days: z.number() })),
    balances: z.array(z.object({ year: z.number().int(), balance: z.number() })),
    documentRequired: z.boolean(),
    conflicts: z.array(z.iso.date()),
  })
  .openapi("LeavePreview");
assertExact<z.infer<typeof leavePreviewSchema>, LeavePreview>(true);

export const leaveAttachmentUploadResultSchema = z
  .object({
    bucket: z.string(),
    path: z.string(),
    token: z.string(),
    signedUrl: z.string(),
    maxBytes: z.number().int(),
  })
  .openapi("LeaveAttachmentUpload");
assertExact<
  z.infer<typeof leaveAttachmentUploadResultSchema>,
  Awaited<ReturnType<typeof service.createAttachmentUpload>>
>(true);

export const leaveRequestSchema = z
  .object({
    id: z.uuid(),
    employee: employeeRef,
    type: z.object({ id: z.uuid(), code: z.string(), name: z.string(), category: z.string() }),
    startDate: z.iso.date(),
    endDate: z.iso.date(),
    workDates: z.array(z.iso.date()),
    days: z.number().int(),
    annualDays: z.number(),
    reason: z.string(),
    attachmentUrl: z.string().nullable(),
    status: z.string(),
    createdAt: z.iso.datetime(),
    decidedAt: z.iso.datetime().nullable(),
    approval: nullableRef(approvalViewSchema),
    canCancel: z.boolean(),
    rejectionNote: z.string().nullable(),
    resubmittedFrom: z
      .object({
        id: z.uuid(),
        startDate: z.iso.date(),
        endDate: z.iso.date(),
        rejectionNote: z.string().nullable(),
      })
      .nullable(),
    resubmitUntil: z.iso.date().nullable(),
    canResubmit: z.boolean(),
  })
  .openapi("LeaveRequest");
assertExact<z.infer<typeof leaveRequestSchema>, LeaveRequestDto>(true);

export const leaveMeSchema = z
  .object({
    year: z.number().int(),
    balances: z.array(leaveBalanceSummarySchema),
    carryUntil: z.iso.date().nullable(),
    expiresOn: z.iso.date(),
    ledger: z.array(
      z.object({
        id: z.uuid(),
        year: z.number().int(),
        kind: z.enum(LEAVE_LEDGER_KINDS),
        days: z.number(),
        workDate: z.iso.date().nullable(),
        note: z.string().nullable(),
        createdAt: z.iso.datetime(),
      }),
    ),
    requests: z.array(leaveRequestSchema),
  })
  .openapi("LeaveMe");
assertExact<z.infer<typeof leaveMeSchema>, Awaited<ReturnType<typeof service.myLeave>>>(true);

export const leaveBalanceSchema = leaveBalanceSummarySchema
  .extend({ employee: employeeRef, carryBalance: z.number() })
  .openapi("LeaveBalance");
assertExact<z.infer<typeof leaveBalanceSchema>, BalanceRow>(true);

export const leaveLedgerSchema = z
  .object({
    summary: leaveBalanceSummarySchema,
    entries: z.array(
      z.object({
        id: z.uuid(),
        kind: z.enum(LEAVE_LEDGER_KINDS),
        days: z.number(),
        workDate: z.iso.date().nullable(),
        requestId: z.uuid().nullable(),
        note: z.string().nullable(),
        createdAt: z.iso.datetime(),
      }),
    ),
  })
  .openapi("LeaveLedger");
assertExact<z.infer<typeof leaveLedgerSchema>, Awaited<ReturnType<typeof service.employeeLedger>>>(
  true,
);
assertExact<z.infer<typeof leaveLedgerSchema>, Awaited<ReturnType<typeof service.adjustBalance>>>(
  true,
);

export const leaveBalanceImportResultSchema = z
  .object({
    total: z.number().int(),
    changed: z.number().int(),
    issues: z.array(
      z.object({ index: z.number().int(), employeeNumber: z.string(), message: z.string() }),
    ),
    saved: z.number().int(),
  })
  .openapi("LeaveBalanceImportResult");
assertExact<
  z.infer<typeof leaveBalanceImportResultSchema>,
  Awaited<ReturnType<typeof service.importBalances>>
>(true);

export const leaveExitSettlementSchema = z
  .object({
    id: z.uuid(),
    employee: employeeRef,
    companyId: z.uuid(),
    exitDate: z.iso.date(),
    exitReason: z.string().nullable(),
    year: z.number().int(),
    remainingDays: z.number(),
    debtDays: z.number(),
    pendingDays: z.number(),
    formula: z.enum(OVERTIME_FORMULAS),
    divisor: z
      .number()
      .int()
      .openapi({ description: "Pembagi upah harian: 25 (pola 6 hari) / 21" }),
    status: z.enum(LEAVE_EXIT_STATUSES),
    note: z.string().nullable(),
    decidedAt: z.iso.datetime().nullable(),
    dailyWage: z.number().nullable(),
    payAmount: z.number().nullable(),
    debtAmount: z.number().nullable(),
    wageMissing: z.boolean(),
  })
  .openapi("LeaveExitSettlement");
assertExact<z.infer<typeof leaveExitSettlementSchema>, ExitSettlementView>(true);

// Recalculate/paid mengembalikan settlement terbaru; 404 bila baris tidak ada.
assertExact<
  z.infer<typeof leaveExitSettlementSchema>,
  Awaited<ReturnType<typeof exits.recalculateExitSettlement>>
>(true);
assertExact<
  z.infer<typeof leaveExitSettlementSchema>,
  Awaited<ReturnType<typeof exits.markExitSettlementPaid>>
>(true);

const leaveDailyResultSchema = z
  .object({
    collective: z.object({ charged: z.number().int() }),
    grant: z.object({ granted: z.number().int() }).optional(),
    expire: z.object({ expired: z.number().int() }).optional(),
    settle: z.object({ settled: z.number().int(), remainingDebt: z.number().int() }).optional(),
    exits: z.object({ created: z.number().int(), cancelled: z.number().int() }),
  })
  .openapi("LeaveDailyResult");
assertExact<z.infer<typeof leaveDailyResultSchema>, LeaveDailyResult>(true);

export const leaveJobResultSchema = z
  .union([
    z.object({ granted: z.number().int() }),
    z.object({ settled: z.number().int(), remainingDebt: z.number().int() }),
    z.object({ expired: z.number().int() }),
    z.object({ charged: z.number().int() }),
    leaveDailyResultSchema,
  ])
  .openapi("LeaveJobResult");
assertExact<z.infer<typeof leaveJobResultSchema>, Awaited<ReturnType<typeof service.runLeaveJob>>>(
  true,
);
