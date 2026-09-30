import { IMPORT_FIELD_KEYS, type ImportFieldKey } from "@hris/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "@/lib/api";
import { ApiError } from "@/lib/api-client";
import { employeeKeys } from "../api";

// D-042: klien API import karyawan (subset respons; sumber kebenaran apps/api …/employee-import.schema.ts).

const fieldKey = z.enum(IMPORT_FIELD_KEYS as [ImportFieldKey, ...ImportFieldKey[]]);
const issueSchema = z.object({
  field: fieldKey.nullable(),
  code: z.string(),
  severity: z.enum(["ERROR", "WARNING"]),
});

export const previewSchema = z.object({
  counts: z.object({
    total: z.number(),
    create: z.number(),
    update: z.number(),
    skip: z.number(),
    error: z.number(),
    blank: z.number(),
  }),
  rows: z.array(
    z.object({
      sourceRow: z.number(),
      action: z.enum(["CREATE", "UPDATE", "SKIP", "ERROR"]),
      employeeNumber: z.string().nullable(),
      fullName: z.string().nullable(),
      changes: z.array(z.string()),
      issues: z.array(issueSchema),
    }),
  ),
  masterData: z.object({
    departments: z.array(z.string()),
    positions: z.array(z.object({ department: z.string(), name: z.string() })),
    grades: z.array(z.string()),
    workLocations: z.array(z.string()),
  }),
  skippedFields: z.array(fieldKey),
  previewHash: z.string(),
});
export type ImportPreview = z.infer<typeof previewSchema>;

const mappingSchema = z.object({
  signature: z.string(),
  mapping: z.record(z.string(), fieldKey.nullable()),
  updatedAt: z.string(),
});

export type ImportCell = string | number | boolean | null;

export interface ImportRequest {
  fileName: string;
  fileSha256: string;
  mode: "CREATE_ONLY" | "UPSERT";
  rows: { sourceRow: number; raw: Partial<Record<ImportFieldKey, ImportCell>> }[];
  masterDataMapping?: {
    departments?: Record<string, string>;
    positions?: Record<string, string>;
    grades?: Record<string, string>;
    workLocations?: Record<string, string>;
  };
}

const one = <T extends z.ZodType>(item: T) => z.object({ data: item });

export function usePreviewImport() {
  return useMutation({
    mutationFn: (body: ImportRequest) =>
      api("/employee-imports/preview", {
        method: "POST",
        body,
        schema: one(previewSchema),
      }).then((r) => r.data),
  });
}

export function useCommitImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ImportRequest & { previewHash: string }) =>
      api("/employee-imports", {
        method: "POST",
        body,
        schema: one(z.object({ jobId: z.string(), counts: previewSchema.shape.counts })),
      }).then((r) => r.data),
    // Daftar, ringkasan (badge), struktur & master data (bisa ada jabatan/departemen baru) disegarkan.
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: employeeKeys.all });
      void queryClient.invalidateQueries({ queryKey: employeeKeys.masterData });
    },
  });
}

/** Profil pemetaan tersimpan untuk susunan header; null bila belum ada. */
export async function fetchSavedMapping(signature: string) {
  try {
    const res = await api(`/employee-imports/mappings/${signature}`, {
      schema: one(mappingSchema),
    });
    return res.data.mapping;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export function saveMapping(signature: string, mapping: Record<string, ImportFieldKey | null>) {
  return api(`/employee-imports/mappings/${signature}`, {
    method: "PUT",
    body: { mapping },
    schema: one(mappingSchema),
  });
}
