import { z } from "@hono/zod-openapi";
import {
  documentCategorySchema,
  documentRequirementSchema,
  documentStatusSchema,
  expiryStateSchema,
} from "@hris/shared";
import { archiveEmployeeRefSchema, archiveListQuerySchema } from "./archive.schema.ts";

// D-055 (Arsip 1b): DTO jenis dokumen & dokumen karyawan. Berkas tidak pernah dikirim lewat API —
// hanya metadata; isi dibuka lewat tautan bertanda tangan singkat (`/url`).

const isoDate = z.iso.date();

export const documentTypeSchema = z
  .object({
    id: z.uuid(),
    code: z.string(),
    name: z.string(),
    category: documentCategorySchema,
    hasExpiry: z.boolean(),
    defaultValidityMonths: z.number().int().nullable(),
    reminderDays: z.array(z.number().int()),
    requiredScope: documentRequirementSchema,
    requiredPositionIds: z.array(z.uuid()),
    multiple: z.boolean(),
    employeeCanUpload: z.boolean(),
    sensitive: z.boolean(),
    maxSizeMb: z.number().int(),
    allowedMimeTypes: z.array(z.string()),
    archived: z.boolean(),
    documentCount: z.number().int(),
  })
  .openapi("DocumentType");

export const documentTypeInputBodySchema = z
  .object({
    code: z.string(),
    name: z.string(),
    category: documentCategorySchema,
    hasExpiry: z.boolean(),
    defaultValidityMonths: z.number().int().nullable().optional(),
    reminderDays: z.array(z.number().int()).optional(),
    requiredScope: documentRequirementSchema,
    requiredPositionIds: z.array(z.uuid()).optional(),
    multiple: z.boolean(),
    employeeCanUpload: z.boolean(),
    sensitive: z.boolean(),
    maxSizeMb: z.number().int(),
    allowedMimeTypes: z.array(z.string()),
  })
  .openapi("DocumentTypeInput");

export const documentTypeListQuerySchema = z.object({
  /** SA: sertakan jenis yang diarsipkan. */
  archived: z.enum(["include", "exclude"]).default("exclude"),
});

export const employeeDocumentSchema = z
  .object({
    id: z.uuid(),
    documentType: z.object({
      id: z.uuid(),
      code: z.string(),
      name: z.string(),
      category: documentCategorySchema,
      sensitive: z.boolean(),
      hasExpiry: z.boolean(),
      multiple: z.boolean(),
    }),
    documentNumber: z.string().nullable(),
    issuedAt: isoDate.nullable(),
    expiresAt: isoDate.nullable(),
    expiryState: expiryStateSchema,
    daysLeft: z.number().int().nullable(),
    version: z.number().int(),
    isCurrent: z.boolean(),
    replacesId: z.uuid().nullable(),
    status: documentStatusSchema,
    note: z.string().nullable(),
    mimeType: z.string(),
    sizeBytes: z.number().int(),
    trainingId: z.uuid().nullable(),
    historyId: z.uuid().nullable(),
    uploadedAt: z.string(),
  })
  .openapi("EmployeeDocument");

export const employeeDocumentsSchema = z
  .object({
    documents: z.array(employeeDocumentSchema),
    access: z.object({ write: z.boolean(), writeSensitive: z.boolean() }),
  })
  .openapi("EmployeeDocuments");

export const archiveDocumentRowSchema = employeeDocumentSchema
  .extend({ employee: archiveEmployeeRefSchema })
  .openapi("ArchiveDocumentRow");

export const documentListQuerySchema = archiveListQuerySchema
  .omit({ level: true, type: true, movementType: true, source: true })
  .extend({
    documentTypeId: z.uuid().optional(),
    category: documentCategorySchema.optional(),
    expiry: expiryStateSchema.optional(),
  });
export type DocumentListQuery = z.infer<typeof documentListQuerySchema>;

export const documentUploadUrlBodySchema = z
  .object({
    documentTypeId: z.uuid(),
    contentType: z.enum(["application/pdf", "image/jpeg", "image/png"]),
  })
  .openapi("EmployeeDocumentUploadUrlInput");

export const documentUploadUrlSchema = z
  .object({
    bucket: z.string(),
    path: z.string(),
    token: z.string(),
    signedUrl: z.string(),
    maxBytes: z.number().int(),
  })
  .openapi("EmployeeDocumentUploadUrl");

export const documentBodySchema = z
  .object({
    documentTypeId: z.uuid(),
    documentNumber: z.string().max(60).nullable().optional(),
    issuedAt: isoDate.nullable().optional(),
    expiresAt: isoDate.nullable().optional(),
    note: z.string().max(500).nullable().optional(),
  })
  .openapi("EmployeeDocumentInput");

export const documentCreateBodySchema = documentBodySchema
  .extend({
    path: z.string().min(1).max(255),
    replacesId: z.uuid().nullable().optional(),
    trainingId: z.uuid().nullable().optional(),
    historyId: z.uuid().nullable().optional(),
  })
  .openapi("EmployeeDocumentCreateInput");

export const documentUrlSchema = z
  .object({ url: z.string(), expiresInSeconds: z.number().int() })
  .openapi("EmployeeDocumentUrl");

export const typeIdParamSchema = z.object({ id: z.uuid() });
export const documentParamSchema = z.object({ id: z.uuid(), documentId: z.uuid() });
