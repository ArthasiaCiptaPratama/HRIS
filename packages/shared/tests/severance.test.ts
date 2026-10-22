import { describe, expect, test } from "bun:test";
import {
  estimateSeverance,
  fullMonths,
  severanceMonths,
  tenureYears,
  upmkMonths,
} from "../src/index.ts";

// PP 35/2021 Pasal 40 & 16 — estimasi dashboard (TM-D10 / DSB-D1).
describe("tabel pesangon & UPMK", () => {
  test.each([
    [0.5, 1],
    [1, 2],
    [2.9, 3],
    [7.99, 8],
    [8, 9],
    [20, 9],
  ])("pesangon masa kerja %d th → %d bulan", (years, months) => {
    expect(severanceMonths(years)).toBe(months);
  });
  test.each([
    [2.9, 0],
    [3, 2],
    [5.9, 2],
    [6, 3],
    [9, 4],
    [12, 5],
    [15, 6],
    [18, 7],
    [21, 8],
    [23.9, 8],
    [24, 10],
  ])("UPMK masa kerja %d th → %d bulan", (years, months) => {
    expect(upmkMonths(years)).toBe(months);
  });
});

describe("estimasi per karyawan", () => {
  const wage = 7_200_000;
  test("Tetap 6 th 2 bln, PHK biasa: 7 bln pesangon + 3 bln UPMK", () => {
    const e = estimateSeverance({
      category: "PERMANENT",
      joinDate: "2020-08-01",
      at: "2026-10-21",
      monthlyWage: wage,
      scenario: "PHK_NORMAL",
    });
    expect(e).toEqual({ severance: 7 * wage, upmk: 3 * wage, pkwt: 0 });
  });
  test("efisiensi rugi 0,5× pesangon; resign tanpa pesangon & UPMK", () => {
    const base = {
      category: "PERMANENT" as const,
      joinDate: "2020-08-01",
      at: "2026-10-21",
      monthlyWage: wage,
    };
    expect(estimateSeverance({ ...base, scenario: "EFFICIENCY_LOSS" }).severance).toBe(3.5 * wage);
    expect(estimateSeverance({ ...base, scenario: "RESIGN" })).toEqual({
      severance: 0,
      upmk: 0,
      pkwt: 0,
    });
  });
  test("PKWT 6 bulan → ½ bulan upah; ≥ 12 bulan → 1 bulan; lainnya 0", () => {
    expect(
      estimateSeverance({
        category: "PKWT",
        joinDate: "2026-04-21",
        at: "2026-10-21",
        monthlyWage: wage,
        scenario: "PHK_NORMAL",
      }).pkwt,
    ).toBe(wage / 2);
    expect(
      estimateSeverance({
        category: "PKWT",
        joinDate: "2024-01-01",
        at: "2026-10-21",
        monthlyWage: wage,
        scenario: "PHK_NORMAL",
      }).pkwt,
    ).toBe(wage);
    expect(
      estimateSeverance({
        category: "OTHER",
        joinDate: "2020-01-01",
        at: "2026-10-21",
        monthlyWage: wage,
        scenario: "PHK_NORMAL",
      }),
    ).toEqual({ severance: 0, upmk: 0, pkwt: 0 });
  });
  test("masa kerja tepat di ulang tahun kerja = bilangan bulat", () => {
    expect(tenureYears("2020-08-01", "2027-08-01")).toBe(7);
    expect(tenureYears("2020-08-01", "2027-07-31")).toBeLessThan(7);
    expect(tenureYears("2020-08-01", "2020-07-01")).toBe(0);
    expect(tenureYears("2024-02-29", "2025-02-28")).toBe(1);
    expect(Number.isFinite(tenureYears("2024-02-29", "2026-06-01"))).toBe(true);
  });
  test("bulan kerja penuh", () => {
    expect(fullMonths("2026-04-21", "2026-10-20")).toBe(5);
    expect(fullMonths("2026-04-21", "2026-10-21")).toBe(6);
  });
});
