import type { SelfReportCrewInput, SelfReportPunchInput } from "@hris/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "@/lib/api";
import { tmKeys, uploadSelfie } from "./api";
import { daySchema } from "./schemas";

// ════════════════════════════════════════════════════════════════════════════════════════════
// TM-D29 — ABSEN MANDIRI (STAGING). Hapus file ini saat fitur dicabut
// (docs/features/time-management/tm-d29-absen-mandiri.md).
// ════════════════════════════════════════════════════════════════════════════════════════════

const one = <T extends z.ZodType>(schema: T) => z.object({ data: schema });

export const selfReportCrewSchema = z.object({
  crewId: z.string(),
  crewName: z.string(),
  activeMembers: z.number(),
  enabled: z.boolean(),
  enabledAt: z.string().nullable(),
});
export type SelfReportCrew = z.infer<typeof selfReportCrewSchema>;

const keys = { crews: (companyId: string) => [...tmKeys.all, "self-report", companyId] as const };

export function useSelfReportCrews(companyId: string | undefined) {
  return useQuery({
    queryKey: keys.crews(companyId ?? ""),
    queryFn: ({ signal }) =>
      api(`/attendance/self-report/crews?companyId=${companyId}`, {
        schema: one(z.array(selfReportCrewSchema)),
        signal,
      }).then((r) => r.data),
    enabled: Boolean(companyId),
  });
}

export function useSetSelfReportCrew() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: SelfReportCrewInput) =>
      api("/attendance/self-report/crews", {
        method: "PUT",
        body,
        schema: one(selfReportCrewSchema),
      }).then((r) => r.data),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: [...tmKeys.all, "self-report"] }),
  });
}

// ── /absen (PWA): karyawan crew berizin ─────────────────────────────────────────────────────

export const selfReportStatusSchema = z.object({
  enabled: z.boolean(),
  crewName: z.string().nullable(),
  location: z
    .object({
      id: z.string(),
      name: z.string(),
      latitude: z.number().nullable(),
      longitude: z.number().nullable(),
      radiusM: z.number().nullable(),
    })
    .nullable(),
});
export type SelfReportStatus = z.infer<typeof selfReportStatusSchema>;

/** Tombol "Absen mandiri" di /absen hanya untuk crew berizin; galat (mis. API tanpa TM-D29) = sembunyi. */
export function useSelfReportStatus() {
  return useQuery({
    queryKey: [...tmKeys.all, "self-report", "me"],
    queryFn: ({ signal }) =>
      api("/attendance/self-report/me", { schema: one(selfReportStatusSchema), signal }).then(
        (r) => r.data,
      ),
    retry: false,
  });
}

export function useSelfReportPunch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      photo,
      ...input
    }: Omit<SelfReportPunchInput, "photoPath"> & { photo: Blob }) => {
      const photoPath = await uploadSelfie(photo, "image/jpeg");
      return api("/attendance/self-report", {
        method: "POST",
        body: { ...input, photoPath },
        schema: one(daySchema),
      }).then((r) => r.data);
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: tmKeys.all }),
  });
}
