import { z } from "zod";
import { addMonths } from "./documents.ts";

// ARS-D7–D13 (Arsip gelombang 2b, D-057; docs/features/arsip/README.md#keputusan): surat peringatan
// SP1–SP3 dari template sistem, masa berlaku bawaan 6 bulan, konfirmasi atasan + karyawan, cabut
// dengan alasan. Aturan murni dipakai API & web.

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal YYYY-MM-DD.");
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Maksimal ${max} karakter.`)
    .nullish()
    .transform((v) => (v ? v : null));

export const WARNING_LEVELS = ["SP1", "SP2", "SP3"] as const;
export const warningLevelSchema = z.enum(WARNING_LEVELS);
export type WarningLevel = z.infer<typeof warningLevelSchema>;
export const WARNING_LEVEL_LABELS: Record<WarningLevel, string> = {
  SP1: "SP 1",
  SP2: "SP 2",
  SP3: "SP 3",
};

/** Status tersimpan. EXPIRED ditandai cron harian; tampilan memakai {@link warningLetterState}. */
export const WARNING_LETTER_STATUSES = ["DRAFT", "ISSUED", "EXPIRED", "REVOKED"] as const;
export type WarningLetterStatus = (typeof WARNING_LETTER_STATUSES)[number];

/** Status tampilan (ARS-D9): Berlaku = terbit & belum dikonfirmasi keduanya. */
export const WARNING_LETTER_STATES = [
  "DRAFT",
  "ACTIVE",
  "CONFIRMED",
  "EXPIRED",
  "REVOKED",
] as const;
export const warningLetterStateSchema = z.enum(WARNING_LETTER_STATES);
export type WarningLetterState = z.infer<typeof warningLetterStateSchema>;
export const WARNING_LETTER_STATE_LABELS: Record<WarningLetterState, string> = {
  DRAFT: "Draft",
  ACTIVE: "Berlaku",
  CONFIRMED: "Berlaku · dikonfirmasi",
  EXPIRED: "Kedaluwarsa",
  REVOKED: "Dicabut",
};

/** ARS-D8: masa berlaku bawaan (PP 35/2021); diubah SA di pengaturan. */
export const DEFAULT_WARNING_VALIDITY_MONTHS = 6;

/**
 * ARS-D8: berlaku s/d = hari terakhir masa N bulan sejak terbit (inklusif), mis. terbit 15 Okt + 6 bulan
 * → s/d 14 Apr (PP 35/2021: paling lama 6 bulan; audit 2026-10-15 — sebelumnya 6 bulan + 1 hari).
 */
export function warningEffectiveUntil(issuedAt: string, months: number): string {
  const end = new Date(`${addMonths(issuedAt, months)}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() - 1);
  return end.toISOString().slice(0, 10);
}

export function warningLetterState(
  letter: {
    status: WarningLetterStatus;
    effectiveUntil: string | null;
    deliveredAt: string | null;
    acknowledgedAt: string | null;
  },
  today: string,
): WarningLetterState {
  if (letter.status === "DRAFT" || letter.status === "REVOKED") return letter.status;
  // Cron menandai EXPIRED sekali sehari; sebelum cron jalan tampilan sudah kedaluwarsa.
  if (letter.status === "EXPIRED" || (letter.effectiveUntil && letter.effectiveUntil < today))
    return "EXPIRED";
  return letter.deliveredAt && letter.acknowledgedAt ? "CONFIRMED" : "ACTIVE";
}

const LEVEL_RANK: Record<WarningLevel, number> = { SP1: 1, SP2: 2, SP3: 3 };

/** ARS-D10: saran tingkat berikut dari SP yang masih berlaku (tanpa SP aktif → SP1; maks SP3). */
export function suggestWarningLevel(activeLevels: readonly WarningLevel[]): WarningLevel {
  const top = Math.max(0, ...activeLevels.map((l) => LEVEL_RANK[l]));
  return WARNING_LEVELS[Math.min(top, 2)] as WarningLevel;
}

/** ARS-D10: tingkat lebih tinggi dari saran wajib beralasan. */
export function isAboveSuggestion(level: WarningLevel, suggested: WarningLevel): boolean {
  return LEVEL_RANK[level] > LEVEL_RANK[suggested];
}

const ROMAN_MONTHS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];

/** ARS-D11: `007/SP1/HRD-ACP/X/2026` — urut per PT per tahun, bulan romawi tanggal terbit. */
export function formatWarningNumber(
  sequence: number,
  level: WarningLevel,
  companyCode: string,
  issuedAt: string,
): string {
  const month = ROMAN_MONTHS[+issuedAt.slice(5, 7) - 1];
  return `${String(sequence).padStart(3, "0")}/${level}/HRD-${companyCode.toUpperCase()}/${month}/${issuedAt.slice(0, 4)}`;
}

// --- Input ---

export const violationTypeInputSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{2,10}$/, "Kode jenis: 2–10 huruf/angka tanpa spasi."),
  name: z.string().trim().min(2, "Nama jenis minimal 2 huruf.").max(100),
  /** ARS-D12: jenis mangkir boleh ditautkan ke hari ALPHA + surat pernyataan. */
  linksAttendance: z.boolean().default(false),
});
export type ViolationTypeInput = z.infer<typeof violationTypeInputSchema>;

export const warningLetterDraftInputSchema = z.object({
  employeeId: z.uuid("Pilih karyawan."),
  level: warningLevelSchema,
  violationTypeId: z.uuid("Pilih jenis pelanggaran."),
  /** ARS-D19: tanggal kejadian wajib (tercetak di surat). */
  incidentDate: z
    .string("Isi tanggal kejadian.")
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Isi tanggal kejadian."),
  description: z
    .string()
    .trim()
    .min(10, "Uraian/kronologi minimal 10 karakter.")
    .max(4000, "Maksimal 4000 karakter."),
  /** ARS-D10: wajib bila tingkat di atas saran sistem (dicek saat terbit). */
  escalationReason: optionalText(500),
  /** ARS-D12: hari ALPHA karyawan yang ditautkan sebagai bukti (hanya jenis mangkir). */
  alphaDayIds: z.array(z.uuid()).max(31, "Maksimal 31 hari ALPHA.").default([]),
});
export type WarningLetterDraftInput = z.infer<typeof warningLetterDraftInputSchema>;

/** ARS-D20: buat draft SP untuk banyak karyawan sekaligus (satu transaksi; semua atau tidak sama sekali). */
export const WARNING_LETTER_BULK_MAX = 50;
export const warningLetterBulkDraftInputSchema = warningLetterDraftInputSchema
  .omit({ employeeId: true, level: true, alphaDayIds: true })
  .extend({
    employeeIds: z
      .array(z.uuid("Pilih karyawan."))
      .min(1, "Pilih minimal satu karyawan.")
      .max(WARNING_LETTER_BULK_MAX, `Maksimal ${WARNING_LETTER_BULK_MAX} karyawan sekaligus.`),
    /** AUTO = tingkat mengikuti saran sistem per karyawan (ARS-D10). */
    level: z.union([warningLevelSchema, z.literal("AUTO")]),
  });
export type WarningLetterBulkDraftInput = z.infer<typeof warningLetterBulkDraftInputSchema>;

export const issueWarningLetterInputSchema = z.object({
  issuedAt: isoDate,
  /** ARS-D11: kosong = nomor otomatis; diisi = nomor manual (unik se-sistem). */
  number: z
    .string()
    .trim()
    .max(60, "Nomor surat maksimal 60 karakter.")
    .nullish()
    .transform((v) => (v ? v : null)),
});
export type IssueWarningLetterInput = z.infer<typeof issueWarningLetterInputSchema>;

export const revokeWarningLetterInputSchema = z.object({
  reason: z.string().trim().min(5, "Tulis alasan minimal 5 karakter.").max(500),
});
export type RevokeWarningLetterInput = z.infer<typeof revokeWarningLetterInputSchema>;

export const attachWarningScanInputSchema = z.object({
  documentId: z.uuid("Pilih dokumen surat peringatan."),
});
export type AttachWarningScanInput = z.infer<typeof attachWarningScanInputSchema>;

export const disciplineSettingsInputSchema = z.object({
  validityMonths: z
    .number()
    .int()
    .min(1, "Masa berlaku 1–24 bulan.")
    .max(24, "Masa berlaku 1–24 bulan."),
});
export type DisciplineSettingsInput = z.infer<typeof disciplineSettingsInputSchema>;
