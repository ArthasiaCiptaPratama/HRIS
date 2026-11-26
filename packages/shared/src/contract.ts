import { z } from "zod";
import { EMPLOYMENT_CATEGORY_LABELS, type EmploymentCategory } from "./employee.ts";

export const CONTRACT_KINDS = ["PKWT", "PROBATION"] as const;
export const CONTRACT_STATUSES = ["ACTIVE", "EXTENDED", "CONVERTED", "PASSED", "ENDED"] as const;
export type ContractKind = (typeof CONTRACT_KINDS)[number];
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];
export const CONTRACT_KIND_LABELS: Record<ContractKind, string> = {
  PKWT: "PKWT",
  PROBATION: "Masa Percobaan",
};
export const CONTRACT_STATUS_LABELS: Record<ContractStatus, string> = {
  ACTIVE: "Aktif",
  EXTENDED: "Diperpanjang",
  CONVERTED: "Dijadikan Karyawan Tetap",
  PASSED: "Lulus masa percobaan",
  ENDED: "Diakhiri",
};
export function employmentTier(
  category: EmploymentCategory | null,
): "PKWT" | "PKWTT" | "THL" | null {
  if (category === "PERMANENT" || category === "PROBATION") return "PKWTT";
  if (category === "PKWT") return "PKWT";
  return category === "DAILY_WORKER" ? "THL" : null;
}
export function contractStageLabel(kind: ContractKind, sequence: number | null): string {
  return kind === "PKWT" ? `PKWT ${sequence}` : "Masa Percobaan";
}
export function employmentStatusDisplay(
  category: EmploymentCategory | null,
  activeSequence: number | null,
): string {
  if (category === "PERMANENT") return "Karyawan Tetap · PKWTT";
  if (category === "PROBATION") return "Karyawan Percobaan · PKWTT – Masa Percobaan";
  if (category === "PKWT")
    return activeSequence === null ? "PKWT · Tahap belum diisi" : `PKWT ${activeSequence}`;
  return category ? EMPLOYMENT_CATEGORY_LABELS[category] : "—";
}
/**
 * Label status pendek untuk badge daftar & header profil (masukan pengguna 2026-11-26):
 * PKWT dengan tahapnya ("PKWT 1"), tanpa istilah resmi PKWTT. `stage` undefined = tahap
 * tidak relevan (mis. karyawan nonaktif) → "PKWT" polos; null = tahap belum diisi.
 */
export function employmentStatusShort(
  category: EmploymentCategory | null,
  stage?: number | null,
): string {
  if (category === "PKWT") {
    if (stage === undefined) return "PKWT";
    return stage === null ? "PKWT · belum diisi" : `PKWT ${stage}`;
  }
  return category ? EMPLOYMENT_CATEGORY_LABELS[category] : "—";
}
const date = (value: string) => new Date(`${value}T00:00:00.000Z`);
const iso = (value: Date) => value.toISOString().slice(0, 10);
const daysBetween = (from: string, to: string) =>
  Math.round((date(to).getTime() - date(from).getTime()) / 86_400_000);
export function addContractDays(value: string, days: number): string {
  const result = date(value);
  result.setUTCDate(result.getUTCDate() + days);
  return iso(result);
}
// Kalender (bukan kelipatan 365/30 hari); tanggal yang tidak ada dijepit ke akhir bulan.
function addMonths(value: string, months: number): string {
  const result = date(value);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const last = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(day, last));
  return iso(result);
}
export function tenure(from: string, to: string): { years: number; months: number; days: number } {
  if (to < from) return { years: 0, months: 0, days: 0 };
  const a = date(from);
  const b = date(to);
  let months = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + b.getUTCMonth() - a.getUTCMonth();
  if (addMonths(from, months) > to) months -= 1;
  return {
    years: Math.floor(months / 12),
    months: months % 12,
    days: daysBetween(addMonths(from, months), to),
  };
}
export interface ContractStage {
  kind: ContractKind;
  sequence: number | null;
  startDate: string;
  endDate: string;
  previous: { endDate: string; sequence: number | null; firstPkwtStart: string } | null;
}
export function validateContractStage(input: ContractStage): {
  errors: string[];
  warnings: string[];
} {
  const { kind, sequence, startDate, endDate, previous } = input;
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!z.iso.date().safeParse(startDate).success || !z.iso.date().safeParse(endDate).success) {
    return { errors: ["Tanggal kontrak tidak valid."], warnings };
  }
  if (endDate < startDate) errors.push("Tanggal akhir kontrak tidak boleh sebelum tanggal mulai.");
  if (kind === "PKWT") {
    if (sequence === null || !Number.isInteger(sequence) || sequence < 1 || sequence > 3)
      errors.push(
        "Tahap PKWT harus 1–3. Batas PKWT tercapai: jadikan Karyawan Tetap atau akhiri kontrak",
      );
    if (endDate > addContractDays(addMonths(startDate, sequence === 1 ? 24 : 12), -1))
      errors.push(sequence === 1 ? "PKWT 1 maksimal 2 tahun." : "PKWT 2/3 maksimal 1 tahun.");
    const first = previous?.firstPkwtStart ?? startDate;
    if (first > startDate) errors.push("Tanggal mulai PKWT 1 tidak boleh setelah tahap ini.");
    if (endDate > addContractDays(addMonths(first, 48), -1))
      errors.push("Total masa PKWT maksimal 4 tahun sejak mulai PKWT 1.");
    if (previous && previous.sequence !== null && sequence !== previous.sequence + 1)
      errors.push("Tahap PKWT harus berurutan.");
  } else {
    if (sequence !== null) errors.push("Masa percobaan tidak memiliki nomor tahap.");
    if (endDate > addContractDays(addMonths(startDate, 3), -1))
      errors.push("Masa percobaan maksimal 3 bulan.");
  }
  if (previous) {
    if (startDate <= previous.endDate)
      errors.push("Tanggal kontrak tumpang tindih dengan tahap sebelumnya.");
    else if (startDate !== addContractDays(previous.endDate, 1))
      warnings.push("Ada jeda antar-tahap: tanggal mulai bukan H+1 dari akhir tahap sebelumnya.");
  }
  return { errors, warnings };
}
export interface SummaryContract {
  id: string;
  kind: ContractKind;
  sequence: number | null;
  startDate: string;
  endDate: string;
  status: ContractStatus;
  previousContractId: string | null;
  pkwtFirstStartDate: string | null;
}
export function contractSummary(contracts: readonly SummaryContract[], today: string) {
  const current = contracts.find((c) => c.status === "ACTIVE");
  if (!current) return null;
  const remainingDays = daysBetween(today, current.endDate);
  const color: "ok" | "warn" | "danger" | "expired" =
    remainingDays < 0
      ? "expired"
      : remainingDays <= 30
        ? "danger"
        : remainingDays <= 60
          ? "warn"
          : "ok";
  let first = current;
  const seen = new Set<string>();
  while (first.previousContractId && !seen.has(first.id)) {
    seen.add(first.id);
    const previous = contracts.find((c) => c.id === first.previousContractId);
    if (!previous) break;
    first = previous;
  }
  const firstStartDate = first.pkwtFirstStartDate ?? first.startDate;
  const until = today < current.endDate ? today : current.endDate;
  const days = Math.max(0, daysBetween(firstStartDate, until) + 1);
  const maxDays = daysBetween(firstStartDate, addMonths(firstStartDate, 48));
  return {
    contractId: current.id,
    stage: contractStageLabel(current.kind, current.sequence),
    startDate: current.startDate,
    endDate: current.endDate,
    remainingDays,
    color,
    stageTenure: tenure(current.startDate, until),
    totalPkwt:
      current.kind === "PKWT"
        ? { firstStartDate, days, maxDays, percent: (days / maxDays) * 100 }
        : null,
  };
}

const note = z.string().trim().max(500).optional();
export const contractPeriodInputSchema = z.object({
  sequence: z.number().int().optional(),
  startDate: z.iso.date(),
  endDate: z.iso.date(),
  firstPkwtStartDate: z.iso.date().optional(),
});
export const createContractInputSchema = contractPeriodInputSchema.extend({
  kind: z.enum(CONTRACT_KINDS),
  note,
});
export const extendContractInputSchema = z.object({
  startDate: z.iso.date().optional(),
  endDate: z.iso.date(),
  note,
});
/** KTR-D12: koreksi tanggal kontrak AKTIF tanpa pindah tahap (koreksi data, bukan perpanjangan). */
export const correctContractInputSchema = z.object({
  startDate: z.iso.date(),
  endDate: z.iso.date(),
  firstPkwtStartDate: z.iso.date().optional(),
  note: z.string().trim().min(1).max(500),
});
export type CorrectContractInput = z.infer<typeof correctContractInputSchema>;
export const promoteEmployeeInputSchema = z.object({ effectiveDate: z.iso.date(), note });
export const endContractInputSchema = promoteEmployeeInputSchema;
export type CreateContractInput = z.infer<typeof createContractInputSchema>;
export type ExtendContractInput = z.infer<typeof extendContractInputSchema>;
export type PromoteEmployeeInput = z.infer<typeof promoteEmployeeInputSchema>;
export type EndContractInput = z.infer<typeof endContractInputSchema>;
