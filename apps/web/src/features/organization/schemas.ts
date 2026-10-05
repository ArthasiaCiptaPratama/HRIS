import { employmentCategorySchema, orgUnitTypeSchema, positionLevelSchema } from "@hris/shared";
import { z } from "zod";

// D-049: bentuk respons daftar admin master data (sama dengan organization-admin.schema.ts API).
const base = {
  id: z.string(),
  name: z.string(),
  archived: z.boolean(),
  employeeCount: z.number(),
};

export const companyAdminSchema = z.object({
  ...base,
  code: z.string(),
  npwpNumber: z.string().nullable(),
  address: z.string().nullable(),
  totalEmployeeCount: z.number(),
});
export const departmentAdminSchema = z.object({
  ...base,
  unitType: orgUnitTypeSchema,
  parentId: z.string().nullable(),
  parentName: z.string().nullable(),
  positionCount: z.number(),
});
export const positionAdminSchema = z.object({
  ...base,
  departmentId: z.string(),
  departmentName: z.string(),
  level: positionLevelSchema.nullable(),
});
export const employmentStatusAdminSchema = z.object({
  ...base,
  category: employmentCategorySchema.nullable(),
});
export const gradeAdminSchema = z.object(base);
export const workLocationAdminSchema = z.object({
  ...base,
  city: z.string().nullable(),
  address: z.string().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  radiusM: z.number().nullable(),
});

export type CompanyAdmin = z.infer<typeof companyAdminSchema>;
export type DepartmentAdmin = z.infer<typeof departmentAdminSchema>;
export type PositionAdmin = z.infer<typeof positionAdminSchema>;
export type EmploymentStatusAdmin = z.infer<typeof employmentStatusAdminSchema>;
export type GradeAdmin = z.infer<typeof gradeAdminSchema>;
export type WorkLocationAdmin = z.infer<typeof workLocationAdminSchema>;

/** Gabungan longgar semua jenis: kolom khusus dibaca dengan pemeriksaan jenis di halaman. */
export const masterDataItemSchema = z.object({
  ...base,
  code: z.string().optional(),
  npwpNumber: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  totalEmployeeCount: z.number().optional(),
  unitType: orgUnitTypeSchema.optional(),
  parentId: z.string().nullable().optional(),
  parentName: z.string().nullable().optional(),
  positionCount: z.number().optional(),
  departmentId: z.string().optional(),
  departmentName: z.string().optional(),
  level: positionLevelSchema.nullable().optional(),
  category: employmentCategorySchema.nullable().optional(),
  city: z.string().nullable().optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  radiusM: z.number().nullable().optional(),
});
export type MasterDataItem = z.infer<typeof masterDataItemSchema>;

export const mergeResultSchema = z.object({
  id: z.string(),
  targetId: z.string(),
  movedEmployees: z.number(),
  movedHistories: z.number(),
  movedPositions: z.number(),
});

export const one = <T extends z.ZodType>(item: T) => z.object({ data: item });
