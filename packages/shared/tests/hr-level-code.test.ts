import { describe, expect, test } from "bun:test";
import { hrLevelCodeDiffers, hrLevelCodeNote, parseHrLevelCode } from "../src/organization.ts";

// ORG-D8: kode level HR dari file → level bagan (kutipan pengguna 2026-11-13 15:58: level 1 punya A/B,
// 2 ke atas dimasukkan ke level yang ada tetapi ditandai).
describe("parseHrLevelCode", () => {
  test.each([
    ["0", "L0", "EXACT"],
    ["1A", "L1A", "EXACT"],
    ["l1b", "L1B", "EXACT"],
    ["L4", "L4", "EXACT"],
    ["Level 3", "L3", "EXACT"],
    ["7", "L7", "EXACT"],
    ["3A", "L3", "SUB_LEVEL"],
    [" 4 b ", "L4", "SUB_LEVEL"],
    ["1", null, "AMBIGUOUS"],
    ["1C", null, "UNKNOWN"],
    ["8", null, "UNKNOWN"],
    ["Staf Senior", null, "UNKNOWN"],
  ] as const)("%p → %p (%p)", (raw, level, match) => {
    expect(parseHrLevelCode(raw)).toMatchObject({ level, match });
  });

  test("kosong → null; kode disimpan huruf besar tanpa spasi, maks 10", () => {
    expect(parseHrLevelCode("  ")).toBeNull();
    expect(parseHrLevelCode(null)).toBeNull();
    expect(parseHrLevelCode(" 3 a ")?.code).toBe("3A");
    expect(parseHrLevelCode("x".repeat(20))?.code).toHaveLength(10);
  });
});

describe("penanda kode HR", () => {
  test("tampil hanya bila kode tidak sama persis dengan level jabatan", () => {
    expect(hrLevelCodeDiffers("1A", "L1A")).toBe(false);
    expect(hrLevelCodeDiffers("L3", "L3")).toBe(false);
    expect(hrLevelCodeDiffers("3A", "L3")).toBe(true);
    expect(hrLevelCodeDiffers("1", "L1A")).toBe(true);
    expect(hrLevelCodeDiffers("4", "L3")).toBe(true);
    expect(hrLevelCodeDiffers(null, "L3")).toBe(false);
  });

  test("teks penjelasan", () => {
    expect(hrLevelCodeNote("3A", "L3")).toBe("Kode HR 3A dimasukkan ke L3 (sub-level belum ada).");
    expect(hrLevelCodeNote("1", null)).toBe("Kode HR 1 tanpa A/B: L1a atau L1b belum jelas.");
    expect(hrLevelCodeNote("L4", "L3")).toBe("Kode HR L4 berbeda dengan level jabatan L3.");
    expect(hrLevelCodeNote("XYZ", null)).toBe("Kode HR XYZ tidak dikenal sebagai level.");
  });
});
