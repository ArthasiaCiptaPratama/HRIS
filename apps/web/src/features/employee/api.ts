import type { EmploymentCategory, ExitReason } from "@hris/shared";
import {
  keepPreviousData,
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  employeeDetailSchema,
  employeeListItemSchema,
  employeePageSchema,
  managerOptionSchema,
  masterDataSchema,
  one,
  orgStructureSchema,
  summarySchema,
} from "./schemas";

// Strategi cache (TanStack Query, memori saja — API mengirim Cache-Control: no-store):
// - master data jarang berubah → staleTime 5 menit, satu request untuk semua pilihan;
// - daftar & ringkasan → 30 detik + keepPreviousData supaya pindah halaman tidak berkedip;
// - detail (bisa berisi data sensitif) → 15 detik, dibuang dari memori 1 menit setelah ditutup;
// - setiap mutasi meng-invalidasi semua kunci "employees" (daftar, ringkasan, detail, struktur).

export const employeeKeys = {
  all: ["employees"] as const,
  list: (params: EmployeeListParams) => ["employees", "list", params] as const,
  summary: ["employees", "summary"] as const,
  detail: (id: string, view: DetailView) => ["employees", "detail", id, view] as const,
  structure: ["employees", "structure"] as const,
  managerOptions: ["employees", "manager-options"] as const,
  masterData: ["master-data"] as const,
};

export interface EmployeeListParams {
  page: number;
  pageSize: number;
  active: boolean;
  q?: string | undefined;
  category?: EmploymentCategory | undefined;
  departmentId?: string | undefined;
  workLocationId?: string | undefined;
  sort: string;
}

function toQuery(params: object) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  return search.toString();
}

const fetchEmployees = (params: EmployeeListParams, signal?: AbortSignal) =>
  api(`/employees?${toQuery(params)}`, { schema: employeePageSchema, signal });

export function useEmployees(params: EmployeeListParams, enabled = true) {
  return useQuery({
    queryKey: employeeKeys.list(params),
    queryFn: ({ signal }) => fetchEmployees(params, signal),
    placeholderData: keepPreviousData,
    enabled,
  });
}

/** Prefetch halaman pertama saat kursor di atas menu (navigasi terasa instan). */
export function prefetchEmployees(queryClient: QueryClient, params: EmployeeListParams) {
  return queryClient.prefetchQuery({
    queryKey: employeeKeys.list(params),
    queryFn: ({ signal }) => fetchEmployees(params, signal),
    staleTime: 30_000,
  });
}

export function useEmployeeSummary(enabled = true) {
  return useQuery({
    queryKey: employeeKeys.summary,
    queryFn: ({ signal }) =>
      api("/employees/summary", { schema: one(summarySchema), signal }).then((r) => r.data),
    enabled,
    staleTime: 60_000,
  });
}

export type DetailView = "work" | "full";

/**
 * "work" = data kerja (tanpa data sensitif, tanpa audit). "full" hanya diminta saat tab
 * sensitif dibuka (need-to-know): setiap pembacaan data sensitif tercatat di audit log.
 */
export function useEmployee(id: string | null, view: DetailView = "work", enabled = true) {
  return useQuery({
    queryKey: employeeKeys.detail(id ?? "", view),
    queryFn: ({ signal }) =>
      api(`/employees/${id}?view=${view}`, { schema: one(employeeDetailSchema), signal }).then(
        (r) => r.data,
      ),
    enabled: enabled && id !== null,
    staleTime: view === "full" ? 0 : 15_000,
    gcTime: view === "full" ? 0 : 60_000,
  });
}

export function useMasterData() {
  return useQuery({
    queryKey: employeeKeys.masterData,
    queryFn: ({ signal }) =>
      api("/master-data", { schema: one(masterDataSchema), signal }).then((r) => r.data),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });
}

export function useOrgStructure() {
  return useQuery({
    queryKey: employeeKeys.structure,
    queryFn: ({ signal }) =>
      api("/org-structure", { schema: one(orgStructureSchema), signal }).then((r) => r.data),
    staleTime: 60_000,
  });
}

export function useManagerOptions(enabled = true) {
  return useQuery({
    queryKey: employeeKeys.managerOptions,
    queryFn: ({ signal }) =>
      api("/employees/manager-options", {
        schema: one(managerOptionSchema.array()),
        signal,
      }).then((r) => r.data),
    enabled,
    staleTime: 60_000,
  });
}

// ── Mutasi ──────────────────────────────────────────────────────────────────

function useEmployeeMutation<TInput>(request: (input: TInput) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: request,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: employeeKeys.all }),
  });
}

const item = one(employeeListItemSchema);

export interface EmployeeWriteBody {
  employeeNumber: string;
  fullName: string;
  workEmail: string | null;
  phoneNumber: string | null;
  emergencyPhone: string | null;
  gender: "MALE" | "FEMALE" | null;
  joinDate: string;
  employmentStatusId?: string;
  positionId: string;
  workLocationId: string | null;
  gradeId: string | null;
  managerId: string | null;
}

export const useCreateEmployee = () =>
  useEmployeeMutation((body: EmployeeWriteBody) =>
    api("/employees", { method: "POST", body, schema: item }),
  );

export const useUpdateEmployee = () =>
  useEmployeeMutation(({ id, body }: { id: string; body: Partial<EmployeeWriteBody> }) =>
    api(`/employees/${id}`, { method: "PATCH", body, schema: item }),
  );

export const useChangeStatus = () =>
  useEmployeeMutation(
    ({
      id,
      ...body
    }: {
      id: string;
      employmentStatusId: string;
      effectiveDate: string;
      note?: string;
    }) => api(`/employees/${id}/status-change`, { method: "POST", body, schema: item }),
  );

export const useDeactivateEmployee = () =>
  useEmployeeMutation(
    ({
      id,
      ...body
    }: {
      id: string;
      effectiveDate: string;
      exitReason: ExitReason;
      note?: string;
    }) => api(`/employees/${id}/deactivate`, { method: "POST", body, schema: item }),
  );

export const useReactivateEmployee = () =>
  useEmployeeMutation(
    ({
      id,
      ...body
    }: {
      id: string;
      effectiveDate: string;
      employmentStatusId?: string;
      note?: string;
    }) => api(`/employees/${id}/reactivate`, { method: "POST", body, schema: item }),
  );
