import type {
  LeaveAdjustInput,
  LeaveBalanceImportInput,
  LeavePreviewInput,
  LeaveRequestInput,
  LeaveTypeInput,
  LeaveYearInput,
} from "@hris/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { approvalSchema } from "./schemas";

// Tahap E — cuti tahunan, izin, sakit (D-072).

const one = <T extends z.ZodType>(schema: T) => z.object({ data: schema });
const many = <T extends z.ZodType>(schema: T) => z.object({ data: z.array(schema) });

export const leaveTypeSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  category: z.enum(["ANNUAL", "PERMIT", "SICK"]),
  maxDaysPerRequest: z.number().nullable(),
  documentRequiredAfterDays: z.number().nullable(),
  /** Keterangan untuk karyawan & berkas yang diperlukan (API lama → null). */
  description: z.string().nullable().default(null),
  documentLabel: z.string().nullable().default(null),
  isActive: z.boolean(),
  sortOrder: z.number(),
});
export type LeaveType = z.infer<typeof leaveTypeSchema>;

export const leaveYearSchema = z.object({
  year: z.number(),
  quota: z.number(),
  isActive: z.boolean(),
  grantedAt: z.string().nullable(),
  settledAt: z.string().nullable(),
  expiredAt: z.string().nullable(),
});
export type LeaveYear = z.infer<typeof leaveYearSchema>;

const summarySchema = z.object({
  year: z.number(),
  granted: z.number(),
  adjusted: z.number(),
  used: z.number(),
  held: z.number(),
  collective: z.number(),
  expired: z.number(),
  settled: z.number(),
  balance: z.number(),
});
export type BalanceSummary = z.infer<typeof summarySchema>;

export const leaveRequestSchema = z.object({
  id: z.string(),
  employee: z.object({
    id: z.string(),
    fullName: z.string(),
    employeeNumber: z.string().nullable(),
  }),
  type: z.object({ id: z.string(), code: z.string(), name: z.string(), category: z.string() }),
  startDate: z.string(),
  endDate: z.string(),
  workDates: z.array(z.string()),
  days: z.number(),
  /** Bagian hari yang memotong cuti tahunan (izin melebihi jatah). API lama → 0. */
  annualDays: z.number().default(0),
  reason: z.string(),
  attachmentUrl: z.string().nullable(),
  status: z.string(),
  createdAt: z.string(),
  decidedAt: z.string().nullable(),
  approval: approvalSchema.nullable(),
  canCancel: z.boolean(),
});
export type LeaveRequest = z.infer<typeof leaveRequestSchema>;

const ledgerEntrySchema = z.object({
  id: z.string(),
  year: z.number().optional(),
  kind: z.string(),
  days: z.number(),
  workDate: z.string().nullable(),
  note: z.string().nullable(),
  createdAt: z.string(),
});
export type LedgerEntry = z.infer<typeof ledgerEntrySchema>;

const myLeaveSchema = z.object({
  year: z.number(),
  balances: z.array(summarySchema),
  carryUntil: z.string(),
  ledger: z.array(ledgerEntrySchema),
  requests: z.array(leaveRequestSchema),
});

const previewSchema = z.object({
  dates: z.array(z.string()),
  days: z.number(),
  /** Hari yang memotong cuti tahunan (izin: kelebihan dari batas jenisnya). API lama → 0. */
  annualDays: z.number().default(0),
  charges: z.array(z.object({ year: z.number(), days: z.number() })),
  balances: z.array(z.object({ year: z.number(), balance: z.number() })),
  documentRequired: z.boolean(),
  conflicts: z.array(z.string()),
});
export type LeavePreview = z.infer<typeof previewSchema>;

export const balanceRowSchema = summarySchema.extend({
  employee: z.object({
    id: z.string(),
    fullName: z.string(),
    employeeNumber: z.string().nullable(),
  }),
  carryBalance: z.number(),
});
export type BalanceRow = z.infer<typeof balanceRowSchema>;

export const leaveKeys = {
  all: ["leave"] as const,
  types: ["leave", "types"] as const,
  years: ["leave", "years"] as const,
  mine: ["leave", "me"] as const,
  requests: (params: object) => ["leave", "requests", params] as const,
  request: (id: string) => ["leave", "request", id] as const,
  balances: (companyId: string, year: number, q: string) =>
    ["leave", "balances", companyId, year, q] as const,
  ledger: (employeeId: string, year: number) => ["leave", "ledger", employeeId, year] as const,
};

function useRefresh() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: leaveKeys.all });
    void queryClient.invalidateQueries({ queryKey: ["time-management"] });
  };
}

export function useLeaveTypes() {
  return useQuery({
    queryKey: leaveKeys.types,
    queryFn: ({ signal }) =>
      api("/leave-types", { schema: many(leaveTypeSchema), signal }).then((r) => r.data),
    staleTime: 5 * 60_000,
  });
}

export function useLeaveYears() {
  return useQuery({
    queryKey: leaveKeys.years,
    queryFn: ({ signal }) =>
      api("/leave-years", { schema: many(leaveYearSchema), signal }).then((r) => r.data),
  });
}

export function useLeaveMaster() {
  const refresh = useRefresh();
  const saveType = useMutation({
    mutationFn: ({ id, ...body }: LeaveTypeInput & { id?: string | undefined }) =>
      api(id ? `/leave-types/${id}` : "/leave-types", {
        method: id ? "PUT" : "POST",
        body,
        schema: one(leaveTypeSchema),
      }),
    onSuccess: refresh,
  });
  const saveYear = useMutation({
    mutationFn: (body: LeaveYearInput) =>
      api("/leave-years", { method: "PUT", body, schema: one(leaveYearSchema) }),
    onSuccess: refresh,
  });
  return { saveType, saveYear };
}

export function useMyLeave(enabled = true) {
  return useQuery({
    queryKey: leaveKeys.mine,
    queryFn: ({ signal }) =>
      api("/leave/me", { schema: one(myLeaveSchema), signal }).then((r) => r.data),
    enabled,
    retry: false,
  });
}

export function useLeavePreview() {
  return useMutation({
    mutationFn: (input: LeavePreviewInput) =>
      api("/leave/preview", { method: "POST", body: input, schema: one(previewSchema) }).then(
        (r) => r.data,
      ),
  });
}

export class AttachmentUploadError extends Error {}

async function uploadAttachment(file: File) {
  const { data: upload } = await api("/leave/attachment-upload", {
    method: "POST",
    body: { contentType: file.type },
    schema: one(
      z.object({
        bucket: z.string(),
        path: z.string(),
        token: z.string(),
        signedUrl: z.string(),
        maxBytes: z.number(),
      }),
    ),
  });
  if (file.size > upload.maxBytes) {
    throw new AttachmentUploadError(
      `Ukuran maksimal ${Math.round(upload.maxBytes / 1024 / 1024)} MB.`,
    );
  }
  const { error } = await supabase.storage
    .from(upload.bucket)
    .uploadToSignedUrl(upload.path, upload.token, file, { contentType: file.type });
  if (error)
    throw new AttachmentUploadError("Lampiran gagal diunggah. Periksa koneksi lalu coba lagi.");
  return upload.path;
}

export function useLeaveActions() {
  const refresh = useRefresh();
  const create = useMutation({
    mutationFn: async ({
      file,
      ...input
    }: Omit<LeaveRequestInput, "attachmentPath"> & { file?: File | null }) => {
      const attachmentPath = file ? await uploadAttachment(file) : undefined;
      return api("/leave-requests", {
        method: "POST",
        body: { ...input, attachmentPath },
        schema: one(leaveRequestSchema),
      }).then((r) => r.data);
    },
    onSuccess: refresh,
  });
  const cancel = useMutation({
    mutationFn: (id: string) =>
      api(`/leave-requests/${id}/cancel`, { method: "POST", schema: one(leaveRequestSchema) }),
    onSuccess: refresh,
  });
  return { create, cancel };
}

export interface LeaveListParams {
  scope: "inbox" | "all";
  companyId?: string | undefined;
  status?: string | undefined;
}

export function useLeaveRequests(params: LeaveListParams, enabled = true) {
  const search = new URLSearchParams({ scope: params.scope });
  if (params.companyId) search.set("companyId", params.companyId);
  if (params.status) search.set("status", params.status);
  return useQuery({
    queryKey: leaveKeys.requests(params),
    queryFn: ({ signal }) =>
      api(`/leave-requests?${search}`, { schema: many(leaveRequestSchema), signal }).then(
        (r) => r.data,
      ),
    enabled,
    placeholderData: (previous) => previous,
  });
}

export function useLeaveRequest(id: string | null) {
  return useQuery({
    queryKey: leaveKeys.request(id ?? ""),
    queryFn: ({ signal }) =>
      api(`/leave-requests/${id}`, { schema: one(leaveRequestSchema), signal }).then((r) => r.data),
    enabled: id !== null,
    staleTime: 5 * 60_000,
  });
}

export function useLeaveBalances(companyId: string | undefined, year: number, q: string) {
  const search = new URLSearchParams({ companyId: companyId ?? "", year: String(year) });
  if (q) search.set("q", q);
  return useQuery({
    queryKey: leaveKeys.balances(companyId ?? "", year, q),
    queryFn: ({ signal }) =>
      api(`/leave-balances?${search}`, { schema: many(balanceRowSchema), signal }).then(
        (r) => r.data,
      ),
    enabled: Boolean(companyId),
    placeholderData: (previous) => previous,
  });
}

export function useEmployeeLedger(employeeId: string | null, year: number) {
  return useQuery({
    queryKey: leaveKeys.ledger(employeeId ?? "", year),
    queryFn: ({ signal }) =>
      api(`/leave-balances/employees/${employeeId}?year=${year}`, {
        schema: one(z.object({ summary: summarySchema, entries: z.array(ledgerEntrySchema) })),
        signal,
      }).then((r) => r.data),
    enabled: employeeId !== null,
  });
}

export function useBalanceActions() {
  const refresh = useRefresh();
  const adjust = useMutation({
    mutationFn: (input: LeaveAdjustInput) =>
      api("/leave-balances/adjust", { method: "POST", body: input, schema: one(z.unknown()) }),
    onSuccess: refresh,
  });
  const importResult = one(
    z.object({
      total: z.number(),
      changed: z.number(),
      saved: z.number(),
      issues: z.array(
        z.object({ index: z.number(), employeeNumber: z.string(), message: z.string() }),
      ),
    }),
  );
  const previewImport = useMutation({
    mutationFn: (input: LeaveBalanceImportInput) =>
      api("/leave-balances/import/preview", {
        method: "POST",
        body: input,
        schema: importResult,
      }).then((r) => r.data),
  });
  const commitImport = useMutation({
    mutationFn: (input: LeaveBalanceImportInput) =>
      api("/leave-balances/import/commit", {
        method: "POST",
        body: input,
        schema: importResult,
      }).then((r) => r.data),
    onSuccess: refresh,
  });
  return { adjust, previewImport, commitImport };
}
