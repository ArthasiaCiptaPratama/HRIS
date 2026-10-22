import { z } from "zod";

// TM-D10 / DSB-D1 — estimasi kompensasi akhir hubungan kerja (PP 35/2021) untuk dashboard. Estimasi
// cadangan biaya, BUKAN hitungan final: upah = upah grade (pokok + tunjangan tetap), masa kerja dari
// tanggal masuk. Karyawan Tetap: pesangon + UPMK + uang penggantian hak (sisa cuti); PKWT: uang
// kompensasi PKWT + sisa cuti; kategori lain: sisa cuti saja.

/** Pesangon (Pasal 40 ayat 2): bulan upah menurut masa kerja penuh (tahun). */
export function severanceMonths(years: number): number {
  if (years < 1) return 1;
  return Math.min(9, Math.floor(years) + 1);
}

/** Uang penghargaan masa kerja (Pasal 40 ayat 3). */
export function upmkMonths(years: number): number {
  const y = Math.floor(years);
  if (y < 3) return 0;
  if (y >= 24) return 10;
  return Math.floor(y / 3) + 1;
}

/** Skenario alasan PHK (pengali pesangon & UPMK). */
export const SEVERANCE_SCENARIOS = [
  "PHK_NORMAL",
  "EFFICIENCY_PREVENT",
  "EFFICIENCY_LOSS",
  "RETIREMENT",
  "DEATH",
  "RESIGN",
] as const;
export type SeveranceScenario = (typeof SEVERANCE_SCENARIOS)[number];
export const severanceScenarioSchema = z.enum(SEVERANCE_SCENARIOS);
export const SEVERANCE_SCENARIO_LABELS: Record<SeveranceScenario, string> = {
  PHK_NORMAL: "PHK biasa (1× pesangon + 1× UPMK)",
  EFFICIENCY_PREVENT: "Efisiensi pencegahan rugi (1× + 1×)",
  EFFICIENCY_LOSS: "Efisiensi karena rugi (0,5× + 1×)",
  RETIREMENT: "Pensiun (1,75× + 1×)",
  DEATH: "Meninggal dunia (2× + 1×)",
  RESIGN: "Mengundurkan diri (tanpa pesangon & UPMK)",
};
export const SEVERANCE_MULTIPLIERS: Record<SeveranceScenario, { severance: number; upmk: number }> =
  {
    PHK_NORMAL: { severance: 1, upmk: 1 },
    EFFICIENCY_PREVENT: { severance: 1, upmk: 1 },
    EFFICIENCY_LOSS: { severance: 0.5, upmk: 1 },
    RETIREMENT: { severance: 1.75, upmk: 1 },
    DEATH: { severance: 2, upmk: 1 },
    RESIGN: { severance: 0, upmk: 0 },
  };

/** Usia pensiun untuk proyeksi (tahun). */
export const RETIREMENT_AGE = 58;

/**
 * Masa kerja (tahun desimal) dari tanggal masuk s.d. `at` (YYYY-MM-DD): tahun kalender penuh (tepat di
 * ulang tahun kerja = bilangan bulat) + pecahan menuju ulang tahun berikutnya.
 */
export function tenureYears(joinDate: string, at: string): number {
  if (at <= joinDate) return 0;
  const [y1] = joinDate.split("-").map(Number) as [number];
  const [y2] = at.split("-").map(Number) as [number];
  let full = y2 - y1;
  if (at.slice(5) < joinDate.slice(5)) full -= 1;
  const last = Date.parse(`${anniversary(joinDate, full)}T00:00:00Z`);
  const next = Date.parse(`${anniversary(joinDate, full + 1)}T00:00:00Z`);
  return full + (Date.parse(`${at}T00:00:00Z`) - last) / (next - last);
}

/** Bulan kerja penuh (untuk kompensasi PKWT). */
export function fullMonths(joinDate: string, at: string): number {
  const [y1, m1, d1] = joinDate.split("-").map(Number) as [number, number, number];
  const [y2, m2, d2] = at.split("-").map(Number) as [number, number, number];
  return Math.max(0, (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0));
}

export type SeveranceCategory = "PERMANENT" | "PKWT" | "OTHER";

export interface SeveranceEstimate {
  severance: number;
  upmk: number;
  pkwt: number;
}

/** Estimasi kompensasi satu karyawan (tanpa sisa cuti) per skenario, dibulatkan ke rupiah. */
export function estimateSeverance(input: {
  category: SeveranceCategory;
  joinDate: string;
  at: string;
  monthlyWage: number;
  scenario: SeveranceScenario;
}): SeveranceEstimate {
  const years = tenureYears(input.joinDate, input.at);
  if (input.category === "PERMANENT") {
    const m = SEVERANCE_MULTIPLIERS[input.scenario];
    return {
      severance: Math.round(severanceMonths(years) * m.severance * input.monthlyWage),
      upmk: Math.round(upmkMonths(years) * m.upmk * input.monthlyWage),
      pkwt: 0,
    };
  }
  if (input.category === "PKWT") {
    // Pasal 16: masa kerja ≥ 1 bulan → (bulan kerja ÷ 12) × 1 bulan upah; ≥ 12 bulan → 1 bulan upah.
    const months = fullMonths(input.joinDate, input.at);
    return {
      severance: 0,
      upmk: 0,
      pkwt: months < 1 ? 0 : Math.round((Math.min(months, 12) / 12) * input.monthlyWage),
    };
  }
  return { severance: 0, upmk: 0, pkwt: 0 };
}

/** Tanggal ulang tahun kerja ke-`n` (YYYY-MM-DD); masuk 29 Feb → 28 Feb di tahun non-kabisat. */
export function anniversary(joinDate: string, n: number): string {
  const year = Number(joinDate.slice(0, 4)) + n;
  const md = joinDate.slice(5);
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return `${year}-${md === "02-29" && !leap ? "02-28" : md}`;
}

export const dashboardAnalyticsQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Format YYYY-MM"),
  companyId: z.uuid().optional(),
  scenario: severanceScenarioSchema.default("PHK_NORMAL"),
});
export type DashboardAnalyticsQuery = z.infer<typeof dashboardAnalyticsQuerySchema>;
