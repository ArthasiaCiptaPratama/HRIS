import { type ArchiveCategory, XLSX_CONTENT_TYPE } from "@hris/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "@/lib/api";
import { downloadBytes } from "@/lib/xlsx-write";
import { archivePageSchema } from "./schemas";

// D-054 (Arsip 1a): tabel lintas karyawan & kelola item per karyawan.

export interface ArchiveParams {
  page: number;
  pageSize: number;
  q?: string | undefined;
  companyId?: string | undefined;
  departmentId?: string | undefined;
  employees: "active" | "inactive" | "all";
  level?: string | undefined;
  type?: string | undefined;
  movementType?: string | undefined;
  source?: string | undefined;
  documentTypeId?: string | undefined;
  expiry?: string | undefined;
  relationship?: string | undefined;
}

/** Kategori tabel Arsip: kategori 1a + Data File (D-055). */
export type ArchiveListCategory = ArchiveCategory | "documents" | "families" | "bank-accounts";

export const archiveKeys = {
  all: ["archive"] as const,
  list: (category: ArchiveListCategory, params: ArchiveParams) =>
    ["archive", category, params] as const,
};

const toSearch = (params: Partial<ArchiveParams>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  return search;
};

export function useArchiveList(category: ArchiveListCategory, params: ArchiveParams) {
  const search = toSearch(params);
  return useQuery({
    queryKey: archiveKeys.list(category, params),
    queryFn: ({ signal }) =>
      api(`/archive/${category}?${search}`, { schema: archivePageSchema, signal }),
    placeholderData: (previous) => previous,
    staleTime: 30_000,
  });
}

export type ItemCategory = Exclude<ArchiveCategory, "contacts">;
const mutation = z.object({ data: z.object({ id: z.string() }) });

/** Tambah/ubah/hapus item; segarkan detail karyawan & tabel Arsip. */
export function useArchiveItem(category: ItemCategory, employeeId: string) {
  const queryClient = useQueryClient();
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["employees"] });
    void queryClient.invalidateQueries({ queryKey: archiveKeys.all });
  };
  const base = `/employees/${employeeId}/${category}`;
  return {
    save: useMutation({
      mutationFn: ({ id, body }: { id?: string; body: Record<string, unknown> }) =>
        id
          ? api(`${base}/${id}`, { method: "PATCH", body, schema: mutation })
          : api(base, { method: "POST", body, schema: mutation }),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string) => api(`${base}/${id}`, { method: "DELETE", schema: mutation }),
      onSuccess: invalidate,
    }),
  };
}

// D-058 (1d): ekspor Excel sesuai filter tabel (tanpa halaman). File dibuat server, diunduh di browser.
const exportSchema = z.object({
  data: z.object({ fileName: z.string(), rows: z.number(), contentBase64: z.string() }),
});

export function useArchiveExport(category: ArchiveListCategory) {
  return useMutation({
    mutationFn: async ({ page: _page, pageSize: _size, ...filters }: ArchiveParams) => {
      const { data } = await api(`/archive/${category}/export?${toSearch(filters)}`, {
        schema: exportSchema,
      });
      const bytes = Uint8Array.from(atob(data.contentBase64), (c) => c.charCodeAt(0));
      downloadBytes(bytes, data.fileName, XLSX_CONTENT_TYPE);
      return data;
    },
  });
}
