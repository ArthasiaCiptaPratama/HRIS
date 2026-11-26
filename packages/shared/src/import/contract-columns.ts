// KTR-D12 (K3 poin 2): kolom kontrak di import karyawan → periode kontrak (PKWT / masa percobaan).
// Fungsi murni: dipakai normalisasi baris (web + api) dan rencana kontrak per baris di server, supaya
// pesan pratinjau sama dengan aturan aksi kontrak (`validateContractStage` + cek di service kontrak).

import { addContractDays, type ContractKind } from "../contract.ts";
import type { EmploymentCategory } from "../employee.ts";
import { dailyWageInputSchema } from "../thl.ts";
import type { ImportFieldKey } from "./fields.ts";
import { cleanText, type Normalized } from "./normalize.ts";

/** Angka Indonesia; never return a raw cell in an issue. */
export function parseDailyWage(value: unknown): Normalized<number> {
  if (value === undefined || value === null || value === "" || value === "-") return undefined;
  let amount: number;
  if (typeof value === "number") amount = value;
  else {
    const text = String(value)
      .trim()
      .replace(/^Rp\s*/i, "");
    if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(text))
      return { issue: "INVALID_DAILY_WAGE" };
    amount = Number(text.replaceAll(".", "").replace(",", "."));
  }
  return dailyWageInputSchema.shape.amount.safeParse(amount).success
    ? { value: amount }
    : { issue: "INVALID_DAILY_WAGE" };
}

const ROMAN: Record<string, number> = { i: 1, ii: 2, iii: 3 };

/** "Tahap PKWT": 1/2/3, I/II/III, "PKWT 2", "PKWT II", "ke-2". */
export function parseContractStage(value: unknown): Normalized<number> {
  if (typeof value === "number")
    return Number.isInteger(value) && value >= 1 && value <= 3
      ? { value }
      : { issue: "UNKNOWN_CONTRACT_STAGE" };
  const text = cleanText(value)?.toLowerCase();
  if (!text || text === "-") return undefined;
  const token = text
    .replace(/^(pkwt|tahap|kontrak)\s*/, "")
    .replace(/^ke\s*-?\s*/, "")
    .trim();
  const n = ROMAN[token] ?? (/^\d$/.test(token) ? Number(token) : Number.NaN);
  return n >= 1 && n <= 3 ? { value: n } : { issue: "UNKNOWN_CONTRACT_STAGE" };
}

/** "Durasi kontrak (bulan)": 6, "6 bulan", "1 tahun" → bulan (1–60). */
export function parseContractDuration(value: unknown): Normalized<number> {
  if (typeof value === "number")
    return Number.isInteger(value) && value >= 1 && value <= 60
      ? { value }
      : { issue: "INVALID_CONTRACT_DURATION" };
  const text = cleanText(value)?.toLowerCase();
  if (!text || text === "-") return undefined;
  const match = text.match(/^(\d{1,2})\s*(bulan|bln|month|months|tahun|thn|year|years)?$/);
  if (!match) return { issue: "INVALID_CONTRACT_DURATION" };
  const months = Number(match[1]) * (/^(tahun|thn|year)/.test(match[2] ?? "") ? 12 : 1);
  return months >= 1 && months <= 60 ? { value: months } : { issue: "INVALID_CONTRACT_DURATION" };
}

// Kalender, tanggal yang tidak ada dijepit ke akhir bulan (sama dengan aturan tahap kontrak).
function addMonths(value: string, months: number): string {
  const result = new Date(`${value}T00:00:00.000Z`);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const last = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(day, last));
  return result.toISOString().slice(0, 10);
}

/** Akhir kontrak dari durasi: mulai + N bulan − 1 hari. */
export function contractEndFromDuration(startDate: string, months: number): string {
  return addContractDays(addMonths(startDate, months), -1);
}

/** Field import kolom kontrak (urutan = urutan tampil/template). */
export const CONTRACT_IMPORT_FIELD_KEYS = [
  "contractStage",
  "contractStartDate",
  "contractEndDate",
  "contractDurationMonths",
  "pkwtFirstStartDate",
  "probationStartDate",
  "probationEndDate",
] as const satisfies readonly ImportFieldKey[];

export interface ImportContractColumns {
  dailyWage?: number;
  stage?: number;
  startDate?: string;
  endDate?: string;
  durationMonths?: number;
  firstPkwtStartDate?: string;
  probationStartDate?: string;
  probationEndDate?: string;
}

export interface ImportContractPeriod {
  kind: ContractKind;
  /** Tahap dari kolom Tahap PKWT / teks status ("PKWT II"); null = tidak disebut di file. */
  sequence: number | null;
  startDate?: string;
  endDate?: string;
  firstPkwtStartDate?: string;
  /** Field asal tanggal mulai/akhir (untuk letak pesan & daftar perubahan). */
  startField: ImportFieldKey;
  endField: ImportFieldKey;
  /** Semua kolom kontrak yang terisi & dipakai. */
  sources: ImportFieldKey[];
}

/** Kolom kontrak yang terisi di baris (tanpa melihat kategori). */
export function filledContractFields(columns: ImportContractColumns): ImportFieldKey[] {
  const filled: ImportFieldKey[] = [];
  if (columns.stage !== undefined) filled.push("contractStage");
  if (columns.startDate) filled.push("contractStartDate");
  if (columns.endDate) filled.push("contractEndDate");
  if (columns.durationMonths !== undefined) filled.push("contractDurationMonths");
  if (columns.firstPkwtStartDate) filled.push("pkwtFirstStartDate");
  if (columns.probationStartDate) filled.push("probationStartDate");
  if (columns.probationEndDate) filled.push("probationEndDate");
  return filled;
}

/**
 * Periode kontrak dari kolom baris untuk kategori tujuan. `null` = tidak ada kolom kontrak;
 * `{ ignored }` = kolom kontrak terisi tetapi kategori bukan PKWT/masa percobaan.
 * PKWT: Mulai/Akhir kontrak (+ durasi); percobaan: Mulai/Akhir percobaan, cadangan Mulai/Akhir kontrak.
 */
export function importContractPeriod(
  columns: ImportContractColumns,
  category: EmploymentCategory | null | undefined,
  fromStatus: { sequence?: number; durationMonths?: number } = {},
): ImportContractPeriod | { ignored: ImportFieldKey[] } | null {
  const filled = filledContractFields(columns);
  if (filled.length === 0) return null;
  if (category !== "PKWT" && category !== "PROBATION") return { ignored: filled };
  const durationMonths = columns.durationMonths ?? fromStatus.durationMonths;
  if (category === "PKWT") {
    const startDate = columns.startDate;
    const endDate =
      columns.endDate ??
      (startDate && durationMonths
        ? contractEndFromDuration(startDate, durationMonths)
        : undefined);
    return {
      kind: "PKWT",
      sequence: columns.stage ?? fromStatus.sequence ?? null,
      ...(startDate ? { startDate } : {}),
      ...(endDate ? { endDate } : {}),
      ...(columns.firstPkwtStartDate ? { firstPkwtStartDate: columns.firstPkwtStartDate } : {}),
      startField: "contractStartDate",
      endField: columns.endDate
        ? "contractEndDate"
        : columns.durationMonths !== undefined
          ? "contractDurationMonths"
          : "contractEndDate",
      sources: filled.filter((f) => f !== "probationStartDate" && f !== "probationEndDate"),
    };
  }
  const startDate = columns.probationStartDate ?? columns.startDate;
  const explicitEnd = columns.probationEndDate ?? columns.endDate;
  const endDate =
    explicitEnd ??
    (startDate && durationMonths ? contractEndFromDuration(startDate, durationMonths) : undefined);
  return {
    kind: "PROBATION",
    sequence: null,
    ...(startDate ? { startDate } : {}),
    ...(endDate ? { endDate } : {}),
    startField: columns.probationStartDate ? "probationStartDate" : "contractStartDate",
    endField: columns.probationEndDate
      ? "probationEndDate"
      : columns.endDate
        ? "contractEndDate"
        : columns.durationMonths !== undefined
          ? "contractDurationMonths"
          : "probationEndDate",
    sources: filled.filter((f) => f !== "contractStage" && f !== "pkwtFirstStartDate"),
  };
}

/**
 * Pesan aturan tahap kontrak (`validateContractStage` & service kontrak) → kode masalah import.
 * Tumpang tindih & sebelum tanggal masuk diletakkan di kolom mulai, selain itu di kolom akhir.
 */
const CONTRACT_RULE_CODES: [RegExp, string][] = [
  [/tidak valid/, "CONTRACT_INVALID_DATE"],
  [/akhir kontrak tidak boleh sebelum/, "CONTRACT_END_BEFORE_START"],
  [/Tahap PKWT harus 1–3/, "CONTRACT_STAGE_INVALID"],
  [/PKWT 1 maksimal 2 tahun/, "CONTRACT_PKWT1_TOO_LONG"],
  [/PKWT 2\/3 maksimal 1 tahun/, "CONTRACT_PKWT_EXTENSION_TOO_LONG"],
  [/mulai PKWT 1 tidak boleh setelah/, "CONTRACT_FIRST_PKWT_AFTER_START"],
  [/Total masa PKWT maksimal 4 tahun/, "CONTRACT_PKWT_TOTAL_TOO_LONG"],
  [/Tahap PKWT harus berurutan/, "CONTRACT_STAGE_ORDER"],
  [/Masa percobaan tidak memiliki nomor tahap/, "CONTRACT_STAGE_INVALID"],
  [/Masa percobaan maksimal 3 bulan/, "CONTRACT_PROBATION_TOO_LONG"],
  [/tumpang tindih/, "CONTRACT_OVERLAP"],
  [/Ada jeda antar-tahap/, "CONTRACT_GAP"],
  [/sebelum tanggal masuk/, "CONTRACT_BEFORE_JOIN"],
  [/mulai PKWT 1 wajib/, "CONTRACT_FIRST_PKWT_REQUIRED"],
  [/mulai PKWT 1 harus sama/, "CONTRACT_FIRST_PKWT_MISMATCH"],
];
export function contractRuleIssueCode(message: string): string {
  return CONTRACT_RULE_CODES.find(([pattern]) => pattern.test(message))?.[1] ?? "CONTRACT_RULE";
}
