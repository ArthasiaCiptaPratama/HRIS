import { z } from "@hono/zod-openapi";

// DTO OpenAPI modul asset (ARS-D1–D6). Body ditulis longgar di OpenAPI lalu divalidasi skema
// @hris/shared di service (pola approval/roster; skema shared memakai instance zod lain).

const condition = z.enum(["GOOD", "FAIR", "DAMAGED"]);
const status = z.enum(["AVAILABLE", "ASSIGNED", "MAINTENANCE", "LOST", "RETIRED"]);
const isoDate = z.string().openapi({ example: "2026-10-13" });

export const idParamSchema = z.object({ id: z.uuid() });
export const employeeParamSchema = z.object({ employeeId: z.uuid() });
export const bastQuerySchema = z.object({
  kind: z.enum(["HANDOVER", "RETURN"]).default("HANDOVER"),
});
export const holdingsQuerySchema = z.object({
  openOnly: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
});
export const nextCodeQuerySchema = z.object({ companyId: z.uuid(), categoryId: z.uuid() });

export const assetListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(100).optional(),
  status: status.optional(),
  categoryId: z.uuid().optional(),
  companyId: z.uuid().optional(),
  workLocationId: z.uuid().optional(),
  holderId: z.uuid().optional(),
  /** Hanya pinjaman yang lewat tanggal kembali. */
  overdue: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
});

export const ppeListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(100).optional(),
  employeeId: z.uuid().optional(),
  ppeTypeId: z.uuid().optional(),
  replacement: z.enum(["DUE"]).optional(),
});

const looseBody = (name: string, description: string) =>
  z.record(z.string(), z.unknown()).openapi(name, { description });

export const categoryBodySchema = looseBody(
  "AssetCategoryInput",
  "`{ code, name, requiresSerial, isActive? }` (assetCategoryInputSchema)",
);
export const ppeTypeBodySchema = looseBody(
  "PpeTypeInput",
  "`{ code, name, replaceAfterMonths?, mustReturn, isActive? }` (ppeTypeInputSchema)",
);
export const assetBodySchema = looseBody(
  "AssetInput",
  "`{ code?, categoryId, name, brand?, model?, serialNumber?, companyId, workLocationId?, condition, purchaseDate?, purchasePrice? (string), note? }` (assetInputSchema)",
);
export const assetStatusBodySchema = looseBody(
  "AssetStatusInput",
  "`{ status: AVAILABLE|MAINTENANCE|RETIRED, note? }`",
);
export const assignBodySchema = looseBody(
  "AssignAssetInput",
  "`{ employeeId, assignedAt, dueBackAt?, conditionOut, note? }`",
);
export const returnBodySchema = looseBody(
  "ReturnAssetInput",
  "`{ returnedAt, conditionIn, note? }`",
);
export const lostBodySchema = looseBody("MarkAssetLostInput", "`{ lostAt, note }`");
export const bastBodySchema = looseBody(
  "AttachBastInput",
  "`{ kind: HANDOVER|RETURN, documentId }` — dokumen karyawan jenis BAST_ASSET",
);
export const ppeIssueBodySchema = looseBody(
  "PpeIssueInput",
  "`{ employeeId, ppeTypeId, quantity, size?, issuedAt, note? }`",
);
export const ppeReturnBodySchema = looseBody("PpeReturnInput", "`{ returnedAt, note? }`");
export const ppeBastBodySchema = looseBody("PpeAttachBastInput", "`{ documentId }`");

export const categorySchema = z
  .object({
    id: z.uuid(),
    code: z.string(),
    name: z.string(),
    requiresSerial: z.boolean(),
    isActive: z.boolean(),
  })
  .openapi("AssetCategory");
export const ppeTypeSchema = z
  .object({
    id: z.uuid(),
    code: z.string(),
    name: z.string(),
    replaceAfterMonths: z.number().int().nullable(),
    mustReturn: z.boolean(),
    isActive: z.boolean(),
  })
  .openapi("PpeType");

const holder = z.object({
  employeeId: z.uuid(),
  fullName: z.string(),
  employeeNumber: z.string().nullable(),
  companyId: z.uuid().nullable(),
  isActive: z.boolean(),
});
const categoryRef = z.object({ id: z.uuid(), code: z.string(), name: z.string() });

export const assignmentSchema = z
  .object({
    id: z.uuid(),
    asset: z
      .object({ id: z.uuid(), code: z.string(), name: z.string(), category: categoryRef })
      .nullable(),
    employee: holder,
    assignedAt: isoDate,
    dueBackAt: isoDate.nullable(),
    loanState: z.enum(["NONE", "OPEN", "DUE_SOON", "OVERDUE"]),
    conditionOut: condition,
    closedAt: isoDate.nullable(),
    outcome: z.enum(["RETURNED", "LOST"]).nullable(),
    conditionIn: condition.nullable(),
    handoverDocumentId: z.uuid().nullable(),
    returnDocumentId: z.uuid().nullable(),
    acknowledgedAt: z.string().nullable(),
    note: z.string().nullable(),
    closeNote: z.string().nullable(),
  })
  .openapi("AssetAssignment");

export const assetSchema = z
  .object({
    id: z.uuid(),
    code: z.string(),
    name: z.string(),
    brand: z.string().nullable(),
    model: z.string().nullable(),
    serialNumber: z.string().nullable(),
    category: categoryRef,
    company: z.object({ id: z.uuid(), code: z.string(), name: z.string() }),
    workLocation: z.object({ id: z.uuid(), name: z.string() }).nullable(),
    condition,
    status,
    purchaseDate: isoDate
      .nullable()
      .openapi({ description: "Hanya untuk pengelola aset (ARS-D4); selain itu null" }),
    purchasePrice: z
      .string()
      .nullable()
      .openapi({ description: "Desimal string; hanya untuk pengelola aset (ARS-D4)" }),
    canSeePrice: z.boolean(),
    canManage: z.boolean(),
    note: z.string().nullable(),
    holder: holder.nullable(),
    assignment: assignmentSchema.nullable(),
  })
  .openapi("Asset");
export const assetDetailSchema = assetSchema
  .extend({ history: z.array(assignmentSchema) })
  .openapi("AssetDetail");

export const ppeIssueSchema = z
  .object({
    id: z.uuid(),
    ppeType: z.object({
      id: z.uuid(),
      code: z.string(),
      name: z.string(),
      mustReturn: z.boolean(),
      replaceAfterMonths: z.number().int().nullable(),
    }),
    employee: holder,
    quantity: z.number().int(),
    size: z.string().nullable(),
    issuedAt: isoDate,
    replacementDue: isoDate.nullable(),
    replacementState: z.enum(["NONE", "OK", "DUE", "REPLACED"]),
    handoverDocumentId: z.uuid().nullable(),
    acknowledgedAt: z.string().nullable(),
    returnedAt: isoDate.nullable(),
    note: z.string().nullable(),
  })
  .openapi("PpeIssue");
export const ppeIssueRowSchema = ppeIssueSchema
  .extend({ canManage: z.boolean() })
  .openapi("PpeIssueRow");

export const holdingsSchema = z
  .object({
    employee: holder.nullable(),
    assets: z.array(assignmentSchema),
    ppe: z.array(ppeIssueSchema),
    canManage: z.boolean(),
  })
  .openapi("AssetHoldings");

export const pendingReturnSchema = z
  .object({
    employee: holder,
    canManage: z.boolean(),
    assets: z.array(assignmentSchema),
    ppe: z.array(ppeIssueSchema),
  })
  .openapi("AssetPendingReturn");

export const fileSchema = z
  .object({
    fileName: z.string(),
    contentBase64: z.string().openapi({ description: "Isi PDF (base64)" }),
  })
  .openapi("AssetBastFile");
export const codeSchema = z.object({ code: z.string() }).openapi("AssetCodeSuggestion");
