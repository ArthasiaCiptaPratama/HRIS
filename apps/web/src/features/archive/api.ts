import type { ArchiveCategory } from "@hris/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "@/lib/api";
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

export function useArchiveList(category: ArchiveListCategory, params: ArchiveParams) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
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
