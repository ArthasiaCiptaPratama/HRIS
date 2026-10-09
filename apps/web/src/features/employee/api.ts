import type { EmploymentCategory, EmploymentCategoryGroup, ExitReason } from "@hris/shared";
import {
  keepPreviousData,
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { z } from "zod";
import { api } from "@/lib/api";
import { prepareProfilePhoto } from "@/lib/image";
import { supabase } from "@/lib/supabase";
import { useStoredCompanyId } from "./company-scope";
import {
  dashboardSchema,
  employeeDetailSchema,
  employeeListItemSchema,
  employeePageSchema,
  managerOptionSchema,
  masterDataSchema,
  one,
  orgChartSchema,
  orgPersonCardSchema,
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
  summary: (companyId: string | undefined) => ["employees", "summary", companyId ?? "all"] as const,
  dashboard: ["employees", "dashboard"] as const,
  detail: (id: string, view: DetailView) => ["employees", "detail", id, view] as const,
  structure: ["employees", "structure"] as const,
  chart: (companyId: string | null) => ["employees", "org-chart", companyId ?? "default"] as const,
  card: (id: string) => ["employees", "org-chart", "card", id] as const,
  managerOptions: ["employees", "manager-options"] as const,
  masterData: ["master-data"] as const,
};

export interface EmployeeListParams {
  page: number;
  pageSize: number;
  active: boolean;
  q?: string | undefined;
  category?: EmploymentCategory | undefined;
  group?: EmploymentCategoryGroup | undefined;
  /** D-040: perusahaan terpilih di top bar (tanpa = semua dalam cakupan). */
  companyId?: string | undefined;
  departmentId?: string | undefined;
  workLocationId?: string | undefined;
  /** D-063: hanya karyawan tanpa NIP. */
  missingNumber?: boolean | undefined;
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
  const { selectedId } = useCompanyScope(enabled);
  return useQuery({
    queryKey: employeeKeys.summary(selectedId),
    queryFn: ({ signal }) =>
      api(`/employees/summary${selectedId ? `?companyId=${selectedId}` : ""}`, {
        schema: one(summarySchema),
        signal,
      }).then((r) => r.data),
    enabled,
    staleTime: 60_000,
  });
}

/** Dashboard SA/HR (cakupan PT aktor, D-040); kunci di bawah "employees" sehingga ikut segar setelah mutasi/import. */
export function useDashboard(enabled = true) {
  return useQuery({
    queryKey: employeeKeys.dashboard,
    queryFn: ({ signal }) =>
      api("/dashboard", { schema: one(dashboardSchema), signal }).then((r) => r.data),
    enabled,
    staleTime: 60_000,
  });
}

/**
 * D-040: perusahaan yang boleh dilihat (dari /master-data, sudah disaring API) + pilihan top bar.
 * `showCompany` = pengguna melihat > 1 perusahaan → kolom/label perusahaan ditampilkan.
 */
export function useCompanyScope(enabled = true) {
  const master = useMasterData(enabled);
  const stored = useStoredCompanyId();
  const companies = master.data?.companies ?? [];
  const selectedId = stored && companies.some((c) => c.id === stored) ? stored : undefined;
  return { companies, selectedId, showCompany: companies.length > 1 };
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

/**
 * Bahan formulir cetak (.xlsx): selalu diambil baru (tidak di-cache) karena setiap unduhan
 * tercatat di audit log (`employee.printed`). API menolak (403) selain SA/HR.
 */
export function fetchEmployeeForPrint(id: string) {
  return api(`/employees/${id}?view=print`, { schema: one(employeeDetailSchema) }).then(
    (r) => r.data,
  );
}

export function useMasterData(enabled = true) {
  return useQuery({
    queryKey: employeeKeys.masterData,
    queryFn: ({ signal }) =>
      api("/master-data", { schema: one(masterDataSchema), signal }).then((r) => r.data),
    enabled,
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

/** D-051: bagan organisasi per PT (kolom direktori; foto URL bertanda tangan berlaku singkat). */
export function useOrgChart(companyId: string | null) {
  return useQuery({
    queryKey: employeeKeys.chart(companyId),
    queryFn: ({ signal }) =>
      api(`/org-chart${companyId ? `?companyId=${companyId}` : ""}`, {
        schema: one(orgChartSchema),
        signal,
      }).then((r) => r.data),
    placeholderData: (previous) => previous,
    staleTime: 60_000,
  });
}

/** D-051: kartu profil kerja untuk role yang tidak membuka detail karyawan lengkap. */
export function useOrgPersonCard(id: string | null) {
  return useQuery({
    queryKey: employeeKeys.card(id ?? ""),
    queryFn: ({ signal }) =>
      api(`/org-chart/people/${id}`, { schema: one(orgPersonCardSchema), signal }).then(
        (r) => r.data,
      ),
    enabled: id !== null,
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
  employeeNumber: string | null;
  fullName: string;
  workEmail: string | null;
  phoneNumber: string | null;
  emergencyPhone: string | null;
  emergencyContactName: string | null;
  emergencyContactRelationship: string | null;
  gender: "MALE" | "FEMALE" | null;
  joinDate: string;
  /** D-039: wajib saat tambah; saat ubah = pindah perusahaan bila berbeda. */
  companyId: string;
  employmentStatusId?: string;
  positionId: string;
  workLocationId: string | null;
  gradeId: string | null;
  /** Tanpa field = tidak diubah (mode atasan otomatis dari pos, D-053). */
  managerId?: string | null;
  /** D-051: pos jabatan; null = lepas dari pos. */
  orgPostId?: string | null;
  /** D-053: true = atasan manual; false = otomatis dari pos. */
  managerOverride?: boolean;
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

// ── Foto profil (D-037) ─────────────────────────────────────────────────────
// Alur: minta URL unggah (API) → unggah langsung ke Supabase Storage dengan token sekali pakai →
// konfirmasi (API memeriksa tipe & ukuran, menyimpan path, menghapus foto lama).

const uploadUrlSchema = one(
  z.object({
    bucket: z.string(),
    path: z.string(),
    token: z.string(),
    signedUrl: z.string(),
    maxBytes: z.number(),
  }),
);
const photoResultSchema = one(z.object({ photoUrl: z.string().nullable() }));

export class PhotoUploadError extends Error {}

export const useUploadPhoto = () =>
  useEmployeeMutation(async ({ id, file }: { id: string; file: File }) => {
    const { blob, contentType } = await prepareProfilePhoto(file);
    const { data: upload } = await api(`/employees/${id}/photo/upload-url`, {
      method: "POST",
      body: { contentType },
      schema: uploadUrlSchema,
    });
    if (blob.size > upload.maxBytes) {
      throw new PhotoUploadError("Foto masih terlalu besar setelah dikompres (maks 2 MB).");
    }
    const { error } = await supabase.storage
      .from(upload.bucket)
      .uploadToSignedUrl(upload.path, upload.token, blob, { contentType });
    if (error) throw new PhotoUploadError("Foto gagal diunggah. Periksa koneksi lalu coba lagi.");
    return api(`/employees/${id}/photo`, {
      method: "POST",
      body: { path: upload.path },
      schema: photoResultSchema,
    });
  });

export const useDeletePhoto = () =>
  useEmployeeMutation(({ id }: { id: string }) =>
    api(`/employees/${id}/photo`, { method: "DELETE", schema: photoResultSchema }),
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
