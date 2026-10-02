import { z } from "@hono/zod-openapi";
import {
  ONBOARDING_MAX_ROWS,
  onboardingInvitationStatusSchema,
  onboardingStatusSchema,
} from "@hris/shared";

// D-045 bagian a: DTO penerimaan karyawan baru (pratinjau, batch, antrean undangan, daftar calon).

export const previewBodySchema = z
  .object({
    /** Baris mentah: divalidasi per baris (bukan menolak seluruh request) supaya pratinjau informatif. */
    candidates: z.array(z.record(z.string(), z.unknown())).min(1).max(ONBOARDING_MAX_ROWS),
  })
  .openapi("OnboardingPreviewBody");

export const previewIssueSchema = z.object({
  field: z.string().nullable(),
  code: z.string(),
  message: z.string(),
});

export const previewRowSchema = z.object({
  sourceRow: z.number().int(),
  /** Nomor yang dipakai: isian pengguna, atau usulan otomatis DD.MM.KODE.NNN. */
  employeeNumber: z.string().nullable(),
  suggested: z.boolean(),
  issues: z.array(previewIssueSchema),
});

export const previewResultSchema = z
  .object({ rows: z.array(previewRowSchema), valid: z.boolean() })
  .openapi("OnboardingPreview");
export type OnboardingPreview = z.infer<typeof previewResultSchema>;

export const invitationCountsSchema = z.object({
  queued: z.number().int(),
  sent: z.number().int(),
  failed: z.number().int(),
});

export const batchSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    companyId: z.uuid().nullable(),
    createdCount: z.number().int(),
    invitedCount: z.number().int(),
    createdAt: z.iso.datetime(),
    invitations: invitationCountsSchema,
  })
  .openapi("OnboardingBatch");
export type OnboardingBatchDto = z.infer<typeof batchSchema>;

export const processResultSchema = z
  .object({
    processed: z.number().int(),
    sent: z.number().int(),
    failed: z.number().int(),
    remaining: z.number().int(),
    /** true = batas per jam tercapai; sisa antrean diproses nanti. */
    rateLimited: z.boolean(),
  })
  .openapi("OnboardingInvitationProcess");
export type ProcessResult = z.infer<typeof processResultSchema>;

export const candidateSchema = z
  .object({
    id: z.uuid(),
    employeeNumber: z.string(),
    fullName: z.string(),
    email: z.string().nullable(),
    companyId: z.uuid(),
    positionId: z.uuid(),
    employmentStatusId: z.uuid(),
    joinDate: z.iso.date(),
    onboardingStatus: onboardingStatusSchema,
    completionRequired: z.boolean(),
    batchId: z.uuid().nullable(),
    invitation: z
      .object({
        status: onboardingInvitationStatusSchema,
        sentAt: z.iso.datetime().nullable(),
        errorCode: z.string().nullable(),
      })
      .nullable(),
    account: z.object({ hasLoggedIn: z.boolean() }).nullable(),
  })
  .openapi("OnboardingCandidate");
export type OnboardingCandidateDto = z.infer<typeof candidateSchema>;

export const candidateListQuerySchema = z.object({
  status: onboardingStatusSchema.optional(),
  batchId: z.uuid().optional(),
  companyId: z.uuid().optional(),
  q: z.string().trim().min(1).max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type CandidateListQuery = z.infer<typeof candidateListQuerySchema>;

export const statusCountsSchema = z.record(onboardingStatusSchema, z.number().int());

export const inviteExistingBodySchema = z
  .object({
    employees: z
      .array(
        z.object({
          employeeId: z.uuid(),
          email: z
            .email()
            .max(254)
            .transform((v) => v.toLowerCase()),
        }),
      )
      .min(1)
      .max(200),
  })
  .openapi("OnboardingInviteExisting");
export type InviteExistingBody = z.infer<typeof inviteExistingBodySchema>;

export const inviteExistingResultSchema = z
  .object({
    queued: z.number().int(),
    skipped: z.array(z.object({ employeeId: z.uuid(), code: z.string(), message: z.string() })),
  })
  .openapi("OnboardingInviteExistingResult");

export const employeeIdParamSchema = z.object({ employeeId: z.uuid() });
export const batchIdParamSchema = z.object({ id: z.uuid() });
