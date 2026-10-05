import { z } from "zod";
import {
  bankSectionSchema,
  emergencySectionSchema,
  familySectionSchema,
  personalSectionSchema,
} from "./onboarding-form.ts";

// D-054 / OD-6 (Arsip gelombang 1c, design/arsip-karyawan.md §6.2, §7.1): karyawan mengubah data
// dirinya lewat PENGAJUAN; data baru berlaku setelah disetujui SA / HR ber-grant. Skema isian memakai
// skema bagian wizard onboarding (aturan format sama).

export const DATA_CHANGE_SECTIONS = [
  "PERSONAL",
  "EMERGENCY",
  "FAMILY",
  "BANK",
  "DOCUMENT",
] as const;
export const dataChangeSectionSchema = z.enum(DATA_CHANGE_SECTIONS);
export type DataChangeSection = z.infer<typeof dataChangeSectionSchema>;
export const DATA_CHANGE_SECTION_LABELS: Record<DataChangeSection, string> = {
  PERSONAL: "Data pribadi",
  EMERGENCY: "Kontak darurat",
  FAMILY: "Data keluarga",
  BANK: "Rekening bank",
  DOCUMENT: "Dokumen",
};

export const DATA_CHANGE_STATUSES = ["PENDING", "APPROVED", "REJECTED", "CANCELLED"] as const;
export const dataChangeStatusSchema = z.enum(DATA_CHANGE_STATUSES);
export type DataChangeStatus = z.infer<typeof dataChangeStatusSchema>;
export const DATA_CHANGE_STATUS_LABELS: Record<DataChangeStatus, string> = {
  PENDING: "Menunggu persetujuan",
  APPROVED: "Disetujui",
  REJECTED: "Ditolak",
  CANCELLED: "Dibatalkan",
};

/** Field data pribadi yang boleh diajukan (nama & jenis kelamin diubah HR lewat data kerja). */
export const PERSONAL_CHANGE_FIELDS = [
  "birthPlace",
  "birthDate",
  "ktpNumber",
  "kkNumber",
  "religion",
  "maritalStatus",
  "ktpAddress",
  "domicileAddress",
  "originCity",
  "phoneNumber",
  "npwpNumber",
  "npwpAbsent",
  "bpjsEmploymentNumber",
  "bpjsEmploymentAbsent",
  "bpjsHealthNumber",
  "bpjsHealthAbsent",
] as const;

const personalChangeSchema = personalSectionSchema.refine(
  (v) => v.fullName === undefined && v.gender === undefined,
  { message: "Nama & jenis kelamin diubah lewat HR.", path: ["fullName"] },
);

const bankChangeSchema = bankSectionSchema
  .extend({
    /** Buku tabungan / bukti rekening (sudah diunggah ke URL bertanda tangan). */
    bankBookPath: z.string().min(1, "Lampirkan buku tabungan.").max(255),
  })
  .refine((v) => Boolean(v.bankName), { message: "Nama bank wajib diisi.", path: ["bankName"] })
  .refine((v) => Boolean(v.accountNumber), {
    message: "Nomor rekening wajib diisi.",
    path: ["accountNumber"],
  });

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Maksimal ${max} karakter.`)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional()
    .transform((v) => v ?? null);
const optionalDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal YYYY-MM-DD.")
  .nullable()
  .optional()
  .transform((v) => v ?? null);

const documentChangeSchema = z.object({
  documentTypeId: z.uuid("Pilih jenis dokumen."),
  path: z.string().min(1, "Pilih file dokumen.").max(255),
  documentNumber: optionalText(60),
  issuedAt: optionalDate,
  expiresAt: optionalDate,
  note: optionalText(500),
});

export const dataChangeInputSchema = z.discriminatedUnion("section", [
  z.object({ section: z.literal("PERSONAL"), data: personalChangeSchema }),
  z.object({ section: z.literal("EMERGENCY"), data: emergencySectionSchema }),
  z.object({ section: z.literal("FAMILY"), data: familySectionSchema }),
  z.object({ section: z.literal("BANK"), data: bankChangeSchema }),
  z.object({ section: z.literal("DOCUMENT"), data: documentChangeSchema }),
]);
export type DataChangeInput = z.infer<typeof dataChangeInputSchema>;

export const dataChangeDecisionSchema = z
  .object({
    decision: z.enum(["APPROVE", "REJECT"]),
    note: optionalText(500),
  })
  .refine((v) => v.decision === "APPROVE" || Boolean(v.note), {
    message: "Tulis alasan penolakan.",
    path: ["note"],
  });
export type DataChangeDecision = z.infer<typeof dataChangeDecisionSchema>;

const norm = (value: unknown) => (value === "" || value === undefined ? null : value);

/** Field (dari `proposed`) yang nilainya berbeda dengan data sekarang; kosong ≈ null. */
export function changedFields(
  current: Record<string, unknown>,
  proposed: Record<string, unknown>,
): string[] {
  return Object.keys(proposed).filter(
    (key) => key in current && norm(current[key]) !== norm(proposed[key]),
  );
}

/** Rekening milik sendiri ditampilkan tersamar (design §8): hanya 4 digit terakhir. */
export function maskAccountNumber(value: string | null | undefined): string | null {
  if (!value) return null;
  return `${"•".repeat(Math.max(value.length - 4, 0))}${value.slice(-4)}`;
}
