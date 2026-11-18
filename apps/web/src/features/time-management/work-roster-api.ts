import {
  type EmployeeResidencyInput,
  type LocalHomebasesInput,
  RESIDENCIES,
  type WorkRosterAssignInput,
  type WorkRosterInput,
} from "@hris/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "@/lib/api";
import { tmKeys } from "./api";
import { templateAssignPlanSchema } from "./schemas";

// TM-D28 — Pola Kerja (siklus kerja–libur; nama kode tetap "work roster"), lokasi kantor & Homebase lokal per
// lokasi kerja, kelompok karyawan (office / lapangan lokal / lapangan non-lokal), dan "Isi dengan pola kerja"
// (pola kerja + shift dirakit jadi template jadwal lalu dipasang lewat mesin TM-D23/TM-D24).

const one = <T extends z.ZodType>(schema: T) => z.object({ data: schema });

const residencySchema = z.enum(RESIDENCIES);
const idName = z.object({ id: z.string(), name: z.string() });

export const workRosterSchema = z.object({
  id: z.string(),
  companyId: z.string(),
  name: z.string(),
  residency: residencySchema,
  workDays: z.number(),
  offDays: z.number(),
  cyclesBeforeTimeOff: z.number(),
  timeOffDays: z.number(),
  crewCount: z.number(),
  cycleLength: z.number(),
  summary: z.string(),
  inUse: z.boolean(),
});
export type WorkRoster = z.infer<typeof workRosterSchema>;

export const localHomebasesViewSchema = z.object({
  homebases: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      city: z.string().nullable(),
      province: z.string().nullable(),
    }),
  ),
  locations: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      city: z.string().nullable(),
      /** Lokasi kantor → karyawannya kelompok office. */
      office: z.boolean().default(false),
      homebaseIds: z.array(z.string()),
    }),
  ),
});
export type LocalHomebasesView = z.infer<typeof localHomebasesViewSchema>;

export const employeeResidencySchema = z.object({
  employeeId: z.string(),
  fullName: z.string(),
  employeeNumber: z.string().nullable(),
  homebase: idName.nullable(),
  workLocation: idName.nullable(),
  residency: residencySchema.nullable(),
  source: z.enum(["OVERRIDE", "LOCATION", "HOMEBASE", "UNKNOWN"]),
  note: z.string().nullable(),
  override: residencySchema.nullable(),
});
export type EmployeeResidency = z.infer<typeof employeeResidencySchema>;

export const workRosterAssignPreviewSchema = z.object({
  groups: z.array(
    z.object({
      residency: residencySchema,
      roster: workRosterSchema,
      templateName: z.string(),
      plan: templateAssignPlanSchema,
    }),
  ),
  unresolved: z.array(
    z.object({ employeeId: z.string(), fullName: z.string(), reason: z.string() }),
  ),
});
export type WorkRosterAssignPreview = z.infer<typeof workRosterAssignPreviewSchema>;

export const workRosterKeys = {
  all: [...tmKeys.all, "work-rosters"] as const,
  list: (companyId: string) => [...tmKeys.all, "work-rosters", "list", companyId] as const,
  localHomebases: [...tmKeys.all, "work-rosters", "local-homebases"] as const,
  residencies: (companyId: string, q: string) =>
    [...tmKeys.all, "work-rosters", "residencies", companyId, q] as const,
};

/** Semua layar Time Management (grid jadwal, template, crew, roster) membaca ulang. */
function useRefreshAll() {
  const queryClient = useQueryClient();
  return () => void queryClient.invalidateQueries({ queryKey: tmKeys.all });
}

// ── Master roster ──────────────────────────────────────────────────────────────

export function useWorkRosters(companyId: string | undefined) {
  return useQuery({
    queryKey: workRosterKeys.list(companyId ?? ""),
    queryFn: ({ signal }) =>
      api(`/work-rosters?companyId=${companyId}`, {
        schema: one(z.array(workRosterSchema)),
        signal,
      }).then((r) => r.data),
    enabled: Boolean(companyId),
  });
}

export function useWorkRosterMutations() {
  const refresh = useRefreshAll();
  const save = useMutation({
    mutationFn: ({ id, body }: { id?: string | undefined; body: WorkRosterInput }) =>
      api(id ? `/work-rosters/${id}` : "/work-rosters", {
        method: id ? "PUT" : "POST",
        body,
        schema: one(workRosterSchema),
      }).then((r) => r.data),
    onSuccess: refresh,
  });
  const archive = useMutation({
    mutationFn: (id: string) =>
      api(`/work-rosters/${id}`, {
        method: "DELETE",
        schema: one(z.object({ id: z.string() })),
      }).then((r) => r.data),
    onSuccess: refresh,
  });
  const createDefaults = useMutation({
    mutationFn: (companyId: string) =>
      api("/work-rosters/defaults", {
        method: "POST",
        body: { companyId },
        schema: one(z.array(workRosterSchema)),
      }).then((r) => r.data),
    onSuccess: refresh,
  });
  return { save, archive, createDefaults };
}

// ── Homebase lokal per lokasi kerja ──────────────────────────────────────────────

export function useLocalHomebases(enabled = true) {
  return useQuery({
    queryKey: workRosterKeys.localHomebases,
    queryFn: ({ signal }) =>
      api("/work-rosters/local-homebases", { schema: one(localHomebasesViewSchema), signal }).then(
        (r) => r.data,
      ),
    enabled,
  });
}

export function useSetLocalHomebases() {
  const refresh = useRefreshAll();
  return useMutation({
    mutationFn: (input: LocalHomebasesInput) =>
      api("/work-rosters/local-homebases", {
        method: "PUT",
        body: input,
        schema: one(
          z.object({
            workLocationId: z.string(),
            office: z.boolean().default(false),
            homebaseIds: z.array(z.string()),
          }),
        ),
      }).then((r) => r.data),
    // Lokal/non-lokal karyawan ikut berubah.
    onSuccess: refresh,
  });
}

// ── Lokal / non-lokal karyawan ───────────────────────────────────────────────────

export function useEmployeeResidencies(companyId: string | undefined, q: string) {
  return useQuery({
    queryKey: workRosterKeys.residencies(companyId ?? "", q),
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ companyId: companyId ?? "" });
      if (q) params.set("q", q);
      return api(`/work-rosters/residencies?${params}`, {
        schema: one(z.array(employeeResidencySchema)),
        signal,
      }).then((r) => r.data);
    },
    enabled: Boolean(companyId),
    placeholderData: (previous) => previous,
  });
}

export function useSetEmployeeResidency() {
  const refresh = useRefreshAll();
  return useMutation({
    mutationFn: (input: EmployeeResidencyInput) =>
      api("/work-rosters/residencies", {
        method: "PUT",
        body: input,
        schema: one(z.object({ updated: z.number() })),
      }).then((r) => r.data),
    onSuccess: refresh,
  });
}

// ── Isi jadwal dengan roster ─────────────────────────────────────────────────────

/**
 * Pratinjau pembagian lokal/non-lokal & crew. Dijalankan lewat tombol "Pratinjau" (bukan otomatis tiap
 * ketikan) karena server merakit template jadwal roster + shift bila belum ada.
 */
export function useWorkRosterAssignPreview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: WorkRosterAssignInput) =>
      api("/work-rosters/assign/preview", {
        method: "POST",
        body,
        schema: one(workRosterAssignPreviewSchema),
      }).then((r) => r.data),
    // Template jadwal hasil rakitan & status "Dipakai" roster bisa berubah.
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [...tmKeys.all, "custom-templates"] });
      void queryClient.invalidateQueries({ queryKey: workRosterKeys.all });
    },
  });
}

export function useWorkRosterAssign() {
  const refresh = useRefreshAll();
  return useMutation({
    mutationFn: (body: WorkRosterAssignInput) =>
      api("/work-rosters/assign", {
        method: "POST",
        body,
        schema: one(workRosterAssignPreviewSchema),
      }).then((r) => r.data),
    // Grid jadwal, template jadwal, crew, & daftar roster (inUse) ikut membaca ulang.
    onSuccess: refresh,
  });
}
