import { z } from "@hono/zod-openapi";
import {
  ARCHIVE_LIST_CATEGORIES,
  documentCategorySchema,
  educationLevelSchema,
  employmentChangeTypeSchema,
  expiryStateSchema,
  familyRelationshipSchema,
  movementTypeSchema,
  trainingTypeSchema,
} from "@hris/shared";

// D-054 (Arsip gelombang 1a): DTO tabel lintas karyawan per kategori & respons kelola item.
// Kolom sensitif (alamat domisili) hanya ada bila aktor berhak; biaya pelatihan hanya SA/HR.

const isoDate = z.iso.date();
const ref = z.object({ id: z.uuid(), name: z.string() });

export const archiveListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(100).optional(),
  companyId: z.uuid().optional(),
  departmentId: z.uuid().optional(),
  /** "active" (bawaan), "inactive", atau "all" — status karyawan, bukan item. */
  employees: z.enum(["active", "inactive", "all"]).default("active"),
  // Filter khusus kategori (diabaikan kategori lain).
  level: educationLevelSchema.optional(),
  type: trainingTypeSchema.optional(),
  movementType: movementTypeSchema.optional(),
  source: z.enum(["SYSTEM", "MANUAL"]).optional(),
});
export type ArchiveListQuery = z.infer<typeof archiveListQuerySchema>;

// D-058 (1d): ekspor = filter tabel yang sama (tanpa halaman) + filter khusus Keluarga & Data File.
export const archiveExportQuerySchema = archiveListQuerySchema
  .omit({ page: true, pageSize: true })
  .extend({
    relationship: familyRelationshipSchema.optional(),
    documentTypeId: z.uuid().optional(),
    category: documentCategorySchema.optional(),
    expiry: expiryStateSchema.optional(),
  });
export type ArchiveExportQuery = z.infer<typeof archiveExportQuerySchema>;
export const archiveExportParamSchema = z.object({ category: z.enum(ARCHIVE_LIST_CATEGORIES) });
export const archiveExportSchema = z
  .object({
    fileName: z.string(),
    rows: z.number().int(),
    /** Isi .xlsx (base64) — dibuat saat diminta, tidak disimpan di server. */
    contentBase64: z.string(),
  })
  .openapi("ArchiveExport");

export const archiveEmployeeRefSchema = z.object({
  id: z.uuid(),
  fullName: z.string(),
  employeeNumber: z.string().nullable(),
  isActive: z.boolean(),
  company: z.object({ id: z.uuid(), code: z.string() }),
  department: ref.nullable(),
  position: ref,
  photoUrl: z.string().nullable(),
});

const row = <T extends z.ZodRawShape>(shape: T) =>
  z.object({ id: z.uuid(), employee: archiveEmployeeRefSchema, ...shape });

export const contactRowSchema = row({
  workEmail: z.string().nullable(),
  personalEmail: z.string().nullable(),
  phoneNumber: z.string().nullable(),
  emergencyContactName: z.string().nullable(),
  emergencyContactRelationship: z.string().nullable(),
  emergencyPhone: z.string().nullable(),
  /** Hanya ada bila berhak membaca data pribadi (PLAN §4.2). */
  domicileAddress: z.string().nullable().optional(),
}).openapi("ArchiveContactRow");

export const educationRowSchema = row({
  level: educationLevelSchema.nullable(),
  schoolName: z.string(),
  major: z.string().nullable(),
  entryYear: z.number().int().nullable(),
  graduationYear: z.number().int().nullable(),
}).openapi("ArchiveEducationRow");

export const trainingRowSchema = row({
  trainingField: z.string(),
  organizer: z.string().nullable(),
  type: trainingTypeSchema.nullable(),
  startDate: isoDate.nullable(),
  endDate: isoDate.nullable(),
  hours: z.number().int().nullable(),
  trainingYear: z.number().int().nullable(),
  duration: z.string().nullable(),
  /** Rupiah; hanya ada untuk SA/HR. */
  cost: z.number().nullable().optional(),
}).openapi("ArchiveTrainingRow");

export const workExperienceRowSchema = row({
  companyName: z.string(),
  position: z.string(),
  startYear: z.number().int(),
  endYear: z.number().int().nullable(),
  description: z.string().nullable(),
}).openapi("ArchiveWorkExperienceRow");

export const positionHistoryRowSchema = row({
  changeType: employmentChangeTypeSchema,
  source: z.enum(["SYSTEM", "MANUAL"]),
  effectiveDate: isoDate,
  movementType: movementTypeSchema.nullable(),
  fromPosition: ref.nullable(),
  toPosition: ref.nullable(),
  /** Jabatan/unit lama berupa teks (riwayat sebelum HRIS). */
  toPositionName: z.string().nullable(),
  toDepartmentName: z.string().nullable(),
  fromCompany: z.object({ id: z.uuid(), code: z.string() }).nullable(),
  toCompany: z.object({ id: z.uuid(), code: z.string() }).nullable(),
  decreeNumber: z.string().nullable(),
  note: z.string().nullable(),
}).openapi("ArchivePositionHistoryRow");

export const employeeIdParamSchema = z.object({ id: z.uuid() });
export const itemParamSchema = z.object({ id: z.uuid(), itemId: z.uuid() });
export const archiveMutationSchema = z.object({ id: z.uuid() }).openapi("ArchiveMutationResult");
