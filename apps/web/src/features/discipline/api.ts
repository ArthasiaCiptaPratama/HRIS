import type { WarningLevel } from "@hris/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "@/lib/api";
import { downloadBytes } from "@/lib/xlsx-write";
import {
  alphaRowSchema,
  letterDetailSchema,
  letterPageSchema,
  letterSchema,
  settingsSchema,
  suggestionSchema,
  violationTypeSchema,
} from "./schemas";

// ARS-D7–D13: hook TanStack Query modul discipline. Semua mutasi menyegarkan seluruh cache "discipline".
// Scan SP diunggah lewat dokumen karyawan → cache "documents" ikut disegarkan pemanggilnya.

export const disciplineKeys = { all: ["discipline"] as const };
const one = <T extends z.ZodType>(schema: T) => z.object({ data: schema });

const toSearch = (params: Record<string, string | number | undefined>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  return search;
};

export function useViolationTypes(enabled = true) {
  return useQuery({
    queryKey: [...disciplineKeys.all, "types"],
    queryFn: ({ signal }) =>
      api("/violation-types", { schema: one(z.array(violationTypeSchema)), signal }).then(
        (r) => r.data,
      ),
    enabled,
    staleTime: 5 * 60_000,
  });
}

export function useDisciplineSettings(enabled = true) {
  return useQuery({
    queryKey: [...disciplineKeys.all, "settings"],
    queryFn: ({ signal }) =>
      api("/discipline-settings", { schema: one(settingsSchema), signal }).then((r) => r.data),
    enabled,
  });
}

export interface LetterParams {
  page: number;
  pageSize: number;
  q?: string | undefined;
  state?: "DRAFT" | "ACTIVE" | "EXPIRED" | "REVOKED" | undefined;
  level?: WarningLevel | undefined;
  violationTypeId?: string | undefined;
  companyId?: string | undefined;
}

export function useWarningLetters(params: LetterParams) {
  return useQuery({
    queryKey: [...disciplineKeys.all, "list", params],
    queryFn: ({ signal }) =>
      api(`/warning-letters?${toSearch({ ...params })}`, { schema: letterPageSchema, signal }),
    placeholderData: (previous) => previous,
    staleTime: 30_000,
  });
}

export function useWarningLetter(id: string | null) {
  return useQuery({
    queryKey: [...disciplineKeys.all, "detail", id],
    queryFn: ({ signal }) =>
      api(`/warning-letters/${id}`, { schema: one(letterDetailSchema), signal }).then(
        (r) => r.data,
      ),
    enabled: id !== null,
  });
}

export function useEmployeeWarningLetters(employeeId: string | null) {
  return useQuery({
    queryKey: [...disciplineKeys.all, "employee", employeeId],
    queryFn: ({ signal }) =>
      api(`/warning-letters/employee/${employeeId}`, {
        schema: one(z.array(letterSchema)),
        signal,
      }).then((r) => r.data),
    enabled: employeeId !== null,
  });
}

export function useSelfWarningLetters(enabled = true) {
  return useQuery({
    queryKey: [...disciplineKeys.all, "self"],
    queryFn: ({ signal }) =>
      api("/self/warning-letters", { schema: one(z.array(letterSchema)), signal }).then(
        (r) => r.data,
      ),
    enabled,
  });
}

export function useLevelSuggestion(employeeId: string | null) {
  return useQuery({
    queryKey: [...disciplineKeys.all, "suggestion", employeeId],
    queryFn: ({ signal }) =>
      api(`/warning-letters/suggestion/${employeeId}`, {
        schema: one(suggestionSchema),
        signal,
      }).then((r) => r.data),
    enabled: employeeId !== null,
  });
}

export function useAlphaCandidates(employeeId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: [...disciplineKeys.all, "alpha", employeeId],
    queryFn: ({ signal }) =>
      api(`/warning-letters/alpha-days/${employeeId}`, {
        schema: one(z.array(alphaRowSchema)),
        signal,
      }).then((r) => r.data),
    enabled: enabled && employeeId !== null,
  });
}

type Body = Record<string, unknown>;

/** Aksi atas satu SP `{ id, body? }` → detail SP; menyegarkan seluruh cache discipline. */
function useLetterAction(path: string, method: "POST" | "PUT" = "POST") {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body?: Body }) =>
      api(path.replace(":id", id), {
        method,
        body: body ?? {},
        schema: one(letterDetailSchema),
      }).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: disciplineKeys.all }),
  });
}

export function useDisciplineMutations() {
  const queryClient = useQueryClient();
  const onSuccess = () => queryClient.invalidateQueries({ queryKey: disciplineKeys.all });
  return {
    saveType: useMutation({
      mutationFn: ({ id, body }: { id?: string; body: Body }) =>
        api(id ? `/violation-types/${id}` : "/violation-types", {
          method: id ? "PUT" : "POST",
          body,
          schema: one(violationTypeSchema),
        }).then((r) => r.data),
      onSuccess,
    }),
    saveSettings: useMutation({
      mutationFn: (body: Body) =>
        api("/discipline-settings", { method: "PUT", body, schema: one(settingsSchema) }).then(
          (r) => r.data,
        ),
      onSuccess,
    }),
    createDraft: useMutation({
      mutationFn: (body: Body) =>
        api("/warning-letters", { method: "POST", body, schema: one(letterSchema) }).then(
          (r) => r.data,
        ),
      onSuccess,
    }),
    updateDraft: useLetterAction("/warning-letters/:id", "PUT"),
    removeDraft: useMutation({
      mutationFn: (id: string) =>
        api(`/warning-letters/${id}`, { method: "DELETE", schema: z.unknown() }),
      onSuccess,
    }),
    issue: useLetterAction("/warning-letters/:id/issue"),
    revoke: useLetterAction("/warning-letters/:id/revoke"),
    deliver: useLetterAction("/warning-letters/:id/deliver"),
    attachScan: useLetterAction("/warning-letters/:id/scan"),
    acknowledge: useLetterAction("/self/warning-letters/:id/acknowledge"),
  };
}

const fileSchema = one(z.object({ fileName: z.string(), contentBase64: z.string() }));

/** ARS-D7: unduh PDF surat dari template sistem (dibuat server saat diminta). */
export async function downloadWarningLetter(id: string) {
  const { data } = await api(`/warning-letters/${id}/pdf`, { schema: fileSchema });
  const bytes = Uint8Array.from(atob(data.contentBase64), (c) => c.charCodeAt(0));
  downloadBytes(bytes, data.fileName, "application/pdf");
  return data.fileName;
}
