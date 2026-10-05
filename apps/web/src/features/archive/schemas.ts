import {
  educationLevelSchema,
  employmentChangeTypeSchema,
  movementTypeSchema,
  trainingTypeSchema,
} from "@hris/shared";
import { z } from "zod";

// D-054 (Arsip 1a): bentuk respons tabel lintas karyawan (sama dengan archive.schema.ts API).
const ref = z.object({ id: z.string(), name: z.string() });
export const archiveEmployeeSchema = z.object({
  id: z.string(),
  fullName: z.string(),
  employeeNumber: z.string(),
  isActive: z.boolean(),
  company: z.object({ id: z.string(), code: z.string() }),
  department: ref.nullable(),
  position: ref,
  photoUrl: z.string().nullable(),
});

export const archiveRowSchema = z
  .object({ id: z.string(), employee: archiveEmployeeSchema })
  .extend({
    // Kontak
    workEmail: z.string().nullable().optional(),
    personalEmail: z.string().nullable().optional(),
    phoneNumber: z.string().nullable().optional(),
    emergencyContactName: z.string().nullable().optional(),
    emergencyContactRelationship: z.string().nullable().optional(),
    emergencyPhone: z.string().nullable().optional(),
    domicileAddress: z.string().nullable().optional(),
    // Pendidikan
    level: educationLevelSchema.nullable().optional(),
    schoolName: z.string().optional(),
    major: z.string().nullable().optional(),
    graduationYear: z.number().nullable().optional(),
    // Pelatihan
    trainingField: z.string().optional(),
    organizer: z.string().nullable().optional(),
    type: trainingTypeSchema.nullable().optional(),
    startDate: z.string().nullable().optional(),
    endDate: z.string().nullable().optional(),
    hours: z.number().nullable().optional(),
    trainingYear: z.number().nullable().optional(),
    duration: z.string().nullable().optional(),
    cost: z.number().nullable().optional(),
    // Riwayat kerja
    companyName: z.string().optional(),
    position: z.string().optional(),
    startYear: z.number().optional(),
    endYear: z.number().nullable().optional(),
    description: z.string().nullable().optional(),
    // Riwayat jabatan
    changeType: employmentChangeTypeSchema.optional(),
    source: z.enum(["SYSTEM", "MANUAL"]).optional(),
    effectiveDate: z.string().optional(),
    movementType: movementTypeSchema.nullable().optional(),
    fromPosition: ref.nullable().optional(),
    toPosition: ref.nullable().optional(),
    toPositionName: z.string().nullable().optional(),
    toDepartmentName: z.string().nullable().optional(),
    fromCompany: z.object({ id: z.string(), code: z.string() }).nullable().optional(),
    toCompany: z.object({ id: z.string(), code: z.string() }).nullable().optional(),
    decreeNumber: z.string().nullable().optional(),
    note: z.string().nullable().optional(),
  });
export type ArchiveRow = z.infer<typeof archiveRowSchema>;

export const archivePageSchema = z.object({
  data: z.array(archiveRowSchema),
  meta: z.object({ page: z.number(), pageSize: z.number(), total: z.number() }),
});
