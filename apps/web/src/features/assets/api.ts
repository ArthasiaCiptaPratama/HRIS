import type { AssetStatus, BastKind } from "@hris/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "@/lib/api";
import { downloadBytes } from "@/lib/xlsx-write";
import {
  assetDetailSchema,
  assetPageSchema,
  assetSchema,
  assignmentSchema,
  categorySchema,
  holdingsSchema,
  pendingReturnSchema,
  ppeIssueSchema,
  ppePageSchema,
  ppeTypeSchema,
} from "./schemas";

// ARS-D1–D6: hook TanStack Query modul asset. Semua mutasi menyegarkan seluruh cache "assets".

export const assetKeys = { all: ["assets"] as const };
const one = <T extends z.ZodType>(schema: T) => z.object({ data: schema });

const toSearch = (params: Record<string, string | number | boolean | undefined>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "" && value !== false) search.set(key, String(value));
  }
  return search;
};

export function useAssetCategories(enabled = true) {
  return useQuery({
    queryKey: [...assetKeys.all, "categories"],
    queryFn: ({ signal }) =>
      api("/asset-categories", { schema: one(z.array(categorySchema)), signal }).then(
        (r) => r.data,
      ),
    enabled,
    staleTime: 5 * 60_000,
  });
}

export function usePpeTypes(enabled = true) {
  return useQuery({
    queryKey: [...assetKeys.all, "ppe-types"],
    queryFn: ({ signal }) =>
      api("/ppe-types", { schema: one(z.array(ppeTypeSchema)), signal }).then((r) => r.data),
    enabled,
    staleTime: 5 * 60_000,
  });
}

export interface AssetParams {
  page: number;
  pageSize: number;
  q?: string | undefined;
  status?: AssetStatus | undefined;
  categoryId?: string | undefined;
  companyId?: string | undefined;
  overdue?: boolean | undefined;
}

export function useAssets(params: AssetParams) {
  return useQuery({
    queryKey: [...assetKeys.all, "list", params],
    queryFn: ({ signal }) =>
      api(`/assets?${toSearch({ ...params })}`, { schema: assetPageSchema, signal }),
    placeholderData: (previous) => previous,
    staleTime: 30_000,
  });
}

export function useAsset(id: string | null) {
  return useQuery({
    queryKey: [...assetKeys.all, "detail", id],
    queryFn: ({ signal }) =>
      api(`/assets/${id}`, { schema: one(assetDetailSchema), signal }).then((r) => r.data),
    enabled: id !== null,
  });
}

export async function fetchNextAssetCode(companyId: string, categoryId: string) {
  const { data } = await api(`/assets/next-code?${toSearch({ companyId, categoryId })}`, {
    schema: one(z.object({ code: z.string() })),
  });
  return data.code;
}

export interface PpeParams {
  page: number;
  pageSize: number;
  q?: string | undefined;
  ppeTypeId?: string | undefined;
  employeeId?: string | undefined;
  replacement?: "DUE" | undefined;
}

export function usePpeIssues(params: PpeParams) {
  return useQuery({
    queryKey: [...assetKeys.all, "ppe", params],
    queryFn: ({ signal }) =>
      api(`/ppe-issues?${toSearch({ ...params })}`, { schema: ppePageSchema, signal }),
    placeholderData: (previous) => previous,
    staleTime: 30_000,
  });
}

/** Aset & APD yang dipegang karyawan (tab Aset detail karyawan / dialog nonaktifkan). */
export function useAssetHoldings(employeeId: string | null, openOnly = false, enabled = true) {
  return useQuery({
    queryKey: [...assetKeys.all, "holdings", employeeId, openOnly],
    queryFn: ({ signal }) =>
      api(`/asset-holdings/${employeeId}?openOnly=${openOnly}`, {
        schema: one(holdingsSchema),
        signal,
      }).then((r) => r.data),
    enabled: enabled && employeeId !== null,
  });
}

export function useSelfAssets(enabled = true) {
  return useQuery({
    queryKey: [...assetKeys.all, "self"],
    queryFn: ({ signal }) =>
      api("/self/assets", { schema: one(holdingsSchema), signal }).then((r) => r.data),
    enabled,
  });
}

export function usePendingReturns(enabled = true) {
  return useQuery({
    queryKey: [...assetKeys.all, "pending"],
    queryFn: ({ signal }) =>
      api("/asset-returns/pending", { schema: one(z.array(pendingReturnSchema)), signal }).then(
        (r) => r.data,
      ),
    enabled,
  });
}

type Body = Record<string, unknown>;

/** Mutasi POST/PUT sederhana `{ id?, body }` → `data`; menyegarkan seluruh cache aset. */
function useAssetPost<T extends z.ZodType>(
  path: string,
  schema: T,
  method: "POST" | "PUT" = "POST",
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id?: string; body: Body }) =>
      api(path.replace(":id", id ?? ""), { method, body, schema: one(schema) }).then(
        (r) => (r as { data: z.infer<T> }).data,
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: assetKeys.all }),
  });
}

export function useAssetMutations() {
  const queryClient = useQueryClient();
  const onSuccess = () => queryClient.invalidateQueries({ queryKey: assetKeys.all });
  return {
    saveCategory: useMutation({
      mutationFn: ({ id, body }: { id?: string; body: Body }) =>
        api(id ? `/asset-categories/${id}` : "/asset-categories", {
          method: id ? "PUT" : "POST",
          body,
          schema: one(categorySchema),
        }).then((r) => r.data),
      onSuccess,
    }),
    savePpeType: useMutation({
      mutationFn: ({ id, body }: { id?: string; body: Body }) =>
        api(id ? `/ppe-types/${id}` : "/ppe-types", {
          method: id ? "PUT" : "POST",
          body,
          schema: one(ppeTypeSchema),
        }).then((r) => r.data),
      onSuccess,
    }),
    saveAsset: useMutation({
      mutationFn: ({ id, body }: { id?: string; body: Body }) =>
        api(id ? `/assets/${id}` : "/assets", {
          method: id ? "PUT" : "POST",
          body,
          schema: one(assetSchema),
        }).then((r) => r.data),
      onSuccess,
    }),
    setStatus: useAssetPost("/assets/:id/status", assetSchema),
    assign: useAssetPost("/assets/:id/assign", assignmentSchema),
    returnAsset: useAssetPost("/asset-assignments/:id/return", assignmentSchema),
    markLost: useAssetPost("/asset-assignments/:id/lost", assignmentSchema),
    attachBast: useAssetPost("/asset-assignments/:id/bast", assignmentSchema),
    acknowledge: useAssetPost("/self/asset-assignments/:id/acknowledge", assignmentSchema),
    issuePpe: useAssetPost("/ppe-issues", ppeIssueSchema),
    returnPpe: useAssetPost("/ppe-issues/:id/return", ppeIssueSchema),
    attachPpeBast: useAssetPost("/ppe-issues/:id/bast", ppeIssueSchema),
    acknowledgePpe: useAssetPost("/self/ppe-issues/:id/acknowledge", ppeIssueSchema),
    removePpe: useMutation({
      mutationFn: (id: string) =>
        api(`/ppe-issues/${id}`, { method: "DELETE", schema: z.unknown() }),
      onSuccess,
    }),
  };
}

const fileSchema = one(z.object({ fileName: z.string(), contentBase64: z.string() }));

/** ARS-D2: unduh PDF BAST (dibuat server saat diminta). */
export async function downloadBast(
  target: { assignmentId: string; kind: BastKind } | { ppeIssueId: string },
) {
  const path =
    "assignmentId" in target
      ? `/asset-assignments/${target.assignmentId}/bast-pdf?kind=${target.kind}`
      : `/ppe-issues/${target.ppeIssueId}/bast-pdf`;
  const { data } = await api(path, { schema: fileSchema });
  const bytes = Uint8Array.from(atob(data.contentBase64), (c) => c.charCodeAt(0));
  downloadBytes(bytes, data.fileName, "application/pdf");
  return data.fileName;
}
