import { z } from "zod";
import { addMonths, daysUntil } from "./documents.ts";

// ARS-D1–D6 (Arsip gelombang 2a, docs/features/arsip/README.md#keputusan): aset per unit (serah-terima &
// pengembalian, satu pemegang aktif) dan pembagian APD/seragam berbasis jumlah (tanpa stok gudang).
// Aturan murni dipakai API & web.

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal YYYY-MM-DD.");
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Maksimal ${max} karakter.`)
    .nullish()
    .transform((v) => (v ? v : null));
const optionalDate = isoDate.nullish().transform((v) => v ?? null);
const codePart = (label: string) =>
  z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{2,6}$/, `${label}: 2–6 huruf/angka tanpa spasi.`);

export const ASSET_CONDITIONS = ["GOOD", "FAIR", "DAMAGED"] as const;
export const assetConditionSchema = z.enum(ASSET_CONDITIONS);
export type AssetCondition = z.infer<typeof assetConditionSchema>;
export const ASSET_CONDITION_LABELS: Record<AssetCondition, string> = {
  GOOD: "Baik",
  FAIR: "Cukup",
  DAMAGED: "Rusak",
};

export const ASSET_STATUSES = ["AVAILABLE", "ASSIGNED", "MAINTENANCE", "LOST", "RETIRED"] as const;
export const assetStatusSchema = z.enum(ASSET_STATUSES);
export type AssetStatus = z.infer<typeof assetStatusSchema>;
export const ASSET_STATUS_LABELS: Record<AssetStatus, string> = {
  AVAILABLE: "Tersedia",
  ASSIGNED: "Dipegang karyawan",
  MAINTENANCE: "Perbaikan",
  LOST: "Hilang",
  RETIRED: "Tidak dipakai",
};
/** Status yang boleh diatur langsung pengelola; ASSIGNED/LOST hanya lewat serah-terima/tandai hilang. */
export const MANUAL_ASSET_STATUSES = ["AVAILABLE", "MAINTENANCE", "RETIRED"] as const;

export const ASSIGNMENT_OUTCOMES = ["RETURNED", "LOST"] as const;
export const assignmentOutcomeSchema = z.enum(ASSIGNMENT_OUTCOMES);
export type AssignmentOutcome = z.infer<typeof assignmentOutcomeSchema>;
export const ASSIGNMENT_OUTCOME_LABELS: Record<AssignmentOutcome, string> = {
  RETURNED: "Dikembalikan",
  LOST: "Hilang",
};

/** ARS-D2: jenis BAST yang dilampirkan ke transaksi. */
export const BAST_KINDS = ["HANDOVER", "RETURN"] as const;
export const bastKindSchema = z.enum(BAST_KINDS);
export type BastKind = z.infer<typeof bastKindSchema>;

/** ARS-D4: usulan kode `<KODE-PT>-<KODE-KATEGORI>-<NNNN>`. */
export function suggestAssetCode(companyCode: string, categoryCode: string, sequence: number) {
  return `${companyCode.toUpperCase()}-${categoryCode.toUpperCase()}-${String(sequence).padStart(4, "0")}`;
}

/** Nomor urut berikutnya untuk pasangan PT + kategori; kode manual yang tidak berpola diabaikan. */
export function nextAssetSequence(
  codes: readonly string[],
  companyCode: string,
  categoryCode: string,
) {
  const prefix = `${companyCode.toUpperCase()}-${categoryCode.toUpperCase()}-`;
  let max = 0;
  for (const code of codes) {
    if (!code.startsWith(prefix)) continue;
    const rest = code.slice(prefix.length);
    if (/^\d+$/.test(rest)) max = Math.max(max, Number(rest));
  }
  return max + 1;
}

/** ARS-D5: pinjaman dengan "kembali paling lambat" — ≤ 3 hari lagi = segera, lewat = terlambat. */
export const LOAN_DUE_SOON_DAYS = 3;
export const LOAN_STATES = ["NONE", "OPEN", "DUE_SOON", "OVERDUE"] as const;
export type LoanState = (typeof LOAN_STATES)[number];
export const LOAN_STATE_LABELS: Record<LoanState, string> = {
  NONE: "Tanpa batas",
  OPEN: "Dipinjam",
  DUE_SOON: "Segera kembali",
  OVERDUE: "Terlambat kembali",
};
export function loanState(dueBackAt: string | null, today: string): LoanState {
  if (!dueBackAt) return "NONE";
  const days = daysUntil(dueBackAt, today);
  if (days < 0) return "OVERDUE";
  return days <= LOAN_DUE_SOON_DAYS ? "DUE_SOON" : "OPEN";
}

/** ARS-D5: tanggal ganti APD = tanggal terima + masa ganti jenisnya; null = tanpa masa ganti. */
export function ppeReplacementDate(issuedAt: string, replaceAfterMonths: number | null) {
  return replaceAfterMonths ? addMonths(issuedAt, replaceAfterMonths) : null;
}

// --- Input ---

export const assetCategoryInputSchema = z.object({
  code: codePart("Kode kategori"),
  name: z.string().trim().min(2, "Nama kategori minimal 2 huruf.").max(100),
  requiresSerial: z.boolean().default(false),
});
export type AssetCategoryInput = z.infer<typeof assetCategoryInputSchema>;

export const ppeTypeInputSchema = z.object({
  code: codePart("Kode jenis APD"),
  name: z.string().trim().min(2, "Nama jenis minimal 2 huruf.").max(100),
  replaceAfterMonths: z
    .number()
    .int()
    .min(1, "Masa ganti 1–120 bulan.")
    .max(120, "Masa ganti 1–120 bulan.")
    .nullish()
    .transform((v) => v ?? null),
  mustReturn: z.boolean().default(false),
});
export type PpeTypeInput = z.infer<typeof ppeTypeInputSchema>;

/** PROMPT §4: nominal uang tidak pernah `number` JS → string desimal, maks 2 angka di belakang koma. */
const money = z
  .string()
  .trim()
  .regex(/^\d{1,13}(\.\d{1,2})?$/, "Harga: angka positif, maksimal 2 desimal.")
  .nullish()
  .transform((v) => v ?? null);

export const assetInputSchema = z.object({
  /** Kosong = dibuat otomatis (ARS-D4). */
  code: z
    .string()
    .trim()
    .toUpperCase()
    .transform((v) => (v === "" ? null : v))
    .pipe(
      z
        .string()
        .regex(
          /^[A-Z0-9][A-Z0-9./-]{1,29}$/,
          "Kode aset: huruf/angka/tanda - . / tanpa spasi, maks 30.",
        )
        .nullable(),
    )
    .nullish()
    .transform((v) => v ?? null),
  categoryId: z.uuid("Pilih kategori."),
  name: z.string().trim().min(2, "Nama aset minimal 2 huruf.").max(150),
  brand: optionalText(80),
  model: optionalText(80),
  serialNumber: optionalText(80),
  companyId: z.uuid("Pilih perusahaan."),
  workLocationId: z
    .uuid()
    .nullish()
    .transform((v) => v ?? null),
  condition: assetConditionSchema.default("GOOD"),
  purchaseDate: optionalDate,
  purchasePrice: money,
  note: optionalText(500),
});
export type AssetInput = z.infer<typeof assetInputSchema>;

export const assetStatusInputSchema = z.object({
  status: z.enum(MANUAL_ASSET_STATUSES),
  note: optionalText(500),
});
export type AssetStatusInput = z.infer<typeof assetStatusInputSchema>;

export const assignAssetInputSchema = z
  .object({
    employeeId: z.uuid("Pilih karyawan."),
    assignedAt: isoDate,
    dueBackAt: optionalDate,
    conditionOut: assetConditionSchema,
    note: optionalText(500),
  })
  .refine((v) => !v.dueBackAt || v.dueBackAt >= v.assignedAt, {
    message: "Tanggal kembali tidak boleh sebelum tanggal serah.",
    path: ["dueBackAt"],
  });
export type AssignAssetInput = z.infer<typeof assignAssetInputSchema>;

export const returnAssetInputSchema = z.object({
  returnedAt: isoDate,
  conditionIn: assetConditionSchema,
  note: optionalText(500),
});
export type ReturnAssetInput = z.infer<typeof returnAssetInputSchema>;

export const markAssetLostInputSchema = z.object({
  lostAt: isoDate,
  note: z.string().trim().min(5, "Tulis keterangan minimal 5 karakter.").max(500),
});
export type MarkAssetLostInput = z.infer<typeof markAssetLostInputSchema>;

export const attachBastInputSchema = z.object({
  kind: bastKindSchema,
  documentId: z.uuid("Pilih dokumen BAST."),
});
export type AttachBastInput = z.infer<typeof attachBastInputSchema>;

export const ppeIssueInputSchema = z.object({
  employeeId: z.uuid("Pilih karyawan."),
  ppeTypeId: z.uuid("Pilih jenis APD."),
  quantity: z.number().int().min(1, "Jumlah 1–100.").max(100, "Jumlah 1–100."),
  size: optionalText(20),
  issuedAt: isoDate,
  note: optionalText(500),
});
export type PpeIssueInput = z.infer<typeof ppeIssueInputSchema>;

export const ppeReturnInputSchema = z.object({
  returnedAt: isoDate,
  note: optionalText(500),
});
export type PpeReturnInput = z.infer<typeof ppeReturnInputSchema>;

export const ppeAttachBastInputSchema = z.object({ documentId: z.uuid("Pilih dokumen BAST.") });
export type PpeAttachBastInput = z.infer<typeof ppeAttachBastInputSchema>;
