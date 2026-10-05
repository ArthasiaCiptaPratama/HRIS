import type { MasterDataKind, MasterDataView } from "@hris/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "@/lib/api";
import { masterDataItemSchema, mergeResultSchema, one, orgPostAdminSchema } from "./schemas";

export const organizationKeys = {
  posts: (view: MasterDataView, q: string, companyId: string) =>
    ["organization", "posts", view, q, companyId] as const,
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

// ── D-051: pos jabatan ──────────────────────────────────────────────────────

/** Daftar pos jabatan (SA kelola, HR lihat). `companyId`: id PT, "corporate", atau "" = semua. */
export function useOrgPosts(view: MasterDataView, q: string, companyId: string) {
  const params = new URLSearchParams({ view });
  if (q.trim()) params.set("q", q.trim());
  if (companyId) params.set("companyId", companyId);
  return useQuery({
    queryKey: organizationKeys.posts(view, q.trim(), companyId),
    queryFn: ({ signal }) =>
      api(`/org-posts?${params}`, { schema: one(z.array(orgPostAdminSchema)), signal }).then(
        (r) => r.data,
      ),
    placeholderData: (previous) => previous,
    staleTime: 30_000,
  });
}

export function useSaveOrgPost() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, body }: { id?: string; body: Record<string, unknown> }) =>
      id
        ? api(`/org-posts/${id}`, { method: "PATCH", body, schema: mutation })
        : api("/org-posts", { method: "POST", body, schema: mutation }),
    onSuccess: invalidate,
  });
}

export function useOrgPostAction() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: MasterDataAction }) =>
      action === "delete"
        ? api(`/org-posts/${id}`, { method: "DELETE", schema: mutation })
        : api(`/org-posts/${id}/${action}`, { method: "POST", schema: mutation }),
    onSuccess: invalidate,
  });
}

/** D-053: hitung ulang atasan otomatis dari pos (mis. setelah role Manager berubah). */
export function useSyncPostManagers() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: () =>
      api("/org-posts/sync-managers", {
        method: "POST",
        schema: one(z.object({ updated: z.number() })),
      }).then((r) => r.data),
    onSuccess: invalidate,
  });
}
