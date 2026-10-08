import { z } from "zod";
import { DOCUMENT_MIME_TYPES } from "./onboarding-form.ts";

// D-055 (Arsip gelombang 1b, design/arsip-karyawan.md §4, §6.1, §7.2): jenis dokumen = master data SA;
// dokumen karyawan berversi + bermasa berlaku; pengingat kedaluwarsa harian. Aturan dipakai API & web.

export const DOCUMENT_CATEGORIES = [
  "IDENTITY",
  "EDUCATION",
  "COMPETENCY",
  "HEALTH",
  "EMPLOYMENT",
  "FINANCE",
  "OTHER",
] as const;
export const documentCategorySchema = z.enum(DOCUMENT_CATEGORIES);
export type DocumentCategory = z.infer<typeof documentCategorySchema>;
export const DOCUMENT_CATEGORY_LABELS: Record<DocumentCategory, string> = {
  IDENTITY: "Identitas",
  EDUCATION: "Pendidikan",
  COMPETENCY: "Kompetensi & sertifikat",
  HEALTH: "Kesehatan",
  EMPLOYMENT: "Kepegawaian",
  FINANCE: "Keuangan",
  OTHER: "Lainnya",
};

/** Siapa yang wajib punya dokumen ini (dipakai laporan kelengkapan). */
export const DOCUMENT_REQUIREMENTS = ["NONE", "ALL", "SITE", "POSITIONS"] as const;
export const documentRequirementSchema = z.enum(DOCUMENT_REQUIREMENTS);
export type DocumentRequirement = z.infer<typeof documentRequirementSchema>;
export const DOCUMENT_REQUIREMENT_LABELS: Record<DocumentRequirement, string> = {
  NONE: "Tidak wajib",
  ALL: "Semua karyawan",
  SITE: "Karyawan site/operasional",
  POSITIONS: "Jabatan tertentu",
};

export const DOCUMENT_STATUSES = ["PENDING_REVIEW", "VERIFIED", "REJECTED"] as const;
export const documentStatusSchema = z.enum(DOCUMENT_STATUSES);
export type DocumentStatus = z.infer<typeof documentStatusSchema>;
export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  PENDING_REVIEW: "Menunggu verifikasi",
  VERIFIED: "Terverifikasi",
  REJECTED: "Ditolak",
};

export const DOCUMENT_FILE_LABELS: Record<(typeof DOCUMENT_MIME_TYPES)[number], string> = {
  "application/pdf": "PDF",
  "image/jpeg": "JPG",
  "image/png": "PNG",
};
/** Batas bucket `employee-documents` (5 MB); jenis dokumen boleh lebih kecil. */
export const DOCUMENT_MAX_SIZE_MB = 5;
export const DEFAULT_REMINDER_DAYS = [60, 30, 7] as const;
/** "Akan kedaluwarsa" di tabel & lencana = sisa ≤ 60 hari (pengingat tetap per jenis). */
export const EXPIRY_WARN_DAYS = 60;
/** Pengingat "sudah kedaluwarsa" hanya untuk dokumen yang lewat ≤ 30 hari (tidak menumpuk). */
export const EXPIRED_NOTICE_WINDOW_DAYS = 30;

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Maksimal ${max} karakter.`)
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .optional()
    .transform((value) => value ?? null);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal YYYY-MM-DD.");
const optionalDate = isoDate
  .nullable()
  .optional()
  .transform((value) => value ?? null);

export const documentTypeInputSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z][A-Z0-9_]{1,29}$/, "Kode 2–30 karakter: huruf besar, angka, garis bawah."),
    name: z.string().trim().min(1, "Nama wajib diisi.").max(100, "Maksimal 100 karakter."),
    category: documentCategorySchema,
    hasExpiry: z.boolean(),
    defaultValidityMonths: z
      .number()
      .int("Bulan bilangan bulat.")
      .min(1, "Masa berlaku 1–120 bulan.")
      .max(120, "Masa berlaku 1–120 bulan.")
      .nullable()
      .optional()
      .transform((value) => value ?? null),
    reminderDays: z
      .array(z.number().int().min(1, "Pengingat 1–365 hari.").max(365, "Pengingat 1–365 hari."))
      .max(5, "Maksimal 5 pengingat.")
      .refine((days) => new Set(days).size === days.length, "Hari pengingat tidak boleh sama.")
      .default([...DEFAULT_REMINDER_DAYS]),
    requiredScope: documentRequirementSchema,
    requiredPositionIds: z.array(z.uuid()).max(200).default([]),
    /** true = boleh beberapa dokumen aktif sekaligus (sertifikat lain, SK, SP); false = satu, diganti versi baru. */
    multiple: z.boolean(),
    employeeCanUpload: z.boolean(),
    sensitive: z.boolean(),
    maxSizeMb: z
      .number()
      .int()
      .min(1, `Ukuran 1–${DOCUMENT_MAX_SIZE_MB} MB.`)
      .max(DOCUMENT_MAX_SIZE_MB, `Ukuran 1–${DOCUMENT_MAX_SIZE_MB} MB.`),
    allowedMimeTypes: z
      .array(z.enum(DOCUMENT_MIME_TYPES))
      .min(1, "Pilih minimal satu format file.")
      .transform((types) => [...new Set(types)]),
  })
  .refine((v) => v.requiredScope !== "POSITIONS" || v.requiredPositionIds.length > 0, {
    message: "Pilih minimal satu jabatan.",
    path: ["requiredPositionIds"],
  })
  .transform((v) => ({
    ...v,
    defaultValidityMonths: v.hasExpiry ? v.defaultValidityMonths : null,
    reminderDays: v.hasExpiry ? [...v.reminderDays].sort((a, b) => b - a) : [],
    requiredPositionIds: v.requiredScope === "POSITIONS" ? v.requiredPositionIds : [],
  }));
export type DocumentTypeInput = z.infer<typeof documentTypeInputSchema>;

/** Metadata dokumen karyawan (unggah & ubah). Wajib-tidaknya tanggal kedaluwarsa dicek terhadap jenisnya. */
export function employeeDocumentInputSchema(today: string) {
  return z
    .object({
      documentTypeId: z.uuid("Pilih jenis dokumen."),
      documentNumber: text(60),
      issuedAt: optionalDate.refine(
        (value) => value === null || value <= today,
        "Tanggal terbit tidak boleh di masa depan.",
      ),
      expiresAt: optionalDate,
      note: text(500),
    })
    .refine((v) => !v.issuedAt || !v.expiresAt || v.expiresAt >= v.issuedAt, {
      message: "Tanggal kedaluwarsa tidak boleh sebelum tanggal terbit.",
      path: ["expiresAt"],
    });
}
export type EmployeeDocumentInput = z.infer<ReturnType<typeof employeeDocumentInputSchema>>;

// ── Masa berlaku (tanggal ISO YYYY-MM-DD, zona Asia/Jakarta ditentukan pemanggil) ──────────────

const DAY_MS = 86_400_000;
const utc = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));

/** Tambah bulan; tanggal 31 → akhir bulan tujuan bila bulan itu lebih pendek. */
export function addMonths(iso: string, months: number): string {
  const year = +iso.slice(0, 4);
  const month = +iso.slice(5, 7) - 1 + months;
  const day = +iso.slice(8, 10);
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(day, last))).toISOString().slice(0, 10);
}

export function daysUntil(expiresAt: string, today: string): number {
  return Math.round((utc(expiresAt) - utc(today)) / DAY_MS);
}

export const EXPIRY_STATES = ["NONE", "VALID", "EXPIRING", "EXPIRED"] as const;
export const expiryStateSchema = z.enum(EXPIRY_STATES);
export type ExpiryState = z.infer<typeof expiryStateSchema>;
export const EXPIRY_STATE_LABELS: Record<ExpiryState, string> = {
  NONE: "Tanpa masa berlaku",
  VALID: "Berlaku",
  EXPIRING: "Akan kedaluwarsa",
  EXPIRED: "Kedaluwarsa",
};

/** "Akan kedaluwarsa" = sisa ≤ `warnDays` (ambang pengingat terbesar jenisnya, bawaan 60). */
export function expiryState(
  expiresAt: string | null,
  today: string,
  warnDays: number,
): ExpiryState {
  if (!expiresAt) return "NONE";
  if (expiresAt < today) return "EXPIRED";
  return daysUntil(expiresAt, today) <= warnDays ? "EXPIRING" : "VALID";
}

/**
 * Ambang pengingat yang berlaku hari ini (dedupe per dokumen + ambang): ambang terkecil yang sudah
 * dilewati; 0 = sudah kedaluwarsa (≤ 30 hari). null = belum/tidak perlu pengingat. Cron yang
 * terlewat beberapa hari hanya mengirim ambang terkini, bukan semua ambang sekaligus.
 */
export function reminderThreshold(
  expiresAt: string,
  today: string,
  reminderDays: readonly number[],
): number | null {
  const left = daysUntil(expiresAt, today);
  if (left < 0) return left >= -EXPIRED_NOTICE_WINDOW_DAYS ? 0 : null;
  const due = reminderDays.filter((d) => left <= d).sort((a, b) => a - b);
  return due[0] ?? null;
}
