import {
  ONBOARDING_DECISIONS,
  onboardingInvitationStatusSchema,
  onboardingStatusSchema,
  ptkpStatusSchema,
  REVIEW_SECTIONS,
} from "@hris/shared";
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
  // D-045 d: calon Dibatalkan — batas pemulihan sebelum dihapus permanen.
  cancellation: z
    .object({ cancelledAt: z.string(), restorableUntil: z.string() })
    .nullable()
    .default(null),
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

// ── D-045 b: wizard milik sendiri (/onboarding/me) ──────────────────────────────────────────────
const ns = z.string().nullable();
export const myOnboardingSchema = z.object({
  employeeId: z.string(),
  status: onboardingStatusSchema,
  mode: z.enum(["candidate", "completion"]).nullable(),
  editable: z.boolean(),
  submittedAt: ns,
  // D-045 c: catatan revisi yang berlaku (hanya bagian bertanda yang terbuka).
  revision: z
    .object({
      notes: z.partialRecord(z.enum(REVIEW_SECTIONS), z.string()),
      decidedAt: z.string(),
    })
    .nullable()
    .default(null),
  personal: z.object({
    fullName: z.string(),
    gender: ns,
    birthPlace: ns,
    birthDate: ns,
    ktpNumber: ns,
    kkNumber: ns,
    religion: ns,
    maritalStatus: ns,
    ktpAddress: ns,
    domicileAddress: ns,
    originCity: ns,
    phoneNumber: ns,
    npwpNumber: ns,
    npwpAbsent: z.boolean(),
    bpjsEmploymentNumber: ns,
    bpjsEmploymentAbsent: z.boolean(),
    bpjsHealthNumber: ns,
    bpjsHealthAbsent: z.boolean(),
  }),
  emergency: z.object({ name: ns, relationship: ns, phone: ns }),
  family: z.array(
    z.object({ name: z.string(), relationship: z.string(), birthDate: ns, phoneNumber: ns }),
  ),
  bank: z.object({ bankName: ns, accountNumber: ns, accountHolder: ns }),
  educations: z.array(
    z.object({
      level: ns,
      schoolName: z.string(),
      major: ns,
      graduationYear: z.number().nullable(),
    }),
  ),
  trainings: z.array(
    z.object({ trainingField: z.string(), organizer: ns, trainingYear: z.number().nullable() }),
  ),
  workExperiences: z.array(
    z.object({
      companyName: z.string(),
      position: z.string(),
      startYear: z.number(),
      endYear: z.number().nullable(),
    }),
  ),
  documents: z.array(
    z.object({
      id: z.string(),
      type: z.string(),
      mimeType: z.string(),
      sizeBytes: z.number(),
      url: ns,
      removable: z.boolean(),
    }),
  ),
  photoUrl: ns,
  missing: z.array(z.object({ section: z.string(), field: z.string(), message: z.string() })),
});
export type MyOnboarding = z.infer<typeof myOnboardingSchema>;

// D-045 c: halaman review (SA / HR + grant).
export const onboardingReviewSchema = myOnboardingSchema.extend({
  reviewMode: z.enum(["candidate", "completion"]),
  employeeNumber: z.string(),
  personalEmail: ns,
  work: z.object({
    companyId: z.string(),
    employmentStatusId: z.string(),
    positionId: z.string(),
    workLocationId: ns,
    gradeId: ns,
    managerId: ns,
    joinDate: z.string(),
  }),
  ptkpStatus: ptkpStatusSchema.nullable(),
  canDecide: z.boolean(),
  reviews: z.array(
    z.object({
      id: z.string(),
      decision: z.enum(ONBOARDING_DECISIONS),
      completion: z.boolean(),
      sectionNotes: z.partialRecord(z.enum(REVIEW_SECTIONS), z.string()).nullable(),
      reason: ns,
      decidedAt: z.string(),
      reviewerEmail: ns,
    }),
  ),
});
export type OnboardingReview = z.infer<typeof onboardingReviewSchema>;

export const documentUploadUrlSchema = z.object({
  bucket: z.string(),
  path: z.string(),
  token: z.string(),
  signedUrl: z.string(),
  maxBytes: z.number(),
});
