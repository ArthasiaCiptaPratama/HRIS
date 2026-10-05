import { z } from "@hono/zod-openapi";
import {
  employmentCategorySchema,
  masterDataViewSchema,
  orgUnitTypeSchema,
  positionLevelSchema,
} from "@hris/shared";

// D-049: DTO halaman admin master data (SA kelola, HR lihat). Hanya jumlah karyawan — tanpa data per orang.

const base = {
  id: z.uuid(),
  name: z.string(),
  archived: z.boolean(),
  /** Karyawan aktif yang memakai item ini (untuk departemen: lewat jabatannya). */
  employeeCount: z.number().int(),
};

export const companyAdminSchema = z
  .object({
    ...base,
    code: z.string(),
    npwpNumber: z.string().nullable(),
    address: z.string().nullable(),
    /** Karyawan aktif + nonaktif; kode PT terkunci bila > 0 (dipakai nomor induk, D-045). */
    totalEmployeeCount: z.number().int(),
  })
  .openapi("CompanyAdmin");

export const departmentAdminSchema = z
  .object({
    ...base,
    unitType: orgUnitTypeSchema,
    parentId: z.uuid().nullable(),
    parentName: z.string().nullable(),
    // D-052: PT pemilik (null = fungsi korporat / lintas grup).
    companyId: z.uuid().nullable(),
    companyCode: z.string().nullable(),
    positionCount: z.number().int(),
  })
  .openapi("DepartmentAdmin");

export const positionAdminSchema = z
  .object({
    ...base,
    departmentId: z.uuid(),
    departmentName: z.string(),
    level: positionLevelSchema.nullable(),
  })
  .openapi("PositionAdmin");

export const employmentStatusAdminSchema = z
  .object({ ...base, category: employmentCategorySchema.nullable() })
  .openapi("EmploymentStatusAdmin");

export const gradeAdminSchema = z.object(base).openapi("GradeAdmin");

export const workLocationAdminSchema = z
  .object({
    ...base,
    city: z.string().nullable(),
    address: z.string().nullable(),
    latitude: z.number().nullable(),
    longitude: z.number().nullable(),
    radiusM: z.number().int().nullable(),
  })
  .openapi("WorkLocationAdmin");

export type CompanyAdmin = z.infer<typeof companyAdminSchema>;
export type DepartmentAdmin = z.infer<typeof departmentAdminSchema>;
export type PositionAdmin = z.infer<typeof positionAdminSchema>;
export type EmploymentStatusAdmin = z.infer<typeof employmentStatusAdminSchema>;
export type GradeAdmin = z.infer<typeof gradeAdminSchema>;
export type WorkLocationAdmin = z.infer<typeof workLocationAdminSchema>;

export const adminListQuerySchema = z.object({
  view: masterDataViewSchema.default("active"),
  q: z.string().trim().min(1).max(100).optional(),
});
export type AdminListQuery = z.infer<typeof adminListQuerySchema>;

export const idParamSchema = z.object({ id: z.uuid() });

export const mutationResultSchema = z.object({ id: z.uuid() }).openapi("MasterDataMutation");

export const mergeResultSchema = z
  .object({
    id: z.uuid(),
    targetId: z.uuid(),
    movedEmployees: z.number().int(),
    movedHistories: z.number().int(),
    movedPositions: z.number().int(),
  })
  .openapi("MasterDataMerge");
export type MergeResult = z.infer<typeof mergeResultSchema>;
