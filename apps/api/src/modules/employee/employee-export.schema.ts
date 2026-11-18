import { z } from "@hono/zod-openapi";
import { listEmployeesQuerySchema } from "./employee.schema.ts";

export const employeeExportSectionSchema = z.enum([
  "identity",
  "contact",
  "personal",
  "bank",
  "family",
  "education",
  "training",
  "experience",
  "employment",
]);
export type EmployeeExportSection = z.infer<typeof employeeExportSectionSchema>;

const exportFilterSchema = listEmployeesQuerySchema
  .omit({ page: true, pageSize: true, active: true })
  .extend({ active: z.literal(true).default(true) })
  .strict();
const sectionsSchema = z.array(employeeExportSectionSchema).max(9).default([]);

// Dua objek strict membuat pilihan eksklusif juga terbaca di kontrak OpenAPI.
export const employeeExportBodySchema = z
  .union([
    z.object({ filter: exportFilterSchema, sections: sectionsSchema }).strict(),
    z
      .object({ employeeIds: z.array(z.uuid()).min(1).max(5000), sections: sectionsSchema })
      .strict(),
  ])
  .openapi({ description: "Pilih tepat salah satu: filter halaman atau daftar ID karyawan." });
export type EmployeeExportInput = z.infer<typeof employeeExportBodySchema>;

export const employeeExportFileSchema = z
  .object({
    fileName: z.string(),
    rows: z.number().int(),
    contentBase64: z.string(),
  })
  .openapi("EmployeeExportFile");
