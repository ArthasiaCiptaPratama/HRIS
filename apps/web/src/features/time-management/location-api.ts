import {
  ATTENDANCE_LOCATION_MODES,
  ATTENDANCE_LOCATION_SOURCES,
  type AttendanceLocationInput,
} from "@hris/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "@/lib/api";
import { tmKeys } from "./api";

// TM-D1 — lokasi absen per karyawan (SA, HR PT): bawaan / lokasi khusus / bebas lokasi.

const named = z.object({ id: z.string(), name: z.string() });

export const locationSettingsSchema = z.object({
  date: z.string(),
  locations: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      city: z.string().nullable(),
      radiusM: z.number().nullable(),
    }),
  ),
  employees: z.array(
    z.object({
      employeeId: z.string(),
      fullName: z.string(),
      employeeNumber: z.string().nullable(),
      mode: z.enum(ATTENDANCE_LOCATION_MODES),
      customLocation: named.nullable(),
      effective: z.object({
        source: z.enum(ATTENDANCE_LOCATION_SOURCES),
        location: named.extend({ hasGeofence: z.boolean() }).nullable(),
        crewName: z.string().nullable(),
      }),
      updatedAt: z.string().nullable(),
    }),
  ),
});
export type LocationSettings = z.infer<typeof locationSettingsSchema>;
export type EmployeeLocationRow = LocationSettings["employees"][number];

export const locationKeys = {
  list: (companyId: string, q: string) =>
    [...tmKeys.all, "attendance-locations", companyId, q] as const,
};

export function useLocationSettings(companyId: string | undefined, q: string) {
  return useQuery({
    queryKey: locationKeys.list(companyId ?? "", q),
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ companyId: companyId ?? "" });
      if (q) params.set("q", q);
      return api(`/attendance-locations?${params}`, {
        schema: z.object({ data: locationSettingsSchema }),
        signal,
      }).then((r) => r.data);
    },
    enabled: Boolean(companyId),
  });
}

export function useSetLocationSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AttendanceLocationInput) =>
      api("/attendance-locations", {
        method: "PUT",
        body: input,
        schema: z.object({ data: z.object({ updated: z.number() }) }),
      }).then((r) => r.data),
    // Semua layar Time Management (mis. ringkasan absen hari ini) ikut membaca ulang.
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: tmKeys.all }),
  });
}
