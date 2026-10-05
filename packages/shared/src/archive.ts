import { z } from "zod";
import { educationLevelSchema } from "./employee.ts";

// D-054 (Arsip gelombang 1a): menu Arsip = tabel lintas karyawan per kategori + tab yang sama di detail
// karyawan. Skema input dipakai API (validasi body) & form web dengan aturan sama.

export const ARCHIVE_CATEGORIES = [
  "contacts",
  "educations",
  "position-histories",
  "trainings",
  "work-experiences",
] as const;
export const archiveCategorySchema = z.enum(ARCHIVE_CATEGORIES);
export type ArchiveCategory = z.infer<typeof archiveCategorySchema>;

/** Menu Arsip yang sudah aktif (slug web ↔ kategori API), urut seperti menu. "documents" = D-055 (1b). */
export const ARCHIVE_SECTIONS: readonly {
  slug: string;
  category: ArchiveCategory | "documents" | "families" | "bank-accounts";
  label: string;
}[] = [
  { slug: "kontak", category: "contacts", label: "Data Kontak" },
  { slug: "keluarga", category: "families", label: "Data Keluarga" },
  { slug: "pendidikan", category: "educations", label: "Data Pendidikan" },
  { slug: "riwayat-jabatan", category: "position-histories", label: "Riwayat Jabatan" },
  { slug: "pelatihan", category: "trainings", label: "Data Pelatihan" },
  { slug: "riwayat-kerja", category: "work-experiences", label: "Data Riwayat Kerja" },
  { slug: "file", category: "documents", label: "Data File" },
  { slug: "bank", category: "bank-accounts", label: "Data Bank" },
];

export const TRAINING_TYPES = ["INTERNAL", "EXTERNAL"] as const;
export const trainingTypeSchema = z.enum(TRAINING_TYPES);
export type TrainingType = z.infer<typeof trainingTypeSchema>;
export const TRAINING_TYPE_LABELS: Record<TrainingType, string> = {
  INTERNAL: "Internal",
  EXTERNAL: "Eksternal",
};

export const MOVEMENT_TYPES = ["PROMOTION", "MUTATION", "DEMOTION", "ROTATION", "OTHER"] as const;
export const movementTypeSchema = z.enum(MOVEMENT_TYPES);
export type MovementType = z.infer<typeof movementTypeSchema>;
export const MOVEMENT_TYPE_LABELS: Record<MovementType, string> = {
  PROMOTION: "Promosi",
  MUTATION: "Mutasi",
  DEMOTION: "Demosi",
  ROTATION: "Rotasi",
  OTHER: "Lainnya",
};

export const HISTORY_SOURCES = ["SYSTEM", "MANUAL"] as const;
export type HistorySource = (typeof HISTORY_SOURCES)[number];

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Maksimal ${max} karakter.`)
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .optional()
    .transform((value) => value ?? null);
const required = (label: string, max: number) =>
  z.string().trim().min(1, `${label} wajib diisi.`).max(max, `Maksimal ${max} karakter.`);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal YYYY-MM-DD.");
const optionalDate = isoDate
  .nullable()
  .optional()
  .transform((value) => value ?? null);
const year = (max = 2100) =>
  z
    .number("Tahun harus berupa angka.")
    .int("Tahun bilangan bulat.")
    .min(1950, "Tahun minimal 1950.")
    .max(max, `Tahun maksimal ${max}.`);
const optionalYear = year()
  .nullable()
  .optional()
  .transform((value) => value ?? null);

export const educationInputSchema = z.object({
  level: educationLevelSchema,
  schoolName: required("Nama sekolah/kampus", 150),
  major: text(100),
  graduationYear: optionalYear,
});
export type EducationInput = z.infer<typeof educationInputSchema>;

export const trainingInputSchema = z
  .object({
    trainingField: required("Nama pelatihan", 150),
    organizer: text(150),
    type: trainingTypeSchema
      .nullable()
      .optional()
      .transform((value) => value ?? null),
    startDate: optionalDate,
    endDate: optionalDate,
    hours: z
      .number()
      .int("Jam bilangan bulat.")
      .min(1, "Jam 1–2000.")
      .max(2000, "Jam 1–2000.")
      .nullable()
      .optional()
      .transform((value) => value ?? null),
    // Rupiah (bukan gaji). Disimpan Decimal(15,2) di DB; maks 2 desimal.
    cost: z
      .number()
      .min(0, "Biaya tidak boleh negatif.")
      .max(999_999_999_999, "Biaya terlalu besar.")
      .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6, "Maks 2 desimal.")
      .nullable()
      .optional()
      .transform((value) => value ?? null),
    trainingYear: optionalYear,
    /** Teks durasi lama (data import/onboarding); diganti tanggal & jam. */
    duration: text(50),
  })
  .refine((v) => !v.startDate || !v.endDate || v.endDate >= v.startDate, {
    message: "Tanggal selesai tidak boleh sebelum tanggal mulai.",
    path: ["endDate"],
  })
  .transform((v) => ({
    ...v,
    trainingYear: v.startDate ? Number(v.startDate.slice(0, 4)) : v.trainingYear,
  }));
export type TrainingInput = z.infer<typeof trainingInputSchema>;

export const workExperienceInputSchema = z
  .object({
    companyName: required("Nama perusahaan", 150),
    position: required("Jabatan", 100),
    startYear: year(),
    endYear: optionalYear,
    description: text(500),
  })
  .refine((v) => v.endYear === null || v.endYear >= v.startYear, {
    message: "Tahun selesai tidak boleh sebelum tahun mulai.",
    path: ["endYear"],
  });
export type WorkExperienceInput = z.infer<typeof workExperienceInputSchema>;

/**
 * Riwayat jabatan LAMA (sebelum HRIS, source MANUAL): jabatan dari master ATAU teks bebas (jabatan
 * lama yang sudah tidak ada di master). Tanggal efektif tidak boleh di masa depan (`today` zona
 * Asia/Jakarta, YYYY-MM-DD dari pemanggil).
 */
export function positionHistoryInputSchema(today: string) {
  return z
    .object({
      effectiveDate: isoDate.refine(
        (v) => v <= today,
        "Tanggal efektif tidak boleh di masa depan.",
      ),
      movementType: movementTypeSchema,
      toPositionId: z
        .uuid()
        .nullable()
        .optional()
        .transform((value) => value ?? null),
      toPositionName: text(100),
      toDepartmentName: text(100),
      decreeNumber: text(60),
      note: text(500),
    })
    .refine((v) => v.toPositionId !== null || v.toPositionName !== null, {
      message: "Pilih jabatan dari master atau tulis nama jabatan lama.",
      path: ["toPositionName"],
    });
}
export type PositionHistoryInput = z.infer<ReturnType<typeof positionHistoryInputSchema>>;

/** Riwayat otomatis (SYSTEM) tidak bisa diubah isinya; hanya keterangan tambahan. */
export const positionHistoryMetaSchema = z
  .object({
    movementType: movementTypeSchema.nullable().optional(),
    decreeNumber: z
      .string()
      .trim()
      .max(60)
      .transform((value) => (value === "" ? null : value))
      .nullable()
      .optional(),
    note: z
      .string()
      .trim()
      .max(500)
      .transform((value) => (value === "" ? null : value))
      .nullable()
      .optional(),
  })
  .strict();
export type PositionHistoryMeta = z.infer<typeof positionHistoryMetaSchema>;
