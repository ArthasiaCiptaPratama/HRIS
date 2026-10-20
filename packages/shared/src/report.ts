import { z } from "zod";
import type { AGE_BUCKETS, TENURE_BUCKETS } from "./dashboard.ts";
import { daysUntil } from "./documents.ts";
import { POSITION_LEVELS, type PositionLevel } from "./organization.ts";

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
  "tenure",
  "demographics",
  "movements",
  "birthdays",
  "assets",
  "data-changes",
] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];
export const REPORT_LABELS: Record<ReportKind, string> = {
  headcount: "Headcount & turnover",
  "document-expiry": "Dokumen kedaluwarsa",
  completeness: "Kelengkapan data",
  "warning-letters": "SP aktif",
  tenure: "Masa kerja",
  demographics: "Demografi",
  movements: "Mutasi & promosi",
  birthdays: "Ulang tahun",
  assets: "Aset",
  "data-changes": "Pengajuan perubahan data",
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

// --- Batch 2 (ARS-D21) ---

/** Tahun penuh dari `from` sampai `today` (YYYY-MM-DD); belum genap ulang tanggal = belum dihitung. */
export function fullYears(from: string, today: string): number {
  const years = Number(today.slice(0, 4)) - Number(from.slice(0, 4));
  return today.slice(5) < from.slice(5) ? years - 1 : years;
}

// Masa kerja — kelompok sama dengan Dashboard (TENURE_BUCKETS / AGE_BUCKETS di dashboard.ts).
export type TenureBucket = (typeof TENURE_BUCKETS)[number];

/** ARS-D21: kelompok masa kerja per `today` (batas bawah inklusif: genap 3 tahun = "3–5 tahun"). */
export function tenureBucket(joinDate: string, today: string): TenureBucket {
  const years = fullYears(joinDate, today);
  if (years < 1) return "<1";
  if (years < 3) return "1-3";
  if (years < 5) return "3-5";
  if (years < 10) return "5-10";
  return "10+";
}

export const JUBILEE_YEARS = [5, 10, 15, 20, 25] as const;

/** ARS-D21: tahun jubilee bila tanggal masuk genap 5/10/15/20/25 tahun pada bulan `year`-`month`; selain itu null. */
export function jubileeYears(joinDate: string, year: number, month: number): number | null {
  if (Number(joinDate.slice(5, 7)) !== month) return null;
  const years = year - Number(joinDate.slice(0, 4));
  return (JUBILEE_YEARS as readonly number[]).includes(years) ? years : null;
}

// Demografi
export type AgeBucket = (typeof AGE_BUCKETS)[number];

export function ageBucket(birthDate: string, today: string): AgeBucket {
  const age = fullYears(birthDate, today);
  if (age < 25) return "<25";
  if (age < 35) return "25-34";
  if (age < 45) return "35-44";
  if (age < 55) return "45-54";
  return "55+";
}

// Mutasi & promosi
export const MOVEMENT_KINDS = ["PROMOTION", "DEMOTION", "TRANSFER", "UNRANKED"] as const;
export type MovementKind = (typeof MOVEMENT_KINDS)[number];
export const MOVEMENT_KIND_LABELS: Record<MovementKind, string> = {
  PROMOTION: "Promosi",
  DEMOTION: "Demosi",
  TRANSFER: "Mutasi",
  UNRANKED: "Perpindahan (level belum diisi)",
};

/**
 * ARS-D21: level jabatan (D-050) naik = Promosi, turun = Demosi, sama = Mutasi; salah satu kosong =
 * "Perpindahan (level belum diisi)". POSITION_LEVELS berurutan dari puncak (indeks kecil = lebih tinggi).
 */
export function movementKind(from: PositionLevel | null, to: PositionLevel | null): MovementKind {
  if (!from || !to) return "UNRANKED";
  const a = POSITION_LEVELS.indexOf(from);
  const b = POSITION_LEVELS.indexOf(to);
  if (b < a) return "PROMOTION";
  if (b > a) return "DEMOTION";
  return "TRANSFER";
}

// Pengajuan perubahan data

/** Rata-rata hari (1 desimal) dari pasangan diajukan → diputuskan (ISO datetime); null bila kosong. */
export function averageDays(pairs: readonly { from: string; to: string }[]): number | null {
  if (pairs.length === 0) return null;
  const total = pairs.reduce((s, p) => s + (Date.parse(p.to) - Date.parse(p.from)), 0);
  return Math.round((total / pairs.length / 86_400_000) * 10) / 10;
}

// Query batch 2
export const monthQuerySchema = reportFilterSchema.extend({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});
export type MonthQuery = z.infer<typeof monthQuerySchema>;
