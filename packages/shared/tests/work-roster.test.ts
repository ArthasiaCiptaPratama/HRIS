import { describe, expect, test } from "bun:test";
import {
  DEFAULT_WORK_ROSTERS,
  shiftInputSchema,
  workRosterInputSchema,
  workRosterLength,
  workRosterSteps,
  workRosterSummary,
} from "../src/index.ts";

// TM-D28 — roster (siklus kerja–libur) dirakit menjadi langkah pola jadwal.
const COMPANY = "11111111-1111-4111-8111-111111111111";
const byGroup = (residency: string) => {
  const found = DEFAULT_WORK_ROSTERS.find((r) => r.residency === residency);
  if (!found) throw new Error(residency);
  return found;
};
const nonLocal = byGroup("NON_LOCAL");
const local = byGroup("LOCAL");
const office = byGroup("OFFICE");

describe("roster → pola jadwal", () => {
  test("non-lokal 13/1 × 4 + time off 14: 70 hari, TO di akhir", () => {
    const steps = workRosterSteps(nonLocal, "D");
    expect(steps).toHaveLength(70);
    expect(workRosterLength(nonLocal)).toBe(70);
    expect(steps.slice(0, 14)).toEqual([...Array(13).fill("D"), "OFF"]);
    expect(steps.slice(56)).toEqual(Array(14).fill("TO"));
    expect(steps.filter((s) => s === "D")).toHaveLength(52);
    expect(workRosterSummary(nonLocal)).toBe("13/1 × 4 + time off 14 hari (70 hari)");
  });

  test("office 5/2 (Senin–Jumat) tanpa time off", () => {
    expect(workRosterSteps(office, "K")).toEqual([...Array(5).fill("K"), "OFF", "OFF"]);
    expect(workRosterSummary(office)).toBe("5/2");
  });

  test("lokal 6/1 tanpa time off", () => {
    expect(workRosterSteps(local, "D")).toEqual([...Array(6).fill("D"), "OFF"]);
    expect(workRosterSummary(local)).toBe("6/1");
  });

  test("validasi: siklus tanpa lama time off ditolak; putaran > 400 hari ditolak", () => {
    expect(workRosterInputSchema.safeParse({ ...nonLocal, companyId: COMPANY }).success).toBe(true);
    expect(
      workRosterInputSchema.safeParse({ ...nonLocal, companyId: COMPANY, timeOffDays: 0 }).success,
    ).toBe(false);
    expect(
      workRosterInputSchema.safeParse({
        ...nonLocal,
        companyId: COMPANY,
        workDays: 60,
        offDays: 30,
        cyclesBeforeTimeOff: 5,
      }).success,
    ).toBe(false);
  });

  test("kode shift TO dicadangkan untuk time off", () => {
    const base = {
      companyId: COMPANY,
      name: "Uji",
      startMinute: 420,
      endMinute: 960,
      checkInOpenMin: 60,
      lateToleranceMin: 0,
      earlyLeaveToleranceMin: 0,
      checkOutCloseMin: 60,
    };
    expect(shiftInputSchema.safeParse({ ...base, code: "TO" }).success).toBe(false);
    expect(shiftInputSchema.safeParse({ ...base, code: "TOP" }).success).toBe(true);
  });
});
