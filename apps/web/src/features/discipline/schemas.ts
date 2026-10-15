import { WARNING_LETTER_STATES, WARNING_LEVELS } from "@hris/shared";
import { z } from "zod";

// ARS-D7–D13: subset respons API modul discipline yang dipakai web (PROMPT §7).

const level = z.enum(WARNING_LEVELS);

export const violationTypeSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  linksAttendance: z.boolean(),
  isActive: z.boolean(),
});
export type ViolationType = z.infer<typeof violationTypeSchema>;

export const settingsSchema = z.object({ validityMonths: z.number() });

export const letterSchema = z.object({
  id: z.string(),
  employee: z.object({
    employeeId: z.string(),
    fullName: z.string(),
    employeeNumber: z.string().nullable(),
    companyId: z.string().nullable(),
    isActive: z.boolean(),
  }),
  companyId: z.string(),
  companyName: z.string().nullable(),
  level,
  violationType: z.object({
    id: z.string(),
    code: z.string(),
    name: z.string(),
    linksAttendance: z.boolean(),
  }),
  incidentDate: z.string().nullable(),
  description: z.string(),
  status: z.enum(["DRAFT", "ISSUED", "EXPIRED", "REVOKED"]),
  state: z.enum(WARNING_LETTER_STATES),
  suggestedLevel: level.nullable(),
  escalationReason: z.string().nullable(),
  number: z.string().nullable(),
  issuedAt: z.string().nullable(),
  effectiveUntil: z.string().nullable(),
  manager: z.object({ employeeId: z.string(), fullName: z.string() }).nullable(),
  deliveredAt: z.string().nullable(),
  acknowledgedAt: z.string().nullable(),
  scanDocumentId: z.string().nullable(),
  revokedAt: z.string().nullable(),
  revokeReason: z.string().nullable(),
  alphaDays: z.array(z.object({ attendanceDayId: z.string(), workDate: z.string() })),
  can: z.object({
    edit: z.boolean(),
    issue: z.boolean(),
    revoke: z.boolean(),
    attachScan: z.boolean(),
    deliver: z.boolean(),
    acknowledge: z.boolean(),
  }),
});
export type WarningLetter = z.infer<typeof letterSchema>;

export const alphaRowSchema = z.object({
  dayId: z.string(),
  workDate: z.string(),
  statement: z
    .object({
      id: z.string(),
      reason: z.string(),
      createdAt: z.string(),
      attachmentUrl: z.string().nullable(),
    })
    .nullable(),
});
export type AlphaRow = z.infer<typeof alphaRowSchema>;

export const letterDetailSchema = letterSchema.extend({ alphaEvidence: z.array(alphaRowSchema) });
export type WarningLetterDetail = z.infer<typeof letterDetailSchema>;

export const letterPageSchema = z.object({
  data: z.array(letterSchema),
  meta: z.object({ page: z.number(), pageSize: z.number(), total: z.number() }),
});

export const suggestionSchema = z.object({
  suggestedLevel: level,
  active: z.array(
    z.object({
      id: z.string(),
      level,
      number: z.string().nullable(),
      effectiveUntil: z.string().nullable(),
    }),
  ),
});
export type LevelSuggestion = z.infer<typeof suggestionSchema>;
