import { z } from "@hono/zod-openapi";
import {
  EMPLOYEE_SORT_FIELDS,
  employmentCategoryGroupSchema,
  employmentCategorySchema,
  employmentChangeTypeSchema,
  exitReasonSchema,
  genderSchema,
  PAGE_SIZE_DEFAULT,
  PAGE_SIZE_MAX,
  roleSchema,
} from "@hris/shared";

// Tanggal murni (PROMPT §4): "YYYY-MM-DD".
const isoDate = z.iso.date();
const ref = z.object({ id: z.uuid(), name: z.string() });
const booleanQuery = z.enum(["true", "false"]).transform((value) => value === "true");
const optionalText = (max: number) => z.string().trim().max(max).optional();

export const idParamSchema = z.object({ id: z.uuid() });

// "work" = data kerja saja (tanpa query/audit data sensitif); "full" = termasuk bagian yang boleh;
// "print" = bahan formulir .xlsx (SA/HR): data pribadi & keluarga bila boleh, rekening tidak dibaca.
export const detailViewSchema = z.enum(["full", "work", "print"]);
export type DetailView = z.infer<typeof detailViewSchema>;
export const detailQuerySchema = z.object({ view: detailViewSchema.default("full") });

// ── Daftar ──────────────────────────────────────────────────────────────────

const SORTS = EMPLOYEE_SORT_FIELDS.flatMap((field) => [`${field}:asc`, `${field}:desc`] as const);

export const listEmployeesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(PAGE_SIZE_MAX).default(PAGE_SIZE_DEFAULT),
  q: z.string().trim().min(1).max(100).optional(),
  active: booleanQuery.default(true),
  category: employmentCategorySchema.optional(),
  // D-038: grup kategori (Internal / Magang / Eksternal); digabung AND dengan `category` bila keduanya ada.
  group: employmentCategoryGroupSchema.optional(),
  statusId: z.uuid().optional(),
  departmentId: z.uuid().optional(),
  positionId: z.uuid().optional(),
  workLocationId: z.uuid().optional(),
  sort: z.enum(SORTS as [string, ...string[]]).default("fullName:asc"),
});
export type ListEmployeesQuery = z.infer<typeof listEmployeesQuerySchema>;

export const employeeListItemSchema = z
  .object({
    id: z.uuid(),
    employeeNumber: z.string(),
    fullName: z.string(),
    workEmail: z.string().nullable(),
    phoneNumber: z.string().nullable(),
    gender: genderSchema.nullable(),
    joinDate: isoDate,
    endDate: isoDate.nullable(),
    isActive: z.boolean(),
    exitReason: exitReasonSchema.nullable(),
    employmentStatus: ref.extend({ category: employmentCategorySchema.nullable() }),
    position: ref,
    department: ref.nullable(),
    workLocation: ref.nullable(),
    grade: ref.nullable(),
    manager: ref.nullable(),
    // D-037: URL baca bertanda tangan (berlaku singkat) untuk foto profil; null = belum ada foto.
    photoUrl: z.string().nullable(),
  })
  .openapi("EmployeeListItem");
export type EmployeeListItem = z.infer<typeof employeeListItemSchema>;

export const employeeSummarySchema = z
  .object({
    active: z.object({
      total: z.number().int(),
      byCategory: z.record(employmentCategorySchema, z.number().int()),
      uncategorized: z.number().int(),
    }),
    inactive: z.number().int(),
  })
  .openapi("EmployeeSummary");
export type EmployeeSummary = z.infer<typeof employeeSummarySchema>;

// ── Detail ──────────────────────────────────────────────────────────────────
// PROMPT §5: field sensitif DIHILANGKAN dari respons (key tidak ada) bila aktor tidak berhak.

const personalSchema = z.object({
  ktpNumber: z.string().nullable(),
  npwpNumber: z.string().nullable(),
  kkNumber: z.string().nullable(),
  birthPlace: z.string().nullable(),
  birthDate: isoDate.nullable(),
  ktpAddress: z.string().nullable(),
  domicileAddress: z.string().nullable(),
  maritalStatus: z.enum(["SINGLE", "MARRIED", "DIVORCED", "WIDOWED"]).nullable(),
  religion: z
    .enum(["ISLAM", "PROTESTANT", "CATHOLIC", "HINDU", "BUDDHIST", "CONFUCIAN", "OTHER"])
    .nullable(),
});

const familyMemberSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  relationship: z.enum(["SPOUSE", "CHILD", "FATHER", "MOTHER", "SIBLING", "OTHER"]),
  address: z.string().nullable(),
  birthDate: isoDate.nullable(),
  phoneNumber: z.string().nullable(),
});

const bankAccountSchema = z.object({
  bankName: z.string(),
  accountNumber: z.string(),
  accountHolder: z.string().nullable(),
});

const historySchema = z.object({
  id: z.uuid(),
  changeType: employmentChangeTypeSchema,
  effectiveDate: isoDate,
  fromStatus: ref.nullable(),
  toStatus: ref.nullable(),
  fromPosition: ref.nullable(),
  toPosition: ref.nullable(),
  exitReason: exitReasonSchema.nullable(),
  note: z.string().nullable(),
  // Pelaku perubahan (null = data awal/seed atau akun sudah tidak ada). name = nama pegawai
  // milik akun itu, atau email akun bila akun tidak terhubung ke data pegawai (mis. Super Admin).
  changedBy: z
    .object({
      name: z.string(),
      role: roleSchema,
      workLocation: z.string().nullable(),
    })
    .nullable(),
  createdAt: z.iso.datetime(),
});

export const employeeDetailSchema = employeeListItemSchema
  .extend({
    emergencyPhone: z.string().nullable(),
    account: z.object({ role: roleSchema, isActive: z.boolean() }).nullable(),
    access: z.object({
      manage: z.boolean(),
      deactivate: z.boolean(),
      personal: z.boolean(),
      bank: z.boolean(),
      print: z.boolean(),
      photo: z.boolean(),
    }),
    personal: personalSchema.nullable().optional(),
    familyMembers: z.array(familyMemberSchema).optional(),
    bankAccount: bankAccountSchema.nullable().optional(),
    educations: z.array(
      z.object({
        id: z.uuid(),
        schoolName: z.string(),
        major: z.string().nullable(),
        graduationYear: z.number().int().nullable(),
      }),
    ),
    trainings: z.array(
      z.object({
        id: z.uuid(),
        trainingField: z.string(),
        organizer: z.string().nullable(),
        duration: z.string().nullable(),
        trainingYear: z.number().int().nullable(),
      }),
    ),
    histories: z.array(historySchema),
  })
  .openapi("EmployeeDetail");
export type EmployeeDetail = z.infer<typeof employeeDetailSchema>;

// ── Foto profil (D-037) ─────────────────────────────────────────────────────

export const photoUploadUrlBodySchema = z
  .object({ contentType: z.enum(["image/jpeg", "image/png", "image/webp"]) })
  .openapi("EmployeePhotoUploadUrlInput");
export type PhotoUploadUrlInput = z.infer<typeof photoUploadUrlBodySchema>;

export const photoUploadUrlSchema = z
  .object({
    bucket: z.string(),
    path: z.string(),
    token: z.string(),
    signedUrl: z.string(),
    maxBytes: z.number().int(),
  })
  .openapi("EmployeePhotoUploadUrl");
export type PhotoUploadUrl = z.infer<typeof photoUploadUrlSchema>;

// Path dibuat server (employees/<id>/<uuid>.<ext>); klien hanya mengembalikannya setelah unggah.
export const photoConfirmBodySchema = z
  .object({
    path: z
      .string()
      .regex(/^(?:[a-z0-9][a-z0-9-]*\/)*employees\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp)$/),
  })
  .openapi("EmployeePhotoConfirmInput");
export type PhotoConfirmInput = z.infer<typeof photoConfirmBodySchema>;

export const photoResultSchema = z
  .object({ photoUrl: z.string().nullable() })
  .openapi("EmployeePhoto");
export type PhotoResult = z.infer<typeof photoResultSchema>;

// ── Tulis ───────────────────────────────────────────────────────────────────

const phone = z
  .string()
  .trim()
  .regex(/^\+?[0-9 ()-]{6,30}$/, "Nomor telepon tidak valid.");
const nullableUuid = z.uuid().nullable().optional();

export const createEmployeeBodySchema = z
  .object({
    employeeNumber: z
      .string()
      .trim()
      .min(1)
      .max(30)
      .regex(/^[A-Za-z0-9./-]+$/, "Hanya huruf, angka, titik, garis miring, dan tanda hubung."),
    fullName: z.string().trim().min(2).max(150),
    workEmail: z.email().max(254).nullable().optional(),
    phoneNumber: phone.nullable().optional(),
    emergencyPhone: phone.nullable().optional(),
    gender: genderSchema.nullable().optional(),
    joinDate: isoDate,
    employmentStatusId: z.uuid(),
    positionId: z.uuid(),
    workLocationId: nullableUuid,
    gradeId: nullableUuid,
    managerId: nullableUuid,
  })
  .openapi("CreateEmployee");
export type CreateEmployeeInput = z.infer<typeof createEmployeeBodySchema>;

// Status kepegawaian diubah lewat /status-change supaya selalu tercatat di riwayat.
export const updateEmployeeBodySchema = createEmployeeBodySchema
  .omit({ employmentStatusId: true })
  .partial()
  .refine((body) => Object.keys(body).length > 0, "Tidak ada perubahan yang dikirim.")
  .openapi("UpdateEmployee");
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeBodySchema>;

export const changeStatusBodySchema = z
  .object({ employmentStatusId: z.uuid(), effectiveDate: isoDate, note: optionalText(500) })
  .openapi("ChangeEmploymentStatus");
export type ChangeStatusInput = z.infer<typeof changeStatusBodySchema>;

export const deactivateBodySchema = z
  .object({ effectiveDate: isoDate, exitReason: exitReasonSchema, note: optionalText(500) })
  .openapi("DeactivateEmployee");
export type DeactivateInput = z.infer<typeof deactivateBodySchema>;

export const reactivateBodySchema = z
  .object({
    effectiveDate: isoDate,
    employmentStatusId: z.uuid().optional(),
    note: optionalText(500),
  })
  .openapi("ReactivateEmployee");
export type ReactivateInput = z.infer<typeof reactivateBodySchema>;

// ── Struktur organisasi & pilihan atasan ────────────────────────────────────

export const orgStructureSchema = z
  .object({
    departments: z.array(
      z.object({
        id: z.uuid(),
        name: z.string(),
        parentId: z.uuid().nullable(),
        positions: z.array(
          z.object({
            id: z.uuid(),
            name: z.string(),
            employees: z.array(
              z.object({
                id: z.uuid(),
                fullName: z.string(),
                employeeNumber: z.string(),
                managerId: z.uuid().nullable(),
              }),
            ),
          }),
        ),
      }),
    ),
    totalEmployees: z.number().int(),
  })
  .openapi("OrgStructure");
export type OrgStructure = z.infer<typeof orgStructureSchema>;

export const managerOptionSchema = z
  .object({ id: z.uuid(), fullName: z.string(), employeeNumber: z.string(), position: z.string() })
  .openapi("ManagerOption");
export type ManagerOption = z.infer<typeof managerOptionSchema>;
