import { describe, expect, test } from "bun:test";
import {
  ageBucket,
  averageDays,
  fullYears,
  jubileeYears,
  monthQuerySchema,
  movementKind,
  tenureBucket,
} from "../src/index.ts";

// ARS-D21: aturan hitung laporan batch 2.
describe("masa kerja & usia (ARS-D21)", () => {
  test("tahun penuh: belum genap ulang tanggal belum dihitung", () => {
    expect(fullYears("2020-10-20", "2026-10-20")).toBe(6);
    expect(fullYears("2020-10-21", "2026-10-20")).toBe(5);
    expect(fullYears("2026-10-20", "2026-10-20")).toBe(0);
  });

  test.each([
    ["2026-01-01", "<1"],
    ["2025-10-20", "1-3"],
    ["2023-10-21", "1-3"],
    ["2023-10-20", "3-5"],
    ["2021-10-20", "5-10"],
    ["2016-10-21", "5-10"],
    ["2016-10-20", "10+"],
  ] as const)("masuk %s → %s", (joinDate, expected) => {
    expect(tenureBucket(joinDate, "2026-10-20")).toBe(expected);
  });

  test("jubilee hanya di bulan tanggal masuk & genap 5/10/15/20/25 tahun", () => {
    expect(jubileeYears("2021-10-31", 2026, 10)).toBe(5);
    expect(jubileeYears("2016-10-01", 2026, 10)).toBe(10);
    expect(jubileeYears("2001-10-01", 2026, 10)).toBe(25);
    expect(jubileeYears("2022-10-01", 2026, 10)).toBeNull();
    expect(jubileeYears("2021-11-01", 2026, 10)).toBeNull();
    expect(jubileeYears("1996-10-01", 2026, 10)).toBeNull();
  });

  test.each([
    ["2002-10-21", "<25"],
    ["2001-10-20", "25-34"],
    ["1991-10-21", "25-34"],
    ["1991-10-20", "35-44"],
    ["1981-10-20", "45-54"],
    ["1971-10-20", "55+"],
  ] as const)("lahir %s → %s", (birthDate, expected) => {
    expect(ageBucket(birthDate, "2026-10-20")).toBe(expected);
  });
});

describe("jenis perpindahan (ARS-D21)", () => {
  test("level naik = promosi, turun = demosi, sama = mutasi, kosong = belum diisi", () => {
    expect(movementKind("STAFF", "SUPERVISOR")).toBe("PROMOTION");
    expect(movementKind("MANAGER", "FOREMAN")).toBe("DEMOTION");
    expect(movementKind("STAFF", "STAFF")).toBe("TRANSFER");
    expect(movementKind(null, "STAFF")).toBe("UNRANKED");
    expect(movementKind("STAFF", null)).toBe("UNRANKED");
  });
});

describe("waktu proses pengajuan (ARS-D21)", () => {
  test("rata-rata hari 1 desimal; kosong → null", () => {
    expect(averageDays([])).toBeNull();
    expect(
      averageDays([
        { from: "2026-10-01T00:00:00Z", to: "2026-10-02T00:00:00Z" },
        { from: "2026-10-01T00:00:00Z", to: "2026-10-03T12:00:00Z" },
      ]),
    ).toBe(1.8);
  });

  test("query bulan: 1–12", () => {
    expect(monthQuerySchema.safeParse({ year: "2026", month: "10" }).success).toBe(true);
    expect(monthQuerySchema.safeParse({ year: "2026", month: "13" }).success).toBe(false);
  });
});
