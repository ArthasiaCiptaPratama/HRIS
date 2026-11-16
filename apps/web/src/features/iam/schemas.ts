import {
  paginationMetaSchema,
  permissionSchema,
  requiresEmployeeLink,
  roleSchema,
} from "@hris/shared";
import { z } from "zod";

// Subset respons API modul iam (sumber kebenaran: apps/api/src/modules/iam/iam.schema.ts).
export const accountSchema = z.object({
  id: z.string(),
  email: z.string(),
  role: roleSchema,
  isActive: z.boolean(),
  isPrimarySuperAdmin: z.boolean(),
  employeeId: z.string().nullable(),
  /** D-040: perusahaan yang ditugaskan (HR_ADMIN). */
  companyIds: z.array(z.string()),
  lastLoginAt: z.string().nullable(),
  createdAt: z.string(),
  /** ONB-D2: akun Karyawan/Manager tanpa data karyawan tertaut. */
  needsEmployeeLink: z.boolean().default(false),
});
export type Account = z.infer<typeof accountSchema>;

/** ONB-D2: undangan role Karyawan masuk antrean "Undang Karyawan Terdaftar" (202). */
export const accountInviteQueuedSchema = z.object({
  employeeId: z.string(),
  queued: z.literal(true),
});
export const linkSuggestionSchema = z.object({
  employeeId: z.string(),
  fullName: z.string(),
  employeeNumber: z.string().nullable(),
  companyId: z.string(),
  matchedBy: z.enum(["PERSONAL_EMAIL", "WORK_EMAIL"]),
});
export type LinkSuggestion = z.infer<typeof linkSuggestionSchema>;

export const grantSchema = z.object({
  id: z.string(),
  accountId: z.string(),
  permission: permissionSchema,
  expiresAt: z.string().nullable(),
  reason: z.string().nullable(),
  grantedBy: z.string(),
  revokedAt: z.string().nullable(),
  revokedBy: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.string(),
});
export type Grant = z.infer<typeof grantSchema>;

export const auditLogSchema = z.object({
  id: z.string(),
  actorAccountId: z.string().nullable(),
  actorEmail: z.string().nullable(),
  action: z.string(),
  entityType: z.string(),
  entityId: z.string().nullable(),
  entityLabel: z.string().nullable(),
  before: z.unknown().nullable(),
  after: z.unknown().nullable(),
  reason: z.string().nullable(),
  occurredAt: z.string(),
});
export type AuditLog = z.infer<typeof auditLogSchema>;

export const page = <T extends z.ZodType>(item: T) =>
  z.object({ data: z.array(item), meta: paginationMetaSchema });
export const one = <T extends z.ZodType>(item: T) => z.object({ data: item });

export const inviteFormSchema = z
  .object({
    email: z.email("Email tidak valid."),
    role: roleSchema,
    employeeId: z.string().optional(),
  })
  .refine((v) => !requiresEmployeeLink(v.role) || Boolean(v.employeeId), {
    path: ["employeeId"],
    message: "Pilih karyawan yang ditautkan ke akun ini.",
  });
export type InviteForm = z.infer<typeof inviteFormSchema>;

export const grantFormSchema = z.object({
  accountId: z.string().min(1, "Pilih akun."),
  permission: permissionSchema,
  // input type=date → dikonversi ke akhir hari WIB saat dikirim.
  expiresOn: z.string().optional(),
  reason: z.string().max(500).optional(),
});
export type GrantForm = z.infer<typeof grantFormSchema>;
