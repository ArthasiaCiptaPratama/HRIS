import {
  documentCategorySchema,
  documentRequirementSchema,
  documentStatusSchema,
  expiryStateSchema,
} from "@hris/shared";
import { z } from "zod";
import { archiveEmployeeSchema } from "@/features/archive/schemas";

// D-055 (Arsip 1b): bentuk respons jenis dokumen & dokumen karyawan (sama dengan document.schema.ts API).

export const documentTypeSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  category: documentCategorySchema,
  hasExpiry: z.boolean(),
  defaultValidityMonths: z.number().nullable(),
  reminderDays: z.array(z.number()),
  requiredScope: documentRequirementSchema,
  requiredPositionIds: z.array(z.string()),
  multiple: z.boolean(),
  employeeCanUpload: z.boolean(),
  sensitive: z.boolean(),
  maxSizeMb: z.number(),
  allowedMimeTypes: z.array(z.string()),
  archived: z.boolean(),
  documentCount: z.number(),
});
export type DocumentType = z.infer<typeof documentTypeSchema>;

export const employeeDocumentSchema = z.object({
  id: z.string(),
  documentType: z.object({
    id: z.string(),
    code: z.string(),
    name: z.string(),
    category: documentCategorySchema,
    sensitive: z.boolean(),
    hasExpiry: z.boolean(),
    multiple: z.boolean(),
  }),
  documentNumber: z.string().nullable(),
  issuedAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
  expiryState: expiryStateSchema,
  daysLeft: z.number().nullable(),
  version: z.number(),
  isCurrent: z.boolean(),
  replacesId: z.string().nullable(),
  status: documentStatusSchema,
  note: z.string().nullable(),
  mimeType: z.string(),
  sizeBytes: z.number(),
  trainingId: z.string().nullable(),
  historyId: z.string().nullable(),
  uploadedAt: z.string(),
});
export type EmployeeDocument = z.infer<typeof employeeDocumentSchema>;

export const employeeDocumentsSchema = z.object({
  data: z.object({
    documents: z.array(employeeDocumentSchema),
    access: z.object({
      write: z.boolean(),
      writeSensitive: z.boolean(),
      writeBankBook: z.boolean().default(false),
    }),
  }),
});
export type EmployeeDocuments = z.infer<typeof employeeDocumentsSchema>["data"];

export const archiveDocumentRowSchema = employeeDocumentSchema.extend({
  employee: archiveEmployeeSchema,
});
