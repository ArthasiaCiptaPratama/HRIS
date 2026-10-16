import { z } from "zod";
import { daysUntil } from "./documents.ts";

// ARS-D16/ARS-D17 (Arsip gelombang 3, Laporan batch 1; docs/features/arsip/README.md#keputusan):
// headcount & turnover, dokumen kedaluwarsa, kelengkapan data, SP aktif. Aturan hitung murni dipakai
// API & web (dan test).

const optionalId = z
  .uuid()
  .nullish()
  .transform((v) => v ?? null);

/** Filter bersama semua laporan; PT tetap dibatasi cakupan aktor di server (D-040). */
export const reportFilterSchema = z.object({
  companyId: optionalId,
  /** Unit organisasi (D-050) — termasuk sub-unit di bawahnya. */
  unitId: optionalId,
  workLocationId: optionalId,
});
export type ReportFilter = z.infer<typeof reportFilterSchema>;

export const REPORT_KINDS = [
  "headcount",
  "document-expiry",
  "completeness",
  "warning-letters",
] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];
export const REPORT_LABELS: Record<ReportKind, string> = {
  headcount: "Headcount & turnover",
  "document-expiry": "Dokumen kedaluwarsa",
  completeness: "Kelengkapan data",
  "warning-letters": "SP aktif",
};

// --- Headcount & turnover ---

export interface TenureRow {
  /** YYYY-MM-DD */
  joinDate: string;
  /** YYYY-MM-DD hari terakhir bekerja; null = masih aktif. */
  endDate: string | null;
}

export interface MonthTurnover {
  /** 1–12 */
  month: number;
  startActive: number;
  endActive: number;
  joined: number;
  left: number;
  /** Persen, 1 desimal; 0 bila rata-rata headcount 0. */
  turnover: number;
}

const pad = (n: number) => String(n).padStart(2, "0");
const lastDay = (year: number, month: number) =>
  `${year}-${pad(month)}-${pad(new Date(Date.UTC(year, month, 0)).getUTCDate())}`;
const isActiveOn = (r: TenureRow, day: string) =>
  r.joinDate <= day && (r.endDate === null || r.endDate >= day);
/** Turnover % = keluar ÷ rata-rata (awal + akhir) / 2 × 100, 1 desimal (ARS-D17). */
export function turnoverPercent(left: number, start: number, end: number): number {
  const avg = (start + end) / 2;
  return avg > 0 ? Math.round((left / avg) * 1000) / 10 : 0;
}

/**
 * Headcount & turnover per bulan dalam `year` (ARS-D17). Aktif pada tanggal d = masuk ≤ d dan (tanpa
 * tanggal keluar atau keluar ≥ d). Keluar dihitung di bulan tanggal keluarnya; masuk di bulan tanggal masuk.
 * Bulan setelah `today` diabaikan (tidak dihitung ke depan).
 */
export function monthlyTurnover(
  rows: readonly TenureRow[],
  year: number,
  today: string,
): MonthTurnover[] {
  const out: MonthTurnover[] = [];
  for (let month = 1; month <= 12; month++) {
    const first = `${year}-${pad(month)}-01`;
    if (first > today) break;
    const last = lastDay(year, month) < today ? lastDay(year, month) : today;
    const prefix = `${year}-${pad(month)}`;
    let startActive = 0;
    let endActive = 0;
    let joined = 0;
    let left = 0;
    for (const r of rows) {
      if (isActiveOn(r, first)) startActive++;
      if (isActiveOn(r, last)) endActive++;
      if (r.joinDate.startsWith(prefix)) joined++;
      if (r.endDate?.startsWith(prefix) && r.endDate <= last) left++;
    }
    out.push({
      month,
      startActive,
      endActive,
      joined,
      left,
      turnover: turnoverPercent(left, startActive, endActive),
    });
  }
  return out;
}

/** Ringkasan tahunan: awal = aktif 1 Jan, akhir = aktif di bulan terakhir yang dihitung. */
export function yearlyTurnover(months: readonly MonthTurnover[]) {
  const first = months[0];
  const last = months[months.length - 1];
  const startActive = first?.startActive ?? 0;
  const endActive = last?.endActive ?? 0;
  const joined = months.reduce((s, m) => s + m.joined, 0);
  const left = months.reduce((s, m) => s + m.left, 0);
  return {
    startActive,
    endActive,
    joined,
    left,
    turnover: turnoverPercent(left, startActive, endActive),
  };
}

// --- Dokumen kedaluwarsa ---

export const EXPIRY_BUCKETS = ["EXPIRED", "D30", "D60", "D90"] as const;
export type ExpiryBucket = (typeof EXPIRY_BUCKETS)[number];
export const EXPIRY_BUCKET_LABELS: Record<ExpiryBucket, string> = {
  EXPIRED: "Sudah kedaluwarsa",
  D30: "≤ 30 hari",
  D60: "31–60 hari",
  D90: "61–90 hari",
};

/** ARS-D17: kelompok masa berlaku dokumen; > 90 hari / tanpa tanggal = null (tidak masuk laporan). */
export function expiryBucket(expiresAt: string | null, today: string): ExpiryBucket | null {
  if (!expiresAt) return null;
  const days = daysUntil(expiresAt, today);
  if (days < 0) return "EXPIRED";
  if (days <= 30) return "D30";
  if (days <= 60) return "D60";
  if (days <= 90) return "D90";
  return null;
}

// --- Kelengkapan data ---

/** ARS-D17: data inti wajib (selain dokumen wajib dari master jenis dokumen). */
export const CORE_COMPLETENESS_ITEMS = [
  "KTP",
  "NPWP",
  "BPJS_TK",
  "BPJS_KES",
  "BANK",
  "EMERGENCY",
  "WORK_EMAIL",
] as const;
export type CoreCompletenessItem = (typeof CORE_COMPLETENESS_ITEMS)[number];
export const CORE_COMPLETENESS_LABELS: Record<CoreCompletenessItem, string> = {
  KTP: "NIK KTP",
  NPWP: "NPWP",
  BPJS_TK: "BPJS Ketenagakerjaan",
  BPJS_KES: "BPJS Kesehatan",
  BANK: "Rekening bank",
  EMERGENCY: "Kontak darurat",
  WORK_EMAIL: "Email kantor",
};

/** Persen lengkap 1 desimal (0 karyawan = 100). */
export function completenessPercent(complete: number, total: number): number {
  return total > 0 ? Math.round((complete / total) * 1000) / 10 : 100;
}

// --- Query ---

export const headcountQuerySchema = reportFilterSchema.extend({
  year: z.coerce.number().int().min(2000).max(2100),
});
export type HeadcountQuery = z.infer<typeof headcountQuerySchema>;
