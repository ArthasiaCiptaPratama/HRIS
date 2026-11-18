import { z } from "@hono/zod-openapi";
import { assertExact } from "../../core/contract.ts";
import type * as service from "./self-report.service.ts";

// TM-D29 — ABSEN MANDIRI (STAGING). Hapus file ini saat fitur dicabut
// (docs/features/time-management/tm-d29-absen-mandiri.md).

export const selfReportStatusSchema = z
  .object({
    enabled: z.boolean(),
    crewName: z.string().nullable(),
    location: z
      .object({
        id: z.uuid(),
        name: z.string(),
        latitude: z.number().nullable(),
        longitude: z.number().nullable(),
        radiusM: z.number().nullable(),
      })
      .nullable(),
  })
  .openapi("SelfReportStatus");
assertExact<z.infer<typeof selfReportStatusSchema>, service.SelfReportStatus>(true);

export const selfReportCrewSchema = z
  .object({
    crewId: z.uuid(),
    crewName: z.string(),
    activeMembers: z.number().int(),
    enabled: z.boolean(),
    enabledAt: z.iso.datetime().nullable(),
  })
  .openapi("SelfReportCrew");
assertExact<z.infer<typeof selfReportCrewSchema>, service.SelfReportCrewView>(true);
export const selfReportCrewListSchema = z.array(selfReportCrewSchema).openapi("SelfReportCrewList");
