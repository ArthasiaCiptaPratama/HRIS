import { PIVOT_NONE, type PivotResult, type PivotSort } from "@hris/shared";
import { MAX_SERIES, OTHER_KEY } from "./palette";

// D-065: hasil pivot → bentuk siap gambar (sortir, batas baris, lipat ke "Lainnya"). Murni & teruji.

export interface PivotKey {
  key: string;
  label: string;
  total: number;
}

export interface PivotView {
  rows: PivotKey[];
  /** Kosong = satu seri (tanpa dimensi kolom). */
  cols: PivotKey[];
  /** Urutan kolom dari server (untuk warna yang mengikuti entitas). */
  colOrder: string[];
  value: (row: string, col?: string) => number;
  total: number;
}

const OTHER_LABEL = "Lainnya";

function sortKeys(keys: PivotKey[], sort: PivotSort): PivotKey[] {
  if (sort === "natural") return keys;
  const none = keys.filter((k) => k.key === PIVOT_NONE);
  const rest = keys.filter((k) => k.key !== PIVOT_NONE);
  rest.sort((a, b) =>
    sort === "count"
      ? b.total - a.total || a.label.localeCompare(b.label, "id")
      : a.label.localeCompare(b.label, "id", { numeric: true }),
  );
  return [...rest, ...none];
}

/** Ambil `limit` kunci; sisanya (≥ 2) dilipat jadi satu "Lainnya". */
function fold(keys: PivotKey[], limit: number): { kept: PivotKey[]; folded: Set<string> } {
  if (keys.length <= limit) return { kept: keys, folded: new Set() };
  const kept = keys.slice(0, limit - 1);
  const rest = keys.slice(limit - 1);
  return {
    kept: [
      ...kept,
      { key: OTHER_KEY, label: OTHER_LABEL, total: rest.reduce((sum, k) => sum + k.total, 0) },
    ],
    folded: new Set(rest.map((k) => k.key)),
  };
}

/**
 * Seri berwarna: maksimal `max` kunci nyata (satu slot palet masing-masing, tanpa diulang). Bila lebih,
 * sisanya + "NONE" dilipat ke satu "Lainnya" abu — supaya tidak ada dua abu yang tak terbedakan.
 */
function foldSeries(keys: PivotKey[], max: number): { kept: PivotKey[]; folded: Set<string> } {
  const real = keys.filter((k) => k.key !== PIVOT_NONE);
  if (real.length <= max) return { kept: keys, folded: new Set() };
  const rest = [...real.slice(max), ...keys.filter((k) => k.key === PIVOT_NONE)];
  return {
    kept: [
      ...real.slice(0, max),
      { key: OTHER_KEY, label: OTHER_LABEL, total: rest.reduce((sum, k) => sum + k.total, 0) },
    ],
    folded: new Set(rest.map((k) => k.key)),
  };
}

export interface ViewOptions {
  sort: PivotSort;
  /** Batas baris (null = semua, mis. tampilan tabel). */
  limit: number | null;
  /** Batas seri berwarna; bawaan = jumlah slot palet kategorikal. */
  seriesLimit?: number;
  /** Baris digambar sebagai seri berwarna (donut). */
  rowsAsSeries?: boolean;
}

export function buildPivotView(result: PivotResult, options: ViewOptions): PivotView {
  const sorted = sortKeys(result.rowKeys, options.sort);
  // Donut: baris = seri berwarna → aturan lipat seri; selain itu batas baris widget.
  const rows = options.rowsAsSeries
    ? foldSeries(sorted, options.seriesLimit ?? MAX_SERIES)
    : fold(sorted, options.limit ?? Number.POSITIVE_INFINITY);
  const cols = foldSeries(result.colKeys, options.seriesLimit ?? MAX_SERIES);

  const matrix = new Map<string, number>();
  const at = (row: string, col: string) => `${row}\u0000${col}`;
  for (const cell of result.cells) {
    const row = rows.folded.has(cell.row) ? OTHER_KEY : cell.row;
    const col = cols.folded.has(cell.col) ? OTHER_KEY : cell.col;
    matrix.set(at(row, col), (matrix.get(at(row, col)) ?? 0) + cell.count);
  }
  const rowTotals = new Map(rows.kept.map((r) => [r.key, r.total]));

  return {
    rows: rows.kept,
    cols: result.cols ? cols.kept : [],
    colOrder: [...result.colKeys.map((k) => k.key), OTHER_KEY],
    value: (row, col) =>
      col === undefined ? (rowTotals.get(row) ?? 0) : (matrix.get(at(row, col)) ?? 0),
    total: result.total,
  };
}

export const percent = (part: number, whole: number) =>
  whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0;
