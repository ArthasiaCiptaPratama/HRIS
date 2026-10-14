import { describe, expect, test } from "bun:test";
import { expandRosterShorthand } from "@hris/shared";
import {
  crossesMidnight,
  daysBetween,
  eachDate,
  generateCrewDays,
  minuteToHHmm,
  patternCodeOn,
} from "../roster-engine.ts";

// D-069: pola siklus roster tambang.
const tenFour = expandRosterShorthand(10, 4);

describe("patternCodeOn", () => {
  test("10/4: hari 0–9 kerja, 10–13 OFF, hari 14 kembali kerja", () => {
    expect(patternCodeOn(tenFour, "2026-01-01", "2026-01-01")).toBe("D");
    expect(patternCodeOn(tenFour, "2026-01-01", "2026-01-10")).toBe("D");
    expect(patternCodeOn(tenFour, "2026-01-01", "2026-01-11")).toBe("OFF");
    expect(patternCodeOn(tenFour, "2026-01-01", "2026-01-14")).toBe("OFF");
    expect(patternCodeOn(tenFour, "2026-01-01", "2026-01-15")).toBe("D");
  });

  test("siklus berlaku mundur sebelum tanggal mulai & melewati pergantian tahun", () => {
    expect(patternCodeOn(tenFour, "2026-01-01", "2025-12-31")).toBe("OFF");
    expect(patternCodeOn(tenFour, "2026-01-01", "2025-12-18")).toBe("D");
    expect(daysBetween("2025-12-31", "2026-03-01")).toBe(60);
  });

  test("pola siang–malam–off (2D-2N-2OFF)", () => {
    const steps = ["D", "D", "N", "N", "OFF", "OFF"];
    const codes = eachDate("2026-02-27", "2026-03-05").map((d) =>
      patternCodeOn(steps, "2026-02-27", d),
    );
    expect(codes).toEqual(["D", "D", "N", "N", "OFF", "OFF", "D"]);
  });
});

describe("generateCrewDays", () => {
  test("memperhatikan masa keanggotaan (masuk/keluar crew di tengah rentang)", () => {
    const days = generateCrewDays(
      ["D", "OFF"],
      "2026-01-01",
      [
        { employeeId: "a", startDate: "2025-01-01", endDate: null },
        { employeeId: "b", startDate: "2026-01-03", endDate: "2026-01-04" },
      ],
      "2026-01-01",
      "2026-01-05",
    );
    expect(days.filter((d) => d.employeeId === "a").map((d) => d.code)).toEqual([
      "D",
      "OFF",
      "D",
      "OFF",
      "D",
    ]);
    expect(days.filter((d) => d.employeeId === "b")).toEqual([
      { employeeId: "b", date: "2026-01-03", code: "D" },
      { employeeId: "b", date: "2026-01-04", code: "OFF" },
    ]);
  });
});

test("jam shift & lintas tengah malam", () => {
  expect(minuteToHHmm(7 * 60)).toBe("07:00");
  expect(crossesMidnight(19 * 60, 7 * 60)).toBe(true);
  expect(crossesMidnight(7 * 60, 19 * 60)).toBe(false);
});
