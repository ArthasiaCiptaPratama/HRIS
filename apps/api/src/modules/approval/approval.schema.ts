import { z } from "@hono/zod-openapi";
import { approvalSubjectSchema } from "@hris/shared";

// Respons modul approval (PLAN §5.2). Isi subjek (hari absen, cuti, …) ditampilkan modul pemiliknya.
// Enum bernama (MOB-D9): enum inline di objek tanpa nama jadi `Kind2`/`Status2` di klien Dart dan nomornya
// bergeser antar-spec. `ApprovalStatus` = nama yang sudah dipakai app untuk `Approval.status`.
const approvalStepKindSchema = z.enum(["MANAGER", "HR"]).openapi("ApprovalStepKind");
const approvalStatusSchema = z
  .enum(["PENDING", "APPROVED", "REJECTED", "CANCELLED"])
  .openapi("ApprovalStatus");

const stepSchema = z.object({
  kind: approvalStepKindSchema,
  decision: z.enum(["PENDING", "APPROVED", "REJECTED"]),
  decidedAt: z.iso.datetime().nullable(),
  note: z.string().nullable(),
  isOverride: z.boolean(),
  myRight: z.enum(["regular", "override"]).nullable(),
});

export const approvalViewSchema = z
  .object({
    id: z.uuid(),
    subjectType: approvalSubjectSchema,
    subjectId: z.uuid(),
    status: approvalStatusSchema,
    createdAt: z.iso.datetime(),
    decidedAt: z.iso.datetime().nullable(),
    steps: z.array(stepSchema),
    canDecide: z.boolean(),
    canOverride: z.boolean(),
  })
  .openapi("Approval");

export const decisionResultSchema = z
  .object({ requestId: z.uuid(), status: z.enum(["PENDING", "APPROVED", "REJECTED", "CANCELLED"]) })
  .openapi("ApprovalDecisionResult");

export const bulkResultSchema = z
  .array(
    z.object({
      requestId: z.uuid(),
      status: approvalStatusSchema.optional(),
      error: z.string().optional(),
    }),
  )
  .openapi("ApprovalBulkResult");

export const idParamSchema = z.object({ id: z.uuid() });
