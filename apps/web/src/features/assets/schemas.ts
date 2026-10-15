import { ASSET_CONDITIONS, ASSET_STATUSES, ASSIGNMENT_OUTCOMES, LOAN_STATES } from "@hris/shared";
import { z } from "zod";

// ARS-D1–D6: subset respons API modul asset yang dipakai web (PROMPT §7).

export const categorySchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  requiresSerial: z.boolean(),
  isActive: z.boolean(),
});
export type AssetCategory = z.infer<typeof categorySchema>;

export const ppeTypeSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  replaceAfterMonths: z.number().nullable(),
  mustReturn: z.boolean(),
  isActive: z.boolean(),
});
export type PpeType = z.infer<typeof ppeTypeSchema>;

const holder = z.object({
  employeeId: z.string(),
  fullName: z.string(),
  employeeNumber: z.string().nullable(),
  companyId: z.string().nullable(),
  isActive: z.boolean(),
});
export type AssetHolder = z.infer<typeof holder>;
const categoryRef = z.object({ id: z.string(), code: z.string(), name: z.string() });
const condition = z.enum(ASSET_CONDITIONS);

export const assignmentSchema = z.object({
  id: z.string(),
  asset: z
    .object({ id: z.string(), code: z.string(), name: z.string(), category: categoryRef })
    .nullable(),
  employee: holder,
  assignedAt: z.string(),
  dueBackAt: z.string().nullable(),
  loanState: z.enum(LOAN_STATES),
  conditionOut: condition,
  closedAt: z.string().nullable(),
  outcome: z.enum(ASSIGNMENT_OUTCOMES).nullable(),
  conditionIn: condition.nullable(),
  handoverDocumentId: z.string().nullable(),
  returnDocumentId: z.string().nullable(),
  acknowledgedAt: z.string().nullable(),
  note: z.string().nullable(),
  closeNote: z.string().nullable(),
});
export type AssetAssignment = z.infer<typeof assignmentSchema>;

export const assetSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  brand: z.string().nullable(),
  model: z.string().nullable(),
  serialNumber: z.string().nullable(),
  category: categoryRef,
  company: z.object({ id: z.string(), code: z.string(), name: z.string() }),
  workLocation: z.object({ id: z.string(), name: z.string() }).nullable(),
  condition,
  status: z.enum(ASSET_STATUSES),
  purchaseDate: z.string().nullable(),
  purchasePrice: z.string().nullable(),
  canSeePrice: z.boolean(),
  canManage: z.boolean(),
  note: z.string().nullable(),
  holder: holder.nullable(),
  assignment: assignmentSchema.nullable(),
});
export type Asset = z.infer<typeof assetSchema>;
export const assetDetailSchema = assetSchema.extend({ history: z.array(assignmentSchema) });
export type AssetDetail = z.infer<typeof assetDetailSchema>;

export const ppeIssueSchema = z.object({
  id: z.string(),
  ppeType: z.object({
    id: z.string(),
    code: z.string(),
    name: z.string(),
    mustReturn: z.boolean(),
    replaceAfterMonths: z.number().nullable(),
  }),
  employee: holder,
  quantity: z.number(),
  size: z.string().nullable(),
  issuedAt: z.string(),
  replacementDue: z.string().nullable(),
  replacementState: z.enum(["NONE", "OK", "DUE", "REPLACED"]),
  handoverDocumentId: z.string().nullable(),
  acknowledgedAt: z.string().nullable(),
  returnedAt: z.string().nullable(),
  note: z.string().nullable(),
  canManage: z.boolean().optional(),
});
export type PpeIssue = z.infer<typeof ppeIssueSchema>;

export const holdingsSchema = z.object({
  employee: holder.nullable(),
  assets: z.array(assignmentSchema),
  ppe: z.array(ppeIssueSchema),
  canManage: z.boolean(),
});
export type AssetHoldings = z.infer<typeof holdingsSchema>;

export const pendingReturnSchema = z.object({
  employee: holder,
  canManage: z.boolean(),
  assets: z.array(assignmentSchema),
  ppe: z.array(ppeIssueSchema),
});
export type PendingReturn = z.infer<typeof pendingReturnSchema>;

const meta = z.object({ page: z.number(), pageSize: z.number(), total: z.number() });
export const assetPageSchema = z.object({ data: z.array(assetSchema), meta });
export const ppePageSchema = z.object({ data: z.array(ppeIssueSchema), meta });
