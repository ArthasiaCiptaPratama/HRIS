import { describe, expect, test } from "bun:test";
import {
  allocateCharges,
  chargeYearOf,
  countLeaveDates,
  datesBetween,
  prorataDays,
  realBalance,
  settlementDays,
  summarize,
} from "../leave-engine.ts";

// D-072 + TM-D9: jatah prorata, hitung hari roster, pembebanan tahun mulai, hutang & pelunasan.

describe("prorata jatah 1 Januari", () => {
  test("masa kerja penuh tahun sebelumnya → kuota penuh", () => {
    expect(prorataDays("2020-06-20", 2026, 12)).toBe(12);
    expect(prorataDays("2025-01-15", 2026, 12)).toBe(12);
  });
  test("1 hari per bulan kerja penuh; tanggal 1–15 bulan itu dihitung", () => {
    expect(prorataDays("2025-11-10", 2026, 12)).toBe(2); // Nov + Des
    expect(prorataDays("2025-11-16", 2026, 12)).toBe(1); // mulai Des
    expect(prorataDays("2025-12-31", 2026, 12)).toBe(0);
    expect(prorataDays("2025-01-16", 2026, 12)).toBe(11);
  });
  test("masuk di tahun jatah → 0; kuota lebih kecil membatasi", () => {
    expect(prorataDays("2026-01-02", 2026, 12)).toBe(0);
    expect(prorataDays("2025-03-01", 2026, 6)).toBe(6);
  });
});

describe("hari terhitung", () => {
  const roster = new Map([
    ["2026-12-24", "WORK"],
    ["2026-12-25", "WORK"],
    ["2026-12-26", "OFF"],
  ] as const);
  const holidays = new Map([
    ["2026-12-24", "COLLECTIVE_LEAVE"],
    ["2026-12-25", "NATIONAL"],
  ] as const);
  test("cuti bersama di hari kerja roster dihitung; tanggal merah & OFF tidak", () => {
    expect(countLeaveDates(["2026-12-24", "2026-12-25", "2026-12-26"], roster, holidays)).toEqual([
      "2026-12-24",
    ]);
  });
  test("tanpa roster → Senin–Jumat bukan libur", () => {
    // 2026-12-28 Senin … 2027-01-03 Minggu; 1 Jan libur nasional.
    const dates = datesBetween("2026-12-28", "2027-01-03");
    expect(countLeaveDates(dates, new Map(), new Map([["2027-01-01", "NATIONAL"]]))).toEqual([
      "2026-12-28",
      "2026-12-29",
      "2026-12-30",
      "2026-12-31",
    ]);
  });
});

describe("pembebanan saldo (TM-D9: tahun mulai, tanpa sisa tahun lalu)", () => {
  test("cuti lintas tahun 29 Des – 3 Jan seluruhnya memakai saldo tahun mulai", () => {
    const dates = ["2027-01-02", "2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01"];
    const year = chargeYearOf(dates);
    expect(year).toBe(2026);
    const result = allocateCharges(dates, year as number);
    expect(result.byYear).toEqual(new Map([[2026, 5]]));
    expect(result.perDate.every((p) => p.year === 2026)).toBe(true);
  });
  test("Jan–Mar tidak lagi memakai sisa tahun lalu", () => {
    const result = allocateCharges(
      ["2027-03-30", "2027-01-05"],
      chargeYearOf(["2027-03-30", "2027-01-05"]) as number,
    );
    expect(result.byYear).toEqual(new Map([[2027, 2]]));
  });
  test("tanpa hari terhitung → tanpa pembebanan", () => {
    expect(chargeYearOf([])).toBeNull();
    expect(allocateCharges([], 2026).byYear.size).toBe(0);
  });
  test("saldo nyata mengabaikan tahanan pengajuan yang masih menunggu", () => {
    expect(
      realBalance([
        { kind: "GRANT", days: 12 },
        { kind: "HOLD", days: -3 },
        { kind: "HOLD", days: -2 },
        { kind: "RELEASE", days: 2 },
        { kind: "USE", days: -2 },
      ]),
    ).toBe(10);
  });
  test("pelunasan hutang dari jatah baru, sebanyak yang tersedia", () => {
    expect(settlementDays(-3, 12)).toBe(3);
    expect(settlementDays(-5, 2)).toBe(2);
    expect(settlementDays(4, 12)).toBe(0);
  });
});

test("ringkasan buku besar", () => {
  const s = summarize(2026, [
    { kind: "GRANT", days: 12 },
    { kind: "HOLD", days: -3 },
    { kind: "RELEASE", days: 3 },
    { kind: "USE", days: -3 },
    { kind: "HOLD", days: -2 },
    { kind: "COLLECTIVE", days: -1 },
    { kind: "SETTLE", days: -1 },
  ]);
  expect(s).toMatchObject({
    granted: 12,
    used: 3,
    held: 2,
    collective: 1,
    settled: -1,
    balance: 5,
  });
});
