import {
  type DashboardLayout,
  dashboardLayoutSchema,
  encodePivotFilters,
  type PivotDimension,
  type PivotFilters,
  type PivotStatus,
  pivotResultSchema,
  type SeveranceScenario,
} from "@hris/shared";
import {
  keepPreviousData,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { z } from "zod";
import { api } from "@/lib/api";

// D-065: pivot agregat & susunan widget Dashboard. Kunci pivot di bawah "employees" supaya ikut segar
// setelah mutasi/import karyawan (invalidasi employeeKeys.all).

export interface AnalyticsParams {
  month: string;
  companyId: string | undefined;
  scenario: SeveranceScenario;
}

export interface PivotParams {
  rows: PivotDimension;
  cols: PivotDimension | null;
  status: PivotStatus;
  filters: PivotFilters;
}

export const dashboardKeys = {
  pivot: (params: PivotParams) => ["employees", "dashboard-pivot", params] as const,
  layout: ["dashboard-layout"] as const,
  analytics: (params: AnalyticsParams) => ["employees", "dashboard-analytics", params] as const,
};

export function pivotSearch(params: PivotParams): string {
  const search = new URLSearchParams({ rows: params.rows, status: params.status });
  if (params.cols) search.set("cols", params.cols);
  for (const item of encodePivotFilters(params.filters)) search.append("filter", item);
  return search.toString();
}

const pivotEnvelope = z.object({ data: pivotResultSchema });

export const pivotQuery = (params: PivotParams) => ({
  queryKey: dashboardKeys.pivot(params),
  queryFn: ({ signal }: { signal: AbortSignal }) =>
    api(`/dashboard/pivot?${pivotSearch(params)}`, { schema: pivotEnvelope, signal }).then(
      (r) => r.data,
    ),
  staleTime: 60_000,
});

export function usePivot(params: PivotParams, enabled = true) {
  return useQuery({ ...pivotQuery(params), enabled, placeholderData: keepPreviousData });
}

/** Label nilai (kunci → nama) untuk beberapa dimensi sekaligus — dipakai chip filter. */
export function usePivotLabels(dimensions: PivotDimension[], status: PivotStatus) {
  return useQueries({
    queries: dimensions.map((rows) => pivotQuery({ rows, cols: null, status, filters: {} })),
    combine: (results) => {
      const map = new Map<string, string>();
      results.forEach((result, i) => {
        for (const key of result.data?.rowKeys ?? [])
          map.set(`${dimensions[i]}:${key.key}`, key.label);
      });
      return map;
    },
  });
}

const layoutEnvelope = z.object({
  data: z.object({ layout: dashboardLayoutSchema.nullable(), updatedAt: z.string().nullable() }),
});

export function useDashboardLayout(enabled = true) {
  return useQuery({
    queryKey: dashboardKeys.layout,
    queryFn: ({ signal }) =>
      api("/me/dashboard-layout", { schema: layoutEnvelope, signal }).then((r) => r.data),
    enabled,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function useSaveDashboardLayout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (layout: DashboardLayout | null) =>
      layout
        ? api("/me/dashboard-layout", { method: "PUT", body: { layout }, schema: layoutEnvelope })
        : api("/me/dashboard-layout", { method: "DELETE", schema: layoutEnvelope }),
    onSuccess: (result) => queryClient.setQueryData(dashboardKeys.layout, result.data),
  });
}

// DSB-D1: analitik SDM & biaya per bulan (GET /dashboard/analytics). Skema sengaja longgar (kunci tak
// dikenal diabaikan); rupiah null tanpa grant labor.cost.read, pensiun null tanpa grant data pribadi.
const num = z.number();
const headcountMonthSchema = z.object({
  month: z.string(),
  start: num,
  joined: num,
  left: num,
  leftByReason: z.record(z.string(), num),
  end: num,
  turnoverPct: num,
});
const efficiencyFields = {
  scheduledHours: num,
  effectiveHours: num,
  efficiencyPct: num,
  overtimeHours: num,
  overtimePct: num,
  latePct: num,
  alphaPct: num,
};

export const dashboardAnalyticsSchema = z.object({
  month: z.string(),
  scope: z.string(),
  showCost: z.boolean(),
  headcount: headcountMonthSchema.extend({
    prevEnd: num,
    endChangePct: num.nullable(),
    history: z.array(headcountMonthSchema),
  }),
  gender: z.array(z.object({ gender: z.string(), count: num, pct: num })),
  tenure: z.object({
    avgYears: num,
    buckets: z.array(
      z.object({
        bucket: z.string(),
        count: num,
        pct: num,
        avgYears: num,
        avgGranted: num,
        avgUsed: num,
        avgRemaining: num,
      }),
    ),
  }),
  leave: z.object({
    year: num,
    onLeaveToday: num,
    pendingRequests: num,
    usedDays: num,
    remainingDays: num,
    debtDays: num,
  }),
  efficiency: z.object({
    ...efficiencyFields,
    prevEfficiencyPct: num,
    byLocation: z.array(z.object({ location: z.string(), headcount: num, ...efficiencyFields })),
  }),
  projection: z.array(
    z.object({
      month: z.string(),
      contractEnds: num,
      tierChanges: num,
      retirements: num.nullable(),
      costDelta: num.nullable(),
    }),
  ),
  laborCost: z
    .object({
      rows: z.array(
        z.object({
          category: z.string(),
          headcount: num,
          wage: num,
          overtime: num,
          total: num,
          pct: num,
        }),
      ),
      total: num,
      wageMissing: num,
    })
    .nullable(),
  liability: z
    .object({
      scenario: z.string(),
      severance: num,
      upmk: num,
      pkwt: num,
      leaveComp: num,
      total: num,
      employees: num,
      wageMissing: num,
    })
    .nullable(),
});
export type DashboardAnalytics = z.infer<typeof dashboardAnalyticsSchema>;

const analyticsEnvelope = z.object({ data: dashboardAnalyticsSchema });

export function analyticsSearch(params: AnalyticsParams): string {
  const search = new URLSearchParams({ month: params.month, scenario: params.scenario });
  if (params.companyId) search.set("companyId", params.companyId);
  return search.toString();
}

type AnalyticsKey = ReturnType<typeof dashboardKeys.analytics>;

export function useDashboardAnalytics(
  month: string,
  companyId: string | undefined,
  scenario: SeveranceScenario = "PHK_NORMAL",
) {
  const params: AnalyticsParams = { month, companyId, scenario };
  return useQuery<DashboardAnalytics, Error, DashboardAnalytics, AnalyticsKey>({
    queryKey: dashboardKeys.analytics(params),
    queryFn: ({ signal }) =>
      api(`/dashboard/analytics?${analyticsSearch(params)}`, {
        schema: analyticsEnvelope,
        signal,
      }).then((r) => r.data),
    staleTime: 60_000,
    // Ganti bulan/skenario/perusahaan: angka lama tetap tampil (redup) sampai yang baru datang.
    placeholderData: keepPreviousData,
  });
}
