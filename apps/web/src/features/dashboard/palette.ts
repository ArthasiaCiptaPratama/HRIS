import {
  EMPLOYMENT_CATEGORIES,
  GENDERS,
  MARITAL_STATUSES,
  ORDINAL_PIVOT_DIMENSIONS,
  PIVOT_NONE,
  type PivotDimension,
  RELIGIONS,
} from "@hris/shared";

// D-062: warna grafik dashboard. Palet kategorikal 7 slot divalidasi (validate_palette.js, 2026-10-09)
// pada kartu putih (#ffffff) & kartu gelap (#18181b): CVD ΔE terdekat 9.1 / 8.4, normal ≥ 19.3.
// Terang: 3 slot < 3:1 → setiap widget punya tampilan tabel + label nilai (relief rule).
// Urutan slot = mekanisme aman buta warna — jangan diacak. Seri ke-8+ dilipat ke "Lainnya" (abu).

export type Mode = "light" | "dark";

const CATEGORICAL: Record<Mode, readonly string[]> = {
  light: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7"],
  dark: ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9"],
};
export const MAX_SERIES = CATEGORICAL.light.length;

/** Ramp satu hue (biru) untuk dimensi berurutan & heatmap: terang → gelap. */
const SEQUENTIAL = [
  "#cde2fb",
  "#b7d3f6",
  "#9ec5f4",
  "#86b6ef",
  "#6da7ec",
  "#5598e7",
  "#3987e5",
  "#2a78d6",
  "#256abf",
  "#1c5cab",
  "#184f95",
  "#104281",
  "#0d366b",
];
/** Ordinal: langkah terdekat permukaan tetap ≥ 2:1 (terang mulai 250; gelap berhenti di 600). */
const ORDINAL_RANGE: Record<Mode, [number, number]> = { light: [3, 12], dark: [2, 10] };

export const NEUTRAL: Record<Mode, string> = { light: "#a1a1aa", dark: "#71717a" };
export const SINGLE: Record<Mode, string> = { light: "#0d9488", dark: "#2dd4bf" };

export const CHROME: Record<
  Mode,
  { surface: string; ink: string; muted: string; grid: string; axis: string }
> = {
  light: { surface: "#ffffff", ink: "#27272a", muted: "#71717a", grid: "#f0f0f2", axis: "#d4d4d8" },
  dark: { surface: "#18181b", ink: "#e4e4e7", muted: "#a1a1aa", grid: "#27272a", axis: "#3f3f46" },
};

export const HEATMAP_RAMP = SEQUENTIAL;

/** Kunci tetap per dimensi enum → warna mengikuti entitas di semua widget (bukan peringkat). */
const FIXED_KEYS: Partial<Record<PivotDimension, readonly string[]>> = {
  category: EMPLOYMENT_CATEGORIES,
  gender: GENDERS,
  status: ["active", "inactive"],
  religion: RELIGIONS,
  maritalStatus: MARITAL_STATUSES,
};

export const OTHER_KEY = "__other";

/**
 * Warna tiap kunci seri. `keys` = urutan dari server (alami/terbanyak) — dipakai untuk dimensi tanpa
 * kunci tetap, sehingga urutan tampilan (sortir widget) tidak mengecat ulang seri.
 */
export function seriesColors(
  dimension: PivotDimension,
  keys: readonly string[],
  mode: Mode,
): Map<string, string> {
  const colors = new Map<string, string>();
  const real = keys.filter((key) => key !== PIVOT_NONE && key !== OTHER_KEY);
  if (ORDINAL_PIVOT_DIMENSIONS.includes(dimension)) {
    const [from, to] = ORDINAL_RANGE[mode];
    real.forEach((key, i) => {
      const step =
        real.length === 1 ? to : Math.round(from + ((to - from) * i) / (real.length - 1));
      colors.set(key, SEQUENTIAL[step] as string);
    });
  } else {
    const fixed = FIXED_KEYS[dimension];
    const palette = CATEGORICAL[mode];
    real.forEach((key, i) => {
      const slot = fixed ? fixed.indexOf(key) : i;
      colors.set(key, palette[slot >= 0 ? slot % palette.length : i % palette.length] as string);
    });
  }
  colors.set(PIVOT_NONE, NEUTRAL[mode]);
  colors.set(OTHER_KEY, NEUTRAL[mode]);
  return colors;
}
