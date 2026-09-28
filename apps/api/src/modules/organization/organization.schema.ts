import { z } from "@hono/zod-openapi";
import { employmentCategorySchema } from "@hris/shared";

export const departmentSchema = z
  .object({ id: z.uuid(), name: z.string(), parentId: z.uuid().nullable() })
  .openapi("Department");

export const positionSchema = z
  .object({ id: z.uuid(), name: z.string(), departmentId: z.uuid() })
  .openapi("Position");

export const employmentStatusSchema = z
  .object({ id: z.uuid(), name: z.string(), category: employmentCategorySchema.nullable() })
  .openapi("EmploymentStatus");

export const gradeSchema = z.object({ id: z.uuid(), name: z.string() }).openapi("Grade");

export const workLocationSchema = z
  .object({ id: z.uuid(), name: z.string(), city: z.string().nullable() })
  .openapi("WorkLocation");

export type DepartmentDto = z.infer<typeof departmentSchema>;
export type PositionDto = z.infer<typeof positionSchema>;
export type EmploymentStatusDto = z.infer<typeof employmentStatusSchema>;
export type GradeDto = z.infer<typeof gradeSchema>;
export type WorkLocationDto = z.infer<typeof workLocationSchema>;
