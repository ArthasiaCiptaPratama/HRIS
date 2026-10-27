import { describe, expect, test } from "bun:test";
import {
  crewCycleStart,
  mondayOnOrBefore,
  rosterTemplateDefInputSchema,
  rosterTemplatePreview,
} from "../src/index.ts";

// TM-D20: pratinjau template roster buatan HR (sama dengan pembangkit roster API: indeks = selisih hari mod siklus).
const shifts = [
  { code: "D", startMinute: 420, endMinute: 1140 },
  { code: "N", startMinute: 1140, endMinute: 420 },
  { code: "M", startMinute: 0, endMinute: 480, startsNextDay: true },
  { code: "M2", startMinute: 0, endMinute: 480 },
];

describe("rosterTemplatePreview", () => {
  test("3 crew bergeser 2 hari pada pola D D N N OFF OFF → setiap hari selalu ada D & N", () => {
    const p = rosterTemplatePreview(
      {
        steps: ["D", "D", "N", "N", "OFF", "OFF"],
        crewCount: 3,
        crewOffsetDays: 2,
        startOnMonday: false,
      },
      shifts,
      "2027-01-10",
      6,
      8,
    );
    expect(p.crews.map((c) => c.name)).toEqual(["Crew A", "Crew B", "Crew C"]);
    expect(p.crews[0]?.codes).toEqual(["D", "D", "N", "N", "OFF", "OFF"]);
    expect(p.crews[1]?.codes).toEqual(["N", "N", "OFF", "OFF", "D", "D"]);
    expect(p.coverage.every((d) => d.codes.includes("D") && d.codes.includes("N"))).toBe(true);
    expect(p.warnings).toEqual([]);
  });

  test("1 crew 2+1 → hari OFF tanpa jaga terlihat di cakupan", () => {
    const p = rosterTemplatePreview(
      { steps: ["D", "D", "OFF"], crewCount: 1, crewOffsetDays: 0, startOnMonday: false },
      shifts,
      "2027-01-10",
      3,
      8,
    );
    expect(p.coverage.map((d) => d.codes)).toEqual([["D"], ["D"], []]);
  });

  test("N lalu shift dini hari: dicentang 17 jam (aman), tanpa centang bentrok −7 jam", () => {
    const ok = rosterTemplatePreview(
      { steps: ["N", "M", "OFF"], crewCount: 1, crewOffsetDays: 0, startOnMonday: false },
      shifts,
      "2027-01-10",
      3,
      8,
    );
    expect(ok.warnings).toEqual([]);
    const clash = rosterTemplatePreview(
      { steps: ["N", "M2", "OFF"], crewCount: 1, crewOffsetDays: 0, startOnMonday: false },
      shifts,
      "2027-01-10",
      3,
      8,
    );
    expect(clash.warnings).toEqual([
      { index: 0, from: "N", to: "M2", restHours: -7, overlap: true },
    ]);
  });

  test("mulai Senin: siklus 5+2 ditarik ke Senin sebelumnya", () => {
    expect(mondayOnOrBefore("2027-01-14")).toBe("2027-01-11");
    const p = rosterTemplatePreview(
      {
        steps: ["D", "D", "D", "D", "D", "OFF", "OFF"],
        crewCount: 1,
        crewOffsetDays: 0,
        startOnMonday: true,
      },
      shifts,
      "2027-01-14",
      4,
      8,
    );
    // Kamis 14 → hari ke-4 siklus (D), Sabtu 16 → OFF.
    expect(p.crews[0]?.codes).toEqual(["D", "D", "OFF", "OFF"]);
    expect(crewCycleStart("2027-01-11", 2, 7)).toBe("2026-12-28");
  });

  test("skema: maksimal 8 crew, pola minimal 1 langkah", () => {
    const base = {
      companyId: crypto.randomUUID(),
      name: "X",
      steps: ["D"],
      crewCount: 1,
      crewOffsetDays: 0,
    };
    expect(rosterTemplateDefInputSchema.safeParse(base).success).toBe(true);
    expect(rosterTemplateDefInputSchema.safeParse({ ...base, crewCount: 9 }).success).toBe(false);
    expect(rosterTemplateDefInputSchema.safeParse({ ...base, steps: [] }).success).toBe(false);
  });
});
