import type { CorrectionInput, PeriodCloseInput } from "@hris/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { approvalSchema } from "./schemas";

// Tahap F — koreksi absensi, rekap bulanan, tutup periode → ALPHA, surat pernyataan (D-070).

const one = <T extends z.ZodType>(schema: T) => z.object({ data: schema });
const many = <T extends z.ZodType>(schema: T) => z.object({ data: z.array(schema) });
const person = z.object({
  id: z.string(),
  fullName: z.string(),
  employeeNumber: z.string().nullable(),
});

export const correctionSchema = z.object({
  id: z.string(),
  employee: person,
  workDate: z.string(),
  checkInAt: z.string().nullable(),
  checkOutAt: z.string().nullable(),
  reason: z.string(),
  status: z.string(),
  createdAt: z.string(),
  approval: approvalSchema.nullable(),
  canCancel: z.boolean(),
});
export type Correction = z.infer<typeof correctionSchema>;

export const recapRowSchema = z.object({
  employee: person,
  workDays: z.number(),
  offDays: z.number(),
  present: z.number(),
  pending: z.number(),
  rejected: z.number(),
  alpha: z.number(),
  leave: z.number(),
  noRecord: z.number(),
  late: z.number(),
  earlyLeave: z.number(),
  outsideRoster: z.number(),
  statements: z.number(),
});
export type RecapRow = z.infer<typeof recapRowSchema>;

const recapSchema = z.object({
  month: z.string(),
  companyId: z.string(),
  period: z.object({ status: z.string(), closedAt: z.string().nullable() }),
  canClose: z.boolean(),
  rows: z.array(recapRowSchema),
});

const closePreviewSchema = z.object({
  status: z.string(),
  alpha: z.number(),
  noAttendance: z.number(),
  pending: z.number(),
  rejected: z.number(),
  sample: z.array(z.object({ employee: person, date: z.string(), status: z.string().nullable() })),
});

export const statementRowSchema = z.object({
  dayId: z.string(),
  employee: person,
  workDate: z.string(),
  statement: z
    .object({
      id: z.string(),
      reason: z.string(),
      createdAt: z.string(),
      attachmentUrl: z.string().nullable(),
    })
    .nullable(),
});
export type StatementRow = z.infer<typeof statementRowSchema>;

export const periodKeys = {
  corrections: (scope: string) => ["time-management", "corrections", scope] as const,
  recap: (companyId: string, month: string) =>
    ["time-management", "recap", companyId, month] as const,
  myStatements: ["time-management", "statements", "me"] as const,
  statements: (companyId: string, month: string) =>
    ["time-management", "statements", companyId, month] as const,
};

function useRefresh() {
  const queryClient = useQueryClient();
  return () => void queryClient.invalidateQueries({ queryKey: ["time-management"] });
}

export function useCorrections(scope: "mine" | "inbox", enabled = true) {
  return useQuery({
    queryKey: periodKeys.corrections(scope),
    queryFn: ({ signal }) =>
      api(`/attendance/corrections?scope=${scope}`, {
        schema: many(correctionSchema),
        signal,
      }).then((r) => r.data),
    enabled,
  });
}

export function useCorrectionActions() {
  const refresh = useRefresh();
  const create = useMutation({
    mutationFn: (input: CorrectionInput) =>
      api("/attendance/corrections", {
        method: "POST",
        body: input,
        schema: one(correctionSchema),
      }),
    onSuccess: refresh,
  });
  const cancel = useMutation({
    mutationFn: (id: string) =>
      api(`/attendance/corrections/${id}/cancel`, {
        method: "POST",
        schema: one(correctionSchema),
      }),
    onSuccess: refresh,
  });
  return { create, cancel };
}

export function useRecap(companyId: string | undefined, month: string) {
  return useQuery({
    queryKey: periodKeys.recap(companyId ?? "", month),
    queryFn: ({ signal }) =>
      api(`/attendance/recap?companyId=${companyId}&month=${month}`, {
        schema: one(recapSchema),
        signal,
      }).then((r) => r.data),
    enabled: Boolean(companyId),
    placeholderData: (previous) => previous,
  });
}

export function usePeriodClose() {
  const refresh = useRefresh();
  const preview = useMutation({
    mutationFn: (input: PeriodCloseInput) =>
      api("/attendance/periods/preview", {
        method: "POST",
        body: input,
        schema: one(closePreviewSchema),
      }).then((r) => r.data),
  });
  const close = useMutation({
    mutationFn: (input: PeriodCloseInput) =>
      api("/attendance/periods/close", {
        method: "POST",
        body: input,
        schema: one(z.object({ month: z.string(), alpha: z.number() })),
      }).then((r) => r.data),
    onSuccess: refresh,
  });
  return { preview, close };
}

export function useMyStatements(enabled = true) {
  return useQuery({
    queryKey: periodKeys.myStatements,
    queryFn: ({ signal }) =>
      api("/attendance/statements/me", { schema: many(statementRowSchema), signal }).then(
        (r) => r.data,
      ),
    enabled,
  });
}

export function useStatements(companyId: string | undefined, month: string) {
  return useQuery({
    queryKey: periodKeys.statements(companyId ?? "", month),
    queryFn: ({ signal }) =>
      api(`/attendance/statements?companyId=${companyId}&month=${month}`, {
        schema: many(statementRowSchema),
        signal,
      }).then((r) => r.data),
    enabled: Boolean(companyId),
  });
}

export class StatementUploadError extends Error {}

export function useCreateStatement() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async ({
      dayId,
      reason,
      file,
    }: {
      dayId: string;
      reason: string;
      file: File | null;
    }) => {
      let attachmentPath: string | undefined;
      if (file) {
        const { data: upload } = await api("/attendance/statements/upload", {
          method: "POST",
          body: { contentType: file.type },
          schema: one(
            z.object({
              bucket: z.string(),
              path: z.string(),
              token: z.string(),
              maxBytes: z.number(),
            }),
          ),
        });
        if (file.size > upload.maxBytes)
          throw new StatementUploadError("Lampiran terlalu besar (maks 5 MB).");
        const { error } = await supabase.storage
          .from(upload.bucket)
          .uploadToSignedUrl(upload.path, upload.token, file, { contentType: file.type });
        if (error) throw new StatementUploadError("Lampiran gagal diunggah. Coba lagi.");
        attachmentPath = upload.path;
      }
      return api("/attendance/statements", {
        method: "POST",
        body: { dayId, reason, attachmentPath },
        schema: one(statementRowSchema),
      });
    },
    onSuccess: refresh,
  });
}
