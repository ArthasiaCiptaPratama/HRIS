import { z } from "@hono/zod-openapi";
import { employmentCategorySchema, orgUnitTypeSchema, positionLevelSchema } from "@hris/shared";

export const departmentSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    parentId: z.uuid().nullable(),
    // D-050: jenis unit organisasi (Direktorat/Divisi/Departemen/Seksi).
    unitType: orgUnitTypeSchema,
  })
  .openapi("Department");

export const positionSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    departmentId: z.uuid(),
    level: positionLevelSchema.nullable(),
  })
  .openapi("Position");

export const employmentStatusSchema = z
  .object({ id: z.uuid(), name: z.string(), category: employmentCategorySchema.nullable() })
  .openapi("EmploymentStatus");

export const gradeSchema = z.object({ id: z.uuid(), name: z.string() }).openapi("Grade");

export const workLocationSchema = z
  .object({ id: z.uuid(), name: z.string(), city: z.string().nullable() })
  .openapi("WorkLocation");

// D-039: perusahaan dalam grup (ringkas: untuk pilihan, filter, dan label).
export const companySchema = z
  .object({ id: z.uuid(), code: z.string(), name: z.string() })
  .openapi("Company");

export type CompanyDto = z.infer<typeof companySchema>;
export type DepartmentDto = z.infer<typeof departmentSchema>;
export type PositionDto = z.infer<typeof positionSchema>;
export type EmploymentStatusDto = z.infer<typeof employmentStatusSchema>;
export type GradeDto = z.infer<typeof gradeSchema>;
export type WorkLocationDto = z.infer<typeof workLocationSchema>;
