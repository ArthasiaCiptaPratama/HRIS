import { onboardingInvitationStatusSchema, onboardingStatusSchema } from "@hris/shared";
import { z } from "zod";

// D-045 bagian a: bentuk respons API penerimaan (sama dengan onboarding.schema.ts di api).

export const previewSchema = z.object({
  rows: z.array(
    z.object({
      sourceRow: z.number(),
      employeeNumber: z.string().nullable(),
      suggested: z.boolean(),
      issues: z.array(
        z.object({ field: z.string().nullable(), code: z.string(), message: z.string() }),
      ),
    }),
  ),
  valid: z.boolean(),
});
export type OnboardingPreview = z.infer<typeof previewSchema>;

export const batchSchema = z.object({
  id: z.string(),
  name: z.string(),
  companyId: z.string().nullable(),
  createdCount: z.number(),
  invitedCount: z.number(),
  createdAt: z.string(),
  invitations: z.object({ queued: z.number(), sent: z.number(), failed: z.number() }),
});
export type OnboardingBatch = z.infer<typeof batchSchema>;

export const processResultSchema = z.object({
  processed: z.number(),
  sent: z.number(),
  failed: z.number(),
  remaining: z.number(),
  rateLimited: z.boolean(),
});
export type ProcessResult = z.infer<typeof processResultSchema>;

export const candidateSchema = z.object({
  id: z.string(),
  employeeNumber: z.string(),
  fullName: z.string(),
  email: z.string().nullable(),
  companyId: z.string(),
  positionId: z.string(),
  employmentStatusId: z.string(),
  joinDate: z.string(),
  onboardingStatus: onboardingStatusSchema,
  completionRequired: z.boolean(),
  batchId: z.string().nullable(),
  invitation: z
    .object({
      status: onboardingInvitationStatusSchema,
      sentAt: z.string().nullable(),
      errorCode: z.string().nullable(),
    })
    .nullable(),
  account: z.object({ hasLoggedIn: z.boolean() }).nullable(),
});
export type OnboardingCandidateRow = z.infer<typeof candidateSchema>;

export const candidatePageSchema = z.object({
  data: z.array(candidateSchema),
  meta: z.object({
    page: z.number(),
    pageSize: z.number(),
    total: z.number(),
    counts: z.record(onboardingStatusSchema, z.number()),
  }),
});

export const inviteExistingResultSchema = z.object({
  queued: z.number(),
  skipped: z.array(z.object({ employeeId: z.string(), code: z.string(), message: z.string() })),
});

export const one = <T extends z.ZodType>(item: T) => z.object({ data: item });
