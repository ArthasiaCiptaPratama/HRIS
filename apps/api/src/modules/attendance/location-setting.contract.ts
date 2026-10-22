import { z } from "@hono/zod-openapi";
import { ATTENDANCE_LOCATION_MODES, ATTENDANCE_LOCATION_SOURCES } from "@hris/shared";
import { assertExact } from "../../core/contract.ts";
import type { LocationSettingsView, setLocationSettings } from "./location-setting.service.ts";
import type { TimeQueue } from "./time-notify.service.ts";

// MOB-D7 #1: skema respons OpenAPI lokasi absen per karyawan (TM-D1) & antrean keputusan TM.
// Setiap skema dikunci ke tipe service dengan assertExact.

const idName = z.object({ id: z.uuid(), name: z.string() });

export const locationSettingsViewSchema = z
  .object({
    date: z.iso.date(),
    locations: z.array(
      z.object({
        id: z.uuid(),
        name: z.string(),
        city: z.string().nullable(),
        radiusM: z.number().int().nullable(),
      }),
    ),
    employees: z.array(
      z
        .object({
          employeeId: z.uuid(),
          fullName: z.string(),
          employeeNumber: z.string().nullable(),
          mode: z.enum(ATTENDANCE_LOCATION_MODES),
          customLocation: idName.nullable(),
          effective: z.object({
            source: z.enum(ATTENDANCE_LOCATION_SOURCES),
            location: z
              .object({ id: z.uuid(), name: z.string(), hasGeofence: z.boolean() })
              .nullable(),
            crewName: z.string().nullable(),
          }),
          updatedAt: z.iso.datetime().nullable(),
        })
        .openapi("AttendanceLocationSettingRow"),
    ),
  })
  .openapi("AttendanceLocationSettings");
assertExact<z.infer<typeof locationSettingsViewSchema>, LocationSettingsView>(true);

export const locationSettingsUpdateSchema = z
  .object({ updated: z.number().int() })
  .openapi("AttendanceLocationSettingsUpdate");
assertExact<
  z.infer<typeof locationSettingsUpdateSchema>,
  Awaited<ReturnType<typeof setLocationSettings>>
>(true);

export const timeQueueSchema = z
  .object({
    attendance: z.number().int(),
    leave: z.number().int(),
    corrections: z.number().int(),
    rosterChanges: z.number().int(),
    overtime: z.number().int(),
    total: z.number().int(),
  })
  .openapi("TimeNotifyQueue");
assertExact<z.infer<typeof timeQueueSchema>, TimeQueue>(true);
