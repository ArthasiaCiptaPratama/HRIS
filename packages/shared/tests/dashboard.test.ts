import { describe, expect, test } from "bun:test";
import {
  DEFAULT_DASHBOARD_LAYOUT,
  dashboardLayoutSchema,
  decodePivotFilters,
  encodePivotFilters,
  isSensitivePivotDimension,
} from "../src/dashboard.ts";

describe("filter pivot (query `filter=dim:nilai`)", () => {
  test("encode → decode kembali ke objek yang sama", () => {
    const filters = { category: ["PERMANENT", "PKWT"], education: ["SD"] };
    expect(decodePivotFilters(encodePivotFilters(filters))).toEqual(filters);
  });

  test("satu nilai (bukan array) dan nilai ganda dirapikan", () => {
    expect(decodePivotFilters("gender:MALE")).toEqual({ gender: ["MALE"] });
    expect(decodePivotFilters(["gender:MALE", "gender:MALE"])).toEqual({ gender: ["MALE"] });
    expect(decodePivotFilters(undefined)).toEqual({});
  });

  test("nilai boleh mengandung titik dua (hanya pemisah pertama yang dipakai)", () => {
    expect(decodePivotFilters("city:A:B")).toEqual({ city: ["A:B"] });
  });

  test("dimensi tak dikenal / tanpa nilai / tanpa pemisah → null (400)", () => {
    expect(decodePivotFilters("salary:10")).toBeNull();
    expect(decodePivotFilters("gender:")).toBeNull();
    expect(decodePivotFilters("gender")).toBeNull();
    expect(decodePivotFilters(`city:${"x".repeat(65)}`)).toBeNull();
  });
});

describe("susunan dashboard", () => {
  test("susunan bawaan valid", () => {
    expect(dashboardLayoutSchema.safeParse(DEFAULT_DASHBOARD_LAYOUT).success).toBe(true);
  });

  test("id widget ganda ditolak", () => {
    const [first] = DEFAULT_DASHBOARD_LAYOUT.widgets;
    const result = dashboardLayoutSchema.safeParse({
      version: 1,
      widgets: [first, first],
    });
    expect(result.success).toBe(false);
  });

  test("versi lain & jenis widget tak dikenal ditolak", () => {
    expect(dashboardLayoutSchema.safeParse({ version: 2, widgets: [] }).success).toBe(false);
    expect(
      dashboardLayoutSchema.safeParse({
        version: 1,
        widgets: [{ id: "x", kind: "script", size: "sm" }],
      }).success,
    ).toBe(false);
  });

  test("dimensi sensitif ditandai", () => {
    expect(isSensitivePivotDimension("religion")).toBe(true);
    expect(isSensitivePivotDimension("age")).toBe(true);
    expect(isSensitivePivotDimension("education")).toBe(false);
  });
});
