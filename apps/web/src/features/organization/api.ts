import type { MasterDataKind, MasterDataView } from "@hris/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "@/lib/api";
import { masterDataItemSchema, mergeResultSchema, one } from "./schemas";

export const organizationKeys = {
  admin: (kind: MasterDataKind, view: MasterDataView, q: string) =>
    ["organization", "admin", kind, view, q] as const,
};

/** Daftar admin (SA kelola, HR lihat). Tabel kecil → tanpa paginasi. */
export function useMasterDataAdmin(kind: MasterDataKind, view: MasterDataView, q: string) {
  const params = new URLSearchParams({ view });
  if (q.trim()) params.set("q", q.trim());
  return useQuery({
    queryKey: organizationKeys.admin(kind, view, q.trim()),
    queryFn: ({ signal }) =>
      api(`/${kind}?${params}`, { schema: one(z.array(masterDataItemSchema)), signal }).then(
        (r) => r.data,
      ),
    placeholderData: (previous) => previous,
    staleTime: 30_000,
  });
}

/**
 * Perubahan master data memengaruhi pilihan form & filter (/master-data), nama di daftar karyawan,
 * struktur organisasi, dan dashboard → segarkan semuanya.
 */
function useInvalidate() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ["organization"] });
    void queryClient.invalidateQueries({ queryKey: ["master-data"] });
    void queryClient.invalidateQueries({ queryKey: ["employees"] });
  };
}

const mutation = one(z.object({ id: z.string() }));

export function useSaveMasterData(kind: MasterDataKind) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, body }: { id?: string; body: Record<string, unknown> }) =>
      id
        ? api(`/${kind}/${id}`, { method: "PATCH", body, schema: mutation })
        : api(`/${kind}`, { method: "POST", body, schema: mutation }),
    onSuccess: invalidate,
  });
}

export type MasterDataAction = "archive" | "restore" | "delete";

export function useMasterDataAction(kind: MasterDataKind) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: MasterDataAction }) =>
      action === "delete"
        ? api(`/${kind}/${id}`, { method: "DELETE", schema: mutation })
        : api(`/${kind}/${id}/${action}`, { method: "POST", schema: mutation }),
    onSuccess: invalidate,
  });
}

export function useMergeMasterData(kind: MasterDataKind) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, targetId }: { id: string; targetId: string }) =>
      api(`/${kind}/${id}/merge`, {
        method: "POST",
        body: { targetId },
        schema: one(mergeResultSchema),
      }).then((r) => r.data),
    onSuccess: invalidate,
  });
}
