import { z } from "@hono/zod-openapi";
import { masterDataViewSchema, orgUnitTypeSchema, positionLevelSchema } from "@hris/shared";

// D-051: DTO pos jabatan (Master Data › Pos jabatan). Hanya jumlah pemegang — tanpa data per orang.

export const orgPostAdminSchema = z
  .object({
    id: z.uuid(),
    code: z.string().nullable(),
    positionId: z.uuid(),
    positionName: z.string(),
    level: positionLevelSchema.nullable(),
    departmentId: z.uuid(),
    departmentName: z.string(),
    unitType: orgUnitTypeSchema,
    /** PT pos = PT unit jabatannya; null = fungsi korporat grup (D-052). */
    companyId: z.uuid().nullable(),
    companyCode: z.string().nullable(),
    reportsToId: z.uuid().nullable(),
    reportsToLabel: z.string().nullable(),
    functionalReportsToId: z.uuid().nullable(),
    functionalReportsToLabel: z.string().nullable(),
    headcount: z.number().int(),
    holderCount: z.number().int(),
    sortOrder: z.number().int(),
    archived: z.boolean(),
  })
  .openapi("OrgPostAdmin");
export type OrgPostAdmin = z.infer<typeof orgPostAdminSchema>;

export const orgPostListQuerySchema = z.object({
  view: masterDataViewSchema.default("active"),
  q: z.string().trim().max(100).optional(),
  /** Filter PT; "corporate" = fungsi korporat grup. */
  companyId: z.union([z.uuid(), z.literal("corporate")]).optional(),
});
export type OrgPostListQuery = z.infer<typeof orgPostListQuerySchema>;

export const syncManagersResultSchema = z
  .object({ updated: z.number().int() })
  .openapi("SyncManagersResult");
