import type { PivotResult } from "@hris/shared";
import { describe, expect, it } from "vitest";
import { OTHER_KEY, seriesColors } from "@/features/dashboard/palette";
import { buildPivotView, percent } from "@/features/dashboard/pivot-data";

// D-062: transformasi hasil pivot → bentuk grafik (sortir, batas baris, lipat "Lainnya", warna).
const key = (k: string, total: number, label = k) => ({ key: k, label, total });

const result: PivotResult = {
  rows: "location",
  cols: "category",
  rowKeys: [
    key("a", 5, "Banjar"),
    key("b", 9, "Amuntai"),
    key("c", 1, "Cempaka"),
    key("d", 2, "Dahor"),
    key("NONE", 3, "Belum diisi"),
  ],
  colKeys: [key("PERMANENT", 12), key("PKWT", 8)],
  cells: [
    { row: "a", col: "PERMANENT", count: 3 },
    { row: "a", col: "PKWT", count: 2 },
    { row: "b", col: "PERMANENT", count: 9 },
    { row: "c", col: "PKWT", count: 1 },
    { row: "d", col: "PKWT", count: 2 },
    { row: "NONE", col: "PKWT", count: 3 },
  ],
  total: 20,
};

describe("buildPivotView", () => {
  it("urutan bawaan = urutan server; terbanyak & abjad tetap menaruh NONE di akhir", () => {
    const natural = buildPivotView(result, { sort: "natural", limit: null });
    expect(natural.rows.map((r) => r.key)).toEqual(["a", "b", "c", "d", "NONE"]);
    const count = buildPivotView(result, { sort: "count", limit: null });
    expect(count.rows.map((r) => r.key)).toEqual(["b", "a", "d", "c", "NONE"]);
    const label = buildPivotView(result, { sort: "label", limit: null });
    expect(label.rows.map((r) => r.label)).toEqual([
      "Amuntai",
      "Banjar",
      "Cempaka",
      "Dahor",
      "Belum diisi",
    ]);
  });

  it("batas baris: sisanya dilipat ke 'Lainnya' dengan jumlah sel yang dijumlahkan", () => {
    const view = buildPivotView(result, { sort: "count", limit: 3 });
    expect(view.rows.map((r) => r.key)).toEqual(["b", "a", OTHER_KEY]);
    expect(view.rows[2]).toMatchObject({ label: "Lainnya", total: 6 });
    expect(view.value(OTHER_KEY, "PKWT")).toBe(6);
    expect(view.value("a", "PERMANENT")).toBe(3);
    expect(view.value("a")).toBe(5);
    expect(view.total).toBe(20);
  });

  it("seri berwarna dibatasi; NONE ikut dilipat bersama sisa seri", () => {
    const many: PivotResult = {
      ...result,
      rows: "category",
      cols: null,
      rowKeys: ["a", "b", "c", "d", "e", "f", "g", "h", "NONE"].map((k) => key(k, 1)),
      colKeys: [],
      cells: ["a", "b", "c", "d", "e", "f", "g", "h", "NONE"].map((row) => ({
        row,
        col: "",
        count: 1,
      })),
      total: 9,
    };
    const view = buildPivotView(many, { sort: "natural", limit: null, rowsAsSeries: true });
    expect(view.rows).toHaveLength(8);
    expect(view.rows.at(-1)).toMatchObject({ key: OTHER_KEY, total: 2 });
  });

  it("persen satu desimal; pembagi nol → 0", () => {
    expect(percent(1, 3)).toBe(33.3);
    expect(percent(5, 0)).toBe(0);
  });
});

describe("seriesColors", () => {
  it("kategori memakai slot tetap (warna mengikuti entitas, bukan urutan)", () => {
    const a = seriesColors("category", ["PKWT", "PERMANENT"], "light");
    const b = seriesColors("category", ["PERMANENT"], "light");
    expect(a.get("PERMANENT")).toBe(b.get("PERMANENT"));
    expect(a.get("PKWT")).not.toBe(a.get("PERMANENT"));
  });

  it("dimensi berurutan memakai ramp satu hue; NONE & Lainnya abu", () => {
    const colors = seriesColors("education", ["SD", "SMA", "S1", "NONE", OTHER_KEY], "light");
    expect(new Set([colors.get("SD"), colors.get("SMA"), colors.get("S1")]).size).toBe(3);
    expect(colors.get("NONE")).toBe(colors.get(OTHER_KEY));
  });
});
