import { describe, expect, test } from "bun:test";
import {
  allocateCharges,
  countLeaveDates,
  datesBetween,
  prorataDays,
  settlementDays,
  summarize,
} from "../leave-engine.ts";

// D-071: jatah prorata, hitung hari roster, sisa tahun lalu dulu (s.d. 31 Maret), hutang & pelunasan.

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

describe("pembebanan saldo", () => {
  test("Jan–Mar memakai sisa tahun lalu dulu, lalu tahun berjalan", () => {
    const result = allocateCharges(
      ["2026-03-30", "2026-03-31", "2026-04-01", "2026-03-27"],
      new Map([
        [2025, 2],
        [2026, 12],
      ]),
    );
    expect(result.byYear).toEqual(
      new Map([
        [2025, 2],
        [2026, 2],
      ]),
    );
    expect(result.perDate.map((p) => p.year)).toEqual([2025, 2025, 2026, 2026]);
  });
  test("saldo habis → boleh minus (hutang) di tahun berjalan", () => {
    const result = allocateCharges(["2026-06-01", "2026-06-02"], new Map([[2026, 1]]));
    expect(result.byYear.get(2026)).toBe(2);
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
