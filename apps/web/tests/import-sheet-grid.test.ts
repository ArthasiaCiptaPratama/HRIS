import { describe, expect, it } from "vitest";
import { type SheetColumn, stretchColumns } from "@/features/employee/import/sheet/sheet-grid";

// Paket B (pengguna 19 Nov "otomatis fill gada gap"): kolom mengisi penuh lebar kotak grid.
const col = (key: string, width: number, kind: SheetColumn["kind"] = "text", locked = false) =>
  ({ key, label: key, width, kind, locked }) as SheetColumn;

describe("stretchColumns", () => {
  it("sisa lebar dibagi proporsional ke kolom teks yang bisa diubah; total = lebar kotak", () => {
    const out = stretchColumns(
      [
        col("nama", 200),
        col("hasil", 100, "readonly"),
        col("pt", 100, "select"),
        col("hp", 100),
        col("ktp", 100, "text", true),
      ],
      900,
    );
    expect(out.map((c) => c.width)).toEqual([400, 100, 100, 200, 100]);
    expect(out.reduce((s, c) => s + c.width, 0)).toBe(900);
  });
  it("tanpa kolom teks → kolom terakhir yang melebar", () => {
    const out = stretchColumns([col("a", 100, "select"), col("b", 100, "readonly")], 350);
    expect(out.map((c) => c.width)).toEqual([100, 250]);
  });
  it("kolom lebih lebar dari kotak, atau lebar belum terukur → tidak diubah (digeser ke samping)", () => {
    const cols = [col("a", 300), col("b", 300)];
    expect(stretchColumns(cols, 500)).toBe(cols);
    expect(stretchColumns(cols, 0)).toBe(cols);
  });
});
