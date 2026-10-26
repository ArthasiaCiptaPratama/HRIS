import {
  type BreakLocationsInput,
  type GradeWageInput,
  OVERTIME_DAY_TYPES,
  OVERTIME_FLAGS,
  OVERTIME_FORMULAS,
  OVERTIME_STATUSES,
  type OvertimeOrderInput,
  type RosterTemplateInput,
} from "@hris/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "@/lib/api";
import { tmKeys } from "./api";
import { approvalSchema } from "./schemas";

// TM-D6 lembur & upah grade, TM-D7 lokasi wajib absen istirahat, TM-D8 template roster.

const one = <T extends z.ZodType>(schema: T) => z.object({ data: schema });
const person = z.object({
  id: z.string(),
  fullName: z.string(),
  employeeNumber: z.string().nullable(),
});

export const overtimeSchema = z.object({
  id: z.string(),
  dayId: z.string(),
  employee: person,
  workDate: z.string(),
  shiftCode: z.string().nullable(),
  checkIn: z.string().nullable(),
  checkOut: z.string().nullable(),
  dayType: z.enum(OVERTIME_DAY_TYPES),
  formula: z.enum(OVERTIME_FORMULAS),
  rawMin: z.number(),
  earlyMin: z.number(),
  debtMin: z.number(),
  regularMin: z.number(),
  proposedMin: z.number(),
  equivalentHours: z.number(),
  flags: z.array(z.enum(OVERTIME_FLAGS)),
  status: z.enum(OVERTIME_STATUSES),
  approval: approvalSchema.nullable(),
  pay: z.number().nullable(),
});
export type Overtime = z.infer<typeof overtimeSchema>;

export const overtimeSummarySchema = z.object({
  month: z.string(),
  rows: z.array(
    z.object({
      employee: person,
      regularMin: z.number(),
      regularEquivalentHours: z.number(),
      approvedMin: z.number(),
      approvedEquivalentHours: z.number(),
      pendingMin: z.number(),
      totalEquivalentHours: z.number(),
      pay: z.number().nullable(),
      wageMissing: z.boolean(),
    }),
  ),
  totals: z.object({
    regularMin: z.number(),
    approvedMin: z.number(),
    pendingMin: z.number(),
    totalEquivalentHours: z.number(),
    pay: z.number().nullable(),
  }),
  showPay: z.boolean(),
});
export type OvertimeSummary = z.infer<typeof overtimeSummarySchema>;

export const gradeWageSchema = z.object({
  gradeId: z.string(),
  gradeName: z.string(),
  basePay: z.number().nullable(),
  fixedAllowance: z.number().nullable(),
  hourly: z.number().nullable(),
  updatedAt: z.string().nullable(),
});
export type GradeWage = z.infer<typeof gradeWageSchema>;

export const breakLocationsSchema = z.object({
  locations: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      city: z.string().nullable(),
      required: z.boolean(),
    }),
  ),
});

const keys = {
  list: (params: object) => [...tmKeys.all, "overtime", params] as const,
  summary: (month: string, companyId: string) =>
    [...tmKeys.all, "overtime-summary", month, companyId] as const,
  wages: [...tmKeys.all, "grade-wages"] as const,
  breaks: [...tmKeys.all, "break-locations"] as const,
  orders: (params: object) => [...tmKeys.all, "overtime-orders", params] as const,
};

function useRefresh() {
  const queryClient = useQueryClient();
  return () => void queryClient.invalidateQueries({ queryKey: tmKeys.all });
}

export function useOvertimeList(
  params: { scope: "inbox" | "all" | "me"; from: string; to: string; companyId?: string },
  enabled = true,
) {
  return useQuery({
    queryKey: keys.list(params),
    queryFn: ({ signal }) => {
      const search = new URLSearchParams({ scope: params.scope, from: params.from, to: params.to });
      if (params.companyId) search.set("companyId", params.companyId);
      return api(`/overtime?${search}`, { schema: one(z.array(overtimeSchema)), signal }).then(
        (r) => r.data,
      );
    },
    enabled,
  });
}

export function useOvertimeSummary(month: string, companyId: string, enabled = true) {
  return useQuery({
    queryKey: keys.summary(month, companyId),
    queryFn: ({ signal }) => {
      const search = new URLSearchParams({ month });
      if (companyId) search.set("companyId", companyId);
      return api(`/overtime/summary?${search}`, {
        schema: one(overtimeSummarySchema),
        signal,
      }).then((r) => r.data);
    },
    enabled,
  });
}

export function useGradeWages(enabled = true) {
  return useQuery({
    queryKey: keys.wages,
    queryFn: ({ signal }) =>
      api("/grade-wages", { schema: one(z.array(gradeWageSchema)), signal }).then((r) => r.data),
    enabled,
  });
}

export function useSetGradeWage() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ gradeId, ...body }: GradeWageInput & { gradeId: string }) =>
      api(`/grade-wages/${gradeId}`, { method: "PUT", body, schema: one(gradeWageSchema) }).then(
        (r) => r.data,
      ),
    onSuccess: refresh,
  });
}

export function useBreakLocations(enabled = true) {
  return useQuery({
    queryKey: keys.breaks,
    queryFn: ({ signal }) =>
      api("/break-locations", { schema: one(breakLocationsSchema), signal }).then((r) => r.data),
    enabled,
  });
}

export function useSetBreakLocations() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (body: BreakLocationsInput) =>
      api("/break-locations", { method: "PUT", body, schema: one(breakLocationsSchema) }).then(
        (r) => r.data,
      ),
    onSuccess: refresh,
  });
}

export function useApplyRosterTemplate() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (body: RosterTemplateInput) =>
      api("/roster/templates", {
        method: "POST",
        body,
        schema: one(
          z.object({
            shifts: z.array(z.object({ code: z.string() })),
            crews: z.array(z.object({ name: z.string() })),
            /** TM-D13: jeda antarshift di pola < pengaturan (opsional: API lama tidak mengirim). */
            restWarnings: z.array(z.string()).optional(),
          }),
        ),
      }).then((r) => r.data),
    onSuccess: refresh,
  });
}

// ── TM-D17 perintah lembur (SPL) ───────────────────────────────────────────────
export const overtimeOrderSchema = z.object({
  id: z.string(),
  employee: person,
  companyId: z.string(),
  workDate: z.string(),
  startsAt: z.string().nullable(),
  endsAt: z.string().nullable(),
  reason: z.string(),
  retroactive: z.boolean(),
  createdAt: z.string(),
  canManage: z.boolean(),
});
export type OvertimeOrder = z.infer<typeof overtimeOrderSchema>;

export function useOvertimeOrders(params: { from: string; to: string; companyId?: string }) {
  return useQuery({
    queryKey: keys.orders(params),
    queryFn: ({ signal }) => {
      const search = new URLSearchParams({ from: params.from, to: params.to });
      if (params.companyId) search.set("companyId", params.companyId);
      return api(`/overtime-orders?${search}`, {
        schema: one(z.array(overtimeOrderSchema)),
        signal,
      }).then((r) => r.data);
    },
  });
}

export function useSetOvertimeOrder() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (body: OvertimeOrderInput) =>
      api("/overtime-orders", { method: "PUT", body, schema: one(overtimeOrderSchema) }).then(
        (r) => r.data,
      ),
    onSuccess: refresh,
  });
}

export function useCancelOvertimeOrder() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (id: string) =>
      api(`/overtime-orders/${id}/cancel`, {
        method: "POST",
        schema: one(z.object({ id: z.string() })),
      }).then((r) => r.data),
    onSuccess: refresh,
  });
}
