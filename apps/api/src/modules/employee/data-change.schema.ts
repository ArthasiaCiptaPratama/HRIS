import { z } from "@hono/zod-openapi";
import {
  dataChangeSectionSchema,
  dataChangeStatusSchema,
  familyRelationshipSchema,
  genderSchema,
} from "@hris/shared";
import { archiveEmployeeRefSchema, archiveListQuerySchema } from "./archive.schema.ts";

// D-054 / OD-6 (Arsip 1c): DTO pengajuan perubahan data + Arsip Keluarga/Bank. Isi `proposed`/`current`
// berbentuk per bagian (dicek skema shared `dataChangeInputSchema` saat diajukan).

const value = z.record(z.string(), z.unknown());

export const dataChangeBodySchema = z
  .object({ section: dataChangeSectionSchema, data: value })
  .openapi("DataChangeInput");

export const dataChangeDecisionBodySchema = z
  .object({
    decision: z.enum(["APPROVE", "REJECT"]),
    note: z.string().max(500).nullable().optional(),
  })
  .openapi("DataChangeDecisionInput");

export const myUploadUrlBodySchema = z
  .object({
    purpose: z.enum(["BANK", "DOCUMENT"]),
    documentTypeId: z.uuid().optional(),
    contentType: z.enum(["application/pdf", "image/jpeg", "image/png"]),
  })
  .openapi("DataChangeUploadUrlInput");

const summary = {
  id: z.uuid(),
  section: dataChangeSectionSchema,
  status: dataChangeStatusSchema,
  documentType: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  /** Nama field yang diubah (tanpa nilai). */
  fields: z.array(z.string()),
  reviewNote: z.string().nullable(),
  reviewedAt: z.string().nullable(),
  createdAt: z.string(),
};

export const dataChangeSummarySchema = z.object(summary).openapi("DataChangeSummary");
export const dataChangeQueueRowSchema = z
  .object({ ...summary, employee: archiveEmployeeRefSchema, canReview: z.boolean() })
  .openapi("DataChangeQueueRow");
export const dataChangeDetailSchema = z
  .object({
    ...summary,
    employee: archiveEmployeeRefSchema,
    proposed: value.nullable(),
    current: value.nullable(),
    document: z
      .object({
        id: z.uuid(),
        name: z.string(),
        mimeType: z.string(),
        sizeBytes: z.number().int(),
        url: z.string().nullable(),
      })
      .nullable(),
    access: z.object({ review: z.boolean(), cancel: z.boolean() }),
  })
  .openapi("DataChangeDetail");

export const myDataSchema = z
  .object({
    employeeId: z.uuid(),
    fullName: z.string(),
    personal: value,
    emergency: value,
    family: z.array(value),
    bank: value,
    pendingSections: z.array(dataChangeSectionSchema),
  })
  .openapi("MyEmployeeData");

export const dataChangeResultSchema = z
  .object({ id: z.uuid(), status: dataChangeStatusSchema.optional() })
  .openapi("DataChangeResult");

export const dataChangeQueueQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(100).optional(),
  companyId: z.uuid().optional(),
  status: dataChangeStatusSchema.optional(),
  section: dataChangeSectionSchema.optional(),
});
export type DataChangeQueueQuery = z.infer<typeof dataChangeQueueQuerySchema>;

export const sensitiveArchiveQuerySchema = archiveListQuerySchema
  .omit({ level: true, type: true, movementType: true, source: true })
  .extend({ relationship: familyRelationshipSchema.optional() });
export type SensitiveArchiveQuery = z.infer<typeof sensitiveArchiveQuerySchema>;

export const familyRowSchema = z
  .object({
    id: z.uuid(),
    employee: archiveEmployeeRefSchema,
    name: z.string(),
    relationship: familyRelationshipSchema,
    birthDate: z.iso.date().nullable(),
    phoneNumber: z.string().nullable(),
    gender: genderSchema.nullable(),
    birthPlace: z.string().nullable(),
    education: z.string().nullable(),
    occupation: z.string().nullable(),
    ageAtEntry: z.number().int().nullable(),
    workAddress: z.string().nullable(),
  })
  .openapi("ArchiveFamilyRow");

export const bankRowSchema = z
  .object({
    id: z.uuid(),
    employee: archiveEmployeeRefSchema,
    bankName: z.string().nullable(),
    accountNumber: z.string().nullable(),
    accountHolder: z.string().nullable(),
  })
  .openapi("ArchiveBankRow");

export const dataChangeIdParamSchema = z.object({ id: z.uuid() });
