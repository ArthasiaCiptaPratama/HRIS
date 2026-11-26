import { describe, expect, test } from "bun:test";
import { IMPORT_FIELDS, normalizeImportRow, parseDailyWage } from "../src/import/index.ts";
import {
  evaluateThlAttendance,
  thlCurrentMonth,
  thlStreak,
  thlWageChangeLabel,
} from "../src/thl.ts";

describe("THL calendar evaluation (KTR-D8/D13)", () => {
  const now = new Date("2027-01-20T00:00:00Z");
  const counts = (days: number[]) =>
    days.map((presentDays, i) => ({
      month: ["2026-10", "2026-11", "2026-12", "2027-01"][i] ?? "",
      presentDays,
      pendingDays: 2,
    }));
  test.each([
    [[21, 21, 21], "REQUIRED"],
    [[20, 21, 21], "APPROACHING"],
    [[21, 20, 21], "NONE"],
    [[21, 21, 20], "NONE"],
    [[20, 20, 20, 31], "NONE"],
    [[21, 21, 21, 0], "REQUIRED"],
  ] as const)("%j → %s", (days, status) => {
    expect(evaluateThlAttendance(counts([...days]), now).status).toBe(status);
  });
  test("year boundary and missing month", () => {
    const result = evaluateThlAttendance([], now);
    expect(result.months.map((m) => m.month)).toEqual(["2026-10", "2026-11", "2026-12"]);
    expect(result.status).toBe("NONE");
  });
  test("evaluated months span December to January", () => {
    const rows = ["2026-12", "2027-01", "2027-02"].map((month) => ({
      month,
      presentDays: 21,
      pendingDays: 0,
    }));
    expect(evaluateThlAttendance(rows, new Date("2027-03-01T00:00:00Z")).status).toBe("REQUIRED");
  });
  test("WIB month changes at 17:00 UTC", () => {
    expect(thlCurrentMonth(new Date("2026-12-31T16:59:59Z"))).toBe("2026-12");
    expect(thlCurrentMonth(new Date("2026-12-31T17:00:00Z"))).toBe("2027-01");
    expect(
      evaluateThlAttendance(counts([21, 21, 21]), new Date("2026-12-31T17:00:00Z")).status,
    ).toBe("REQUIRED");
  });
  test("pending never qualifies", () => {
    expect(evaluateThlAttendance(counts([20, 20, 20]), now).status).toBe("NONE");
  });
});

describe("THL import amount", () => {
  test.each(["Rp 150.000", "150000", "150.000,00", 150000])("%p", (cell) => {
    expect(parseDailyWage(cell)).toEqual({ value: 150000 });
    expect(normalizeImportRow({ dailyWage: cell }).row.contract.dailyWage).toBe(150000);
  });
  test.each([0, -1, 1.234, 100000001, "1,234", "Rp nonsense", "150.00", true])(
    "invalid %p",
    (cell) => {
      expect(parseDailyWage(cell)).toEqual({ issue: "INVALID_DAILY_WAGE" });
    },
  );
  test("aliases and section", () => {
    expect(IMPORT_FIELDS.dailyWage).toMatchObject({
      section: "contract",
      label: "Upah harian",
      synonyms: ["upah harian", "upah per hari", "daily wage", "upah/hari"],
    });
  });
});

describe("thlWageChangeLabel", () => {
  test("satu tarif dalam bulan → null", () => {
    expect(thlWageChangeLabel([{ effectiveFrom: "2026-05-01", amount: 140000 }])).toBeNull();
    expect(thlWageChangeLabel(undefined)).toBeNull();
  });
  test("tarif berubah → rentang dengan tanggal perubahan", () => {
    expect(
      thlWageChangeLabel([
        { effectiveFrom: "2026-05-01", amount: 140000 },
        { effectiveFrom: "2026-10-15", amount: 160000 },
      ])?.replaceAll("\u00a0", " "),
    ).toBe("Rp 140.000 → Rp 160.000 (15 Okt)");
  });
});

describe("thlStreak (opsi C daftar THL)", () => {
  const m = (...days: number[]) => days.map((presentDays) => ({ presentDays }));
  test("berturut dari bulan penuh terakhir, batas 20/21", () => {
    expect(thlStreak(m(21, 21, 21))).toBe(3);
    expect(thlStreak(m(20, 21, 22))).toBe(2);
    expect(thlStreak(m(21, 20, 22))).toBe(1);
    expect(thlStreak(m(22, 22, 20))).toBe(0);
    expect(thlStreak([])).toBe(0);
  });
});
