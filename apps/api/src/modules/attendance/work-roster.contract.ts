import { z } from "@hono/zod-openapi";
import { RESIDENCIES } from "@hris/shared";
import { assertExact } from "../../core/contract.ts";
import { rosterTemplateAssignPlanSchema } from "./roster.contract.ts";
import type * as service from "./work-roster.service.ts";

// TM-D28: skema respons roster (siklus kerja–libur), Homebase lokal, lokal/non-lokal, isi jadwal.

const residencySchema = z.enum(RESIDENCIES).openapi("Residency");
const idName = z.object({ id: z.uuid(), name: z.string() });

export const workRosterSchema = z
  .object({
    id: z.uuid(),
    companyId: z.uuid(),
    name: z.string(),
    residency: residencySchema,
    workDays: z.number().int(),
    offDays: z.number().int(),
    cyclesBeforeTimeOff: z.number().int(),
    timeOffDays: z.number().int(),
    crewCount: z.number().int(),
    cycleLength: z.number().int(),
    summary: z.string(),
    inUse: z.boolean(),
  })
  .openapi("WorkRoster");
assertExact<z.infer<typeof workRosterSchema>, service.WorkRosterDto>(true);
export const workRosterListSchema = z.array(workRosterSchema);
export const workRosterArchivedSchema = z.object({ id: z.uuid() });

export const localHomebasesViewSchema = z
  .object({
    homebases: z.array(
      z.object({
        id: z.uuid(),
        name: z.string(),
        city: z.string().nullable(),
        province: z.string().nullable(),
      }),
    ),
    locations: z.array(
      z.object({
        id: z.uuid(),
        name: z.string(),
        city: z.string().nullable(),
        office: z.boolean(),
        homebaseIds: z.array(z.uuid()),
      }),
    ),
  })
  .openapi("LocalHomebasesView");
assertExact<z.infer<typeof localHomebasesViewSchema>, service.LocalHomebasesView>(true);
export const localHomebasesResultSchema = z.object({
  workLocationId: z.uuid(),
  office: z.boolean(),
  homebaseIds: z.array(z.uuid()),
});

export const employeeResidencySchema = z
  .object({
    employeeId: z.uuid(),
    fullName: z.string(),
    employeeNumber: z.string().nullable(),
    homebase: idName.nullable(),
    workLocation: idName.nullable(),
    residency: residencySchema.nullable(),
    source: z.enum(["OVERRIDE", "LOCATION", "HOMEBASE", "UNKNOWN"]),
    note: z.string().nullable(),
    override: residencySchema.nullable(),
  })
  .openapi("EmployeeResidency");
assertExact<z.infer<typeof employeeResidencySchema>, service.EmployeeResidencyRow>(true);
export const employeeResidencyListSchema = z.array(employeeResidencySchema);
export const employeeResidencyResultSchema = z.object({ updated: z.number().int() });

export const workRosterAssignPreviewSchema = z
  .object({
    groups: z.array(
      z.object({
        residency: residencySchema,
        roster: workRosterSchema,
        templateName: z.string(),
        plan: rosterTemplateAssignPlanSchema,
      }),
    ),
    unresolved: z.array(
      z.object({ employeeId: z.uuid(), fullName: z.string(), reason: z.string() }),
    ),
  })
  .openapi("WorkRosterAssignPreview");
assertExact<z.infer<typeof workRosterAssignPreviewSchema>, service.WorkRosterAssignPreview>(true);
