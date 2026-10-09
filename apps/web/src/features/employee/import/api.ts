import { IMPORT_FIELD_KEYS, type ImportFieldKey } from "@hris/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
    attachments: z.number(),
  }),
  rows: z.array(
    z.object({
      sourceRow: z.number(),
      action: z.enum(["CREATE", "UPDATE", "SKIP", "ERROR"]),
      employeeNumber: z.string().nullable(),
      fullName: z.string().nullable(),
      companyCode: z.string().nullable(),
      newEmployee: z.boolean(),
      employmentStatusId: z.string().nullable(),
      changes: z.array(z.string()),
      issues: z.array(issueSchema),
      attachments: z.number(),
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
  companyId?: string | undefined;
  /** D-062: status bawaan & status per baris (nomor baris → id) untuk baris yang belum ada di sistem. */
  defaultEmploymentStatusId?: string | undefined;
  employmentStatusOverrides?: Record<string, string> | undefined;
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

// ── D-060: lampiran Google Drive ─────────────────────────────────────────────

export const attachmentsSchema = z.object({
  jobId: z.string(),
  driveConfigured: z.boolean(),
  counts: z.object({
    total: z.number(),
    pending: z.number(),
    done: z.number(),
    skipped: z.number(),
    failed: z.number(),
  }),
  items: z.array(
    z.object({
      id: z.string(),
      sourceRow: z.number(),
      employeeNumber: z.string(),
      fullName: z.string(),
      field: z.string(),
      target: z.string(),
      fileCount: z.number(),
      status: z.enum(["PENDING", "PROCESSING", "DONE", "SKIPPED", "FAILED"]),
      reason: z.string().nullable(),
    }),
  ),
});
export type ImportAttachments = z.infer<typeof attachmentsSchema>;

const openJobsSchema = z.array(
  z.object({
    jobId: z.string(),
    fileName: z.string(),
    createdAt: z.string(),
    pending: z.number(),
    failed: z.number(),
  }),
);

export const importKeys = {
  attachments: (jobId: string) => ["employee-imports", jobId, "attachments"] as const,
  openAttachments: ["employee-imports", "attachments-open"] as const,
};

export function useImportAttachments(jobId: string) {
  return useQuery({
    queryKey: importKeys.attachments(jobId),
    queryFn: ({ signal }) =>
      api(`/employee-imports/${jobId}/attachments`, {
        schema: one(attachmentsSchema),
        signal,
      }).then((r) => r.data),
  });
}

export function useOpenAttachmentJobs() {
  return useQuery({
    queryKey: importKeys.openAttachments,
    queryFn: ({ signal }) =>
      api("/employee-imports/attachments/open", { schema: one(openJobsSchema), signal }).then(
        (r) => r.data,
      ),
  });
}

/** Proses / ulangi lampiran: hasil langsung menggantikan cache status lampiran import itu. */
export function useAttachmentActions(jobId: string) {
  const queryClient = useQueryClient();
  const onSuccess = (data: ImportAttachments) => {
    queryClient.setQueryData(importKeys.attachments(jobId), data);
    void queryClient.invalidateQueries({ queryKey: importKeys.openAttachments });
  };
  const post = (action: "process" | "retry") =>
    api(`/employee-imports/${jobId}/attachments/${action}`, {
      method: "POST",
      schema: one(attachmentsSchema),
    }).then((r) => r.data);
  return {
    process: useMutation({ mutationFn: () => post("process"), onSuccess }),
    retry: useMutation({ mutationFn: () => post("retry"), onSuccess }),
  };
}
