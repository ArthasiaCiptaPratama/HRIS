import { z } from "@hono/zod-openapi";
import { HOLIDAY_KINDS, ROSTER_CHANGE_STATUSES, ROSTER_SOURCES } from "@hris/shared";
import { assertExact, nullableRef } from "../../core/contract.ts";
import { approvalViewSchema } from "../approval/index.ts";
import { shiftSchema } from "./attendance.contract.ts";
import type * as service from "./roster.service.ts";
import type { RosterChangeDto } from "./roster-change.service.ts";
import type * as edits from "./roster-edit.service.ts";
import type * as templates from "./roster-template.service.ts";

// MOB-D7 #1: skema respons OpenAPI roster (D-069) untuk codegen app mobile (MOB-D9).
// Setiap skema dikunci ke tipe service dengan assertExact → typecheck gagal bila tidak sama.

const idName = z.object({ id: z.uuid(), name: z.string() });
const employeeRef = z.object({
  id: z.uuid(),
  fullName: z.string(),
  employeeNumber: z.string().nullable(),
});

export const shiftListSchema = z.array(shiftSchema).openapi("ShiftList");

export const rosterPatternSchema = z
  .object({
    id: z.uuid(),
    companyId: z.uuid(),
    name: z.string(),
    steps: z.array(z.string()),
    cycleLength: z.number().int(),
    workDays: z.number().int(),
    crewCount: z.number().int(),
  })
  .openapi("RosterPattern");
assertExact<z.infer<typeof rosterPatternSchema>, service.PatternDto>(true);
export const rosterPatternListSchema = z.array(rosterPatternSchema).openapi("RosterPatternList");

/** Respons arsip pola / crew. */
export const rosterArchivedSchema = z.object({ id: z.uuid() }).openapi("RosterArchived");
assertExact<
  z.infer<typeof rosterArchivedSchema>,
  Awaited<ReturnType<typeof service.archivePattern>>
>(true);
assertExact<z.infer<typeof rosterArchivedSchema>, Awaited<ReturnType<typeof service.archiveCrew>>>(
  true,
);

export const crewSchema = z
  .object({
    id: z.uuid(),
    companyId: z.uuid(),
    workLocation: idName.nullable(),
    name: z.string(),
    pattern: z.object({ id: z.uuid(), name: z.string(), steps: z.array(z.string()) }),
    cycleStartDate: z.iso.date(),
    members: z.array(
      z.object({
        employeeId: z.uuid(),
        fullName: z.string(),
        employeeNumber: z.string().nullable(),
        startDate: z.iso.date(),
      }),
    ),
  })
  .openapi("Crew");
assertExact<z.infer<typeof crewSchema>, service.CrewDto>(true);
export const crewListSchema = z.array(crewSchema).openapi("CrewList");

export const rosterGridSchema = z
  .object({
    month: z.string(),
    companyId: z.uuid(),
    dates: z.array(z.iso.date()),
    holidays: z.array(
      z.object({ date: z.iso.date(), name: z.string(), kind: z.enum(HOLIDAY_KINDS) }),
    ),
    shifts: z.array(shiftSchema),
    employees: z.array(
      z.object({
        id: z.uuid(),
        fullName: z.string(),
        employeeNumber: z.string().nullable(),
        crew: z.string().nullable(),
      }),
    ),
    days: z.array(
      z.object({
        employeeId: z.uuid(),
        date: z.iso.date(),
        code: z.string(),
        source: z.enum(ROSTER_SOURCES),
      }),
    ),
    canEdit: z.boolean(),
  })
  .openapi("RosterGrid");
assertExact<z.infer<typeof rosterGridSchema>, service.RosterGrid>(true);

// Item bernama: tanpa ini codegen app menamai item-nya "EmployeeRoster" & membuat `data` objek tunggal.
export const employeeRosterDaySchema = z
  .object({
    date: z.iso.date(),
    code: z.string(),
    shift: nullableRef(shiftSchema),
    source: z.enum(ROSTER_SOURCES),
  })
  .openapi("EmployeeRosterDay");
export const employeeRosterSchema = z.array(employeeRosterDaySchema).openapi("EmployeeRoster");
assertExact<
  z.infer<typeof employeeRosterSchema>,
  Awaited<ReturnType<typeof service.getEmployeeRoster>>
>(true);

export const rosterCellsResultSchema = z
  .object({ updated: z.number().int() })
  .openapi("RosterCellsResult");
assertExact<
  z.infer<typeof rosterCellsResultSchema>,
  Awaited<ReturnType<typeof service.setRosterCells>>
>(true);

export const rosterImportPreviewSchema = z
  .object({
    total: z.number().int(),
    valid: z.number().int(),
    issues: z.array(
      z
        .object({
          index: z.number().int(),
          employeeId: z.uuid().optional(),
          employeeNumber: z.string().optional(),
          date: z.string(),
          message: z.string(),
        })
        .openapi("RosterCellIssue"),
    ),
  })
  .openapi("RosterImportPreview");
assertExact<z.infer<typeof rosterImportPreviewSchema>, service.ImportPreview>(true);

export const rosterImportCommitSchema = z
  .object({ saved: z.number().int() })
  .openapi("RosterImportCommit");
assertExact<
  z.infer<typeof rosterImportCommitSchema>,
  Awaited<ReturnType<typeof service.commitRosterImport>>
>(true);

export const rosterChangeSchema = z
  .object({
    id: z.uuid(),
    employee: employeeRef,
    peer: employeeRef.nullable(),
    date: z.iso.date(),
    fromCode: z.string(),
    toCode: z.string(),
    reason: z.string(),
    status: z.enum(ROSTER_CHANGE_STATUSES),
    createdAt: z.iso.datetime(),
    approval: nullableRef(approvalViewSchema),
    awaitingMyConsent: z.boolean(),
    canCancel: z.boolean(),
  })
  .openapi("RosterChange");
assertExact<z.infer<typeof rosterChangeSchema>, RosterChangeDto>(true);
export const rosterChangeListSchema = z.array(rosterChangeSchema).openapi("RosterChangeList");

// ── TM-D23: template roster buatan HR ──
export const rosterCustomTemplateSchema = z
  .object({
    id: z.uuid(),
    companyId: z.uuid(),
    name: z.string(),
    description: z.string().nullable(),
    steps: z.array(z.string()),
    crewCount: z.number().int(),
    crewOffsetDays: z.number().int(),
    startOnMonday: z.boolean(),
    cycleLength: z.number().int(),
    workDays: z.number().int(),
    installations: z.array(
      z.object({
        patternId: z.uuid(),
        patternName: z.string(),
        workLocationId: z.uuid().nullable(),
        workLocationName: z.string().nullable(),
        crews: z.array(
          z.object({
            id: z.uuid(),
            name: z.string(),
            cycleStartDate: z.iso.date(),
            memberCount: z.number().int(),
          }),
        ),
      }),
    ),
    updatedAt: z.string(),
  })
  .openapi("RosterCustomTemplate");
assertExact<z.infer<typeof rosterCustomTemplateSchema>, templates.RosterTemplateDto>(true);
export const rosterCustomTemplateListSchema = z
  .array(rosterCustomTemplateSchema)
  .openapi("RosterCustomTemplateList");
export const rosterTemplateInstallResultSchema = z
  .object({
    template: rosterCustomTemplateSchema,
    pattern: rosterPatternSchema,
    crews: z.array(crewSchema),
    restWarnings: z.array(z.string()),
  })
  .openapi("RosterTemplateInstallResult");
assertExact<
  z.infer<typeof rosterTemplateInstallResultSchema>,
  templates.RosterTemplateInstallResult
>(true);
assertExact<
  z.infer<typeof rosterArchivedSchema>,
  Awaited<ReturnType<typeof templates.archiveCustomTemplate>>
>(true);

// TM-D23 Fase 2: isi roster karyawan dengan template (bagi rata ke crew).
export const rosterTemplateAssignPlanSchema = z
  .object({
    installed: z.boolean(),
    cycleStartDate: z.iso.date(),
    crews: z.array(
      z.object({ name: z.string(), existing: z.number().int(), added: z.number().int() }),
    ),
    assignments: z.array(
      z.object({
        employeeId: z.uuid(),
        fullName: z.string(),
        employeeNumber: z.string().nullable(),
        crewName: z.string(),
        fromCrew: z.string().nullable(),
        stays: z.boolean(),
        needsApproval: z.boolean(),
      }),
    ),
    skipped: z.array(
      z.object({ employeeId: z.uuid(), fullName: z.string().nullable(), reason: z.string() }),
    ),
    replacedDays: z.number().int(),
    lockedDays: z.number().int(),
    approvalCount: z.number().int(),
    restWarnings: z.array(z.string()),
  })
  .openapi("RosterTemplateAssignPlan");
assertExact<z.infer<typeof rosterTemplateAssignPlanSchema>, templates.RosterTemplateAssignPlan>(
  true,
);

// TM-D24: perubahan roster karyawan ber-crew oleh HR — berlaku setelah disetujui atasan + HR.
export const rosterEditSchema = z
  .object({
    id: z.uuid(),
    kind: z.enum(["TEMPLATE", "CELLS", "IMPORT", "CREW"]),
    status: z.enum(["PENDING", "APPLIED", "REJECTED", "CANCELLED"]),
    employee: employeeRef,
    summary: z.string(),
    effectiveDate: z.iso.date(),
    appliedFrom: z.iso.date().nullable(),
    reason: z.string().nullable(),
    preview: z.array(
      z.object({ date: z.iso.date(), from: z.string().nullable(), to: z.string().nullable() }),
    ),
    createdAt: z.string(),
    createdByMe: z.boolean(),
    approval: nullableRef(approvalViewSchema),
  })
  .openapi("RosterEdit");
assertExact<z.infer<typeof rosterEditSchema>, edits.RosterEditDto>(true);
export const rosterEditListSchema = z.array(rosterEditSchema).openapi("RosterEditList");
