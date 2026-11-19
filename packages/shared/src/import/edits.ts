import type { ImportFieldKey } from "./fields.ts";

// Paket B (IMP-D6): perubahan sel yang diketik di Pratinjau spreadsheet. Disimpan per nomor baris sheet
// & isian; diterapkan ke `raw` sebelum pratinjau/simpan, jadi validasi, izin, dan penulisan tetap lewat
// jalur server yang sama. Teks kosong = sel dikosongkan (null).

export type ImportCellEdits = Record<number, Partial<Record<ImportFieldKey, string>>>;

export function applyCellEdits<R extends { sourceRow: number; raw: object }>(
  rows: readonly R[],
  edits: ImportCellEdits,
): R[] {
  return rows.map((row) => {
    const changed = edits[row.sourceRow];
    if (!changed) return row;
    const raw: Record<string, unknown> = { ...row.raw };
    for (const [field, value] of Object.entries(changed) as [ImportFieldKey, string][]) {
      raw[field] = value.trim() === "" ? null : value;
    }
    return { ...row, raw: raw as R["raw"] };
  });
}

/** Daftar sel yang diubah (baris + isian, tanpa nilai) — untuk audit & penanda. */
export function editedCellList(
  edits: ImportCellEdits,
): { sourceRow: number; field: ImportFieldKey }[] {
  return Object.entries(edits).flatMap(([row, fields]) =>
    Object.keys(fields ?? {}).map((field) => ({
      sourceRow: Number(row),
      field: field as ImportFieldKey,
    })),
  );
}
