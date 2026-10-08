import { dataChangeSectionSchema, dataChangeStatusSchema } from "@hris/shared";
import { z } from "zod";
import { archiveEmployeeSchema } from "@/features/archive/schemas";

// D-054 / OD-6 (Arsip 1c): bentuk respons pengajuan perubahan data (sama dengan data-change.schema.ts API).

const value = z.record(z.string(), z.unknown());

export const myDataSchema = z.object({
  employeeId: z.string(),
  fullName: z.string(),
  personal: value,
  emergency: value,
  family: z.array(value),
  bank: value,
  pendingSections: z.array(dataChangeSectionSchema),
});
export type MyData = z.infer<typeof myDataSchema>;

const summary = {
  id: z.string(),
  section: dataChangeSectionSchema,
  status: dataChangeStatusSchema,
  documentType: z.object({ id: z.string(), name: z.string() }).nullable(),
  fields: z.array(z.string()),
  reviewNote: z.string().nullable(),
  reviewedAt: z.string().nullable(),
  createdAt: z.string(),
};
export const dataChangeSummarySchema = z.object(summary);
export type DataChangeSummary = z.infer<typeof dataChangeSummarySchema>;

export const dataChangeQueueRowSchema = z.object({
  ...summary,
  employee: archiveEmployeeSchema,
  canReview: z.boolean(),
});
export type DataChangeQueueRow = z.infer<typeof dataChangeQueueRowSchema>;

export const dataChangeDetailSchema = z.object({
  ...summary,
  employee: archiveEmployeeSchema,
  proposed: value.nullable(),
  current: value.nullable(),
  document: z
    .object({
      id: z.string(),
      name: z.string(),
      mimeType: z.string(),
      sizeBytes: z.number(),
      url: z.string().nullable(),
    })
    .nullable(),
  access: z.object({ review: z.boolean(), cancel: z.boolean() }),
});
export type DataChangeDetail = z.infer<typeof dataChangeDetailSchema>;
