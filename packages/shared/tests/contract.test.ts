import { describe, expect, test } from "bun:test";
import {
  contractSummary,
  EMPLOYMENT_CATEGORY_LABELS,
  employmentStatusDisplay,
  employmentTier,
  parseEmploymentStatus,
  tenure,
  validateContractStage,
} from "../src/index.ts";

const stage = (startDate: string, endDate: string, sequence = 1) =>
  validateContractStage({ kind: "PKWT", sequence, startDate, endDate, previous: null });
describe("KTR calendar duration rules", () => {
  test("PKWT 1 exactly two years, +1 day", () => {
    expect(stage("2024-01-01", "2025-12-31").errors).toEqual([]);
    expect(stage("2024-01-01", "2026-01-01").errors).toContain("PKWT 1 maksimal 2 tahun.");
  });
  test("leap anniversary clamps before subtracting one day", () => {
    expect(stage("2024-02-29", "2026-02-27").errors).toEqual([]);
    expect(stage("2024-02-29", "2026-02-28").errors).toContain("PKWT 1 maksimal 2 tahun.");
    expect(stage("2023-03-01", "2025-02-28").errors).toEqual([]);
  });
  test.each([2, 3])("PKWT %i exactly one year", (sequence) => {
    expect(stage("2026-01-01", "2026-12-31", sequence).errors).toEqual([]);
    expect(stage("2026-01-01", "2027-01-01", sequence).errors.length).toBeGreaterThan(0);
  });
  test("four-year total includes gaps", () => {
    const input = {
      kind: "PKWT" as const,
      sequence: 3,
      startDate: "2027-01-01",
      endDate: "2027-12-31",
      previous: { endDate: "2026-12-31", sequence: 2, firstPkwtStart: "2024-01-01" },
    };
    expect(validateContractStage(input).errors).toEqual([]);
    expect(
      validateContractStage({ ...input, startDate: "2027-01-02", endDate: "2028-01-01" }).errors,
    ).toContain("Total masa PKWT maksimal 4 tahun sejak mulai PKWT 1.");
  });
  test("fourth stage rejected", () =>
    expect(stage("2026-01-01", "2026-02-01", 4).errors.length).toBeGreaterThan(0));
  test("probation exactly three months, +1 day including month-end", () => {
    const input = {
      kind: "PROBATION" as const,
      sequence: null,
      startDate: "2024-01-31",
      endDate: "2024-04-29",
      previous: null,
    };
    expect(validateContractStage(input).errors).toEqual([]);
    expect(validateContractStage({ ...input, endDate: "2024-04-30" }).errors).toContain(
      "Masa percobaan maksimal 3 bulan.",
    );
  });
  test("gap warns, overlap blocks, reversed dates block", () => {
    const input = {
      kind: "PKWT" as const,
      sequence: 2,
      startDate: "2026-01-02",
      endDate: "2026-12-31",
      previous: { sequence: 1, endDate: "2025-12-31", firstPkwtStart: "2024-01-01" },
    };
    expect(validateContractStage(input)).toMatchObject({
      errors: [],
      warnings: [expect.any(String)],
    });
    expect(
      validateContractStage({ ...input, startDate: "2025-12-31" }).errors.length,
    ).toBeGreaterThan(0);
    expect(stage("2026-02-01", "2026-01-01").errors.length).toBeGreaterThan(0);
  });
});
const current = {
  id: "1",
  kind: "PKWT" as const,
  sequence: 2,
  startDate: "2026-01-01",
  endDate: "2026-12-31",
  status: "ACTIVE" as const,
  previousContractId: null,
  pkwtFirstStartDate: "2024-01-01",
};
test.each([
  ["2026-10-31", "ok", 61],
  ["2026-11-01", "warn", 60],
  ["2026-12-01", "danger", 30],
  ["2027-01-01", "expired", -1],
])("summary %s %s", (today, color, remainingDays) => {
  const summary = contractSummary([current], String(today));
  expect(summary).toMatchObject({
    color,
    remainingDays,
    totalPkwt: { firstStartDate: "2024-01-01", maxDays: 1461 },
  });
});
test("summary follows chain and excludes unrelated historical spells", () => {
  expect(
    contractSummary(
      [
        { ...current, id: "old", startDate: "2010-01-01", status: "ENDED" },
        {
          ...current,
          id: "root",
          sequence: 1,
          startDate: "2024-01-01",
          pkwtFirstStartDate: null,
          status: "EXTENDED",
        },
        { ...current, previousContractId: "root", pkwtFirstStartDate: null },
      ],
      "2026-06-01",
    )?.totalPkwt?.firstStartDate,
  ).toBe("2024-01-01");
  expect(contractSummary([], "2026-01-01")).toBeNull();
});
test("tenure calendar anniversaries, month end, before start", () => {
  expect(tenure("2020-02-29", "2024-03-01")).toEqual({ years: 4, months: 0, days: 1 });
  expect(tenure("2026-01-31", "2026-02-28")).toEqual({ years: 0, months: 1, days: 0 });
  expect(tenure("2026-01-01", "2025-01-01")).toEqual({ years: 0, months: 0, days: 0 });
});
test("tiers and legacy/new import labels", () => {
  expect(employmentTier("PROBATION")).toBe("PKWTT");
  expect(employmentTier("DAILY_WORKER")).toBe("THL");
  expect(employmentTier("INTERNSHIP")).toBeNull();
  for (const label of ["THL", "Harian Lepas", "Harian Lepas (THL)", "Pekerja Harian"])
    expect(parseEmploymentStatus(label)).toEqual({ value: { category: "DAILY_WORKER" } });
  expect(parseEmploymentStatus("PKWTT – Masa Percobaan")).toEqual({
    value: { category: "PROBATION" },
  });
  expect(parseEmploymentStatus("PKWTT")).toEqual({ value: { category: "PERMANENT" } });
});
test("KTR-D2 revisi: nama biasa di menu, istilah resmi di detail", () => {
  expect(EMPLOYMENT_CATEGORY_LABELS.PERMANENT).toBe("Karyawan Tetap");
  expect(EMPLOYMENT_CATEGORY_LABELS.PROBATION).toBe("Karyawan Percobaan");
  expect(EMPLOYMENT_CATEGORY_LABELS.DAILY_WORKER).toBe("Harian Lepas (THL)");
  expect(employmentStatusDisplay("PERMANENT", null)).toBe("Karyawan Tetap · PKWTT");
  expect(employmentStatusDisplay("PROBATION", null)).toBe(
    "Karyawan Percobaan · PKWTT – Masa Percobaan",
  );
  expect(employmentStatusDisplay("PKWT", 2)).toBe("PKWT 2");
  expect(employmentStatusDisplay("PKWT", null)).toBe("PKWT · Tahap belum diisi");
  expect(employmentStatusDisplay("DAILY_WORKER", null)).toBe("Harian Lepas (THL)");
  expect(employmentStatusDisplay("INTERNSHIP", null)).toBe("Magang");
  expect(employmentStatusDisplay(null, null)).toBe("—");
});
