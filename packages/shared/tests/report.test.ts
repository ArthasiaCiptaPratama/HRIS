import { describe, expect, test } from "bun:test";
import {
  completenessPercent,
  expiryBucket,
  monthlyTurnover,
  turnoverPercent,
  yearlyTurnover,
} from "../src/index.ts";

// ARS-D17: aturan hitung laporan batch 1.
describe("turnover (ARS-D17)", () => {
  test("keluar ÷ rata-rata (awal + akhir) / 2, 1 desimal; rata-rata 0 → 0", () => {
    expect(turnoverPercent(1, 10, 9)).toBe(10.5);
    expect(turnoverPercent(0, 0, 0)).toBe(0);
    expect(turnoverPercent(2, 0, 2)).toBe(200);
  });

  test("per bulan: masuk di bulan tanggal masuk, keluar di bulan tanggal keluar, berhenti di hari ini", () => {
    const rows = [
      { joinDate: "2025-01-10", endDate: null },
      { joinDate: "2026-02-15", endDate: null },
      { joinDate: "2024-06-01", endDate: "2026-03-20" },
      { joinDate: "2026-03-05", endDate: "2026-03-25" },
    ];
    const months = monthlyTurnover(rows, 2026, "2026-04-10");
    expect(months.map((m) => m.month)).toEqual([1, 2, 3, 4]);
    expect(months[0]).toMatchObject({ startActive: 2, endActive: 2, joined: 0, left: 0 });
    expect(months[1]).toMatchObject({ startActive: 2, endActive: 3, joined: 1, left: 0 });
    // Maret: awal 3 (A, B, C), akhir 2 (A, B); masuk D, keluar C & D.
    expect(months[2]).toMatchObject({
      startActive: 3,
      endActive: 2,
      joined: 1,
      left: 2,
      turnover: 80,
    });
    // April dihitung sampai hari ini (10 Apr).
    expect(months[3]).toMatchObject({ startActive: 2, endActive: 2 });
    expect(yearlyTurnover(months)).toMatchObject({
      startActive: 2,
      endActive: 2,
      joined: 2,
      left: 2,
      turnover: 100,
    });
  });

  test("tahun di masa depan: tidak ada bulan", () => {
    expect(monthlyTurnover([], 2030, "2026-10-16")).toEqual([]);
    expect(yearlyTurnover([])).toMatchObject({ startActive: 0, endActive: 0, turnover: 0 });
  });
});

describe("dokumen kedaluwarsa & kelengkapan", () => {
  test.each([
    ["2026-10-15", "EXPIRED"],
    ["2026-10-16", "D30"],
    ["2026-11-15", "D30"],
    ["2026-11-16", "D60"],
    ["2026-12-15", "D60"],
    ["2026-12-16", "D90"],
    ["2027-01-14", "D90"],
    ["2027-01-15", null],
    [null, null],
  ] as const)("berlaku s/d %s → %s", (expiresAt, expected) => {
    expect(expiryBucket(expiresAt, "2026-10-16")).toBe(expected);
  });

  test("persen lengkap", () => {
    expect(completenessPercent(3, 4)).toBe(75);
    expect(completenessPercent(0, 0)).toBe(100);
    expect(completenessPercent(1, 3)).toBe(33.3);
  });
});
