import { z } from "@hono/zod-openapi";

// DTO OpenAPI modul discipline (ARS-D7–D13). Body ditulis longgar di OpenAPI lalu divalidasi skema
// @hris/shared di service (pola asset/approval; skema shared memakai instance zod lain).

const level = z.enum(["SP1", "SP2", "SP3"]);
const isoDate = z.string().openapi({ example: "2026-10-15" });

export const idParamSchema = z.object({ id: z.uuid() });
export const employeeParamSchema = z.object({ employeeId: z.uuid() });

export const letterListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(100).optional(),
  /** ACTIVE = masih berlaku (termasuk yang sudah dikonfirmasi). */
  state: z.enum(["DRAFT", "ACTIVE", "EXPIRED", "REVOKED"]).optional(),
  level: level.optional(),
  violationTypeId: z.uuid().optional(),
  companyId: z.uuid().optional(),
  employeeId: z.uuid().optional(),
});

const looseBody = (name: string, description: string) =>
  z.record(z.string(), z.unknown()).openapi(name, { description });

export const violationTypeBodySchema = looseBody(
  "ViolationTypeInput",
  "`{ code, name, linksAttendance, isActive? }` (violationTypeInputSchema)",
);
export const settingsBodySchema = looseBody(
  "DisciplineSettingsInput",
  "`{ validityMonths }` (1–24)",
);
export const draftBodySchema = looseBody(
  "WarningLetterDraftInput",
  "`{ employeeId, level, violationTypeId, incidentDate, description, escalationReason?, alphaDayIds? }`",
);
export const bulkDraftBodySchema = looseBody(
  "WarningLetterBulkDraftInput",
  "`{ employeeIds[1–50], level: SP1|SP2|SP3|AUTO, violationTypeId, incidentDate, description, escalationReason? }` (ARS-D20)",
);
export const issueBodySchema = looseBody(
  "IssueWarningLetterInput",
  "`{ issuedAt, number? }` — nomor kosong = otomatis per PT per tahun (ARS-D11)",
);
export const revokeBodySchema = looseBody("RevokeWarningLetterInput", "`{ reason }`");
export const scanBodySchema = looseBody(
  "AttachWarningScanInput",
  "`{ documentId }` — dokumen karyawan jenis WARNING_LETTER",
);

export const violationTypeSchema = z
  .object({
    id: z.uuid(),
    code: z.string(),
    name: z.string(),
    linksAttendance: z.boolean(),
    isActive: z.boolean(),
  })
  .openapi("ViolationType");

export const settingsSchema = z
  .object({ validityMonths: z.number().int() })
  .openapi("DisciplineSettings");

export const letterSchema = z
  .object({
    id: z.uuid(),
    employee: z.object({
      employeeId: z.uuid(),
      fullName: z.string(),
      employeeNumber: z.string().nullable(),
      companyId: z.string().nullable(),
      isActive: z.boolean(),
    }),
    companyId: z.uuid(),
    companyName: z.string().nullable(),
    level,
    violationType: z.object({
      id: z.uuid(),
      code: z.string(),
      name: z.string(),
      linksAttendance: z.boolean(),
    }),
    incidentDate: isoDate.nullable(),
    description: z.string(),
    status: z.enum(["DRAFT", "ISSUED", "EXPIRED", "REVOKED"]),
    state: z.enum(["DRAFT", "ACTIVE", "CONFIRMED", "EXPIRED", "REVOKED"]),
    suggestedLevel: level.nullable(),
    escalationReason: z.string().nullable(),
    number: z.string().nullable(),
    issuedAt: isoDate.nullable(),
    effectiveUntil: isoDate.nullable(),
    manager: z.object({ employeeId: z.uuid(), fullName: z.string() }).nullable(),
    deliveredAt: z.string().nullable(),
    acknowledgedAt: z.string().nullable(),
    scanDocumentId: z.uuid().nullable(),
    revokedAt: z.string().nullable(),
    revokeReason: z.string().nullable(),
    alphaDays: z.array(z.object({ attendanceDayId: z.uuid(), workDate: isoDate })),
    createdAt: z.string(),
    updatedAt: z.string(),
    can: z.object({
      edit: z.boolean(),
      issue: z.boolean(),
      revoke: z.boolean(),
      attachScan: z.boolean(),
      deliver: z.boolean(),
      acknowledge: z.boolean(),
    }),
  })
  .openapi("WarningLetter");

const statementRowSchema = z
  .object({
    dayId: z.uuid(),
    employee: z.object({
      id: z.uuid(),
      fullName: z.string(),
      employeeNumber: z.string().nullable(),
    }),
    workDate: isoDate,
    statement: z
      .object({
        id: z.uuid(),
        reason: z.string(),
        createdAt: z.string(),
        attachmentUrl: z.string().nullable(),
      })
      .nullable(),
  })
  .openapi("WarningLetterAlphaEvidence");

export const letterDetailSchema = letterSchema
  .extend({ alphaEvidence: z.array(statementRowSchema) })
  .openapi("WarningLetterDetail");

export const alphaCandidatesSchema = z.array(statementRowSchema);

export const suggestionSchema = z
  .object({
    suggestedLevel: level,
    active: z.array(
      z.object({
        id: z.uuid(),
        level,
        number: z.string().nullable(),
        effectiveUntil: isoDate.nullable(),
      }),
    ),
  })
  .openapi("WarningLevelSuggestion");

export const fileSchema = z
  .object({
    fileName: z.string(),
    contentBase64: z.string().openapi({ description: "Isi PDF (base64)" }),
  })
  .openapi("WarningLetterFile");
