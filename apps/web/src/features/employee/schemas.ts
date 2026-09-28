import {
  employmentCategorySchema,
  employmentChangeTypeSchema,
  exitReasonSchema,
  genderSchema,
  paginationMetaSchema,
  roleSchema,
} from "@hris/shared";
import { z } from "zod";

// Subset respons API modul employee & organization
// (sumber kebenaran: apps/api/src/modules/{employee,organization}/*.schema.ts).

const ref = z.object({ id: z.string(), name: z.string() });

export const employeeListItemSchema = z.object({
  id: z.string(),
  employeeNumber: z.string(),
  fullName: z.string(),
  workEmail: z.string().nullable(),
  phoneNumber: z.string().nullable(),
  gender: genderSchema.nullable(),
  joinDate: z.string(),
  endDate: z.string().nullable(),
  isActive: z.boolean(),
  exitReason: exitReasonSchema.nullable(),
  employmentStatus: ref.extend({ category: employmentCategorySchema.nullable() }),
  position: ref,
  department: ref.nullable(),
  workLocation: ref.nullable(),
  grade: ref.nullable(),
  manager: ref.nullable(),
});
export type EmployeeListItem = z.infer<typeof employeeListItemSchema>;

export const employeePageSchema = z.object({
  data: z.array(employeeListItemSchema),
  meta: paginationMetaSchema,
});
export type EmployeePage = z.infer<typeof employeePageSchema>;

export const one = <T extends z.ZodType>(item: T) => z.object({ data: item });

export const summarySchema = z.object({
  active: z.object({
    total: z.number(),
    byCategory: z.record(employmentCategorySchema, z.number()),
    uncategorized: z.number(),
  }),
  inactive: z.number(),
});
export type EmployeeSummary = z.infer<typeof summarySchema>;

export const employeeDetailSchema = employeeListItemSchema.extend({
  emergencyPhone: z.string().nullable(),
  account: z.object({ role: roleSchema, isActive: z.boolean() }).nullable(),
  access: z.object({
    manage: z.boolean(),
    deactivate: z.boolean(),
    personal: z.boolean(),
    bank: z.boolean(),
  }),
  personal: z
    .object({
      ktpNumber: z.string().nullable(),
      npwpNumber: z.string().nullable(),
      kkNumber: z.string().nullable(),
      birthPlace: z.string().nullable(),
      birthDate: z.string().nullable(),
      ktpAddress: z.string().nullable(),
      domicileAddress: z.string().nullable(),
      maritalStatus: z.string().nullable(),
      religion: z.string().nullable(),
    })
    .nullable()
    .optional(),
  familyMembers: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        relationship: z.string(),
        birthDate: z.string().nullable(),
        phoneNumber: z.string().nullable(),
      }),
    )
    .optional(),
  bankAccount: z
    .object({
      bankName: z.string(),
      accountNumber: z.string(),
      accountHolder: z.string().nullable(),
    })
    .nullable()
    .optional(),
  educations: z.array(
    z.object({
      id: z.string(),
      schoolName: z.string(),
      major: z.string().nullable(),
      graduationYear: z.number().nullable(),
    }),
  ),
  trainings: z.array(
    z.object({
      id: z.string(),
      trainingField: z.string(),
      organizer: z.string().nullable(),
      duration: z.string().nullable(),
      trainingYear: z.number().nullable(),
    }),
  ),
  histories: z.array(
    z.object({
      id: z.string(),
      changeType: employmentChangeTypeSchema,
      effectiveDate: z.string(),
      fromStatus: ref.nullable(),
      toStatus: ref.nullable(),
      fromPosition: ref.nullable(),
      toPosition: ref.nullable(),
      exitReason: exitReasonSchema.nullable(),
      note: z.string().nullable(),
      createdAt: z.string(),
    }),
  ),
});
export type EmployeeDetail = z.infer<typeof employeeDetailSchema>;

export const masterDataSchema = z.object({
  departments: z.array(ref.extend({ parentId: z.string().nullable() })),
  positions: z.array(ref.extend({ departmentId: z.string() })),
  employmentStatuses: z.array(ref.extend({ category: employmentCategorySchema.nullable() })),
  grades: z.array(ref),
  workLocations: z.array(ref.extend({ city: z.string().nullable() })),
});
export type MasterData = z.infer<typeof masterDataSchema>;

export const orgStructureSchema = z.object({
  departments: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      parentId: z.string().nullable(),
      positions: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          employees: z.array(
            z.object({
              id: z.string(),
              fullName: z.string(),
              employeeNumber: z.string(),
              managerId: z.string().nullable(),
            }),
          ),
        }),
      ),
    }),
  ),
  totalEmployees: z.number(),
});
export type OrgStructure = z.infer<typeof orgStructureSchema>;

export const managerOptionSchema = z.object({
  id: z.string(),
  fullName: z.string(),
  employeeNumber: z.string(),
  position: z.string(),
});
export type ManagerOption = z.infer<typeof managerOptionSchema>;

// ── Form ────────────────────────────────────────────────────────────────────
// Pesan bahasa Indonesia; aturan sama dengan createEmployeeBodySchema di API.

const optionalPhone = z
  .string()
  .trim()
  .refine((v) => v === "" || /^\+?[0-9 ()-]{6,30}$/.test(v), "Nomor telepon tidak valid.");

export const employeeFormSchema = z.object({
  employeeNumber: z
    .string()
    .trim()
    .min(1, "Nomor induk wajib diisi.")
    .max(30, "Maksimal 30 karakter.")
    .regex(/^[A-Za-z0-9./-]+$/, "Hanya huruf, angka, titik, garis miring, dan tanda hubung."),
  fullName: z.string().trim().min(2, "Nama minimal 2 karakter.").max(150),
  workEmail: z
    .string()
    .trim()
    .refine((v) => v === "" || z.email().safeParse(v).success, "Email tidak valid."),
  phoneNumber: optionalPhone,
  emergencyPhone: optionalPhone,
  gender: z.enum(["", "MALE", "FEMALE"]),
  joinDate: z.iso.date("Tanggal masuk wajib diisi."),
  employmentStatusId: z.string().min(1, "Pilih status kepegawaian."),
  departmentId: z.string().min(1, "Pilih departemen."),
  positionId: z.string().min(1, "Pilih jabatan."),
  workLocationId: z.string(),
  gradeId: z.string(),
  managerId: z.string(),
});
export type EmployeeForm = z.infer<typeof employeeFormSchema>;
