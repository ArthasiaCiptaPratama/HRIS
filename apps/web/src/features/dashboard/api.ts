import {
  type DashboardLayout,
  dashboardLayoutSchema,
  encodePivotFilters,
  type PivotDimension,
  type PivotFilters,
  type PivotStatus,
  pivotResultSchema,
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

export interface PivotParams {
  rows: PivotDimension;
  cols: PivotDimension | null;
  status: PivotStatus;
  filters: PivotFilters;
}

export const dashboardKeys = {
  pivot: (params: PivotParams) => ["employees", "dashboard-pivot", params] as const,
  layout: ["dashboard-layout"] as const,
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
