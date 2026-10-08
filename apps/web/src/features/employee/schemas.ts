import {
  educationLevelSchema,
  employmentCategorySchema,
  employmentChangeTypeSchema,
  exitReasonSchema,
  genderSchema,
  movementTypeSchema,
  orgUnitTypeSchema,
  paginationMetaSchema,
  positionLevelSchema,
  ptkpStatusSchema,
  roleSchema,
  trainingTypeSchema,
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
  /** D-039: perusahaan dalam grup. */
  company: ref.extend({ code: z.string() }),
  position: ref,
  department: ref.nullable(),
  workLocation: ref.nullable(),
  grade: ref.nullable(),
  manager: ref.nullable(),
  // D-051/D-053: pos jabatan & atasan manual (data lama tanpa field ini tetap terbaca).
  orgPostId: z.string().nullable().optional(),
  managerOverride: z.boolean().optional(),
  /** D-037: URL baca bertanda tangan (berlaku ±10 menit); null = belum ada foto. */
  photoUrl: z.string().nullable(),
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

// Dashboard SA/HR (GET /dashboard): agregat karyawan — jumlah saja, tanpa data per orang.
const countRow = z.object({ id: z.string().nullable(), name: z.string(), count: z.number() });
export const DASHBOARD_EDUCATION_LEVELS = ["SD", "SMP", "SMA", "Kuliah", "Tanpa Data"] as const;
export const dashboardSchema = z.object({
  overview: z.object({
    total: z.number(),
    active: z.number(),
    inactive: z.number(),
    avgTenureYears: z.number().nullable(),
  }),
  byCategory: z.array(countRow.extend({ category: employmentCategorySchema.nullable() })),
  byLocation: z.array(countRow.extend({ city: z.string().nullable() })),
  byDepartment: z.array(countRow),
  byPosition: z.array(countRow),
  byJoinYear: z.array(z.object({ year: z.number(), count: z.number() })),
  byEducationPivot: z.array(
    z.object({
      category: z.string(),
      label: z.string(),
      levels: z.array(z.object({ level: z.enum(DASHBOARD_EDUCATION_LEVELS), count: z.number() })),
      total: z.number(),
    }),
  ),
});
export type EmployeeDashboard = z.infer<typeof dashboardSchema>;

export const employeeDetailSchema = employeeListItemSchema.extend({
  emergencyPhone: z.string().nullable(),
  emergencyContactName: z.string().nullable(),
  emergencyContactRelationship: z.string().nullable(),
  account: z.object({ role: roleSchema, isActive: z.boolean() }).nullable(),
  access: z.object({
    manage: z.boolean(),
    deactivate: z.boolean(),
    personal: z.boolean(),
    bank: z.boolean(),
    print: z.boolean(),
    photo: z.boolean(),
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
      // D-041 (sensitif).
      bpjsEmploymentNumber: z.string().nullable(),
      bpjsHealthNumber: z.string().nullable(),
      ptkpStatus: ptkpStatusSchema.nullable(),
      originCity: z.string().nullable(),
      // D-059 (Formulir Data Karyawan → Import); opsional agar respons lama tetap terbaca.
      personalEmail: z.string().nullable().optional(),
      nickname: z.string().nullable().optional(),
      nationality: z.string().nullable().optional(),
      ethnicity: z.string().nullable().optional(),
      bloodType: z.string().nullable().optional(),
      drivingLicenseTypes: z.array(z.string()).optional(),
      drivingLicenseNumber: z.string().nullable().optional(),
      drivingLicenseNumbers: z.record(z.string(), z.string()).nullable().optional(),
      emergencyContactAddress: z.string().nullable().optional(),
      // D-061
      domicileVillage: z.string().nullable().optional(),
      domicileDistrict: z.string().nullable().optional(),
      domicileCity: z.string().nullable().optional(),
      domicileProvince: z.string().nullable().optional(),
      ktpVillage: z.string().nullable().optional(),
      ktpDistrict: z.string().nullable().optional(),
      ktpCity: z.string().nullable().optional(),
      ktpProvince: z.string().nullable().optional(),
      emergencyContact2Name: z.string().nullable().optional(),
      emergencyContact2Relationship: z.string().nullable().optional(),
      emergencyContact2Phone: z.string().nullable().optional(),
      emergencyContact2Address: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
  familyMembers: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        relationship: z.string(),
        address: z.string().nullable(),
        birthDate: z.string().nullable(),
        phoneNumber: z.string().nullable(),
        // D-059
        gender: z.string().nullable().optional(),
        birthPlace: z.string().nullable().optional(),
        education: z.string().nullable().optional(),
        occupation: z.string().nullable().optional(),
        ageAtEntry: z.number().nullable().optional(),
        workAddress: z.string().nullable().optional(),
        // D-061: keterangan hubungan (saudara: Kakak/Adik).
        relationDetail: z.string().nullable().optional(),
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
      level: educationLevelSchema.nullable(),
      entryYear: z.number().nullable().optional(),
    }),
  ),
  trainings: z.array(
    z.object({
      id: z.string(),
      trainingField: z.string(),
      organizer: z.string().nullable(),
      duration: z.string().nullable(),
      trainingYear: z.number().nullable(),
      // D-054 (Arsip 1a); opsional agar respons lama tetap terbaca.
      type: trainingTypeSchema.nullable().optional(),
      startDate: z.string().nullable().optional(),
      endDate: z.string().nullable().optional(),
      hours: z.number().nullable().optional(),
      /** Hanya ada untuk SA/HR. */
      cost: z.number().nullable().optional(),
      certificateNumber: z.string().nullable().optional(),
    }),
  ),
  workExperiences: z
    .array(
      z.object({
        id: z.string(),
        companyName: z.string(),
        position: z.string(),
        startYear: z.number(),
        endYear: z.number().nullable(),
        description: z.string().nullable(),
      }),
    )
    .optional(),
  histories: z.array(
    z.object({
      id: z.string(),
      changeType: employmentChangeTypeSchema,
      effectiveDate: z.string(),
      fromStatus: ref.nullable(),
      toStatus: ref.nullable(),
      fromPosition: ref.nullable(),
      toPosition: ref.nullable(),
      fromCompany: ref.nullable(),
      toCompany: ref.nullable(),
      exitReason: exitReasonSchema.nullable(),
      note: z.string().nullable(),
      // D-054 (Arsip 1a)
      source: z.enum(["SYSTEM", "MANUAL"]).optional(),
      movementType: movementTypeSchema.nullable().optional(),
      decreeNumber: z.string().nullable().optional(),
      toPositionName: z.string().nullable().optional(),
      toDepartmentName: z.string().nullable().optional(),
      changedBy: z
        .object({ name: z.string(), role: roleSchema, workLocation: z.string().nullable() })
        .nullable(),
      createdAt: z.string(),
    }),
  ),
});
export type EmployeeDetail = z.infer<typeof employeeDetailSchema>;

export const masterDataSchema = z.object({
  /** D-040: hanya perusahaan dalam cakupan pengguna. */
  companies: z.array(ref.extend({ code: z.string() })),
  // D-050: departments = semua unit organisasi (dengan jenis); jabatan ber-level opsional.
  departments: z.array(
    ref.extend({ parentId: z.string().nullable(), unitType: orgUnitTypeSchema }),
  ),
  positions: z.array(
    ref.extend({ departmentId: z.string(), level: positionLevelSchema.nullable() }),
  ),
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
      unitType: orgUnitTypeSchema,
      positions: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          level: positionLevelSchema.nullable(),
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
    .min(1, "NIP wajib diisi.")
    .max(30, "Maksimal 30 karakter.")
    .regex(/^[A-Za-z0-9./-]+$/, "Hanya huruf, angka, titik, garis miring, dan tanda hubung."),
  fullName: z.string().trim().min(2, "Nama minimal 2 karakter.").max(150),
  workEmail: z
    .string()
    .trim()
    .refine((v) => v === "" || z.email().safeParse(v).success, "Email tidak valid."),
  phoneNumber: optionalPhone,
  emergencyPhone: optionalPhone,
  emergencyContactName: z.string().trim().max(150),
  emergencyContactRelationship: z.string().trim().max(50),
  gender: z.enum(["", "MALE", "FEMALE"]),
  joinDate: z.iso.date("Tanggal masuk wajib diisi."),
  companyId: z.string().min(1, "Pilih perusahaan."),
  employmentStatusId: z.string().min(1, "Pilih status kepegawaian."),
  departmentId: z.string().min(1, "Pilih unit organisasi."),
  positionId: z.string().min(1, "Pilih jabatan."),
  workLocationId: z.string(),
  gradeId: z.string(),
  managerId: z.string(),
  // D-051/D-053: pos jabatan (opsional) & atasan diatur manual.
  orgPostId: z.string(),
  managerManual: z.boolean(),
});
export type EmployeeForm = z.infer<typeof employeeFormSchema>;

// ── D-051: bagan organisasi (kanvas) ────────────────────────────────────────
const chartCompany = z.object({ id: z.string(), code: z.string(), name: z.string() });

export const orgChartSchema = z.object({
  company: chartCompany,
  companies: z.array(chartCompany),
  units: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      unitType: orgUnitTypeSchema,
      parentId: z.string().nullable(),
      corporate: z.boolean(),
    }),
  ),
  posts: z.array(
    z.object({
      id: z.string(),
      positionName: z.string(),
      level: positionLevelSchema.nullable(),
      departmentId: z.string(),
      corporate: z.boolean(),
      reportsToId: z.string().nullable(),
      functionalReportsToId: z.string().nullable(),
      headcount: z.number(),
      sortOrder: z.number(),
      holders: z.array(
        z.object({ id: z.string(), fullName: z.string(), photoUrl: z.string().nullable() }),
      ),
    }),
  ),
  unplacedCount: z.number(),
  canOpenDetail: z.boolean(),
  canManage: z.boolean(),
});
export type OrgChart = z.infer<typeof orgChartSchema>;
export type OrgChartPost = OrgChart["posts"][number];

export const orgPersonCardSchema = z.object({
  id: z.string(),
  fullName: z.string(),
  photoUrl: z.string().nullable(),
  position: z.string(),
  department: z.string().nullable(),
  company: z.object({ code: z.string(), name: z.string() }),
  workLocation: z.string().nullable(),
  workEmail: z.string().nullable(),
});
export type OrgPersonCard = z.infer<typeof orgPersonCardSchema>;
