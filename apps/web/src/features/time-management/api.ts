import {
  type ApprovalDecisionBody,
  DEFAULT_TIME_SETTINGS,
  type HolidayInput,
  type ManualPunchInput,
  type PunchInput,
  type PunchPrecheckInput,
  type RosterCellsInput,
  type RosterChangeInput,
  type RosterImportInput,
  type TimeSettings,
  timeSettingsSchema,
} from "@hris/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import {
  bulkResultSchema,
  crewSchema,
  daySchema,
  holidaySchema,
  importPreviewSchema,
  patternSchema,
  precheckSchema,
  rosterChangeSchema,
  rosterGridSchema,
  selfieUploadSchema,
  shiftSchema,
  todaySchema,
} from "./schemas";

// Time Management (docs/design/time-management.md, D-067–D-072): absen PWA, Data Absen Harian,
// roster tambang, kalender libur & pengaturan.

const one = <T extends z.ZodType>(schema: T) => z.object({ data: schema });
const many = <T extends z.ZodType>(schema: T) => z.object({ data: z.array(schema) });

export const tmKeys = {
  all: ["time-management"] as const,
  today: ["time-management", "today"] as const,
  history: (from: string, to: string) => ["time-management", "history", from, to] as const,
  days: (params: object) => ["time-management", "days", params] as const,
  day: (id: string) => ["time-management", "day", id] as const,
  shifts: (companyId: string) => ["time-management", "shifts", companyId] as const,
  patterns: (companyId: string) => ["time-management", "patterns", companyId] as const,
  crews: (companyId: string) => ["time-management", "crews", companyId] as const,
  grid: (companyId: string, month: string, crewId: string) =>
    ["time-management", "grid", companyId, month, crewId] as const,
  changes: (scope: string) => ["time-management", "changes", scope] as const,
  holidays: (year: number) => ["time-management", "holidays", year] as const,
  settings: ["time-management", "settings"] as const,
};

function useRefreshAll() {
  const queryClient = useQueryClient();
  return () => void queryClient.invalidateQueries({ queryKey: tmKeys.all });
}

// ── Absen (PWA) ─────────────────────────────────────────────────────────────────

export function useToday(enabled = true) {
  return useQuery({
    queryKey: tmKeys.today,
    queryFn: ({ signal }) =>
      api("/attendance/me/today", { schema: one(todaySchema), signal }).then((r) => r.data),
    retry: false,
    refetchOnWindowFocus: true,
    enabled,
  });
}

export function useMyHistory(from: string, to: string, enabled = true) {
  return useQuery({
    enabled,
    queryKey: tmKeys.history(from, to),
    queryFn: ({ signal }) =>
      api(`/attendance/me/history?from=${from}&to=${to}`, { schema: many(daySchema), signal }).then(
        (r) => r.data,
      ),
  });
}

export function usePrecheck() {
  return useMutation({
    mutationFn: (input: PunchPrecheckInput) =>
      api("/attendance/precheck", {
        method: "POST",
        body: input,
        schema: one(precheckSchema),
      }).then((r) => r.data),
  });
}

export class SelfieUploadError extends Error {}

async function uploadSelfie(blob: Blob, contentType: "image/jpeg" | "image/webp") {
  const { data: upload } = await api("/attendance/selfie-upload", {
    method: "POST",
    body: { contentType },
    schema: one(selfieUploadSchema),
  });
  if (blob.size > upload.maxBytes) throw new SelfieUploadError("Ukuran foto terlalu besar.");
  const { error } = await supabase.storage
    .from(upload.bucket)
    .uploadToSignedUrl(upload.path, upload.token, blob, { contentType });
  if (error) throw new SelfieUploadError("Foto gagal diunggah. Periksa koneksi lalu coba lagi.");
  return upload.path;
}

export function usePunch() {
  const refresh = useRefreshAll();
  return useMutation({
    mutationFn: async ({
      selfie,
      contentType,
      ...input
    }: Omit<PunchInput, "selfiePath"> & {
      selfie: Blob;
      contentType: "image/jpeg" | "image/webp";
    }) => {
      // altitudeM ikut dikirim bila HP menyediakan (D-073).
      const selfiePath = await uploadSelfie(selfie, contentType);
      return api("/attendance/punch", {
        method: "POST",
        body: { ...input, selfiePath },
        schema: one(daySchema),
      }).then((r) => r.data);
    },
    onSuccess: refresh,
  });
}

/** D-073: batalkan absen sendiri (salah pencet) <= 15 menit & belum diputuskan. */
export function useCancelPunch() {
  const refresh = useRefreshAll();
  return useMutation({
    mutationFn: (punchId: string) =>
      api(`/attendance/punches/${punchId}/cancel`, {
        method: "POST",
        schema: one(z.object({ cancelled: z.boolean(), kind: z.string() })),
      }).then((r) => r.data),
    onSuccess: refresh,
  });
}

/** D-073: autentikasi manual HR/SA — masukkan/ganti jam absen masuk atau pulang. */
export function useManualPunch() {
  const refresh = useRefreshAll();
  return useMutation({
    mutationFn: (input: ManualPunchInput) =>
      api("/attendance/manual", { method: "POST", body: input, schema: one(daySchema) }).then(
        (r) => r.data,
      ),
    onSuccess: refresh,
  });
}

// ── Data Absen Harian & approval ───────────────────────────────────────────────

export interface DayListParams {
  scope: "inbox" | "all";
  from: string;
  to: string;
  companyId?: string | undefined;
  labeledOnly?: boolean;
  status?: string | undefined;
  employeeId?: string | undefined;
}

export function useAttendanceDays(params: DayListParams, enabled = true) {
  const search = new URLSearchParams({ scope: params.scope, from: params.from, to: params.to });
  if (params.companyId) search.set("companyId", params.companyId);
  if (params.labeledOnly) search.set("labeledOnly", "true");
  if (params.status) search.set("status", params.status);
  if (params.employeeId) search.set("employeeId", params.employeeId);
  return useQuery({
    queryKey: tmKeys.days(params),
    queryFn: ({ signal }) =>
      api(`/attendance/days?${search}`, { schema: many(daySchema), signal }).then((r) => r.data),
    placeholderData: (previous) => previous,
    enabled,
  });
}

export function useAttendanceDay(id: string | null) {
  return useQuery({
    queryKey: tmKeys.day(id ?? ""),
    queryFn: ({ signal }) =>
      api(`/attendance/days/${id}`, { schema: one(daySchema), signal }).then((r) => r.data),
    enabled: id !== null,
    // URL selfie bertanda tangan berlaku 10 menit.
    staleTime: 5 * 60_000,
  });
}

export function useDecideApproval() {
  const refresh = useRefreshAll();
  return useMutation({
    mutationFn: ({ requestId, ...body }: ApprovalDecisionBody & { requestId: string }) =>
      api(`/approvals/${requestId}/decision`, {
        method: "POST",
        body,
        schema: one(z.object({ requestId: z.string(), status: z.string() })),
      }).then((r) => r.data),
    onSuccess: refresh,
  });
}

export function useDecideBulk() {
  const refresh = useRefreshAll();
  return useMutation({
    mutationFn: (body: ApprovalDecisionBody & { requestIds: string[] }) =>
      api("/approvals/decisions", { method: "POST", body, schema: one(bulkResultSchema) }).then(
        (r) => r.data,
      ),
    onSuccess: refresh,
  });
}

// ── Roster ─────────────────────────────────────────────────────────────────────

export function useShifts(companyId: string | undefined) {
  return useQuery({
    queryKey: tmKeys.shifts(companyId ?? ""),
    queryFn: ({ signal }) =>
      api(`/shifts?companyId=${companyId}`, { schema: many(shiftSchema), signal }).then(
        (r) => r.data,
      ),
    enabled: Boolean(companyId),
  });
}

export function usePatterns(companyId: string | undefined) {
  return useQuery({
    queryKey: tmKeys.patterns(companyId ?? ""),
    queryFn: ({ signal }) =>
      api(`/roster-patterns?companyId=${companyId}`, { schema: many(patternSchema), signal }).then(
        (r) => r.data,
      ),
    enabled: Boolean(companyId),
  });
}

export function useCrews(companyId: string | undefined) {
  return useQuery({
    queryKey: tmKeys.crews(companyId ?? ""),
    queryFn: ({ signal }) =>
      api(`/crews?companyId=${companyId}`, { schema: many(crewSchema), signal }).then(
        (r) => r.data,
      ),
    enabled: Boolean(companyId),
  });
}

export function useRosterGrid(companyId: string | undefined, month: string, crewId: string) {
  return useQuery({
    queryKey: tmKeys.grid(companyId ?? "", month, crewId),
    queryFn: ({ signal }) =>
      api(`/roster?companyId=${companyId}&month=${month}${crewId ? `&crewId=${crewId}` : ""}`, {
        schema: one(rosterGridSchema),
        signal,
      }).then((r) => r.data),
    enabled: Boolean(companyId),
    placeholderData: (previous) => previous,
  });
}

/** Roster seorang karyawan pada rentang (rekap per karyawan). */
export function useEmployeeRoster(employeeId: string | null, from: string, to: string) {
  return useQuery({
    queryKey: ["time-management", "employee-roster", employeeId, from, to],
    queryFn: ({ signal }) =>
      api(`/roster/employees/${employeeId}?from=${from}&to=${to}`, {
        schema: many(
          z.object({
            date: z.string(),
            code: z.string(),
            shift: shiftSchema.nullable(),
            source: z.string(),
          }),
        ),
        signal,
      }).then((r) => r.data),
    enabled: employeeId !== null,
  });
}

/** Simpan master roster (shift / pola / crew): POST baru, PUT ubah, DELETE arsip. */
export function useRosterMaster(resource: "shifts" | "roster-patterns" | "crews") {
  const refresh = useRefreshAll();
  const save = useMutation({
    mutationFn: ({ id, body }: { id?: string | undefined; body: Record<string, unknown> }) =>
      api(id ? `/${resource}/${id}` : `/${resource}`, {
        method: id ? "PUT" : "POST",
        body,
        schema: one(z.unknown()),
      }),
    onSuccess: refresh,
  });
  const archive = useMutation({
    mutationFn: (id: string) =>
      api(`/${resource}/${id}`, { method: "DELETE", schema: one(z.unknown()) }),
    onSuccess: refresh,
  });
  return { save, archive };
}

export function useSetCrewMembers() {
  const refresh = useRefreshAll();
  return useMutation({
    mutationFn: ({
      crewId,
      employeeIds,
      effectiveDate,
    }: {
      crewId: string;
      employeeIds: string[];
      effectiveDate: string;
    }) =>
      api(`/crews/${crewId}/members`, {
        method: "PUT",
        body: { employeeIds, effectiveDate },
        schema: one(z.unknown()),
      }),
    onSuccess: refresh,
  });
}

export function useSetRosterCells() {
  const refresh = useRefreshAll();
  return useMutation({
    mutationFn: (input: RosterCellsInput) =>
      api("/roster/cells", {
        method: "PUT",
        body: input,
        schema: one(z.object({ updated: z.number() })),
      }).then((r) => r.data),
    onSuccess: refresh,
  });
}

export function useRosterImport() {
  const refresh = useRefreshAll();
  const preview = useMutation({
    mutationFn: (input: RosterImportInput) =>
      api("/roster/import/preview", {
        method: "POST",
        body: input,
        schema: one(importPreviewSchema),
      }).then((r) => r.data),
  });
  const commit = useMutation({
    mutationFn: (input: RosterImportInput) =>
      api("/roster/import/commit", {
        method: "POST",
        body: input,
        schema: one(z.object({ saved: z.number() })),
      }).then((r) => r.data),
    onSuccess: refresh,
  });
  return { preview, commit };
}

export function useRosterChanges(scope: "mine" | "inbox", enabled = true) {
  return useQuery({
    queryKey: tmKeys.changes(scope),
    queryFn: ({ signal }) =>
      api(`/roster-changes?scope=${scope}`, { schema: many(rosterChangeSchema), signal }).then(
        (r) => r.data,
      ),
    enabled,
  });
}

export function useRosterChangeActions() {
  const refresh = useRefreshAll();
  const create = useMutation({
    mutationFn: (input: RosterChangeInput) =>
      api("/roster-changes", { method: "POST", body: input, schema: one(rosterChangeSchema) }),
    onSuccess: refresh,
  });
  const respond = useMutation({
    mutationFn: ({ id, accept }: { id: string; accept: boolean }) =>
      api(`/roster-changes/${id}/peer-response`, {
        method: "POST",
        body: { accept },
        schema: one(rosterChangeSchema),
      }),
    onSuccess: refresh,
  });
  const cancel = useMutation({
    mutationFn: (id: string) =>
      api(`/roster-changes/${id}/cancel`, { method: "POST", schema: one(rosterChangeSchema) }),
    onSuccess: refresh,
  });
  return { create, respond, cancel };
}

// ── Kalender libur & pengaturan ────────────────────────────────────────────────

export function useHolidays(year: number) {
  return useQuery({
    queryKey: tmKeys.holidays(year),
    queryFn: ({ signal }) =>
      api(`/holidays?year=${year}`, { schema: many(holidaySchema), signal }).then((r) => r.data),
  });
}

export function useHolidayActions() {
  const refresh = useRefreshAll();
  const save = useMutation({
    mutationFn: ({ id, ...body }: HolidayInput & { id?: string | undefined }) =>
      api(id ? `/holidays/${id}` : "/holidays", {
        method: id ? "PUT" : "POST",
        body,
        schema: one(holidaySchema),
      }),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) =>
      api(`/holidays/${id}`, { method: "DELETE", schema: one(z.unknown()) }),
    onSuccess: refresh,
  });
  return { save, remove };
}

/** Tahun yang punya data libur resmi bawaan (SKB 3 Menteri). */
export function useOfficialHolidayYears() {
  return useQuery({
    queryKey: ["time-management", "holidays", "official-years"],
    queryFn: ({ signal }) =>
      api("/holidays/official-years", { schema: one(z.array(z.number())), signal }).then(
        (r) => r.data,
      ),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function useImportOfficialHolidays() {
  const refresh = useRefreshAll();
  return useMutation({
    mutationFn: (year: number) =>
      api("/holidays/import-official", {
        method: "POST",
        body: { year },
        schema: one(
          z.object({ year: z.number(), added: z.number(), skipped: z.number(), total: z.number() }),
        ),
      }).then((r) => r.data),
    onSuccess: refresh,
  });
}

export function useTimeSettings(enabled = true) {
  return useQuery({
    queryKey: tmKeys.settings,
    queryFn: ({ signal }) =>
      api("/time-settings", { schema: one(timeSettingsSchema), signal }).then((r) => r.data),
    enabled,
  });
}

/** Zona waktu jam shift dari pengaturan Time Management (bawaan WITA bila belum termuat). */
export function useTimezone(): string {
  return useTimeSettings().data?.timezone ?? DEFAULT_TIME_SETTINGS.timezone;
}

export function useSaveTimeSettings() {
  const refresh = useRefreshAll();
  return useMutation({
    mutationFn: (input: TimeSettings) =>
      api("/time-settings", { method: "PUT", body: input, schema: one(timeSettingsSchema) }),
    onSuccess: refresh,
  });
}
